const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const logger = require('../config/logger');
const { productoSchema, validate } = require('../middlewares/validatorMiddleware');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { PRODUCTOS_DIR } = require('../config/uploads');

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, PRODUCTOS_DIR);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({ 
  storage: storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB limit
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se permiten imágenes'));
    }
  }
});

// GET /api/productos — Listar productos con paginación
router.get('/', async (req, res) => {
  try {
    const { page = 1, limit = 50, buscar } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
    const parsedLimit = Math.min(200, Math.max(1, parseInt(limit)));

    let whereClause = '1=1';
    const params = [];

    if (buscar) {
      const like = db.helpers.like();
      whereClause += ` AND (nombre ${like} ? OR descripcion ${like} ?)`;
      const search = `%${buscar}%`;
      params.push(search, search);
    }

    const countRow = await db.getAsync(
      `SELECT COUNT(*) as total FROM productos WHERE ${whereClause}`,
      params
    );

    const rows = await db.allAsync(
      `SELECT * FROM productos WHERE ${whereClause} ORDER BY nombre LIMIT ? OFFSET ?`,
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
    logger.error('Error listando productos:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/productos/:id — Obtener detalle de un producto
router.get('/:id', async (req, res) => {
  try {
    const row = await db.getAsync('SELECT * FROM productos WHERE id = ?', [req.params.id]);
    if (!row) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(row);
  } catch (err) {
    logger.error('Error obteniendo producto:', err);
    res.status(500).json({ error: 'Error al obtener el producto' });
  }
});

// POST /api/productos — Crear producto
router.post('/', authenticateToken, authorizeRole(['admin', 'empleado']), upload.single('imagen'), validate(productoSchema), async (req, res) => {
  try {
    const { nombre, precio, descripcion } = req.body;
    let imagen_url = null;
    
    if (req.file) {
      imagen_url = `/uploads/productos/${req.file.filename}`;
    }

    const result = await db.runAsync(
      'INSERT INTO productos (nombre, precio, descripcion, imagen_url) VALUES (?, ?, ?, ?)',
      [nombre, precio, descripcion, imagen_url]
    );
    logger.info(`Producto creado: ${nombre} (ID: ${result.lastID}) por usuario: ${req.user.username}`);
    res.status(201).json({ id: result.lastID, nombre, precio, descripcion, imagen_url });
  } catch (err) {
    logger.error('Error creando producto:', err);
    res.status(500).json({ error: 'Error al crear el producto' });
  }
});

// PUT /api/productos/:id — Actualizar producto
router.put('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), upload.single('imagen'), validate(productoSchema), async (req, res) => {
  try {
    const { nombre, precio, descripcion } = req.body;
    
    // First get existing product
    const existing = await db.getAsync('SELECT imagen_url FROM productos WHERE id = ?', [req.params.id]);
    if (!existing) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    let imagen_url = existing.imagen_url;
    if (req.file) {
      imagen_url = `/uploads/productos/${req.file.filename}`;
    }

    const result = await db.runAsync(
      'UPDATE productos SET nombre = ?, precio = ?, descripcion = ?, imagen_url = ? WHERE id = ?',
      [nombre, precio, descripcion, imagen_url, req.params.id]
    );
    
    logger.info(`Producto actualizado: ${nombre} (ID: ${req.params.id}) por usuario: ${req.user.username}`);
    res.json({ id: req.params.id, nombre, precio, descripcion, imagen_url });
  } catch (err) {
    logger.error('Error actualizando producto:', err);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

// DELETE /api/productos/:id — Eliminar producto (solo admin)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const result = await db.runAsync('DELETE FROM productos WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    logger.info(`Producto eliminado (ID: ${req.params.id}) por usuario: ${req.user.username}`);
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    logger.error('Error eliminando producto:', err);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
});

module.exports = router;
