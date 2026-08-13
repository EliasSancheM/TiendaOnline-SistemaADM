const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../config/logger');
const { clienteSchema, validate } = require('../middlewares/validatorMiddleware');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');

// GET /api/clientes — Listar clientes con paginación
// Solo admin y empleado: expone datos personales completos (email, teléfono,
// dirección). El rol contador NO entra aquí; para facturar dispone de
// GET /api/facturas/clientes-facturables, que devuelve el mínimo necesario.
router.get('/', authenticateToken, authorizeRole(['admin', 'empleado']), async (req, res) => {
  try {
    const { page = 1, limit = 50, buscar } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit)));

    let whereClause = '1=1';
    const params = [];

    if (buscar) {
      whereClause += ' AND (nombre LIKE ? OR email LIKE ? OR telefono LIKE ?)';
      const search = `%${buscar}%`;
      params.push(search, search, search);
    }

    const countRow = await db.getAsync(
      `SELECT COUNT(*) as total FROM clientes WHERE ${whereClause}`,
      params
    );

    const rows = await db.allAsync(
      `SELECT * FROM clientes WHERE ${whereClause} ORDER BY nombre LIMIT ? OFFSET ?`,
      [...params, parsedLimit, offset]
    );

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
    logger.error('Error listando clientes:', err);
    res.status(500).json({ error: 'Error al obtener clientes' });
  }
});

// GET /api/clientes/:id — Detalle de un cliente
router.get('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), async (req, res) => {
  try {
    const row = await db.getAsync('SELECT * FROM clientes WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    res.json(row);
  } catch (err) {
    logger.error('Error obteniendo cliente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/clientes — Crear cliente
router.post('/', authenticateToken, authorizeRole(['admin', 'empleado']), validate(clienteSchema), async (req, res) => {
  try {
    const { nombre, telefono, direccion, email, rut, giro } = req.body;
    const result = await db.runAsync(
      'INSERT INTO clientes (nombre, telefono, direccion, email, rut, giro) VALUES (?, ?, ?, ?, ?, ?)',
      [nombre, telefono, direccion, email, rut, giro]
    );
    logger.info(`Cliente creado: ${nombre} por usuario: ${req.user.username}`);
    res.status(201).json({ id: result.lastID, nombre, telefono, direccion, email, rut, giro });
  } catch (err) {
    logger.error('Error creando cliente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// PUT /api/clientes/:id — Actualizar cliente
router.put('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), validate(clienteSchema), async (req, res) => {
  try {
    const { nombre, telefono, direccion, email, rut, giro } = req.body;
    const result = await db.runAsync(
      'UPDATE clientes SET nombre = ?, telefono = ?, direccion = ?, email = ?, rut = ?, giro = ? WHERE id = ?',
      [nombre, telefono, direccion, email, rut, giro, req.params.id]
    );
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    logger.info(`Cliente actualizado: ${nombre} por usuario: ${req.user.username}`);
    res.json({ id: req.params.id, nombre, telefono, direccion, email, rut, giro });
  } catch (err) {
    logger.error('Error actualizando cliente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// DELETE /api/clientes/:id — Eliminar cliente (solo admin)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await db.runAsync('DELETE FROM clientes WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Cliente no encontrado' });
    }
    logger.info(`Cliente eliminado (ID: ${req.params.id}) por usuario: ${req.user.username}`);
    res.json({ message: 'Cliente eliminado' });
  } catch (err) {
    logger.error('Error eliminando cliente:', err);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
