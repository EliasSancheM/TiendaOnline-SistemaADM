/**
 * Cierra los pedidos que se quedaron esperando un pago que nunca llegó.
 *
 * Un pedido de la tienda nace en 'pendiente_pago' y solo el retorno de Webpay lo
 * saca de ahí. Pero ese retorno no siempre ocurre: basta con que el cliente
 * cierre la pestaña en la pasarela, se quede sin conexión o abandone el pago a
 * medias. Nadie vuelve a tocar ese pedido.
 *
 * Y no se podía arreglar a mano: 'pendiente_pago' no admite ninguna transición
 * desde el panel (ver utils/estadosPedido.js), y con razón —el estado de un
 * cobro en curso lo decide Transbank, no un operador—, así que esos pedidos
 * quedaban atascados de forma permanente. Se acumulaban en el listado, ocupaban
 * su hueco en la producción del día y ni el administrador podía cancelarlos.
 *
 * El token de Webpay caduca a los pocos minutos. Pasado un margen holgado se
 * puede afirmar sin riesgo que ese cobro ya no se va a confirmar.
 *
 * El barrido es deliberadamente conservador: exige que el pedido siga en
 * 'pendiente_pago'. Si el retorno de Transbank llega justo a la vez, o bien ya
 * cambió el estado (y esta consulta no lo toca) o bien lo cambiará después
 * comprobando ese mismo estado, y encontrará 'cancelado'. En ningún orden se
 * pierde un pago autorizado.
 */
const db = require('../config/database');
const logger = require('../config/logger');

// Dos horas: muy por encima de la vida útil de un token de Webpay, de modo que
// ningún pago real puede seguir en curso al alcanzar el corte.
const MINUTOS_DE_GRACIA = parseInt(process.env.MINUTOS_PAGO_PENDIENTE, 10) || 120;

/**
 * @param {number} minutos antigüedad mínima para dar el pago por perdido
 * @returns {Promise<number>} cuántos pedidos se cancelaron
 */
async function caducarPendientesDePago(minutos = MINUTOS_DE_GRACIA) {
  const corte = db.helpers.haceMinutos(minutos);

  const res = await db.runAsync(
    `UPDATE pedidos
        SET estado = 'cancelado'
      WHERE estado = 'pendiente_pago'
        AND fecha_creacion <= ${corte}`
  );

  if (res.changes > 0) {
    logger.info(
      `Pedidos sin pago confirmado tras ${minutos} minutos: ${res.changes} cancelados.`
    );
  }
  return res.changes;
}

module.exports = { caducarPendientesDePago, MINUTOS_DE_GRACIA };
