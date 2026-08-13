/**
 * Utilidades de fecha para el adaptador dual SQLite ↔ PostgreSQL.
 *
 * config/database.js fuerza a que PostgreSQL devuelva las columnas DATE como
 * texto, igual que SQLite, así que en condiciones normales aquí siempre llega
 * un string. Aun así el código de negocio no debería romperse si un driver
 * decide entregar un Date: esa suposición ya tumbó el dashboard una vez.
 */

const dosDigitos = (n) => String(n).padStart(2, '0');

/**
 * Devuelve la parte 'YYYY-MM-DD' de una fecha, venga como texto o como Date.
 *
 * Con un Date se usan sus componentes locales en lugar de toISOString(): el
 * parser de PostgreSQL construye la medianoche en hora local, y convertir a UTC
 * desplazaría el día completo en cualquier zona con offset positivo.
 *
 * @param {string|Date|null|undefined} valor
 * @returns {string} 'YYYY-MM-DD', o '' si no hay valor
 */
function soloFecha(valor) {
  if (valor === null || valor === undefined || valor === '') return '';

  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return '';
    return `${valor.getFullYear()}-${dosDigitos(valor.getMonth() + 1)}-${dosDigitos(valor.getDate())}`;
  }

  return String(valor).slice(0, 10);
}

/**
 * Devuelve la parte 'YYYY-MM' de una fecha, con las mismas garantías.
 */
function soloMes(valor) {
  return soloFecha(valor).slice(0, 7);
}

module.exports = { soloFecha, soloMes };
