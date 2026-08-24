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

module.exports = { UPLOADS_ROOT, PRODUCTOS_DIR };
