const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../config/logger');
const { paginacion, meta } = require('../utils/paginacion');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { idNumerico } = require('../middlewares/idMiddleware');
const { esViolacionDeReferencia } = require('../utils/erroresDb');
const { pedidoSchema, validate } = require('../middlewares/validatorMiddleware');
const { ESTADOS, validarTransicion, filtroComputables } = require('../utils/estadosPedido');
const { soloFecha, soloMes } = require('../utils/fechas');

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
    const { fecha, periodo } = req.query;
    const { limit: parsedLimit, offset, page: paginaActual } = paginacion(req.query);
    
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
      pagination: meta({ page: paginaActual, limit: parsedLimit }, countRow.total)
    });
  } catch (err) {
    logger.error('Error listando pedidos:', err);
    res.status(500).json({ error: 'Error al obtener pedidos' });
  }
});
 
/**
 * Cifras del panel de inicio, contadas por la base de datos.
 *
 * Antes las calculaba el navegador sobre /api/pedidos?limit=200 y
 * /api/clientes?limit=200. Eso traia dos problemas:
 *   1. A partir del pedido 201 los contadores de "pendientes" y "completados"
 *      se congelaban, porque solo veian la primera pagina.
 *   2. Sumaba todos los pedidos del dia sin mirar el estado, asi que las
 *      anulaciones y los carritos abandonados en Webpay contaban como venta.
 * COUNT y SUM en el servidor resuelven ambas cosas y ademas evitan traer
 * cientos de filas al navegador para no mostrar ninguna.
 */
async function resumenOperativo() {
  const hoy = soloFecha(new Date());
  const computables = filtroComputables('estado');
  const dia = db.helpers.date('fecha');

  const [clientes, productos, delDia, pendientes, completados] = await Promise.all([
    db.getAsync('SELECT COUNT(*) as total FROM clientes'),
    db.getAsync('SELECT COUNT(*) as total FROM productos'),
    db.getAsync(
      `SELECT COUNT(*) as pedidos,
              SUM(CASE WHEN periodo = 'mañana' THEN 1 ELSE 0 END) as manana,
              SUM(CASE WHEN periodo = 'tarde' THEN 1 ELSE 0 END) as tarde,
              SUM(total) as ventas
         FROM pedidos
        WHERE ${dia} = ? AND ${computables.sql}`,
      [hoy, ...computables.params]
    ),
    db.getAsync("SELECT COUNT(*) as total FROM pedidos WHERE estado = 'pendiente'"),
    db.getAsync("SELECT COUNT(*) as total FROM pedidos WHERE estado = 'completado'")
  ]);

  const n = (v) => Number(v) || 0;
  return {
    clientes: n(clientes && clientes.total),
    productos: n(productos && productos.total),
    pedidosHoy: n(delDia && delDia.pedidos),
    pedidosManana: n(delDia && delDia.manana),
    pedidosTarde: n(delDia && delDia.tarde),
    ventasHoy: n(delDia && delDia.ventas),
    pedidosPendientes: n(pendientes && pendientes.total),
    pedidosCompletados: n(completados && completados.total)
  };
}

/** Los ultimos pedidos para la tabla del panel, en el mismo orden que ya mostraba. */
function ultimosPedidos(limite = 5) {
  return db.allAsync(
    `SELECT p.id, p.cliente_id, p.fecha, p.periodo, p.estado, p.total,
            c.nombre as cliente_nombre
       FROM pedidos p
       LEFT JOIN clientes c ON p.cliente_id = c.id
      ORDER BY p.fecha DESC, p.id DESC
      LIMIT ?`,
    [limite]
  );
}

