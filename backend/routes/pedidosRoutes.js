const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../config/logger');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { pedidoSchema, validate } = require('../middlewares/validatorMiddleware');
const { ESTADOS, validarTransicion } = require('../utils/estadosPedido');

const conflicto = (mensaje) => {
  const err = new Error(mensaje);
  err.status = 409;
  return err;
};

/**
 * Recalcula las líneas de un pedido con los precios reales del catálogo.
 *
 * Los campos precio_unitario, subtotal y total que llegan en el body se
 * ignoran por completo: el panel los deriva del catálogo (ver NuevoPedido.js /
 * EditarPedido.js), así que aquí se reconstruyen igual y nadie puede fijar
 * importes arbitrarios llamando a la API directamente. Es la misma garantía
 * que ya aplicaba el checkout público.
 *
 * @param {Array} detalles líneas validadas por Joi (producto_id, cantidad)
 * @param {Object} ejecutor conexión o transacción sobre la que consultar
 * @returns {Promise<{detalles: Array, total: number}>}
 * @throws {Error} con .status = 400 si algún producto no existe
 */
async function recalcularImportes(detalles, ejecutor) {
  if (!detalles || detalles.length === 0) {
    return { detalles: [], total: 0 };
  }

  const ids = [...new Set(detalles.map(d => d.producto_id))];
  const placeholders = ids.map(() => '?').join(',');
  const productos = await ejecutor.allAsync(
    `SELECT id, precio FROM productos WHERE id IN (${placeholders})`,
    ids
  );

  const precios = new Map(productos.map(p => [p.id, p.precio]));

  const lineas = detalles.map(d => {
    const precio = precios.get(d.producto_id);
    if (precio === undefined) {
      const err = new Error(`El producto con ID ${d.producto_id} no existe en el catálogo`);
      err.status = 400;
      throw err;
    }
    return {
      producto_id: d.producto_id,
      cantidad: d.cantidad,
      precio_unitario: precio,
      subtotal: precio * d.cantidad
    };
  });

  return {
    detalles: lineas,
    total: lineas.reduce((suma, l) => suma + l.subtotal, 0)
  };
}

// GET /api/pedidos — Listar pedidos con filtros y paginación
// Solo admin y empleado (operación diaria). El contador no factura desde aquí:
// usa GET /api/facturas/pedidos-disponibles, que ya filtra lo no facturado.
router.get('/', authenticateToken, authorizeRole(['admin', 'empleado']), async (req, res) => {
  try {
    const { fecha, periodo, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit)));
    
    let whereClause = '1=1';
    const params = [];
 
    if (fecha) {
      whereClause += ` AND ${db.helpers.date('p.fecha')} = ?`;
      params.push(fecha);
    }
    if (periodo) {
      whereClause += ' AND p.periodo = ?';
      params.push(periodo);
    }
 
    // Obtener total para paginación
    const countRow = await db.getAsync(
      `SELECT COUNT(*) as total FROM pedidos p WHERE ${whereClause}`,
      params
    );
 
    const query = `
      SELECT p.*, c.nombre as cliente_nombre 
      FROM pedidos p 
      LEFT JOIN clientes c ON p.cliente_id = c.id 
      WHERE ${whereClause}
      ORDER BY p.fecha DESC, p.periodo
      LIMIT ? OFFSET ?
    `;
 
    const rows = await db.allAsync(query, [...params, parsedLimit, offset]);
 
    res.json({
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parsedLimit,
        total: countRow.total,
        totalPages: Math.ceil(countRow.total / parsedLimit)
      }
    });
  } catch (err) {
    logger.error('Error listando pedidos:', err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});
 
