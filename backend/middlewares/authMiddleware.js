const jwt = require('jsonwebtoken');
const logger = require('../config/logger');
const { isBlacklisted } = require('../utils/tokenBlacklist');
require('dotenv').config();

// Middleware de autenticación — Lee token de httpOnly cookie o Authorization header
const authenticateToken = (req, res, next) => {
  // 1. Try httpOnly cookie first
  let token = req.cookies && req.cookies.token;

  // 2. Fallback to Authorization header (for API clients, tests, etc.)
  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  // 3. Check if token is blacklisted (logout invalidation)
  if (isBlacklisted(token)) {
    logger.warn(`Token blacklisted usado desde IP: ${req.ip}`);
    return res.status(403).json({ error: 'Sesión cerrada. Inicia sesión nuevamente.' });
  }

  // 4. Verify JWT signature and expiry
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      logger.warn(`Token inválido desde IP: ${req.ip}`);
      return res.status(403).json({ error: 'Token inválido o expirado' });
    }
    req.user = user;
    req.token = token; // Store for blacklisting on logout
    next();
  });
};

// Middleware de autorización por roles
const authorizeRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuario no autenticado' });
    }
    
    if (!roles.includes(req.user.role)) {
      logger.warn(`Acceso denegado para rol ${req.user.role} desde IP: ${req.ip}`);
      return res.status(403).json({ error: 'No tienes permisos para esta acción' });
    }
    
    next();
  };
};

module.exports = {
  authenticateToken,
  authorizeRole
};
