/**
 * Comprobaciones de configuración para el administrador.
 *
 * Existen porque los fallos de integración son opacos desde el panel: el
 * cliente ve "no pudimos conectar con el sistema de pagos" y el motivo real
 * —que es lo único accionable— queda enterrado en los registros del servidor,
 * a los que no todo el mundo sabe llegar.
 *
 * Todo aquí es de solo lectura y exige rol admin: se informa de la
 * configuración del servidor, que no debe ver nadie más.
 */
const express = require('express');
const router = express.Router();
const logger = require('../config/logger');
const { authenticateToken, authorizeRole } = require('../middlewares/authMiddleware');
const { createTransaction } = require('../utils/webpayService');
const { IntegrationApiKeys, IntegrationCommerceCodes } = require('transbank-sdk');

/** Deja a la vista los últimos dígitos, suficientes para cotejar sin exponerlo. */
const enmascarar = (valor) => {
  if (!valor) return null;
  const s = String(valor);
  return s.length <= 4 ? '••••' : '••••••••' + s.slice(-4);
};

// GET /api/diagnostico/pagos — ¿puede el servidor abrir una transacción?
//
// Intenta abrir una transacción real contra Transbank y devuelve su respuesta
// tal cual. No crea ningún pedido ni cobra nada: si nadie la paga, caduca sola.
router.get('/pagos', authenticateToken, authorizeRole(['admin']), async (req, res) => {
  const enProduccion = (process.env.WEBPAY_ENVIRONMENT || '').toLowerCase() === 'production';
  const ambiente = enProduccion ? 'produccion' : 'integracion';
  const codigoPropio = !!process.env.WEBPAY_COMMERCE_CODE;
  const llavePropia = !!process.env.WEBPAY_API_KEY;

  // La combinación que hace perder horas: credenciales de producción apuntando
  // al servidor de pruebas. webpayService solo usa las credenciales de prueba
  // cuando las variables NO existen, así que dejarlas puestas y cambiar solo
  // WEBPAY_ENVIRONMENT no revierte nada; falla igual, pero por otro motivo.
  const combinacionIncoherente = !enProduccion && (codigoPropio || llavePropia);

  // La llave de INTEGRACIÓN es pública: viene dentro del SDK y aparece en toda
  // la documentación de Transbank. Es facilísimo confundirla con la propia,
  // porque es lo primero que uno encuentra al buscar "api key webpay". Puesta
  // junto a un código de comercio real, Transbank rechaza el par y el error que
  // devuelve no dice en ningún momento que la llave sea la de pruebas.
  const usaLlaveDePruebas =
    !!process.env.WEBPAY_API_KEY && process.env.WEBPAY_API_KEY.trim() === IntegrationApiKeys.WEBPAY;
  const usaCodigoDePruebas =
    !!process.env.WEBPAY_COMMERCE_CODE &&
    process.env.WEBPAY_COMMERCE_CODE.trim() === String(IntegrationCommerceCodes.WEBPAY_PLUS);

  // Copiar y pegar desde un correo o un panel arrastra basura que no se ve.
  const bruto = process.env.WEBPAY_API_KEY || '';
  const problemasDeFormato = [];
  if (bruto && bruto !== bruto.trim()) problemasDeFormato.push('tiene espacios o saltos de línea alrededor');
  if (/^["']|["']$/.test(bruto)) problemasDeFormato.push('está entre comillas: el valor va tal cual, sin ellas');
  if (bruto.includes('${{') || bruto.includes('}}')) problemasDeFormato.push('lleva llaves ${{ }}: eso es una referencia de Railway, no un valor');
  if (/\s/.test(bruto.trim())) problemasDeFormato.push('contiene espacios en medio');

  const configuracion = {
    ambiente,
    codigoComercio: codigoPropio ? enmascarar(process.env.WEBPAY_COMMERCE_CODE) : 'el de pruebas de Transbank',
    llaveSecreta: llavePropia ? 'configurada' : 'la de pruebas de Transbank',
    combinacionIncoherente,
    usaLlaveDePruebas,
    usaCodigoDePruebas,
    problemasDeFormato
  };

  try {
    const base = process.env.BACKEND_URL || `${req.protocol}://${req.get('host')}`;
    const respuesta = await createTransaction(
      `DIAG-${Date.now()}`.slice(0, 26), // buy_order: máximo 26 caracteres
      'DIAG',
      1000,
      `${base}/api/public/checkout/webpay-return`
    );

    res.json({
      conexion: 'correcta',
      configuracion,
      urlDevuelta: respuesta && respuesta.url,
      diagnostico: enProduccion
        ? 'Transbank acepta abrir transacciones con estas credenciales. Los cobros son REALES.'
        : 'Conexión correcta contra el ambiente de pruebas. No se cobra dinero real.'
    });
  } catch (err) {
    const mensaje = (err && err.message) || String(err);
    logger.error('Diagnóstico de pagos fallido:', mensaje);

    let diagnostico;
    if (usaLlaveDePruebas && enProduccion) {
      // Se comprueba lo primero porque es la causa mas probable y la que el
      // error de Transbank nunca menciona.
      diagnostico = 'La WEBPAY_API_KEY que tienes puesta es la llave PUBLICA DE PRUEBAS de Transbank ' +
        '(la que aparece en su documentacion y dentro del SDK), no la tuya de produccion. ' +
        'Junto a un codigo de comercio real, Transbank rechaza el par. Tu llave de produccion te la ' +
        'entrega Transbank al terminar la validacion de la integracion.';
    } else if (problemasDeFormato.length > 0) {
      diagnostico = 'El valor de WEBPAY_API_KEY ' + problemasDeFormato.join('; ') + '.';
    } else if (combinacionIncoherente) {
      diagnostico = 'Tienes credenciales propias configuradas pero el ambiente NO es produccion. ' +
        'Se estan enviando credenciales de produccion al servidor de pruebas. Pon WEBPAY_ENVIRONMENT=production, ' +
        'o borra WEBPAY_COMMERCE_CODE y WEBPAY_API_KEY para volver de verdad a pruebas.';
    } else if (/invalid|unauthorized|401|403/i.test(mensaje)) {
      diagnostico = 'Transbank no reconoce el par codigo de comercio + llave secreta. ' +
        'O estan mal copiados, o el comercio todavia no esta habilitado para operar en produccion.';
    } else {
      diagnostico = 'Transbank no acepto la peticion. El mensaje literal esta en "errorDeTransbank".';
    }

    res.status(502).json({
      conexion: 'fallida',
      configuracion,
      errorDeTransbank: mensaje,
      diagnostico
    });
  }
});

module.exports = router;
