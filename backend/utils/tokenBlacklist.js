/**
 * Lista de tokens revocados, persistida en la base de datos.
 *
 * Antes era un Map en memoria. Eso funciona con un solo proceso, pero se pierde
 * en cada reinicio y no se comparte entre instancias: cerrar sesión no
 * invalidaba nada de forma fiable. Al vivir en la base de datos, el logout es
 * efectivo aunque el proceso se reinicie o haya varias réplicas.
 *
 * Se guarda el SHA-256 del token, no el token: quien lea la tabla no obtiene
 * credenciales utilizables. `expira_en` es el claim `exp` del propio JWT (epoch
 * en segundos), así que un entero basta y no hay diferencias de tipo entre
 * SQLite y PostgreSQL.
 */
const crypto = require('crypto');
const db = require('../config/database');
const logger = require('../config/logger');

const hash = (token) => crypto.createHash('sha256').update(token).digest('hex');

const ahora = () => Math.floor(Date.now() / 1000);

/**
 * Revoca un token hasta que caduque por sí solo.
 * @param {string} token JWT completo
 * @param {number} expiresAt claim `exp` del token (epoch en segundos)
 */
const addToken = async (token, expiresAt) => {
  try {
    await db.runAsync(
      'INSERT INTO tokens_revocados (token_hash, expira_en) VALUES (?, ?)',
      [hash(token), expiresAt || ahora()]
    );
  } catch (err) {
    // Cerrar sesión dos veces con el mismo token viola la clave primaria y no
    // es un problema: el token ya estaba revocado.
    if (!/UNIQUE|duplicate key/i.test(err.message || '')) throw err;
  }
};

/**
 * @param {string} token
 * @returns {Promise<boolean>}
 */
const isBlacklisted = async (token) => {
  const fila = await db.getAsync(
    'SELECT 1 as revocado FROM tokens_revocados WHERE token_hash = ? AND expira_en > ?',
    [hash(token), ahora()]
  );
  return !!fila;
};

/** Borra las entradas ya caducadas: el JWT expirado se rechaza igualmente. */
const cleanup = async () => {
  const res = await db.runAsync('DELETE FROM tokens_revocados WHERE expira_en <= ?', [ahora()]);
  if (res.changes > 0) {
    logger.info(`Limpieza de tokens revocados: ${res.changes} entradas caducadas eliminadas`);
  }
  return res.changes;
};

module.exports = { addToken, isBlacklisted, cleanup, hash };
