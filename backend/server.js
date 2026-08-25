const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const os = require('os');
const fs = require('fs');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const logger = require('./config/logger');
const { verifyEmailConfig } = require('./utils/emailService');
require('dotenv').config();

// ─── Validación de configuración crítica (fail-fast) ───────────────
// Sin un JWT_SECRET fuerte la autenticación es insegura o directamente
// falla en tiempo de ejecución. Preferimos abortar el arranque antes
// que servir con una configuración vulnerable.
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 ||
    process.env.JWT_SECRET === 'CAMBIAR_POR_UN_SECRET_FUERTE_ALEATORIO') {
  logger.error('❌ ERROR CRÍTICO: JWT_SECRET no está configurado o es demasiado débil (mínimo 32 caracteres).');
  logger.error('👉 Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'base64\'))"');
  throw new Error('JWT_SECRET inseguro. El servidor no arrancará hasta configurarlo.');
}

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 5000;

// ─── Confianza en el proxy inverso ─────────────────────────────────
// Railway, Render y Vercel sirven la app detrás de un proxy. Sin esto:
//   1. `req.ip` es la IP del proxy para TODOS los visitantes, así que el rate
//      limit se aplica al conjunto: 100 peticiones y la tienda entera queda
//      bloqueada, y 10 logins fallidos dejan sin acceso a todo el personal.
//   2. express-rate-limit v8 detecta la cabecera X-Forwarded-For sin trust proxy
//      y aborta con ERR_ERL_UNEXPECTED_X_FORWARDED_FOR.
// Se confía en un solo salto (el proxy de la plataforma), no en toda la cadena:
// 'trust proxy: true' permitiría a cualquiera falsear su IP con X-Forwarded-For
// y saltarse el rate limit.
const TRUST_PROXY = process.env.TRUST_PROXY !== undefined
  ? (isNaN(Number(process.env.TRUST_PROXY)) ? process.env.TRUST_PROXY : Number(process.env.TRUST_PROXY))
  : (process.env.NODE_ENV === 'production' ? 1 : false);
app.set('trust proxy', TRUST_PROXY);

// Rate limiting general para toda la API
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false
});

// Rate limiting estricto para autenticación (mitiga fuerza bruta de credenciales)
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 10,                  // 10 intentos por IP
  message: { error: 'Demasiados intentos de autenticación. Intenta de nuevo en unos minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true // solo cuentan los intentos fallidos
});

// Configurar CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true);
    
    // CORS_ORIGIN admite varios orígenes separados por coma: en Vercel el frontend
    // tiene la URL de producción y además una distinta por cada preview deploy, y
    // con un solo valor las previews quedan bloqueadas.
    const configuredOrigins = (process.env.CORS_ORIGIN || '')
      .split(',')
      .map(o => o.trim())
      .filter(Boolean);

    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      ...configuredOrigins
    ];


    const networkInterfaces = os.networkInterfaces();
    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          allowedOrigins.push(`http://${iface.address}:3000`);
          allowedOrigins.push(`https://${iface.address}:3000`);
        }
      }
    }
    
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    
    if (allowedOrigins.indexOf(origin) !== -1 || !origin) {
      callback(null, true);
    } else {
      callback(new Error('No permitido por CORS'));
    }
  },
  credentials: true,
  optionsSuccessStatus: 200
};

// Middleware de seguridad — cabeceras HTTP (HSTS, X-Content-Type-Options, etc.)
// crossOriginResourcePolicy se relaja para permitir servir las imágenes de /uploads
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: false // React inyecta estilos/scripts inline; se deja a cargo del build
}));

// Middleware
app.use(cors(corsOptions));
app.use(express.json({ limit: '1mb' }));
// Necesario para parsear el POST de retorno de Webpay/Transbank (form-urlencoded)
app.use(express.urlencoded({ extended: false, limit: '1mb' }));
app.use(cookieParser());
app.use('/api/', limiter);
// Limitador reforzado en los endpoints de autenticación
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/forgot-password', authLimiter);
app.use('/api/auth/reset-password', authLimiter);
const path = require('path');
// Se sirve desde el mismo directorio donde multer escribe (configurable con
// UPLOADS_DIR para poder apuntarlo a un volumen persistente en producción).
const { UPLOADS_ROOT } = require('./config/uploads');
app.use('/uploads', express.static(UPLOADS_ROOT));

app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});

// Importar base de datos para asegurar su inicialización
const db = require('./config/database');

