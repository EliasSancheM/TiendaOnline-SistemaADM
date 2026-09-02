/**
 * Dirección pública del propio backend, la que se le da a Transbank para que
 * devuelva al cliente después de pagar.
 *
 * Nace de un fallo real y difícil de ver: BACKEND_URL estaba puesta como
 * "mi-servicio.up.railway.app", sin esquema. Es lo que uno copia del panel de
 * Railway, que muestra el dominio a secas. La URL de retorno quedaba así:
 *
 *   mi-servicio.up.railway.app/api/public/checkout/webpay-return?pedidoId=1
 *
 * Eso no es una dirección absoluta, y Transbank respondía 422 «Invalid value
 * for parameter: return_url». El checkout fallaba entero, y como el error no
 * llegaba al usuario, todo apuntaba a las credenciales.
 *
 * Aquí se normaliza: se añade https:// si falta y se quita la barra final, que
 * daría lugar a una doble barra en la ruta.
 */
const logger = require('../config/logger');

/**
 * @param {Object} req petición en curso, para deducirla si no está configurada
 * @returns {string} base sin barra final, p. ej. 'https://api.ejemplo.cl'
 */
function baseDelBackend(req) {
  const configurada = (process.env.BACKEND_URL || '').trim();

  if (!configurada) {
    // Sin configurar se deduce de la petición. Detrás de un proxy hace falta
    // 'trust proxy' para que req.protocol sea https y no http (ver server.js).
    return `${req.protocol}://${req.get('host')}`;
  }

  return normalizar(configurada);
}

/**
 * Dirección pública del frontend, a la que se devuelve al cliente después de
 * pagar (…/checkout?status=success).
 *
 * Por defecto vale 'http://localhost:3000', que es lo correcto en desarrollo y
 * una trampa en producción: el pago se cobra, Transbank redirige, y el cliente
 * acaba en una página que no existe. Desde su punto de vista el dinero se fue y
 * la compra falló, aunque el pedido esté bien registrado.
 *
 * Se normaliza igual que la del backend, porque el descuido es el mismo: copiar
 * el dominio del panel sin el https://.
 */
function baseDelFrontend() {
  const configurada = (process.env.FRONTEND_URL || '').trim();
  if (!configurada) return 'http://localhost:3000';
  return normalizar(configurada);
}

/** Añade el esquema si falta y quita las barras finales. */
function normalizar(valor) {
  const conEsquema = /^https?:\/\//i.test(valor) ? valor : `https://${valor}`;
  return conEsquema.replace(/\/+$/, '');
}

/**
 * Aviso al arrancar si BACKEND_URL viene incompleta.
 *
 * Se corrige sola, pero conviene decirlo: quien la puso probablemente crea que
 * el valor es correcto, y el mismo descuido en otra variable no se arregla.
 */
function avisarSiEsSospechosa() {
  const configurada = (process.env.BACKEND_URL || '').trim();
  if (!configurada) return;

  if (!/^https?:\/\//i.test(configurada)) {
    logger.warn(`⚠️  BACKEND_URL no incluye el esquema: "${configurada}"`);
    logger.warn(`   Se usará "${normalizar(configurada)}". Corrígela para evitar sorpresas:`);
    logger.warn('   Transbank rechaza una URL de retorno que no sea absoluta (error 422).');
  } else if (/^http:\/\//i.test(configurada) && process.env.NODE_ENV === 'production') {
    logger.warn(`⚠️  BACKEND_URL usa http:// en producción: "${configurada}"`);
    logger.warn('   Transbank exige https en el ambiente de producción.');
  }
}

module.exports = { baseDelBackend, baseDelFrontend, normalizar, avisarSiEsSospechosa };
