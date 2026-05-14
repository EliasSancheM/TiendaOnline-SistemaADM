const express = require('express');
const cors = require('cors');
const os = require('os');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');
const logger = require('./config/logger');
const { verifyEmailConfig } = require('./utils/emailService');
require('dotenv').config();

// Inicializar la aplicación Express
const app = express();
const PORT = process.env.PORT || 5000;

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: { error: 'Demasiadas solicitudes, intenta más tarde' },
  standardHeaders: true,
  legacyHeaders: false
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

// Middleware
app.use(cors(corsOptions));
app.use(express.json());
app.use(cookieParser());
app.use('/api/', limiter);
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