const { WebpayPlus, Options, IntegrationApiKeys, Environment, IntegrationCommerceCodes } = require('transbank-sdk');

// Usar entorno de integración (pruebas) por defecto.
// Para producción, debes usar tus propias llaves y Environment.Production
const tx = new WebpayPlus.Transaction(
  new Options(IntegrationCommerceCodes.WEBPAY_PLUS, IntegrationApiKeys.WEBPAY, Environment.Integration)
);

const createTransaction = async (buyOrder, sessionId, amount, returnUrl) => {
  try {
    const response = await tx.create(buyOrder, sessionId, amount, returnUrl);
    return response;
  } catch (error) {
    console.error('Error creando transacción Webpay:', error);
    throw error;
  }
};

const commitTransaction = async (token) => {
  try {
    const response = await tx.commit(token);
    return response;
  } catch (error) {
    console.error('Error confirmando transacción Webpay:', error);
    throw error;
  }
};

module.exports = {
  createTransaction,
  commitTransaction,
};