// GET /api/pedidos/dashboard-stats — Estadísticas para el dashboard
router.get('/dashboard-stats', authenticateToken, authorizeRole(['admin', 'empleado', 'contador']), async (req, res) => {
  try {
    // Para mantener compatibilidad entre SQLite y Postgres sin funciones específicas,
    // traemos los detalles y pedidos del último año y agrupamos en memoria.
    // Esto es muy rápido para el volumen de una panadería.
    // Todas las claves y límites se calculan en hora LOCAL, igual que las fechas
    // que se guardan en `pedidos.fecha`. Con toISOString() se usaba UTC: en
    // Chile (UTC-4), entre las 20:00 y medianoche el día "de hoy" se etiquetaba
    // con la fecha de mañana y las ventas del día aparecían en cero.
    const lastYearDate = new Date();
    lastYearDate.setFullYear(lastYearDate.getFullYear() - 1);
    const lastYearStr = soloFecha(lastYearDate);

    // Solo cuentan los pedidos que son una venta real: uno anulado, o uno que se
    // quedó en 'pendiente_pago' porque el cliente abandonó el carrito en Webpay,
    // no es un ingreso. Antes ambos engordaban las gráficas de ventas y el
    // ranking de productos más vendidos.
    const computables = filtroComputables('estado');
    const computablesJoin = filtroComputables('pe.estado');

    const pedidos = await db.allAsync(
      `SELECT id, fecha, total FROM pedidos WHERE fecha >= ? AND ${computables.sql}`,
      [lastYearStr, ...computables.params]
    );
    const detalles = await db.allAsync(`
      SELECT d.producto_id, d.cantidad, d.subtotal, p.nombre, p.descripcion, p.precio
      FROM detalles_pedido d
      JOIN productos p ON d.producto_id = p.id
      JOIN pedidos pe ON d.pedido_id = pe.id
      WHERE pe.fecha >= ? AND ${computablesJoin.sql}
    `, [lastYearStr, ...computablesJoin.params]);

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
    const sevenDaysStr = soloFecha(sevenDaysAgo);

    const weeklyMap = {};
    // Rellenar los últimos 7 días con 0
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      weeklyMap[soloFecha(d)] = 0;
    }

    // 3. Ventas Mensuales (Últimos 12 meses)
    const monthlyMap = {};
    for (let i = 11; i >= 0; i--) {
      const d = new Date();
      d.setDate(1); // evita que setMonth se desborde en los días 29-31
      d.setMonth(d.getMonth() - i);
      monthlyMap[soloMes(d)] = 0;
    }

    for (const p of pedidos) {
      const pDate = soloFecha(p.fecha);
      const pMonth = soloMes(p.fecha);
      const importe = Number(p.total) || 0;

      if (pDate >= sevenDaysStr) {
        if (weeklyMap[pDate] !== undefined) {
          weeklyMap[pDate] += importe;
        }
      }

      if (monthlyMap[pMonth] !== undefined) {
        monthlyMap[pMonth] += importe;
      }
    }

    const ventasSemanales = Object.keys(weeklyMap).map(date => ({ date, total: weeklyMap[date] }));
    const ventasMensuales = Object.keys(monthlyMap).map(month => ({ month, total: monthlyMap[month] }));

    const respuesta = { productosPopulares, ventasSemanales, ventasMensuales };

    // El contador no participa en la operación diaria y tiene vetado el acceso a
    // los datos de clientes (ver clientesRoutes.js), así que no se le envían ni
    // el resumen del día ni los últimos pedidos con el nombre del cliente. Su
    // panel se arma con /api/facturas/reporte.
    if (req.user.role !== 'contador') {
      const [resumen, pedidosRecientes] = await Promise.all([
        resumenOperativo(),
        ultimosPedidos(5)
      ]);
      respuesta.resumen = resumen;
      respuesta.pedidosRecientes = pedidosRecientes;
    }

    res.json(respuesta);

  } catch (err) {
    logger.error('Error calculando stats del dashboard:', err);
    res.status(500).json({ error: 'Error al calcular estadísticas' });
  }
});

// GET /api/pedidos/:id — Detalle de un pedido con sus líneas
router.get('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), idNumerico, async (req, res) => {
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
    // cliente_id apunta a un cliente que no existe (o que se borró entretanto).
    // Es un dato mal enviado, no una avería: 400 y se dice cuál es el problema.
    if (esViolacionDeReferencia(err)) {
      return res.status(400).json({ error: 'El cliente indicado no existe' });
    }
    logger.error('Error creando pedido:', err);
    res.status(500).json({ error: 'Error al crear el pedido' });
  }
});

// PUT /api/pedidos/:id — Actualizar pedido y sus detalles (transacción)
router.put('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), idNumerico, validate(pedidoSchema), async (req, res) => {
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
    // cliente_id apunta a un cliente que no existe (o que se borró entretanto).
    // Es un dato mal enviado, no una avería: 400 y se dice cuál es el problema.
    if (esViolacionDeReferencia(err)) {
      return res.status(400).json({ error: 'El cliente indicado no existe' });
    }
    logger.error('Error actualizando pedido:', err);
    res.status(500).json({ error: 'Error al actualizar el pedido' });
  }
});

// PATCH /api/pedidos/:id/estado — Actualizar solo el estado del pedido
router.patch('/:id/estado', authenticateToken, authorizeRole(['admin', 'empleado']), idNumerico, async (req, res) => {
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
router.delete('/:id', authenticateToken, authorizeRole(['admin']), idNumerico, async (req, res) => {
  try {
    const result = await db.runAsync('DELETE FROM pedidos WHERE id = ?', [req.params.id]);

    if (result.changes === 0) {
      return res.status(404).json({ error: 'Pedido no encontrado' });
    }

    logger.info(`Pedido eliminado (ID: ${req.params.id}) por usuario: ${req.user.username}`);
    res.json({ message: 'Pedido eliminado' });
  } catch (err) {
    // El pedido está incluido en una factura emitida: borrarlo descuadraría
    // ese documento, así que la referencia lo protege.
    if (esViolacionDeReferencia(err)) {
      return res.status(409).json({
        error: 'No se puede eliminar el pedido porque está incluido en una factura. Quítalo de la factura o anula la factura primero.'
      });
    }
    logger.error('Error eliminando pedido:', err);
    res.status(500).json({ error: 'Error al eliminar el pedido' });
  }
});

module.exports = router;
