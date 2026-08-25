const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../config/logger');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { facturaSchema, validate } = require('../middlewares/validatorMiddleware');
const billingService = require('../services/billingService');

const TASA_IVA = 0.19; // IVA Chile

const redondear = (n) => Math.round(n * 100) / 100;

const errorDeDatos = (mensaje) => {
  const err = new Error(mensaje);
  err.status = 400;
  return err;
};

/**
 * Calcula los importes de una factura a partir de los pedidos que agrupa.
 *
 * subtotal/impuestos/total del body se ignoran: en el panel son campos de solo
 * lectura derivados de los pedidos seleccionados (ver Facturas.js), así que el
 * servidor los reconstruye igual. Sin esto, cualquiera con rol contador podía
 * emitir una factura por $0 sobre pedidos por cualquier monto.
 *
 * De paso valida lo que el recálculo da por supuesto: que los pedidos existan,
 * que sean del mismo cliente que la factura y que no estén ya facturados.
 *
 * @param {number|null} facturaIdActual al editar, la factura que se excluye del
 *        control de duplicados (sus propios pedidos no son "de otra factura")
 */
async function calcularImportes(pedidosIds, clienteId, ejecutor, facturaIdActual = null) {
  if (!pedidosIds || pedidosIds.length === 0) {
    return { subtotal: 0, impuestos: 0, total: 0 };
  }

  const ids = [...new Set(pedidosIds)];
  const placeholders = ids.map(() => '?').join(',');

  const pedidos = await ejecutor.allAsync(
    `SELECT id, cliente_id, total FROM pedidos WHERE id IN (${placeholders})`,
    ids
  );

  if (pedidos.length !== ids.length) {
    const encontrados = new Set(pedidos.map(p => p.id));
    const faltantes = ids.filter(id => !encontrados.has(id));
    throw errorDeDatos(`No existe el pedido ${faltantes.join(', ')}`);
  }

  const ajenos = pedidos.filter(p => p.cliente_id !== clienteId);
  if (ajenos.length > 0) {
    throw errorDeDatos(
      `El pedido ${ajenos.map(p => p.id).join(', ')} pertenece a otro cliente y no puede incluirse en esta factura`
    );
  }

  let sqlDuplicados = `SELECT pedido_id FROM factura_pedidos WHERE pedido_id IN (${placeholders})`;
  const paramsDuplicados = [...ids];
  if (facturaIdActual !== null && facturaIdActual !== undefined) {
    sqlDuplicados += ' AND factura_id <> ?';
    paramsDuplicados.push(facturaIdActual);
  }
  const yaFacturados = await ejecutor.allAsync(sqlDuplicados, paramsDuplicados);
  if (yaFacturados.length > 0) {
    const repetidos = [...new Set(yaFacturados.map(f => f.pedido_id))];
    throw errorDeDatos(`El pedido ${repetidos.join(', ')} ya está incluido en otra factura`);
  }

  const subtotal = redondear(pedidos.reduce((suma, p) => suma + (p.total || 0), 0));
  const impuestos = redondear(subtotal * TASA_IVA);

  return { subtotal, impuestos, total: redondear(subtotal + impuestos) };
}

// GET /api/facturas/pedidos-disponibles — Obtener pedidos no facturados
router.get('/pedidos-disponibles', authenticateToken, authorizeRole(['admin', 'contador']), async (req, res) => {
  try {
    let whereClause = 'fp.pedido_id IS NULL';
    const params = [];

    if (req.query.fechaInicio && req.query.fechaFin) {
      whereClause += ` AND ${db.helpers.date('p.fecha')} BETWEEN ? AND ?`;
      params.push(req.query.fechaInicio, req.query.fechaFin);
    } else if (req.query.fecha) {
      whereClause += ` AND ${db.helpers.date('p.fecha')} = ?`;
      params.push(req.query.fecha);
    }

    if (req.query.cliente && req.query.cliente !== 'todos') {
      whereClause += ' AND p.cliente_id = ?';
      params.push(req.query.cliente);
    }

    const query = `
      SELECT p.*, c.nombre as cliente_nombre
      FROM pedidos p
      JOIN clientes c ON p.cliente_id = c.id
      LEFT JOIN factura_pedidos fp ON p.id = fp.pedido_id
      WHERE ${whereClause}
      ORDER BY p.fecha DESC, p.id DESC
    `;

    const rows = await db.allAsync(query, params);
    res.json(rows);
  } catch (err) {
    logger.error('Error obteniendo pedidos para facturación:', err);
    res.status(500).json({ error: 'Error al obtener pedidos disponibles' });
  }
});

