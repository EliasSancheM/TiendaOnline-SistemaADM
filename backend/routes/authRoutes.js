const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const logger = require('../config/logger');
const { loginSchema, registerSchema, resetPasswordSchema, validate } = require('../middlewares/validatorMiddleware');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { sendWelcomeEmail, sendPasswordResetEmail } = require('../utils/emailService');
const { addToken: blacklistToken } = require('../utils/tokenBlacklist');

// Cookie options helper
const getCookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax',
  maxAge: 24 * 60 * 60 * 1000, // 24 hours
  path: '/'
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  try {
    const { username, password } = req.body;
    
    const user = await db.getAsync(
      'SELECT * FROM usuarios WHERE username = ? AND activo = true',
      [username]
    );
    
    if (!user) {
      logger.warn(`Intento de login fallido para usuario: ${username} desde IP: ${req.ip}`);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      logger.warn(`Contraseña incorrecta para usuario: ${username} desde IP: ${req.ip}`);
      return res.status(401).json({ error: 'Credenciales inválidas' });
    }
    
    // Actualizar último login
    await db.runAsync(
      `UPDATE usuarios SET ultimo_login = ${db.helpers.now()} WHERE id = ?`,
      [user.id]
    );
    
    // Generar token JWT
    const token = jwt.sign(
      { 
        id: user.id, 
        username: user.username, 
        role: user.role,
        nombre_completo: user.nombre_completo
      },
      process.env.JWT_SECRET,
      { expiresIn: process.env.SESSION_TIMEOUT || '24h' }
    );
    
    logger.info(`Login exitoso para usuario: ${username} desde IP: ${req.ip}`);
    
    // Set httpOnly cookie
    res.cookie('token', token, getCookieOptions());
    
    res.json({
      token, // Also send in body for backward compatibility
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        nombre_completo: user.nombre_completo,
        email: user.email
      }
    });
  } catch (error) {
    logger.error('Error en login:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/register — Solo admins pueden crear nuevos usuarios
router.post('/register', authenticateToken, authorizeRole(['admin']), validate(registerSchema), async (req, res) => {
  try {
    const { username, password, nombre_completo, email } = req.body;
    
    // Verificar si el usuario ya existe
    const existingUser = await db.getAsync(
      'SELECT * FROM usuarios WHERE username = ? OR email = ?',
      [username, email]
    );
    
    if (existingUser) {
      if (existingUser.username === username) {
        return res.status(400).json({ error: 'El nombre de usuario ya está en uso' });
      }
      if (existingUser.email === email) {
        return res.status(400).json({ error: 'El correo electrónico ya está registrado' });
      }
    }
    
    // Encriptar contraseña con 12 salt rounds
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Crear nuevo usuario con rol 'empleado' por defecto
    const result = await db.runAsync(
      'INSERT INTO usuarios (username, password_hash, role, nombre_completo, email, activo) VALUES (?, ?, ?, ?, ?, ?)',
      [username, hashedPassword, 'empleado', nombre_completo, email, true]
    );
    
    const newUser = {
      id: result.lastID,
      username,
      nombre_completo,
      email,
      role: 'empleado'
    };
    
    // Enviar correo de bienvenida (no bloquear si falla)
    try {
      const emailResult = await sendWelcomeEmail(email, nombre_completo);
      if (emailResult.success) {
        logger.info(`Usuario registrado y correo enviado: ${username}`);
      } else {
        logger.warn(`Usuario registrado pero error enviando correo: ${emailResult.error}`);
      }
    } catch (emailError) {
      logger.error('Error enviando correo de bienvenida:', emailError);
    }
    
    logger.info(`Usuario registrado: ${username} (${email}) por admin: ${req.user.username}`);
    
    res.status(201).json({
      message: 'Usuario registrado exitosamente.',
      user: newUser
    });
  } catch (error) {
    logger.error('Error en registro:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// GET /api/auth/verify — Verificar token válido
router.get('/verify', authenticateToken, (req, res) => {
  res.json({
    valid: true,
    user: {
      id: req.user.id,
      username: req.user.username,
      role: req.user.role,
      nombre_completo: req.user.nombre_completo
    }
  });
});

// POST /api/auth/logout — Invalidar token
router.post('/logout', authenticateToken, (req, res) => {
  // Blacklist the current token so it can't be reused
  if (req.token && req.user.exp) {
    blacklistToken(req.token, req.user.exp);
  }
  
  // Clear the httpOnly cookie
  res.clearCookie('token', { path: '/' });
  
  logger.info(`Logout para usuario: ${req.user.username} desde IP: ${req.ip}`);
  res.json({ message: 'Logout exitoso' });
});

// ─── Password Reset ──────────────────────────────────────────────────

// POST /api/auth/forgot-password — Solicitar restablecimiento
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({ error: 'El correo electrónico es requerido' });
    }
    
    // Find user by email
    const user = await db.getAsync(
      'SELECT id, username, nombre_completo, email FROM usuarios WHERE email = ? AND activo = true',
      [email]
    );
    
    // Always return success to prevent email enumeration
    if (!user) {
      logger.warn(`Solicitud de reset para email no registrado: ${email}`);
      return res.json({ 
        message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.' 
      });
    }
    
    // Generate cryptographically secure token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour
    
    // Invalidate any existing tokens for this user
    await db.runAsync(
      'UPDATE password_reset_tokens SET used = true WHERE user_id = ? AND used = false',
      [user.id]
    );
    
    // Store new token
    await db.runAsync(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES (?, ?, ?)',
      [user.id, resetToken, expiresAt]
    );
    
    // Send reset email
    try {
      const emailResult = await sendPasswordResetEmail(user.email, user.nombre_completo, resetToken);
      if (emailResult.success) {
        logger.info(`Email de reset enviado a: ${email}`);
      } else {
        logger.warn(`Error enviando email de reset: ${emailResult.error}`);
      }
    } catch (emailError) {
      logger.error('Error enviando email de reset:', emailError);
    }
    
    res.json({ 
      message: 'Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña.' 
    });
  } catch (error) {
    logger.error('Error en forgot-password:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

// POST /api/auth/reset-password — Ejecutar restablecimiento
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  try {
    const { token, password } = req.body;

    // Find valid token
    const resetEntry = await db.getAsync(
      'SELECT * FROM password_reset_tokens WHERE token = ? AND used = false',
      [token]
    );
    
    if (!resetEntry) {
      return res.status(400).json({ error: 'Token inválido o ya utilizado' });
    }
    
    // Check expiry
    if (new Date(resetEntry.expires_at) < new Date()) {
      await db.runAsync('UPDATE password_reset_tokens SET used = true WHERE id = ?', [resetEntry.id]);
      return res.status(400).json({ error: 'El token ha expirado. Solicita uno nuevo.' });
    }
    
    // Hash new password
    const hashedPassword = await bcrypt.hash(password, 12);
    
    // Update user password
    await db.runAsync(
      `UPDATE usuarios SET password_hash = ?, updated_at = ${db.helpers.now()} WHERE id = ?`,
      [hashedPassword, resetEntry.user_id]
    );
    
    // Mark token as used
    await db.runAsync('UPDATE password_reset_tokens SET used = true WHERE id = ?', [resetEntry.id]);
    
    const user = await db.getAsync('SELECT username FROM usuarios WHERE id = ?', [resetEntry.user_id]);
    logger.info(`Contraseña restablecida para usuario: ${user?.username}`);
    
    res.json({ message: 'Contraseña restablecida exitosamente. Ya puedes iniciar sesión.' });
  } catch (error) {
    logger.error('Error en reset-password:', error);
    res.status(500).json({ error: 'Error interno del servidor' });
  }
});

module.exports = router;
