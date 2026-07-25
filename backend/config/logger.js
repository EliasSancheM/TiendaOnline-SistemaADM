const winston = require('winston');

// En entornos serverless / de solo lectura (ej: Vercel) no se puede escribir a
// disco. Ahí usamos únicamente la consola — Vercel la captura en Runtime Logs.
// En local / Railway / Render se mantienen los archivos de log.
const isReadOnlyFS = process.env.VERCEL || process.env.LOG_TO_CONSOLE_ONLY === 'true';

const transports = [new winston.transports.Console()];

if (!isReadOnlyFS) {
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
