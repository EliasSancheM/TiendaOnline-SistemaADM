const { WebpayPlus, Options, IntegrationApiKeys, Environment, IntegrationCommerceCodes } = require('transbank-sdk');

// Determinar el ambiente de Webpay Plus dinámicamente desde variables de entorno
const commerceCode = process.env.WEBPAY_COMMERCE_CODE || IntegrationCommerceCodes.WEBPAY_PLUS;
const apiKey = process.env.WEBPAY_API_KEY || IntegrationApiKeys.WEBPAY;
const environment = (process.env.WEBPAY_ENVIRONMENT || '').toLowerCase() === 'production'
  ? Environment.Production
  : Environment.Integration;

const tx = new WebpayPlus.Transaction(
  new Options(commerceCode, apiKey, environment)
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