// GET /api/facturas/clientes-facturables — Clientes para el selector de facturación
// Alternativa acotada a GET /api/clientes para el rol contador: devuelve solo los
// campos que se imprimen en un DTE. Deliberadamente NO incluye email ni teléfono.
router.get('/clientes-facturables', authenticateToken, authorizeRole(['admin', 'contador']), async (req, res) => {
  try {
    const rows = await db.allAsync(
      'SELECT id, nombre, rut, giro, direccion FROM clientes ORDER BY nombre'
    );
    res.json(rows);
  } catch (err) {
    logger.error('Error obteniendo clientes facturables:', err);
    res.status(500).json({ error: 'Error al obtener los clientes' });
  }
});

// GET /api/facturas — Listar facturas con filtros y paginación
router.get('/', authenticateToken, authorizeRole(['admin', 'contador']), async (req, res) => {
  try {
    const { fecha, estado, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit)));

    let whereClause = '1=1';
    const params = [];

    if (fecha) {
      whereClause += ` AND ${db.helpers.date('f.fecha')} = ?`;
      params.push(fecha);
    }

    if (estado && estado !== 'todos') {
      whereClause += ' AND f.estado = ?';
      params.push(estado);
    }

    const countRow = await db.getAsync(
      `SELECT COUNT(*) as total FROM facturas f WHERE ${whereClause}`,
      params
    );

    const query = `
      SELECT f.*, c.nombre as cliente_nombre,
             ${db.helpers.groupConcat('fp.pedido_id')} as pedidos_ids,
             COUNT(fp.pedido_id) as cantidad_pedidos
      FROM facturas f
      JOIN clientes c ON f.cliente_id = c.id
      LEFT JOIN factura_pedidos fp ON f.id = fp.factura_id
      WHERE ${whereClause}
      GROUP BY f.id, c.nombre
      ORDER BY f.fecha DESC, f.id DESC
      LIMIT ? OFFSET ?
    `;

    const rows = await db.allAsync(query, [...params, parsedLimit, offset]);

    // Convertir pedidos_ids de string a array
    const facturas = rows.map(row => ({
      ...row,
      pedidos_ids: row.pedidos_ids ? (typeof row.pedidos_ids === 'string' ? row.pedidos_ids.split(',').map(id => parseInt(id)) : [row.pedidos_ids]) : []
    }));

    res.json({
      data: facturas,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / parsedLimit)
      }
    });
  } catch (err) {
    logger.error('Error listando facturas:', err);
    res.status(500).json({ error: 'Error al obtener facturas' });
  }
});

