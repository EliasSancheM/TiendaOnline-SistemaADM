/**
 * Tests de la evaluacion de la configuracion de Webpay.
 *
 * Las credenciales van SIEMPRE en pareja: codigo de comercio y llave secreta se
 * emiten juntos, y Transbank rechaza cualquier mezcla con un error que rara vez
 * explica el motivo. Estos tests fijan que se acepten las tres formas validas
 * de configurarlo y que cada mezcla se identifique con su causa.
 */
const { evaluarConfiguracion, LLAVE_PUBLICA, CODIGO_PUBLICO } = require('../utils/estadoWebpay');

describe('Configuraciones validas', () => {
  it('sin ninguna variable: el SDK usa el par de pruebas', () => {
    const r = evaluarConfiguracion({});
    expect(r.coherente).toBe(true);
    expect(r.ambiente).toBe('integracion');
    expect(r.cobrosReales).toBe(false);
  });

  it('el par de pruebas escrito de forma explicita tambien vale', () => {
    // Falso positivo que hubo que corregir: escribir a mano el par de pruebas
    // completo es legitimo, y se marcaba como configuracion incoherente.
    const r = evaluarConfiguracion({
      WEBPAY_ENVIRONMENT: 'integration',
      WEBPAY_COMMERCE_CODE: CODIGO_PUBLICO,
      WEBPAY_API_KEY: LLAVE_PUBLICA
    });
    expect(r.coherente).toBe(true);
    expect(r.motivo).toBeNull();
    expect(r.codigoEsElDePruebas).toBe(true);
  });

  it('el par propio del comercio en produccion', () => {
    const r = evaluarConfiguracion({
      WEBPAY_ENVIRONMENT: 'production',
      WEBPAY_COMMERCE_CODE: '597053097973',
      WEBPAY_API_KEY: 'MI-LLAVE-DE-VERDAD'
    });
    expect(r.coherente).toBe(true);
    expect(r.cobrosReales).toBe(true);
  });
});

describe('Mezclas que Transbank rechaza', () => {
  it('la llave de pruebas junto a un codigo de comercio real', () => {
    // El caso que mas cuesta ver: media pareja de cada sitio. La llave de
    // integracion es publica (viene en el SDK), asi que es facil tomarla por
    // la propia.
    const r = evaluarConfiguracion({
      WEBPAY_ENVIRONMENT: 'production',
      WEBPAY_COMMERCE_CODE: '597053097973',
      WEBPAY_API_KEY: LLAVE_PUBLICA
    });
    expect(r.coherente).toBe(false);
    expect(r.motivo).toMatch(/publica de pruebas.*codigo de comercio es real/i);
    expect(r.cobrosReales).toBe(false);
  });

  it('produccion sin la llave', () => {
    const r = evaluarConfiguracion({
      WEBPAY_ENVIRONMENT: 'production',
      WEBPAY_COMMERCE_CODE: '597053097973'
    });
    expect(r.coherente).toBe(false);
    expect(r.motivo).toMatch(/falta el codigo de comercio o la llave/i);
  });

  it('credenciales propias apuntando al servidor de pruebas', () => {
    // Cambiar solo WEBPAY_ENVIRONMENT no revierte nada: las credenciales
    // propias siguen puestas y se envian al ambiente equivocado.
    const r = evaluarConfiguracion({
      WEBPAY_COMMERCE_CODE: '597053097973',
      WEBPAY_API_KEY: 'MI-LLAVE-DE-VERDAD'
    });
    expect(r.coherente).toBe(false);
    expect(r.motivo).toMatch(/servidor de pruebas/i);
  });
});

describe('No filtrar nada', () => {
  it('el resultado no contiene la llave ni el codigo de comercio', () => {
    const r = evaluarConfiguracion({
      WEBPAY_ENVIRONMENT: 'production',
      WEBPAY_COMMERCE_CODE: '597053097973',
      WEBPAY_API_KEY: 'LLAVE-QUE-NO-DEBE-SALIR'
    });
    const texto = JSON.stringify(r);
    expect(texto).not.toContain('LLAVE-QUE-NO-DEBE-SALIR');
    expect(texto).not.toContain('597053097973');
  });
});

describe('Tolerancia al copiar y pegar', () => {
  it('los espacios alrededor no impiden reconocer la llave de pruebas', () => {
    const r = evaluarConfiguracion({
      WEBPAY_ENVIRONMENT: 'production',
      WEBPAY_COMMERCE_CODE: '597053097973',
      WEBPAY_API_KEY: `  ${LLAVE_PUBLICA}\n`
    });
    expect(r.llaveEsLaDePruebas).toBe(true);
  });
});
