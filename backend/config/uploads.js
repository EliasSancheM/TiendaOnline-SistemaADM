const path = require('path');
const fs = require('fs');
const logger = require('./logger');

// Directorio donde se guardan las imágenes subidas.
//
// El disco de un contenedor (Railway, Render, etc.) es EFÍMERO: todo lo escrito
// dentro se pierde en cada redespliegue o reinicio. Si las fotos de productos se
// guardan ahí, el cliente las ve desaparecer sin explicación.
//
// Por eso la ruta es configurable: en producción se apunta UPLOADS_DIR al punto
// de montaje de un volumen persistente (en Railway: Service → Settings → Volumes,
// p. ej. /data, y luego UPLOADS_DIR=/data/uploads).
// Sin la variable se usa la carpeta local del repo, que es lo correcto en desarrollo.
const UPLOADS_ROOT = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, '../uploads');

const PRODUCTOS_DIR = path.join(UPLOADS_ROOT, 'productos');

// Crear el árbol si no existe: un volumen recién montado viene vacío y multer
// falla con ENOENT si el destino no está creado.
try {
  fs.mkdirSync(PRODUCTOS_DIR, { recursive: true });
} catch (err) {
  logger.error(`No se pudo crear el directorio de subidas ${PRODUCTOS_DIR}:`, err.message);
}

if (!process.env.UPLOADS_DIR && process.env.NODE_ENV === 'production') {
  logger.warn('⚠️  UPLOADS_DIR no está configurada en producción: las imágenes de');
  logger.warn('   productos se guardarán en el disco efímero del contenedor y se');
  logger.warn('   perderán en el próximo despliegue. Monta un volumen y apunta UPLOADS_DIR ahí.');
}

/**
 * Borra del disco la imagen de un producto.
 *
 * Al cambiar la foto de un producto se guardaba la nueva y la anterior se
 * quedaba en el disco para siempre, sin que nada volviera a referenciarla; lo
 * mismo al eliminar el producto. En desarrollo pasa desapercibido, pero en
 * producción esas imágenes viven en un volumen de pago que solo crece.
 *
 * Se acepta la URL pública tal como se guarda en la columna imagen_url
 * ('/uploads/productos/1234.jpg') y se traduce a la ruta real, que depende de
 * UPLOADS_DIR. Solo se toma el nombre del archivo, nunca la ruta que venga en
 * la cadena: así un valor manipulado con '../' no puede alcanzar otro
 * directorio.
 *
 * No propaga errores a propósito: que no se pueda borrar un archivo suelto no
 * es motivo para que falle la operación que el usuario pidió.
 *
 * @param {string|null} imagenUrl valor de productos.imagen_url
 */
function eliminarImagen(imagenUrl) {
  if (!imagenUrl || typeof imagenUrl !== 'string') return;
  if (!imagenUrl.startsWith('/uploads/productos/')) return;

  const nombre = path.basename(imagenUrl);
  if (!nombre || nombre === '.' || nombre === '..') return;

  const destino = path.join(PRODUCTOS_DIR, nombre);
  fs.unlink(destino, (err) => {
    if (err && err.code !== 'ENOENT') {
      logger.warn(`No se pudo eliminar la imagen ${destino}: ${err.message}`);
    }
  });
}

module.exports = { UPLOADS_ROOT, PRODUCTOS_DIR, eliminarImagen };

