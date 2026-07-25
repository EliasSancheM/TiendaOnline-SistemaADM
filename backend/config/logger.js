const winston = require('winston');

// Los logs a ARCHIVO solo tienen sentido en desarrollo local. En cualquier
// entorno de producción (Vercel, Railway, Render...) el filesystem puede ser
// de solo lectura y `winston.transports.File` intenta hacer mkdir 'logs',
// lo que rompe TODAS las peticiones con ENOENT/EROFS. La consola funciona en
// todos lados (las plataformas capturan stdout), así que en producción usamos
// solo consola. Se puede forzar consola con LOG_TO_CONSOLE_ONLY=true.
const enableFileLogs =
  process.env.NODE_ENV !== 'production' &&
  !process.env.VERCEL &&
  process.env.LOG_TO_CONSOLE_ONLY !== 'true';

const transports = [new winston.transports.Console()];

if (enableFileLogs) {
  transports.push(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports
});

module.exports = logger;
