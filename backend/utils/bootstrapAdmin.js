/**
 * Alta o restablecimiento del administrador desde una variable de entorno.
 *
 * Al crear la base por primera vez, el sistema genera un administrador con una
 * contraseña aleatoria que se imprime UNA sola vez en el log. En un despliegue
 * en la nube eso es frágil: si el mensaje se pierde entre miles de líneas, o el
 * log ya rotó, no queda ninguna forma de entrar al panel salvo escribir a mano
 * en la base de datos, y no todos los proveedores ofrecen una consola SQL que
 * permita escribir.
 *
 * Con `ADMIN_PASSWORD` definida, el servidor crea el administrador —o le pone
 * esa contraseña si ya existe— al arrancar. Es la vía de rescate: se define la
 * variable, se reinicia, se entra al panel y se quita la variable.
 *
 * Deliberadamente:
 *   - No hace nada si la variable no está definida (el caso normal).
 *   - Exige la misma longitud mínima que el resto del sistema.
 *   - Deja un aviso en el log recordando retirarla, porque una contraseña en
 *     una variable de entorno es visible para cualquiera con acceso al panel
 *     del proveedor.
 *   - Nunca escribe la contraseña en el log.
 */
const bcrypt = require('bcryptjs');
const db = require('../config/database');
const logger = require('../config/logger');

const LONGITUD_MINIMA = 8;

/**
 * @param {Object} opciones
 * @param {number} opciones.intentos  reintentos si las tablas aún no existen
 * @param {number} opciones.esperaMs  espera entre reintentos
 * @returns {Promise<{aplicado: boolean, accion?: string, motivo?: string}>}
 */
async function bootstrapAdmin({ intentos = 5, esperaMs = 2000 } = {}) {
  const password = process.env.ADMIN_PASSWORD;
  const username = process.env.ADMIN_USERNAME || 'administrador';

  if (!password) {
    return { aplicado: false, motivo: 'ADMIN_PASSWORD no definida' };
  }

  if (password.length < LONGITUD_MINIMA) {
    logger.error(
      `ADMIN_PASSWORD tiene menos de ${LONGITUD_MINIMA} caracteres. No se aplica ningún cambio.`
    );
    return { aplicado: false, motivo: 'contraseña demasiado corta' };
  }

  for (let intento = 1; intento <= intentos; intento++) {
    try {
      const hash = await bcrypt.hash(password, 12);
      const existente = await db.getAsync(
        'SELECT id FROM usuarios WHERE username = ?',
        [username]
      );

      let accion;
      if (existente) {
        await db.runAsync(
          `UPDATE usuarios SET password_hash = ?, role = 'admin', activo = true
            WHERE username = ?`,
          [hash, username]
        );
        accion = 'actualizado';
      } else {
        await db.runAsync(
          `INSERT INTO usuarios (username, password_hash, role, nombre_completo, email, activo)
           VALUES (?, ?, 'admin', ?, ?, true)`,
          [username, hash, 'Administrador', `${username}@local`]
        );
        accion = 'creado';
      }

      logger.warn('════════════════════════════════════════════════');
      logger.warn(`  ADMINISTRADOR ${accion.toUpperCase()} DESDE ADMIN_PASSWORD`);
      logger.warn(`  Usuario: ${username}`);
      logger.warn('  ⚠️  Entra al panel y BORRA la variable ADMIN_PASSWORD:');
      logger.warn('     mientras exista, la contraseña queda a la vista de');
      logger.warn('     cualquiera con acceso al panel del proveedor.');
      logger.warn('════════════════════════════════════════════════');

      return { aplicado: true, accion };
    } catch (err) {
      // Al primer arranque las tablas pueden estar creándose todavía.
      if (intento === intentos) {
        logger.error('No se pudo aplicar ADMIN_PASSWORD:', err.message);
        return { aplicado: false, motivo: err.message };
      }
      await new Promise((resolve) => setTimeout(resolve, esperaMs));
    }
  }
}

module.exports = { bootstrapAdmin, LONGITUD_MINIMA };
