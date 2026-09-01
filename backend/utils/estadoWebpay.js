/**
 * Evaluación de la configuración de Webpay.
 *
 * Las credenciales van SIEMPRE en pareja: el código de comercio y la llave
 * secreta se emiten juntos y Transbank rechaza cualquier mezcla. Los pares
 * válidos son solo dos, y de ahí salen las tres formas de configurarlo bien:
 *
 *   1. Sin ninguna variable → el SDK usa el par de pruebas por defecto.
 *   2. El par de pruebas escrito de forma explícita, en ambiente integracion.
 *   3. El par propio del comercio, en ambiente production.
 *
 * Cualquier otra combinación falla, y el error de Transbank rara vez explica
 * por qué: lo habitual es un 401 genérico que hace pensar en un problema de
 * red o de permisos.
 *
 * La llave de integración merece atención aparte porque es PÚBLICA —viene
 * dentro del SDK y aparece en toda la documentación—, así que es lo primero
 * que uno encuentra al buscar "api key webpay" y acaba puesta como si fuera la
 * propia. Junto a un código de comercio real, no funciona.
 */
const { IntegrationApiKeys, IntegrationCommerceCodes } = require('transbank-sdk');

const LLAVE_PUBLICA = IntegrationApiKeys.WEBPAY;
const CODIGO_PUBLICO = String(IntegrationCommerceCodes.WEBPAY_PLUS);

/**
 * @param {Object} env normalmente process.env
 * @returns {Object} estado de la configuración, sin ningún dato sensible
 */
function evaluarConfiguracion(env = process.env) {
  const enProduccion = (env.WEBPAY_ENVIRONMENT || '').toLowerCase() === 'production';
  const codigo = (env.WEBPAY_COMMERCE_CODE || '').trim();
  const llave = (env.WEBPAY_API_KEY || '').trim();

  const tieneCodigo = !!codigo;
  const tieneLlave = !!llave;
  const llaveEsLaDePruebas = tieneLlave && llave === LLAVE_PUBLICA;
  const codigoEsElDePruebas = tieneCodigo && codigo === CODIGO_PUBLICO;

  const sinVariables = !tieneCodigo && !tieneLlave;
  const parDePruebasCompleto = codigoEsElDePruebas && llaveEsLaDePruebas;
  const parPropioCompleto = tieneCodigo && tieneLlave && !llaveEsLaDePruebas && !codigoEsElDePruebas;

  let coherente = false;
  let motivo = null;

  if (!enProduccion && sinVariables) {
    coherente = true; // el SDK usa el par de pruebas
  } else if (!enProduccion && parDePruebasCompleto) {
    coherente = true; // par de pruebas escrito a mano
  } else if (enProduccion && parPropioCompleto) {
    coherente = true; // par propio del comercio
  } else if (llaveEsLaDePruebas && tieneCodigo && !codigoEsElDePruebas) {
    // El caso que mas cuesta ver: media pareja de cada sitio.
    motivo = 'la llave es la publica de pruebas pero el codigo de comercio es real: Transbank rechaza el par';
  } else if (enProduccion && llaveEsLaDePruebas) {
    motivo = 'ambiente produccion con la llave publica de pruebas';
  } else if (enProduccion && (!tieneCodigo || !tieneLlave)) {
    motivo = 'ambiente produccion pero falta el codigo de comercio o la llave';
  } else if (!enProduccion && (tieneCodigo || tieneLlave)) {
    motivo = 'credenciales que no son el par de pruebas apuntando al servidor de pruebas';
  } else {
    motivo = 'combinacion no reconocida';
  }

  return {
    ambiente: enProduccion ? 'produccion' : 'integracion',
    codigoDeComercioPropio: tieneCodigo && !codigoEsElDePruebas,
    llavePropia: tieneLlave && !llaveEsLaDePruebas,
    llaveEsLaDePruebas,
    codigoEsElDePruebas,
    cobrosReales: enProduccion && coherente,
    coherente,
    motivo
  };
}

module.exports = { evaluarConfiguracion, LLAVE_PUBLICA, CODIGO_PUBLICO };
