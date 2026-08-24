const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../config/logger');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { pedidoSchema, validate } = require('../middlewares/validatorMiddleware');

// GET /api/pedidos — Listar pedidos con filtros y paginación
router.get('/', authenticateToken, async (req, res) => {
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

    // `fecha` llega como texto 'YYYY-MM-DD' en ambos motores (ver el type parser
    // de DATE en config/database.js). Se normaliza igualmente por si algún driver
    // entrega un Date: esta ruta alimenta la portada del panel y no debe caerse.
    const aTextoFecha = (valor) => {
      if (valor instanceof Date) {
        const dosDigitos = (n) => String(n).padStart(2, '0');
        return `${valor.getFullYear()}-${dosDigitos(valor.getMonth() + 1)}-${dosDigitos(valor.getDate())}`;
      }
      return String(valor);
    };

    for (const p of pedidos) {
      const fechaTexto = aTextoFecha(p.fecha);
      const pDate = fechaTexto.substring(0, 10);
      const pMonth = fechaTexto.substring(0, 7);
      
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
router.get('/:id', authenticateToken, async (req, res) => {
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
  const { cliente_id, fecha, periodo, estado, total, notas, detalles } = req.body;
 
  try {
    const pedidoId = await db.transaction(async (tx) => {
      const result = await tx.runAsync(
        'INSERT INTO pedidos (cliente_id, fecha, periodo, estado, total, notas) VALUES (?, ?, ?, ?, ?, ?)',
        [cliente_id, fecha, periodo, estado || 'pendiente', total || 0, notas]
      );
      const id = result.lastID;
 
      if (detalles && detalles.length > 0) {
        for (const detalle of detalles) {
          await tx.runAsync(
            'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
            [id, detalle.producto_id, detalle.cantidad, detalle.precio_unitario, detalle.subtotal]
          );
        }
      }
      return id;
    });
 
    logger.info(`Pedido creado (ID: ${pedidoId}) por usuario: ${req.user.username}`);
    res.status(201).json({
      id: pedidoId,
      cliente_id,
      fecha,
      periodo,
      estado: estado || 'pendiente',
      total: total || 0,
      notas,
    });
  } catch (err) {
    logger.error('Error creando pedido:', err);
    res.status(500).json({ error: 'Error al crear el pedido' });
  }
});

// PUT /api/pedidos/:id — Actualizar pedido y sus detalles (transacción)
router.put('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), validate(pedidoSchema), async (req, res) => {
  const { cliente_id, fecha, periodo, estado, total, notas, detalles } = req.body;

  try {
    await db.transaction(async (tx) => {
      const updateResult = await tx.runAsync(
        'UPDATE pedidos SET cliente_id = ?, fecha = ?, periodo = ?, estado = ?, total = ?, notas = ? WHERE id = ?',
        [cliente_id, fecha, periodo, estado, total, notas, req.params.id]
      );

      if (updateResult.changes === 0) {
        throw new Error('Pedido no encontrado');
      }

      // Si se proporcionan detalles, reemplazar todos
      if (detalles && Array.isArray(detalles)) {
        await tx.runAsync('DELETE FROM detalles_pedido WHERE pedido_id = ?', [req.params.id]);

        for (const detalle of detalles) {
          await tx.runAsync(
            'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
            [req.params.id, detalle.producto_id, detalle.cantidad, detalle.precio_unitario, detalle.subtotal]
          );
        }
      }
    });

    logger.info(`Pedido actualizado (ID: ${req.params.id}) por usuario: ${req.user.username}`);
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
    logger.error('Error actualizando pedido:', err);
    res.status(500).json({ error: 'Error al actualizar el pedido' });
  }
});

// PATCH /api/pedidos/:id/estado — Actualizar solo el estado del pedido
router.patch('/:id/estado', authenticateToken, authorizeRole(['admin', 'empleado']), async (req, res) => {
  const { estado } = req.body;
  if (!['pendiente', 'en_proceso', 'completado', 'cancelado'].includes(estado)) {
    return res.status(400).json({ error: 'Estado no válido' });
  }

  try {
    const result = await db.runAsync(
      'UPDATE pedidos SET estado = ? WHERE id = ?',
      [estado, req.params.id]
    );

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    logger.info(`Estado de pedido actualizado (ID: ${req.params.id} -> ${estado}) por usuario: ${req.user.username}`);
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
