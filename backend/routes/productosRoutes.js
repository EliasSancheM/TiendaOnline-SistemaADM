const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const db = require('../config/database');
const logger = require('../config/logger');
const { paginacion, meta } = require('../utils/paginacion');
const { productoSchema, validate } = require('../middlewares/validatorMiddleware');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { idNumerico } = require('../middlewares/idMiddleware');
const { esViolacionDeReferencia } = require('../utils/erroresDb');
const { PRODUCTOS_DIR, eliminarImagen } = require('../config/uploads');

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

/**
 * multer con los errores traducidos.
 *
 * Sin esto, subir una foto de más de 5 MB —cosa habitual con una cámara de
 * móvil— o un archivo que no es imagen terminaba en el manejador global de
 * errores, que responde 500 "Error interno del servidor". El usuario no tenía
 * forma de saber que bastaba con reducir la imagen.
 */
const subirImagen = (req, res, next) => {
  upload.single('imagen')(req, res, (err) => {
    if (!err) return next();

    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'La imagen pesa más de 5 MB. Reduce su tamaño e inténtalo de nuevo.'
      });
    }
    if (/Solo se permiten imágenes/.test(err.message || '')) {
      return res.status(400).json({
        error: 'El archivo debe ser una imagen (JPG, PNG o WEBP).'
      });
    }

    logger.error('Error procesando la imagen del producto:', err);
    return res.status(400).json({ error: 'No se pudo procesar la imagen enviada.' });
  });
};

/**
 * Si la petición acaba en error, borra la imagen que multer ya había escrito.
 *
 * multer guarda el archivo en disco ANTES de que Joi valide el cuerpo, así que
 * cada intento fallido (un nombre demasiado corto, un precio inválido) dejaba
 * una imagen que ningún producto referenciaba.
 */
const descartarSubidaFallida = (req, res, next) => {
  res.on('finish', () => {
    if (res.statusCode >= 400 && req.file) {
      eliminarImagen(`/uploads/productos/${req.file.filename}`);
    }
  });
  next();
};

// GET /api/productos — Listar productos con paginación
router.get('/', async (req, res) => {
  try {
    const { buscar } = req.query;
    const { limit: parsedLimit, offset, page: paginaActual } = paginacion(req.query);

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
      pagination: meta({ page: paginaActual, limit: parsedLimit }, countRow.total)
    });
  } catch (err) {
    logger.error('Error listando productos:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

// GET /api/productos/:id — Obtener detalle de un producto
router.get('/:id', idNumerico, async (req, res) => {
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
router.post('/', authenticateToken, authorizeRole(['admin', 'empleado']), descartarSubidaFallida, subirImagen, validate(productoSchema), async (req, res) => {
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
router.put('/:id', authenticateToken, authorizeRole(['admin', 'empleado']), idNumerico, descartarSubidaFallida, subirImagen, validate(productoSchema), async (req, res) => {
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
    
    // La foto anterior ya no la referencia nadie: fuera del disco. En
    // producción las imágenes viven en un volumen de pago que solo crecía.
    if (req.file && existing.imagen_url && existing.imagen_url !== imagen_url) {
      eliminarImagen(existing.imagen_url);
    }

    logger.info(`Producto actualizado: ${nombre} (ID: ${req.params.id}) por usuario: ${req.user.username}`);
    res.json({ id: req.params.id, nombre, precio, descripcion, imagen_url });
  } catch (err) {
    logger.error('Error actualizando producto:', err);
    res.status(500).json({ error: 'Error al actualizar el producto' });
  }
});

// DELETE /api/productos/:id — Eliminar producto (solo admin)
router.delete('/:id', authenticateToken, authorizeRole(['admin']), idNumerico, async (req, res) => {
  try {
    // Se lee la ruta de la imagen antes de borrar la fila: después ya no
    // habría forma de saber qué archivo quedó suelto en el disco.
    const existente = await db.getAsync('SELECT imagen_url FROM productos WHERE id = ?', [req.params.id]);

    const result = await db.runAsync('DELETE FROM productos WHERE id = ?', [req.params.id]);
    if (result.changes === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }

    if (existente) eliminarImagen(existente.imagen_url);
    logger.info(`Producto eliminado (ID: ${req.params.id}) por usuario: ${req.user.username}`);
    res.json({ message: 'Producto eliminado' });
  } catch (err) {
    // El producto aparece en pedidos anteriores. Borrarlo dejaría esos
    // pedidos sin línea, así que la base lo impide y se explica.
    if (esViolacionDeReferencia(err)) {
      return res.status(409).json({
        error: 'No se puede eliminar el producto porque aparece en pedidos ya registrados. Puedes cambiarle el precio o el nombre, pero no borrarlo.'
      });
    }
    logger.error('Error eliminando producto:', err);
    res.status(500).json({ error: 'Error al eliminar el producto' });
  }
});

module.exports = router;
