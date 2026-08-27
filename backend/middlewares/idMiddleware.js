/**
 * Comprueba que :id sea un entero antes de llegar a la consulta.
 *
 * En SQLite `WHERE id = 'abc'` simplemente no encuentra nada y la ruta responde
 * 404, así que en desarrollo el problema es invisible. PostgreSQL, en cambio,
 * es estricto con los tipos y aborta con «invalid input syntax for type
 * integer», que el `catch` convierte en un 500.
 *
 * Es decir: en producción bastaba una URL mal tecleada —o el clásico
 * /api/pedidos/undefined que produce el frontend cuando un id llega vacío— para
 * que la API respondiera un error de servidor. Un identificador que no es un
 * número no puede existir, y eso es un 404.
 */
const idNumerico = (req, res, next) => {
  if (!/^\d+$/.test(String(req.params.id || ''))) {
    return res.status(404).json({ error: 'Identificador no válido' });
  }
  next();
};

module.exports = { idNumerico };