// GET /api/facturas/reporte — Resumen de facturación para reportes
router.get('/reporte', authenticateToken, authorizeRole(['admin', 'contador']), async (req, res) => {
  try {
    const { mes, anio } = req.query;
    const currentAnio = anio || new Date().getFullYear();
    const currentMes = mes || (new Date().getMonth() + 1);

    // Rango [primer día del mes, primer día del mes siguiente).
    // NO usar `fecha LIKE '2026-08-%'`: en SQLite funciona porque las fechas se
    // guardan como texto, pero en PostgreSQL `fecha` es DATE y LIKE sobre un DATE
    // revienta con «operator does not exist: date ~~ unknown». La comparación por
    // rango es válida en ambos motores.
    const mesFormatted = String(currentMes).padStart(2, '0');
    const desde = `${currentAnio}-${mesFormatted}-01`;
    const hasta = new Date(Date.UTC(Number(currentAnio), Number(currentMes), 1))
      .toISOString().split('T')[0];

    const stats = await db.getAsync(
      `SELECT
        COUNT(*) as total_documentos,
        SUM(subtotal) as neto,
        SUM(impuestos) as iva,
        SUM(total) as total,
        SUM(CASE WHEN estado = 'pagada' THEN total ELSE 0 END) as recaudado
       FROM facturas
       WHERE fecha >= ? AND fecha < ?`,
      [desde, hasta]
    );

    const porEstado = await db.allAsync(
      `SELECT estado, COUNT(*) as cantidad, SUM(total) as monto
       FROM facturas
       WHERE fecha >= ? AND fecha < ?
       GROUP BY estado`,
      [desde, hasta]
    );

    res.json({
      periodo: { mes: currentMes, anio: currentAnio },
      stats,
      porEstado
    });
  } catch (err) {
    logger.error('Error generando reporte de facturas:', err);
    res.status(500).json({ error: 'Error al generar el reporte' });
  }
});

// GET /api/facturas/:id — Detalle de una factura
router.get('/:id', authenticateToken, authorizeRole(['admin', 'contador']), async (req, res) => {
  try {
    const factura = await db.getAsync(
      `SELECT f.*, c.nombre as cliente_nombre, c.email as cliente_email,
              c.telefono as cliente_telefono, c.direccion as cliente_direccion, c.rut as cliente_rut
       FROM facturas f
       JOIN clientes c ON f.cliente_id = c.id
       WHERE f.id = ?`,
      [req.params.id]
    );

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    // También obtener los pedidos asociados
    const pedidos = await db.allAsync(
      `SELECT p.* FROM pedidos p 
       JOIN factura_pedidos fp ON p.id = fp.pedido_id 
       WHERE fp.factura_id = ?`,
      [req.params.id]
    );
    factura.pedidos = pedidos;

    res.json(factura);
  } catch (err) {
    logger.error('Error obteniendo factura:', err);
    res.status(500).json({ error: 'Error al obtener la factura' });
  }
});

