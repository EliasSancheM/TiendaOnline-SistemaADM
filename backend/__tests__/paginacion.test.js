/**
 * Tests del normalizador de paginación.
 *
 * Cierran dos fallos que estaban repetidos en los cuatro listados de la API
 * (productos, clientes, pedidos y facturas), porque el cálculo se había copiado
 * tal cual en cada uno:
 *
 *   1. El offset se calculaba con el `limit` SIN acotar mientras la consulta
 *      usaba el acotado. Con ?limit=500&page=2 se pedían 200 filas saltando
 *      500, así que las filas 200 a 499 no aparecían en ninguna página.
 *   2. Un `limit` no numérico producía NaN y llegaba así a la consulta:
 *      ?limit=abc respondía 500 (SQLITE_MISMATCH, comprobado). Bastaba teclear
 *      mal la URL para tumbar el listado.
 */
const { paginacion, meta, LIMITE_POR_DEFECTO, LIMITE_MAXIMO } = require('../utils/paginacion');

describe('paginacion()', () => {
  it('usa los valores por defecto cuando no se pide nada', () => {
    expect(paginacion({})).toEqual({ page: 1, limit: LIMITE_POR_DEFECTO, offset: 0 });
  });

  it('el offset siempre concuerda con el límite que se acaba de aplicar', () => {
    // El caso que se colaba: limit por encima del máximo y página distinta de 1.
    const p = paginacion({ page: '2', limit: '500' });

    expect(p.limit).toBe(LIMITE_MAXIMO);
    expect(p.offset).toBe(LIMITE_MAXIMO); // y NO 500, que dejaba un hueco de 300 filas
    expect(p.offset).toBe((p.page - 1) * p.limit);
  });

  it('ninguna fila queda fuera de todas las páginas', () => {
    // Recorrer páginas consecutivas tiene que cubrir el rango sin saltos.
    const primera = paginacion({ page: '1', limit: '1000' });
    const segunda = paginacion({ page: '2', limit: '1000' });
    const tercera = paginacion({ page: '3', limit: '1000' });

    expect(segunda.offset).toBe(primera.offset + primera.limit);
    expect(tercera.offset).toBe(segunda.offset + segunda.limit);
  });

  it('un limit que no es un número no llega a la consulta', () => {
    const p = paginacion({ limit: 'abc' });

    expect(Number.isFinite(p.limit)).toBe(true);
    expect(Number.isFinite(p.offset)).toBe(true);
    expect(p.limit).toBe(LIMITE_POR_DEFECTO);
  });

  it('una página que no es un número tampoco', () => {
    const p = paginacion({ page: 'undefined' });

    expect(p.page).toBe(1);
    expect(p.offset).toBe(0);
  });

  it('rechaza valores absurdos en lugar de propagarlos', () => {
    expect(paginacion({ page: '-5' }).page).toBe(1);
    expect(paginacion({ page: '0' }).page).toBe(1);
    expect(paginacion({ limit: '0' }).limit).toBe(1);
    expect(paginacion({ limit: '-20' }).limit).toBe(1);
    expect(paginacion({ limit: '99999' }).limit).toBe(LIMITE_MAXIMO);
  });

  it('acota el límite para que nadie pueda pedir la tabla entera', () => {
    expect(paginacion({ limit: String(LIMITE_MAXIMO + 1) }).limit).toBe(LIMITE_MAXIMO);
  });
});

describe('meta()', () => {
  it('calcula las páginas totales', () => {
    expect(meta({ page: 1, limit: 50 }, 120)).toEqual({
      page: 1, limit: 50, total: 120, totalPages: 3
    });
  });

  it('trata el total como número aunque llegue como texto', () => {
    // COUNT(*) de PostgreSQL es BIGINT y el driver lo entrega como cadena.
    // Sin convertirlo, totalPages salía NaN.
    const m = meta({ page: 1, limit: 50 }, '120');
    expect(m.total).toBe(120);
    expect(m.totalPages).toBe(3);
  });

  it('no divide por cero con una tabla vacía', () => {
    expect(meta({ page: 1, limit: 50 }, 0)).toEqual({
      page: 1, limit: 50, total: 0, totalPages: 0
    });
  });
});