// GET /api/pedidos/dashboard-stats — Estadísticas para el dashboard
router.get('/dashboard-stats', authenticateToken, authorizeRole(['admin', 'empleado', 'contador']), async (req, res) => {
  try {
    // Para mantener compatibilidad entre SQLite y Postgres sin funciones específicas,
    // traemos los detalles y pedidos del último año y agrupamos en memoria.
    // Esto es muy rápido para el volumen de una panadería.
    const lastYearDate = new Date();
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
    const lastYearStr = lastYearDate.toISOString().split('T')[0];

    const pedidos = await db.allAsync(`SELECT id, fecha, total FROM pedidos WHERE fecha >= ?`, [lastYearStr]);
    const detalles = await db.allAsync(`
      SELECT d.producto_id, d.cantidad, d.subtotal, p.nombre, p.descripcion, p.precio 
      FROM detalles_pedido d
      JOIN productos p ON d.producto_id = p.id
      JOIN pedidos pe ON d.pedido_id = pe.id
      WHERE pe.fecha >= ?
    `, [lastYearStr]);

    // 1. Productos Populares
    const productosMap = {};
    for (const d of detalles) {
      if (!productosMap[d.producto_id]) {
        productosMap[d.producto_id] = {
          id: d.producto_id,
          nombre: d.nombre,
          descripcion: d.descripcion,
          precio: d.precio,
          cantidadVendida: 0,
          ingresosTotales: 0
        };
      }
      productosMap[d.producto_id].cantidadVendida += d.cantidad;
      productosMap[d.producto_id].ingresosTotales += d.subtotal;
    }
    const productosPopulares = Object.values(productosMap)
      .sort((a, b) => b.cantidadVendida - a.cantidadVendida)
      .slice(0, 5);

    // 2. Ventas Semanales (Últimos 7 días)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysStr = sevenDaysAgo.toISOString().split('T')[0];
    
    const weeklyMap = {};
    // Rellenar los últimos 7 días con 0
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weeklyMap[d.toISOString().split('T')[0]] = 0;
    }

    // 3. Ventas Mensuales (Últimos 12 meses)
    const monthlyMap = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const monthStr = d.toISOString().substring(0, 7); // YYYY-MM
      monthlyMap[monthStr] = 0;
    }

    for (const p of pedidos) {
      const pDate = p.fecha.substring(0, 10);
      const pMonth = p.fecha.substring(0, 7);
      
      if (pDate >= sevenDaysStr) {
        if (weeklyMap[pDate] !== undefined) {
          weeklyMap[pDate] += p.total;
        }
      }
      
      if (monthlyMap[pMonth] !== undefined) {
        monthlyMap[pMonth] += p.total;
      }
    }

    const ventasSemanales = Object.keys(weeklyMap).map(date => ({ date, total: weeklyMap[date] }));
    const ventasMensuales = Object.keys(monthlyMap).map(month => ({ month, total: monthlyMap[month] }));

    res.json({
      productosPopulares,
      ventasSemanales,
      ventasMensuales
    });

  } catch (err) {
    logger.error('Error calculando stats del dashboard:', err);
    res.status(500).json({ error: 'Error al calcular estadísticas' });
  }
});

// GET /api/pedidos/:id — Detalle de un pedido con sus líneas
router.get('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), async (req, res) => {
  try {
    const pedido = await db.getAsync(
      `SELECT p.*, c.nombre as cliente_nombre 
       FROM pedidos p 
       LEFT JOIN clientes c ON p.cliente_id = c.id 
       WHERE p.id = ?`,
      [req.params.id]
    );
 
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }
 
    const detalles = await db.allAsync(
      `SELECT d.*, p.nombre as producto_nombre 
       FROM detalles_pedido d 
       JOIN productos p ON d.producto_id = p.id 
       WHERE d.pedido_id = ?`,
      [req.params.id]
    );
 
    pedido.detalles = detalles;
    res.json(pedido);
  } catch (err) {
    logger.error('Error obteniendo pedido:', err);
    res.status(500).json({ error: 'Error al obtener el pedido' });
  }
});
 
// POST /api/pedidos — Crear pedido con detalles (transacción)
router.post('/', authenticateToken, authorizeRole(['admin', 'empleado']), validate(pedidoSchema), async (req, res) => {
  const { cliente_id, fecha, periodo, estado, notas, detalles } = req.body;

  try {
    const { pedidoId, total } = await db.transaction(async (tx) => {
      // El total del body se descarta: manda el catálogo.
      const importes = await recalcularImportes(detalles, tx);

      const result = await tx.runAsync(
        'INSERT INTO pedidos (cliente_id, fecha, periodo, estado, total, notas) VALUES (?, ?, ?, ?, ?, ?)',
        [cliente_id, fecha, periodo, estado || 'pendiente', importes.total, notas]
      );
      const id = result.lastID;

      for (const linea of importes.detalles) {
        await tx.runAsync(
          'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
          [id, linea.producto_id, linea.cantidad, linea.precio_unitario, linea.subtotal]
        );
      }
      return { pedidoId: id, total: importes.total };
    });

    logger.info(`Pedido creado (ID: ${pedidoId}, total recalculado: ${total}) por usuario: ${req.user.username}`);
    res.status(201).json({
      id: pedidoId,
      cliente_id,
      fecha,
      periodo,
      estado: estado || 'pendiente',
      total,
      notas,
    });
  } catch (err) {
    if (err.status === 400) {
      return res.status(400).json({ error: err.message });
    }
    logger.error('Error creando pedido:', err);
    res.status(500).json({ error: 'Error al crear el pedido' });
  }
});