// POST /api/facturas — Crear factura con relaciones a pedidos (transacción)
router.post('/', authenticateToken, authorizeRole(['admin', 'contador']), validate(facturaSchema), async (req, res) => {
  const { cliente_id, pedidos_ids, numero_factura, fecha, estado, notas } = req.body;

  try {
    const { facturaId, importes } = await db.transaction(async (tx) => {
      const calculado = await calcularImportes(pedidos_ids, cliente_id, tx);

      const result = await tx.runAsync(
        `INSERT INTO facturas (cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado, notas)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cliente_id, numero_factura, fecha, calculado.subtotal, calculado.impuestos, calculado.total, estado, notas]
      );
      const id = result.lastID;

      // Insertar relaciones factura-pedidos
      if (pedidos_ids && pedidos_ids.length > 0) {
        for (const pedidoId of pedidos_ids) {
          await tx.runAsync(
            'INSERT INTO factura_pedidos (factura_id, pedido_id) VALUES (?, ?)',
            [id, pedidoId]
          );
        }
      }
      return { facturaId: id, importes: calculado };
    });

    logger.info(`Factura creada (ID: ${facturaId}, Nro: ${numero_factura}, total recalculado: ${importes.total}) por usuario: ${req.user.username}`);
    res.status(201).json({
      id: facturaId,
      ...importes,
      message: 'Factura creada correctamente'
    });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('duplicate key value'))) {
      return res.status(400).json({ error: 'El número de factura ya existe' });
    }
    logger.error('Error creando factura:', err);
    res.status(500).json({ error: 'Error al crear la factura' });
  }
});

// PUT /api/facturas/:id — Actualizar factura (transacción)
router.put('/:id', authenticateToken, authorizeRole(['admin', 'contador']), validate(facturaSchema), async (req, res) => {
  const { id } = req.params;
  const { cliente_id, pedidos_ids, numero_factura, fecha, estado, notas } = req.body;

  try {
    await db.transaction(async (tx) => {
      // Los pedidos que ya son de esta factura no cuentan como duplicados.
      const calculado = await calcularImportes(pedidos_ids, cliente_id, tx, id);

      const updateResult = await tx.runAsync(
        `UPDATE facturas SET
          cliente_id = ?, numero_factura = ?, fecha = ?,
          subtotal = ?, impuestos = ?, total = ?, estado = ?, notas = ?,
          updated_at = ${tx.helpers.now()}
        WHERE id = ?`,
        [cliente_id, numero_factura, fecha, calculado.subtotal, calculado.impuestos, calculado.total, estado, notas, id]
      );

      if (updateResult.changes === 0) {
        throw new Error('Factura no encontrada');
      }

      // Reemplazar relaciones
      await tx.runAsync('DELETE FROM factura_pedidos WHERE factura_id = ?', [id]);

      if (pedidos_ids && pedidos_ids.length > 0) {
        for (const pedidoId of pedidos_ids) {
          await tx.runAsync(
            'INSERT INTO factura_pedidos (factura_id, pedido_id) VALUES (?, ?)',
            [id, pedidoId]
          );
        }
      }
    });

    logger.info(`Factura actualizada (ID: ${id}) por usuario: ${req.user.username}`);
    res.json({ message: 'Factura actualizada correctamente' });
  } catch (err) {
    if (err.message === 'Factura no encontrada') {
      return res.status(404).json({ error: err.message });
    }
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('duplicate key value'))) {
      return res.status(400).json({ error: 'El número de factura ya existe' });
    }
    logger.error('Error actualizando factura:', err);
    res.status(500).json({ error: 'Error al actualizar la factura' });
  }
});

// DELETE /api/facturas/:id — Eliminar factura (CASCADE elimina relaciones)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await db.runAsync('DELETE FROM facturas WHERE id = ?', [req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    logger.info(`Factura eliminada (ID: ${req.params.id}) por usuario: ${req.user.username}`);
    res.json({ message: 'Factura eliminada correctamente' });
  } catch (err) {
    logger.error('Error eliminando factura:', err);
    res.status(500).json({ error: 'Error al eliminar la factura' });
  }
});

// POST /api/facturas/:id/subir-sii — Endpoint placeholder para conexión con SII
router.post('/:id/subir-sii', authenticateToken, authorizeRole(['admin', 'contador']), async (req, res) => {
  try {
    const { id } = req.params;
    
    // 1. Obtener datos completos de la factura y cliente
    const factura = await db.getAsync(
      `SELECT f.*, c.nombre, c.rut, c.giro, c.direccion, c.email
       FROM facturas f
       JOIN clientes c ON f.cliente_id = c.id
       WHERE f.id = ?`,
      [id]
    );

    if (!factura) {
      return res.status(404).json({ error: 'Factura no encontrada' });
    }

    if (!factura.rut) {
      return res.status(400).json({ error: 'El cliente no tiene RUT asignado. Es obligatorio para el SII.' });
    }

    // 2. Llamada real al servicio de facturación
    const result = await billingService.sendFactura(factura, factura, []);

    // 3. Actualizar estado y guardar folio/trackId si es necesario
    await db.runAsync(
      'UPDATE facturas SET estado = ?, updated_at = ? WHERE id = ?',
      ['pagada', new Date().toISOString(), id]
    );

    res.json({
      success: true,
      message: result.message || 'Documento tributario emitido con éxito',
      folio: result.folio,
      trackId: result.trackId,
      pdfUrl: result.pdfUrl
    });
  } catch (err) {
    logger.error('Error al subir factura al SII:', err);
    res.status(500).json({ error: 'Error en la conexión con el servicio de facturación' });
  }
});

module.exports = router;
