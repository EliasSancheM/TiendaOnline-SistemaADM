/**
 * Memoria del último fallo al hablar con la pasarela de pago.
 *
 * Cuando el checkout se cae, lo único visible desde fuera es el mensaje que ve
 * el cliente ("no pudimos conectar con el sistema de pagos"). El motivo real lo
 * devuelve Transbank y queda en los registros del servidor, que no siempre se
 * pueden consultar en el momento — y es justo cuando más falta hacen, con la
 * tienda caída.
 *
 * Esto guarda en memoria el último fallo para poder mirarlo por HTTP. Vive solo
 * en el proceso: no se persiste ni se acumula, porque no es un historial sino
 * una ayuda para el rato en que algo está roto.
 *
 * El mensaje se recorta y NUNCA incluye credenciales: lo que se registra es la
 * respuesta de Transbank, que no las contiene.
 */
const LARGO_MAXIMO = 300;

let ultimo = null;

/**
 * @param {Error|string} error lo que devolvió la pasarela
 * @param {Object} contexto datos no sensibles que ayudan a situar el fallo
 */
function registrarFallo(error, contexto = {}) {
  const mensaje = (error && error.message) || String(error || '');
  ultimo = {
    cuando: new Date().toISOString(),
    mensaje: mensaje.slice(0, LARGO_MAXIMO),
    ...contexto
  };
}

/** Marca que la pasarela respondió bien, para no arrastrar un fallo ya resuelto. */
function registrarExito() {
  ultimo = null;
}

/** @returns {Object|null} el último fallo, o null si la última vez fue bien */
function ultimoFallo() {
  return ultimo;
}

module.exports = { registrarFallo, registrarExito, ultimoFallo };