// PUT /api/pedidos/:id — Actualizar pedido y sus detalles (transacción)
router.put('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), validate(pedidoSchema), async (req, res) => {
  const { cliente_id, fecha, periodo, estado, notas, detalles } = req.body;

  try {
    const total = await db.transaction(async (tx) => {
      const actual = await tx.getAsync('SELECT estado FROM pedidos WHERE id = ?', [req.params.id]);
      if (!actual) {
        throw new Error('Pedido no encontrado');
      }

      // Editar un pedido mientras Webpay resuelve el cobro cambiaría el total
      // que Transbank tiene reservado, y el callback rechazaría el pago por
      // descuadre de monto. Se bloquea de forma explícita.
      if (actual.estado === 'pendiente_pago') {
        throw conflicto('El pedido tiene un pago en curso y no puede editarse desde el panel. Espera la respuesta de Webpay.');
      }

      const rechazo = validarTransicion(actual.estado, estado);
      if (rechazo) {
        throw conflicto(rechazo);
      }

      let totalCalculado;
      const reemplazaDetalles = detalles && Array.isArray(detalles);

      if (reemplazaDetalles) {
        // Se envían líneas nuevas: se revalorizan con el catálogo actual.
        const importes = await recalcularImportes(detalles, tx);
        totalCalculado = importes.total;

        await tx.runAsync('DELETE FROM detalles_pedido WHERE pedido_id = ?', [req.params.id]);
        for (const linea of importes.detalles) {
          await tx.runAsync(
            'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, linea.producto_id, linea.cantidad, linea.precio_unitario, linea.subtotal]
          );
        }
      } else {
        // No se tocan las líneas (p. ej. editar solo las notas): el total sale
        // de los subtotales ya guardados, no del body. Así no se revaloriza un
        // pedido histórico por un cambio de precio posterior, y el cliente
        // tampoco puede imponer un total.
        const fila = await tx.getAsync(
          'SELECT SUM(subtotal) as total FROM detalles_pedido WHERE pedido_id = ?',
          [req.params.id]
        );
        totalCalculado = (fila && fila.total) || 0;
      }

      const updateResult = await tx.runAsync(
        'UPDATE pedidos SET cliente_id = ?, fecha = ?, periodo = ?, estado = ?, total = ?, notas = ? WHERE id = ?',
        [cliente_id, fecha, periodo, estado, totalCalculado, notas, req.params.id]
      );

      if (updateResult.changes === 0) {
        throw new Error('Pedido no encontrado');
      }

      return totalCalculado;
    });

    logger.info(`Pedido actualizado (ID: ${req.params.id}, total recalculado: ${total}) por usuario: ${req.user.username}`);
    res.json({
      id: req.params.id,
      cliente_id,
      fecha,
      periodo,
      estado,
      total,
      notas,
    });
  } catch (err) {
    if (err.message === 'Pedido no encontrado') {
      return res.status(404).json({ error: err.message });
    }
    if (err.status === 400 || err.status === 409) {
      return res.status(err.status).json({ error: err.message });
    }
    logger.error('Error actualizando pedido:', err);
    res.status(500).json({ error: 'Error al actualizar el pedido' });
  }
});

// PATCH /api/pedidos/:id/estado — Actualizar solo el estado del pedido
router.patch('/:id/estado', authenticateToken, authorizeRole(['admin', 'empleado']), async (req, res) => {
  const { estado } = req.body;
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }

  try {
    const pedido = await db.getAsync('SELECT estado FROM pedidos WHERE id = ?', [req.params.id]);
    if (!pedido) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    const rechazo = validarTransicion(pedido.estado, estado);
    if (rechazo) {
      logger.warn(
        `Transición de estado rechazada (pedido ${req.params.id}: ${pedido.estado} -> ${estado}) ` +
        `solicitada por usuario: ${req.user.username}`
      );
      return res.status(409).json({ error: rechazo });
    }

    // Condicionado al estado que acabamos de leer: si otra petición lo cambió
    // entretanto, esta no lo pisa.
    const result = await db.runAsync(
      'UPDATE pedidos SET estado = ? WHERE id = ? AND estado = ?',
      [estado, req.params.id, pedido.estado]
    );

    if (result.changes === 0) {
      return res.status(409).json({
        error: 'El pedido cambió de estado mientras se procesaba la solicitud. Recarga la página e intenta de nuevo.'
      });
    }

    logger.info(`Estado de pedido actualizado (ID: ${req.params.id}: ${pedido.estado} -> ${estado}) por usuario: ${req.user.username}`);
    res.json({ message: 'Estado actualizado correctamente' });
  } catch (err) {
    logger.error('Error actualizando estado del pedido:', err);
    res.status(500).json({ error: 'Error al actualizar el estado del pedido' });
  }
});

// DELETE /api/pedidos/:id — Eliminar pedido (CASCADE elimina detalles)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await db.runAsync('DELETE FROM pedidos WHERE id = ?', [req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    logger.info(`Pedido eliminado (ID: ${req.params.id}) por usuario: ${req.user.username}`);
    res.json({ message: 'Pedido eliminado' });
  } catch (err) {
    logger.error('Error eliminando pedido:', err);
    res.status(500).json({ error: 'Error al eliminar el pedido' });
  }
});

module.exports = router;
