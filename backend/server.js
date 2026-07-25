const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const os = require('os');
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
    
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      process.env.CORS_ORIGIN
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
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

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

// ─── Producción: servir frontend desde el backend ──────────────────
// En producción (Railway, Render, etc.) el backend sirve el build de React
// para que todo funcione como una sola aplicación.
if (process.env.NODE_ENV === 'production') {
  const frontendBuildPath = path.join(__dirname, '../frontend/build');
  app.use(express.static(frontendBuildPath));

  // Catch-all: cualquier ruta que no sea /api/* devuelve index.html
  // para que React Router maneje la navegación del lado del cliente
  app.get('*', (req, res) => {
    res.sendFile(path.join(frontendBuildPath, 'index.html'));
  });

  logger.info(`Sirviendo frontend desde: ${frontendBuildPath}`);
}

// Manejador global de errores
app.use((err, req, res, next) => {
  logger.error('Error no manejado:', err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

// Verificar configuración de correo al iniciar
verifyEmailConfig().then(result => {
  if (result.success) {
    logger.info('✅ Servicio de correo configurado correctamente');
  } else {
    logger.warn('⚠️ Problema con configuración de correo:', result.error);
    logger.warn('El registro funcionará pero no se enviarán correos de bienvenida');
  }
});

// Iniciar servidor
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
});