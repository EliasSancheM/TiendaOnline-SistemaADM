/**
 * Máquina de estados de un pedido.
 *
 * Antes no existía: el estado se validaba solo contra una lista de valores
 * permitidos, sin mirar el estado actual. Eso permitía dar por 'completado' un
 * pedido en 'pendiente_pago' —es decir, uno que nadie llegó a pagar— y también
 * revivir pedidos anulados.
 *
 * 'pendiente_pago' es el estado inicial de los pedidos de la tienda pública
 * mientras Webpay resuelve el cobro. Solo el callback de Transbank puede
 * sacarlos de ahí, a 'pendiente' si la transacción se autoriza y el monto
 * coincide, o a 'cancelado' en cualquier otro caso (ver routes/publicRoutes.js).
 * Desde el panel no hay ninguna transición permitida: el estado de un pago en
 * curso lo decide la respuesta de Transbank, no un operador.
 *
 * 'cancelado' es terminal. Un pedido anulado pudo haberse reembolsado, así que
 * revivirlo exige crear uno nuevo.
 *
 * 'completado' sí admite vuelta atrás hacia 'en_proceso' o 'pendiente', para
 * poder corregir un clic equivocado (el panel permite completar en lote).
 */
const TRANSICIONES = {
  pendiente_pago: [],
  pendiente: ['en_proceso', 'completado', 'cancelado'],
  en_proceso: ['pendiente', 'completado', 'cancelado'],
  completado: ['pendiente', 'en_proceso'],
  cancelado: []
};

const ESTADOS = Object.keys(TRANSICIONES);

/**
 * Comprueba si un pedido puede pasar de un estado a otro.
 *
 * @param {string} actual estado guardado en la base de datos
 * @param {string} nuevo estado solicitado
 * @returns {string|null} mensaje explicando el rechazo, o null si es válida
 */
function validarTransicion(actual, nuevo) {
  if (actual === nuevo) return null; // sin cambios: idempotente

  if (!ESTADOS.includes(nuevo)) {
    return `Estado no válido: ${nuevo}`;
  }

  const permitidos = TRANSICIONES[actual] || [];
  if (permitidos.includes(nuevo)) return null;

  if (actual === 'pendiente_pago') {
    return 'El pedido tiene un pago en curso: su estado lo determina la respuesta de Webpay, no el panel';
  }
  if (permitidos.length === 0) {
    return `Un pedido ${actual} es final y no admite cambios de estado`;
  }
  return `No se puede pasar un pedido de "${actual}" a "${nuevo}" (permitidos: ${permitidos.join(', ')})`;
}

module.exports = {
  ESTADOS,
  TRANSICIONES,
  validarTransicion
};
