const axios = require('axios');
const logger = require('../config/logger');

/**
 * Servicio para manejo de facturación electrónica (SII via Proveedor DTE)
 * Configurado por defecto para OpenFactura (Haulmer) o similar.
 */
class BillingService {
  constructor() {
    this.apiKey = process.env.BILLING_API_KEY;
    this.emisorRut = process.env.BILLING_EMISOR_RUT;
    this.environment = process.env.BILLING_ENVIRONMENT || 'sandbox';
    this.baseUrl = this.environment === 'production' 
      ? 'https://api.haulmer.com/v2/dte/emitir' 
      : 'https://api.haulmer.com/v2/dte/emitir'; // Haulmer usa el mismo para dev con sandbox keys
  }

  /**
   * Envía una factura electrónica al SII
   * @param {Object} factura Datos de la factura desde la DB
   * @param {Object} cliente Datos del cliente desde la DB
   * @param {Array} pedidos Listado de pedidos asociados
   */
  async sendFactura(factura, cliente, pedidos) {
    if (!this.apiKey || this.apiKey === 'tu_api_key_aqui') {
      logger.warn('BillingService: API Key no configurada. Usando modo simulación.');
      return this.simulateSuccess(factura);
    }

    try {
      // 1. Preparar los ítems del DTE (unificando productos de todos los pedidos)
      const items = [];
      // En una implementación real, buscaríamos los detalles de cada pedido
      // Por ahora, usamos el total como un ítem genérico o agrupamos
      items.push({
        NmbItem: `Servicio de Panadería - Factura ${factura.numero_factura}`,
        QtyItem: 1,
        PrcItem: Math.round(factura.subtotal)
      });

      // 2. Construir el objeto DTE según estándar chileno
      const dteBody = {
        responseConfig: {
          format: "pdf"
        },
        dte: {
          Encabezado: {
            IdDoc: {
              TipoDTE: 33, // Factura Electrónica
              Folio: 0,    // 0 para que el proveedor asigne el siguiente correlativo
              FchEmis: factura.fecha
            },
            Emisor: {
              RUTEmisor: this.emisorRut
            },
            Receptor: {
              RUTRecep: cliente.rut,
              RznSocRecep: cliente.nombre,
              GiroRecep: cliente.giro || 'Giro Particular',
              DirRecep: cliente.direccion,
              CmnaRecep: "Santiago" // Idealmente dinámico
            },
            Totales: {
              MntNeto: Math.round(factura.subtotal),
              TasaIVA: 19,
              IVA: Math.round(factura.impuestos),
              MntTotal: Math.round(factura.total)
            }
          },
          Detalle: items
        }
      };

      logger.info(`BillingService: Enviando DTE Folio ${factura.numero_factura} al SII...`);

      const response = await axios.post(this.baseUrl, dteBody, {
        headers: {
          'apikey': this.apiKey,
          'Content-Type': 'application/json'
        }
      });

      return {
        success: true,
        folio: response.data.folio,
        trackId: response.data.trackId,
        pdfUrl: response.data.pdfUrl,
        xmlUrl: response.data.xmlUrl
      };

    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message;
      logger.error(`BillingService Error: ${errorMsg}`);
      throw new Error(`Error SII: ${errorMsg}`);
    }
  }

  /**
   * Simulación de éxito si no hay API Key
   */
  async simulateSuccess(factura) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    return {
      success: true,
      folio: factura.numero_factura || Math.floor(Math.random() * 1000),
      trackId: Math.floor(Math.random() * 1000000),
      message: 'Modo simulación activo (Sin API Key)'
    };
  }
}

module.exports = new BillingService();
