/**
 * Manejo de las fechas "de calendario" (pedidos, facturas).
 *
 * El backend guarda y devuelve estas fechas como 'YYYY-MM-DD', sin hora ni zona.
 * El problema es que `new Date('2026-08-27')` NO crea el 27 a medianoche local:
 * el estándar obliga a interpretar esa forma como UTC. En Chile (UTC-4) el
 * resultado es el 26 a las 20:00, así que al formatear en horario local toda la
 * aplicación mostraba **el día anterior** al guardado.
 *
 * Y no se quedaba en lo visual: EditarPedido cargaba la fecha con `new Date()`,
 * el selector mostraba el día anterior y al guardar enviaba ese día. Cada
 * edición corría el pedido 24 horas hacia atrás.
 *
 * En Facturas.js ya existía el apaño de concatenar 'T00:00:00' en tres sitios;
 * esto lo generaliza en un único lugar.
 *
 * Para las marcas de tiempo completas (fecha_creacion, fecha_registro) no hace
 * falta nada de esto: incluyen hora y zona, y `new Date()` las lee bien.
 */
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const SOLO_FECHA = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * Convierte una fecha del backend en un Date situado en el mediodía LOCAL.
 *
 * Se usa el mediodía y no la medianoche a propósito: deja 12 horas de margen a
 * cada lado, de modo que un cambio de horario de verano (que mueve el reloj una
 * hora) no puede empujar la fecha al día vecino.
 *
 * @param {string|Date|null|undefined} valor
 * @returns {Date|null} null si no hay valor o no es interpretable
 */
export const parseFechaLocal = (valor) => {
  if (!valor) return null;
  if (valor instanceof Date) return isNaN(valor.getTime()) ? null : valor;

  const m = SOLO_FECHA.exec(String(valor));
  if (m) {
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
  }

  const d = new Date(valor);
  return isNaN(d.getTime()) ? null : d;
};

/**
 * Fecha en el formato que espera el backend ('YYYY-MM-DD'), en hora LOCAL.
 *
 * Sustituye a `new Date().toISOString().split('T')[0]`, que devuelve la fecha
 * UTC: en Chile, a partir de las 20:00 daba ya el día siguiente, y el panel
 * pedía los pedidos de mañana mostrando cero ventas el resto de la tarde.
 *
 * @param {Date|string} valor
 * @returns {string} 'YYYY-MM-DD' ('' si el valor no es una fecha válida)
 */
export const soloFecha = (valor = new Date()) => {
  const d = parseFechaLocal(valor);
  if (!d) return '';
  const mes = String(d.getMonth() + 1).padStart(2, '0');
  const dia = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mes}-${dia}`;
};

/**
 * Fecha ya formateada para mostrar.
 * @param {string|Date} valor
 * @param {string} patron patrón de date-fns
 * @returns {string} '—' si no hay fecha, para no imprimir "Invalid Date"
 */
export const formatFecha = (valor, patron = 'dd/MM/yyyy') => {
  const d = parseFechaLocal(valor);
  return d ? format(d, patron, { locale: es }) : '—';
};

const fechas = { parseFechaLocal, soloFecha, formatFecha };
export default fechas;
