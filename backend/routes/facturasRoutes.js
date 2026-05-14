const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../config/logger');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { facturaSchema, validate } = require('../middlewares/validatorMiddleware');
const billingService = require('../services/billingService');

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

    // Formatear mes con zero-padding para SQLite
    const mesFormatted = String(currentMes).padStart(2, '0');
    const pattern = `${currentAnio}-${mesFormatted}-%`;

    const stats = await db.getAsync(
      `SELECT 
        COUNT(*) as total_documentos,
        SUM(subtotal) as neto,
        SUM(impuestos) as iva,
        SUM(total) as total,
        SUM(CASE WHEN estado = 'pagada' THEN total ELSE 0 END) as recaudado
       FROM facturas 
       WHERE fecha LIKE ?`,
      [pattern]
    );

    const porEstado = await db.allAsync(
      `SELECT estado, COUNT(*) as cantidad, SUM(total) as monto 
       FROM facturas 
       WHERE fecha LIKE ? 
       GROUP BY estado`,
      [pattern]
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
  const { cliente_id, pedidos_ids, numero_factura, fecha, subtotal, impuestos, total, estado, notas } = req.body;

  try {
    const facturaId = await db.transaction(async (tx) => {
      const result = await tx.runAsync(
        `INSERT INTO facturas (cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado, notas) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado, notas]
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
      return id;
    });

    logger.info(`Factura creada (ID: ${facturaId}, Nro: ${numero_factura}) por usuario: ${req.user.username}`);
    res.status(201).json({
      id: facturaId,
      message: 'Factura creada correctamente'
    });
  } catch (err) {
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
  const { cliente_id, pedidos_ids, numero_factura, fecha, subtotal, impuestos, total, estado, notas } = req.body;

  try {
    await db.transaction(async (tx) => {
      const updateResult = await tx.runAsync(
        `UPDATE facturas SET
          cliente_id = ?, numero_factura = ?, fecha = ?,
          subtotal = ?, impuestos = ?, total = ?, estado = ?, notas = ?,
          updated_at = ${tx.helpers.now()}
        WHERE id = ?`,
        [cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado, notas, id]
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
    if (err.message && (err.message.includes('UNIQUE constraint failed') || err.message.includes('duplicate key value'))) {
      return res.status(400).json({ error: 'El número de factura ya existe' });
    }
    logger.error('Error actualizando factura:', err);
    res.status(500).json({ error: 'Error al actualizar the factura' });
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