// Importar rutas
const authRoutes = require('./routes/authRoutes');
const clientesRoutes = require('./routes/clientesRoutes');
const pedidosRoutes = require('./routes/pedidosRoutes');
const productosRoutes = require('./routes/productosRoutes');
const facturasRoutes = require('./routes/facturasRoutes');
const publicRoutes = require('./routes/publicRoutes');

// Registrar rutas — Patrón consistente: /api/<recurso>
app.use('/api/auth', authRoutes);
app.use('/api/clientes', clientesRoutes);
app.use('/api/pedidos', pedidosRoutes);
app.use('/api/productos', productosRoutes);
app.use('/api/facturas', facturasRoutes);
app.use('/api/public', publicRoutes);

// Health check: Railway y cualquier monitor necesitan una ruta que responda 200
// sin tocar la base de datos ni exigir autenticación. Va ANTES del catch-all del
// SPA para que no lo intercepte.
app.get('/health', (req, res) => {
  res.json({ status: 'ok', uptime: process.uptime() });
});

// ─── Producción: servir frontend desde el backend ──────────────────
// Solo cuando el build de React está junto al backend (Render, o local con
// NODE_ENV=production). En el despliegue actual NO ocurre: el frontend vive en
// Vercel y el backend en Railway, donde `frontend/build` no existe. Sin la
// comprobación de existencia, el catch-all respondería ENOENT (500) a toda ruta
// que no sea /api/*. En Vercel tampoco aplica: la plataforma sirve el estático.
const frontendBuildPath = path.join(__dirname, '../frontend/build');
if (process.env.NODE_ENV === 'production' && !process.env.VERCEL &&
    fs.existsSync(path.join(frontendBuildPath, 'index.html'))) {
  app.use(express.static(frontendBuildPath));

  // Catch-all SPA. OJO: en Express 5 `app.get('*')` es inválido (path-to-regexp
  // exige nombrar el comodín). Usamos un middleware, que no tiene ese problema.
  app.use((req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });

  logger.info(`Sirviendo frontend desde: ${frontendBuildPath}`);
}


// Manejador global de errores
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// ─── Limpieza periodica de tokens revocados ────────────────────────
// La tabla solo necesita guardar un token hasta que caduca por si solo. Sin
// esta poda crece sin limite. Se ejecuta al arrancar y cada 6 horas; unref()
// evita que el temporizador mantenga vivo el proceso.
const { cleanup: limpiarTokensRevocados } = require('./utils/tokenBlacklist');
const podar = () => limpiarTokensRevocados().catch(err =>
  logger.error('Error limpiando tokens revocados:', err));
podar();
const intervaloPoda = setInterval(podar, 6 * 60 * 60 * 1000);
if (intervaloPoda.unref) intervaloPoda.unref();

// Verificar configuración de correo al iniciar
verifyEmailConfig().then(result => {
  if (result.success) {
    logger.info('✅ Servicio de correo configurado correctamente');
  } else {
    logger.warn('⚠️ Problema con configuración de correo:', result.error);
    logger.warn('El registro funcionará pero no se enviarán correos de bienvenida');
  }
});

// ─── Arranque tradicional (local / Railway / Render) ───────────────
// En entornos serverless como Vercel NO se abre un puerto: la plataforma
// invoca la app exportada por request. Por eso solo escuchamos cuando NO
// estamos en Vercel.
if (!process.env.VERCEL) {
  const server = app.listen(PORT, '0.0.0.0', () => {
    const networkInterfaces = os.networkInterfaces();
    let localIP = 'localhost';

    for (const interfaceName in networkInterfaces) {
      const interfaces = networkInterfaces[interfaceName];
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal) {
          localIP = iface.address;
          break;
        }
      }
      if (localIP !== 'localhost') break;
    }

    console.log(`Servidor corriendo en:`);
    console.log(`  - Local:   http://localhost:${PORT}`);
    console.log(`  - Red:     http://${localIP}:${PORT}`);
    console.log(`  - Acceso externo: Configura tu router para port forwarding`);
    logger.info(`Servidor iniciado en puerto ${PORT} (0.0.0.0)`);
  });

  // Manejar el cierre de la aplicación
  process.on('SIGINT', () => {
    if (typeof db.close === 'function') {
      db.close((err) => {
        if (err) console.error(err.message);
        console.log('Base de datos cerrada');
        process.exit(0);
      });
    } else {
      console.log('Servidor detenido');
      process.exit(0);
    }
    server.close();
  });
}

// Exportar la app para el entorno serverless de Vercel (api/index.js)
module.exports = app;