/**
 * Reconocimiento de los errores de integridad de la base de datos.
 *
 * Los dos motores informan del mismo problema de formas distintas: SQLite con
 * un mensaje de texto y PostgreSQL con un código SQLSTATE. Sin traducirlos,
 * todos caían en el `catch` genérico y el usuario recibía «Error interno del
 * servidor» con un 500.
 *
 * Eso importa porque el caso más frecuente no es un fallo del sistema, sino una
 * acción legítima que no se puede completar: borrar un cliente que tiene
 * pedidos, o un producto que aparece en pedidos anteriores. La respuesta
 * correcta es 409 explicando qué lo impide, no un 500 que parece una avería.
 */

/** Borrado o inserción que rompe una referencia (FOREIGN KEY). */
const esViolacionDeReferencia = (err) => {
  if (!err) return false;
  // PostgreSQL: foreign_key_violation
  if (err.code === '23503') return true;
  return /FOREIGN KEY constraint failed/i.test(err.message || '');
};

/** Valor repetido en una columna única (UNIQUE / PRIMARY KEY). */
const esDuplicado = (err) => {
  if (!err) return false;
  // PostgreSQL: unique_violation
  if (err.code === '23505') return true;
  return /UNIQUE constraint failed|duplicate key value/i.test(err.message || '');
};

module.exports = { esViolacionDeReferencia, esDuplicado };
