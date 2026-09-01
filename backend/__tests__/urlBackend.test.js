/**
 * Tests de la direccion publica del backend.
 *
 * Cierran un fallo real que costo horas de diagnostico: BACKEND_URL estaba
 * puesta como "mi-servicio.up.railway.app", sin esquema, que es exactamente lo
 * que muestra el panel de Railway al copiar el dominio. La URL de retorno que
 * se le enviaba a Transbank no era absoluta, y respondia 422 «Invalid value for
 * parameter: return_url».
 *
 * El checkout fallaba entero y el error no llegaba al usuario, asi que todo
 * apuntaba a las credenciales de pago, que estaban perfectamente.
 */
const { baseDelBackend, normalizar } = require('../utils/urlBackend');

const peticion = (protocolo = 'https', host = 'deducido.example.com') => ({
  protocol: protocolo,
  get: (cabecera) => (cabecera === 'host' ? host : undefined)
});

describe('normalizar()', () => {
  it('añade https:// cuando falta, que es el caso que rompia los pagos', () => {
    expect(normalizar('mi-servicio.up.railway.app'))
      .toBe('https://mi-servicio.up.railway.app');
  });

  it('respeta el esquema si ya viene', () => {
    expect(normalizar('https://api.ejemplo.cl')).toBe('https://api.ejemplo.cl');
    expect(normalizar('http://localhost:5000')).toBe('http://localhost:5000');
  });

  it('quita la barra final, que daria una doble barra en la ruta', () => {
    expect(normalizar('https://api.ejemplo.cl/')).toBe('https://api.ejemplo.cl');
    expect(normalizar('https://api.ejemplo.cl///')).toBe('https://api.ejemplo.cl');
  });

  it('produce una URL absoluta valida', () => {
    // Lo que Transbank exige y no se cumplia.
    const url = new URL(`${normalizar('mi-servicio.up.railway.app')}/api/public/checkout/webpay-return`);
    expect(url.protocol).toBe('https:');
    expect(url.pathname).toBe('/api/public/checkout/webpay-return');
  });
});

describe('baseDelBackend()', () => {
  const original = process.env.BACKEND_URL;
  afterEach(() => {
    if (original === undefined) delete process.env.BACKEND_URL;
    else process.env.BACKEND_URL = original;
  });

  it('corrige el valor sin esquema en lugar de propagarlo', () => {
    process.env.BACKEND_URL = 'tienda.up.railway.app';
    expect(baseDelBackend(peticion())).toBe('https://tienda.up.railway.app');
  });

  it('se deduce de la peticion si no hay nada configurado', () => {
    delete process.env.BACKEND_URL;
    expect(baseDelBackend(peticion('https', 'api.dondelaeli.com')))
      .toBe('https://api.dondelaeli.com');
  });

  it('ignora una variable vacia o con solo espacios', () => {
    process.env.BACKEND_URL = '   ';
    expect(baseDelBackend(peticion('https', 'api.dondelaeli.com')))
      .toBe('https://api.dondelaeli.com');
  });

  it('limpia los espacios de alrededor', () => {
    process.env.BACKEND_URL = '  https://api.ejemplo.cl  ';
    expect(baseDelBackend(peticion())).toBe('https://api.ejemplo.cl');
  });
});
