/**
 * Normaliza los parámetros de paginación de una query string.
 *
 * Antes cada ruta repetía este cálculo, y siempre con el mismo par de fallos:
 *
 *   const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
 *   const parsedLimit = Math.min(200, Math.max(1, parseInt(limit)));
 *
 *   1. El offset usaba `limit` SIN acotar mientras la consulta usaba el acotado.
 *      Con ?limit=500&page=2 se pedían 200 filas saltando 500: las filas 200 a
 *      499 no aparecían en ninguna página. Los datos no se perdían, pero eran
 *      invisibles desde el panel.
 *   2. Un valor no numérico daba NaN y llegaba tal cual a la consulta.
 *      ?limit=abc respondía 500 (SQLITE_MISMATCH en SQLite, error de sintaxis
 *      en PostgreSQL). Basta con teclear mal la URL para tumbar el listado.
 *
 * Aquí el límite se acota UNA vez y el offset se deriva de ese mismo valor, así
 * que las páginas no pueden descuadrar.
 */
const LIMITE_POR_DEFECTO = 50;
const LIMITE_MAXIMO = 200;

/**
 * @param {Object} query req.query
 * @returns {{page: number, limit: number, offset: number}}
 */
function paginacion(query = {}) {
  const pageBruto = parseInt(query.page, 10);
  const limitBruto = parseInt(query.limit, 10);

  const page = Number.isFinite(pageBruto) ? Math.max(1, pageBruto) : 1;
  const limit = Number.isFinite(limitBruto)
    ? Math.min(LIMITE_MAXIMO, Math.max(1, limitBruto))
    : LIMITE_POR_DEFECTO;

  return { page, limit, offset: (page - 1) * limit };
}

/** Bloque `pagination` de la respuesta, con el total ya contado. */
function meta({ page, limit }, total) {
  const totalNumerico = Number(total) || 0;
  return {
    page,
    limit,
    total: totalNumerico,
    totalPages: Math.ceil(totalNumerico / limit)
  };
}

module.exports = { paginacion, meta, LIMITE_POR_DEFECTO, LIMITE_MAXIMO };
