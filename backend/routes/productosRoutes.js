const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
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

// GET /api/productos/diagnostico/almacenamiento — ¿dónde acaban las fotos?
//
// Existe porque este problema se ha repetido dos veces y desde fuera es
// indistinguible: el disco de un contenedor es efímero, así que las imágenes se
// suben bien, se ven bien, y desaparecen en el siguiente despliegue. La base de
// datos conserva la ruta, de modo que el panel sigue pidiendo un archivo que ya
// no existe y solo se ve un hueco.
//
// Esto responde con hechos: qué carpeta se está usando de verdad, si la
// variable está puesta, cuántos archivos hay y cuántos productos apuntan a una
// foto que ya no está.
router.get('/diagnostico/almacenamiento', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const variableConfigurada = !!process.env.UPLOADS_DIR;

    let existe = false;
    let escribible = false;
    let archivos = [];
    try {
      archivos = fs.readdirSync(PRODUCTOS_DIR);
      existe = true;
      fs.accessSync(PRODUCTOS_DIR, fs.constants.W_OK);
      escribible = true;
    } catch (e) {
      // existe/escribible se quedan en false; no es un error de la petición
    }

    const enDisco = new Set(archivos);
    const productos = await db.allAsync(
      'SELECT id, nombre, imagen_url FROM productos WHERE imagen_url IS NOT NULL'
    );
    const rotas = productos.filter(p => !enDisco.has(path.basename(p.imagen_url)));

    // Sin la variable, la carpeta vive dentro del contenedor y se borra en cada
    // despliegue. Con ella, depende de que haya un volumen montado en esa ruta,
    // cosa que el proceso no puede comprobar por sí mismo.
    const persistente = variableConfigurada ? 'depende del volumen' : 'no';

    res.json({
      directorio: PRODUCTOS_DIR,
      variableConfigurada,
      existe,
      escribible,
      archivosEnDisco: archivos.length,
      productosConFoto: productos.length,
      fotosRotas: rotas.length,
      ejemplosRotos: rotas.slice(0, 5).map(p => ({ id: p.id, nombre: p.nombre, imagen_url: p.imagen_url })),
      persistente,
      diagnostico: !variableConfigurada
        ? 'UPLOADS_DIR no está definida: las fotos se guardan dentro del contenedor y se borrarán en el próximo despliegue. Monta un volumen y apunta UPLOADS_DIR a su ruta.'
        : (!existe
          ? `La carpeta ${PRODUCTOS_DIR} no existe. Comprueba que el volumen esté montado en esa ruta.`
          : (rotas.length > 0
            ? `Hay ${rotas.length} producto(s) apuntando a una foto que ya no está en el disco. Si esto ocurre tras un despliegue, el volumen no está montado donde apunta UPLOADS_DIR.`
            : 'Todo correcto: la carpeta existe, se puede escribir y todas las fotos están.'))
    });
  } catch (err) {
    logger.error('Error en el diagnóstico de almacenamiento:', err);
    res.status(500).json({ error: 'No se pudo comprobar el almacenamiento' });
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
