const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../config/logger');
require('dotenv').config();

const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Autenticación — token desde la cookie httpOnly o la cabecera Authorization.
 *
 * Además de verificar la firma, se contrasta el token con la base de datos. El
 * JWT lleva dentro el rol y dura 24 h, así que confiar solo en su contenido
 * significaba que desactivar a alguien no lo expulsaba, y que un cambio de rol
 * no surtía efecto hasta que el token caducara por su cuenta.
 *
 * Las dos comprobaciones (token revocado y estado del usuario) van en una sola
 * consulta para no añadir dos viajes a la base de datos en cada petición.
 */
const authenticateToken = (req, res, next) => {
  let token = req.cookies && req.cookies.token;

  if (!token) {
    const authHeader = req.headers['authorization'];
    token = authHeader && authHeader.split(' ')[1];
  }

  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }

  jwt.verify(token, process.env.JWT_SECRET, async (err, payload) => {
    if (err) {
      logger.warn(`Token inválido desde IP: ${req.ip}`);
      return res.status(403).json({ error: 'Token inválido o expirado', codigo: 'SESION_INVALIDA' });
    }

    try {
      const fila = await db.getAsync(
        `SELECT u.id, u.username, u.role, u.activo, u.nombre_completo,
                u.sesiones_validas_desde,
                (SELECT 1 FROM tokens_revocados
                  WHERE token_hash = ? AND expira_en > ?) AS revocado
           FROM usuarios u
          WHERE u.id = ?`,
        [hashToken(token), Math.floor(Date.now() / 1000), payload.id]
      );

      if (fila && fila.revocado) {
        logger.warn(`Token revocado usado desde IP: ${req.ip}`);
        return res.status(403).json({ error: 'Sesión cerrada. Inicia sesión nuevamente.', codigo: 'SESION_INVALIDA' });
      }

      if (!fila) {
        logger.warn(`Token de un usuario inexistente (id ${payload.id}) desde IP: ${req.ip}`);
        return res.status(403).json({ error: 'La cuenta ya no existe. Inicia sesión nuevamente.', codigo: 'SESION_INVALIDA' });
      }

      if (!fila.activo) {
        logger.warn(`Acceso de cuenta desactivada: ${fila.username} desde IP: ${req.ip}`);
        return res.status(403).json({ error: 'Tu cuenta está desactivada. Contacta al administrador.', codigo: 'SESION_INVALIDA' });
      }

      // Cambiar la contraseña invalida las sesiones abiertas antes de ese
      // momento. Sin esto, restablecerla no servía para echar a quien hubiera
      // entrado con la contraseña antigua: su token seguía siendo válido hasta
      // 24 horas después, que es justo el caso para el que existe la función.
      if (payload.iat && Number(fila.sesiones_validas_desde) > payload.iat) {
        logger.warn(`Token anterior al cambio de contraseña de ${fila.username} desde IP: ${req.ip}`);
        return res.status(403).json({
          error: 'Tu contraseña cambió. Inicia sesión nuevamente.',
          codigo: 'SESION_INVALIDA'
        });
      }

      if (fila.role !== payload.role) {
        logger.warn(
          `Rol cambiado para ${fila.username} (token: ${payload.role}, actual: ${fila.role}). ` +
          'Se rechaza el token desde IP: ' + req.ip
        );
        return res.status(403).json({ error: 'Tus permisos cambiaron. Inicia sesión nuevamente.', codigo: 'SESION_INVALIDA' });
      }

      // El rol viene de la base de datos, no del token: es el dato autoritativo.
      req.user = {
        id: fila.id,
        username: fila.username,
        role: fila.role,
        nombre_completo: fila.nombre_completo,
        exp: payload.exp
      };
      req.token = token;
      next();
    } catch (dbErr) {
      logger.error('Error validando el token contra la base de datos:', dbErr);
      return res.status(500).json({ error: 'Error interno del servidor' });
    }
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
