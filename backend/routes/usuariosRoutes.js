/**
 * Administración de las credenciales del personal.
 *
 * Hasta ahora el sistema tenía roles bien definidos pero ningún mando para
 * accionarlos: la única forma de crear una cuenta era llamar a
 * POST /api/auth/register a mano, y ese endpoint fija el rol 'empleado' por
 * código, así que no había manera de crear un segundo administrador. Desactivar
 * a alguien que se va, o devolverle el acceso a quien perdió su contraseña,
 * exigía escribir directamente en la base de datos.
 *
 * Estas rutas son ese panel de mandos. Todas exigen rol admin salvo
 * `mi-password`, que es la única que cualquiera puede usar sobre sí mismo.
 */
const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const logger = require('../config/logger');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { idNumerico } = require('../middlewares/idMiddleware');
const { esDuplicado } = require('../utils/erroresDb');
const {
  validate,
  usuarioCrearSchema,
  usuarioActualizarSchema,
  cambiarPasswordSchema,
  establecerPasswordSchema
} = require('../middlewares/validatorMiddleware');

const COSTE_BCRYPT = 12;

// Nunca se devuelve password_hash: no hace ninguna falta en el panel y no tiene
// sentido pasearlo por la red.
const CAMPOS = `id, username, role, nombre_completo, email, activo, ultimo_login, created_at`;

/** Marca de tiempo a partir de la cual valen las sesiones (ver authMiddleware). */
const ahora = () => Math.floor(Date.now() / 1000);

/**
 * Cuántos administradores activos quedarían sin contar a `excluyendo`.
 *
 * Sirve para no dejar el sistema sin nadie que pueda administrarlo. Sin esta
 * comprobación, el único admin podía desactivarse a sí mismo o rebajarse a
 * empleado de un clic, y a partir de ahí solo se recuperaba el acceso tocando
 * la base de datos o reiniciando con ADMIN_PASSWORD.
 */
async function adminsActivosSalvo(excluyendo) {
  const fila = await db.getAsync(
    `SELECT COUNT(*) as total FROM usuarios
      WHERE role = 'admin' AND activo = true AND id <> ?`,
    [excluyendo]
  );
  return Number(fila && fila.total) || 0;
}

// GET /api/usuarios — Listar el personal
router.get('/', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  try {
    const filas = await db.allAsync(
      `SELECT ${CAMPOS} FROM usuarios ORDER BY activo DESC, username`
    );
    res.json(filas);
  } catch (err) {
    logger.error('Error listando usuarios:', err);
    res.status(500).json({ error: 'Error al obtener los usuarios' });
  }
});

// POST /api/usuarios — Crear una cuenta para alguien del equipo
router.post('/', authenticateToken, authorizeRole(['admin']), validate(usuarioCrearSchema), async (req, res) => {
  const { username, password, nombre_completo, email, role } = req.body;

  try {
    const hash = await bcrypt.hash(password, COSTE_BCRYPT);

    const resultado = await db.runAsync(
      `INSERT INTO usuarios (username, password_hash, role, nombre_completo, email, activo)
       VALUES (?, ?, ?, ?, ?, true)`,
      [username, hash, role, nombre_completo, email || null]
    );

    logger.info(`Usuario creado: ${username} (${role}) por admin: ${req.user.username}`);
    res.status(201).json({
      id: resultado.lastID, username, role, nombre_completo, email, activo: true
    });
  } catch (err) {
    // El índice único de la base es la palabra final: comprobar antes con un
    // SELECT deja una rendija por la que dos peticiones simultáneas se cuelan.
    if (esDuplicado(err)) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre' });
    }
    logger.error('Error creando usuario:', err);
    res.status(500).json({ error: 'Error al crear el usuario' });
  }
});

// PATCH /api/usuarios/:id — Cambiar rol, datos o activar/desactivar
router.patch('/:id', authenticateToken, authorizeRole(['admin']), idNumerico, validate(usuarioActualizarSchema), async (req, res) => {
  const id = Number(req.params.id);
  const cambios = req.body;

  if (Object.keys(cambios).length === 0) {
    return res.status(400).json({ error: 'No se indicó ningún cambio' });
  }

  try {
    const actual = await db.getAsync('SELECT id, username, role, activo FROM usuarios WHERE id = ?', [id]);
    if (!actual) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // ¿Este cambio deja al usuario fuera del grupo de administradores activos?
    const eraAdminActivo = actual.role === 'admin' && !!actual.activo;
    const seguiraSiendoAdmin = (cambios.role ?? actual.role) === 'admin';
    const seguiraActivo = cambios.activo === undefined ? !!actual.activo : cambios.activo;

    if (eraAdminActivo && !(seguiraSiendoAdmin && seguiraActivo)) {
      if (await adminsActivosSalvo(id) === 0) {
        return res.status(409).json({
          error: 'Es el único administrador activo. Nombra a otro antes de quitarle el acceso, o el panel quedará sin nadie que pueda administrarlo.'
        });
      }
    }

    const columnas = [];
    const valores = [];
    for (const campo of ['nombre_completo', 'email', 'role', 'activo']) {
      if (cambios[campo] !== undefined) {
        columnas.push(`${campo} = ?`);
        valores.push(cambios[campo]);
      }
    }
    valores.push(id);

    await db.runAsync(`UPDATE usuarios SET ${columnas.join(', ')} WHERE id = ?`, valores);

    logger.info(
      `Usuario ${actual.username} modificado (${columnas.join(', ')}) por admin: ${req.user.username}`
    );

    const actualizado = await db.getAsync(`SELECT ${CAMPOS} FROM usuarios WHERE id = ?`, [id]);
    res.json(actualizado);
  } catch (err) {
    logger.error('Error actualizando usuario:', err);
    res.status(500).json({ error: 'Error al actualizar el usuario' });
  }
});

// POST /api/usuarios/mi-password — Cambiar la contraseña propia
//
// Va ANTES de las rutas con :id para que 'mi-password' no se interprete como un
// identificador. Es la única ruta de este archivo abierta a los tres roles: se
// actúa sobre uno mismo, no sobre otra cuenta.
router.post('/mi-password', authenticateToken, validate(cambiarPasswordSchema), async (req, res) => {
  const { passwordActual, passwordNueva } = req.body;

  try {
    const usuario = await db.getAsync('SELECT id, username, password_hash FROM usuarios WHERE id = ?', [req.user.id]);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    // Se exige la contraseña actual: si alguien deja la sesión abierta en el
    // ordenador de la panadería, que no pueda apropiarse de la cuenta.
    const correcta = await bcrypt.compare(passwordActual, usuario.password_hash);
    if (!correcta) {
      logger.warn(`Contraseña actual incorrecta al cambiarla: ${usuario.username} desde IP: ${req.ip}`);
      return res.status(400).json({ error: 'La contraseña actual no es correcta' });
    }

    const hash = await bcrypt.hash(passwordNueva, COSTE_BCRYPT);
    await db.runAsync(
      `UPDATE usuarios SET password_hash = ?, sesiones_validas_desde = ?, updated_at = ${db.helpers.now()}
        WHERE id = ?`,
      [hash, ahora(), usuario.id]
    );

    logger.info(`Contraseña cambiada por el propio usuario: ${usuario.username}`);
    // Su sesión actual también queda invalidada, así que hay que volver a entrar.
    res.json({ message: 'Contraseña actualizada. Vuelve a iniciar sesión.' });
  } catch (err) {
    logger.error('Error cambiando la contraseña propia:', err);
    res.status(500).json({ error: 'Error al cambiar la contraseña' });
  }
});

// POST /api/usuarios/:id/password — Un admin asigna una contraseña nueva
//
// Es la vía para cuando alguien pierde la suya y no hay correo configurado.
router.post('/:id/password', authenticateToken, authorizeRole(['admin']), idNumerico, validate(establecerPasswordSchema), async (req, res) => {
  const id = Number(req.params.id);

  try {
    const usuario = await db.getAsync('SELECT id, username FROM usuarios WHERE id = ?', [id]);
    if (!usuario) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const hash = await bcrypt.hash(req.body.password, COSTE_BCRYPT);
    await db.runAsync(
      `UPDATE usuarios SET password_hash = ?, sesiones_validas_desde = ?, updated_at = ${db.helpers.now()}
        WHERE id = ?`,
      [hash, ahora(), id]
    );

    logger.info(`Contraseña de ${usuario.username} restablecida por admin: ${req.user.username}`);
    res.json({ message: `Contraseña de ${usuario.username} actualizada. Sus sesiones abiertas se han cerrado.` });
  } catch (err) {
    logger.error('Error restableciendo la contraseña:', err);
    res.status(500).json({ error: 'Error al restablecer la contraseña' });
  }
});

module.exports = router;
