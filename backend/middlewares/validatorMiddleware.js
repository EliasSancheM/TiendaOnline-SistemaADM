const Joi = require('joi');

const loginSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required()
});

const clienteSchema = Joi.object({
  nombre: Joi.string().min(2).max(100).required(),
  telefono: Joi.string().pattern(/^[0-9+\-\s()]+$/).max(20).allow(''),
  email: Joi.string().email().allow(''),
  direccion: Joi.string().max(200).allow(''),
  rut: Joi.string().max(15).allow(''),
  giro: Joi.string().max(200).allow('')
});

const productoSchema = Joi.object({
  id: Joi.number().optional(),
  nombre: Joi.string().min(2).max(100).required(),
  precio: Joi.number().positive().required(),
  descripcion: Joi.string().max(500).allow('')
});

const registerSchema = Joi.object({
  username: Joi.string().alphanum().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
  nombre_completo: Joi.string().min(2).max(100).required(),
  email: Joi.string().email().required()
});

// Esquema de validación para detalles de pedido
const detallePedidoSchema = Joi.object({
  producto_id: Joi.number().integer().positive().required(),
  cantidad: Joi.number().integer().min(1).required(),
  precio_unitario: Joi.number().positive().required(),
  subtotal: Joi.number().min(0).required()
});

// Esquema de validación para pedidos
const pedidoSchema = Joi.object({
  cliente_id: Joi.number().integer().positive().allow(null),
  fecha: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}/).required()
    .messages({ 'string.pattern.base': 'La fecha debe tener formato YYYY-MM-DD' }),
  periodo: Joi.string().valid('mañana', 'tarde').required()
    .messages({ 'any.only': 'El periodo debe ser "mañana" o "tarde"' }),
  estado: Joi.string().valid('pendiente', 'en_proceso', 'completado', 'cancelado').default('pendiente'),
  total: Joi.number().min(0).default(0),
  notas: Joi.string().max(500).allow('', null),
  detalles: Joi.array().items(detallePedidoSchema).optional()
});

// Esquema de validación para facturas
const facturaSchema = Joi.object({
  cliente_id: Joi.number().integer().positive().required()
    .messages({ 'any.required': 'El cliente es obligatorio' }),
  pedidos_ids: Joi.array().items(Joi.number().integer().positive()).optional(),
  numero_factura: Joi.string().min(1).max(50).required()
    .messages({ 'any.required': 'El número de factura es obligatorio' }),
  fecha: Joi.string().pattern(/^\d{4}-\d{2}-\d{2}/).required()
    .messages({ 'string.pattern.base': 'La fecha debe tener formato YYYY-MM-DD' }),
  subtotal: Joi.number().min(0).required(),
  impuestos: Joi.number().min(0).required(),
  total: Joi.number().min(0).required(),
  estado: Joi.string().valid('pendiente', 'pagada', 'anulada').default('pendiente'),
  notas: Joi.string().max(500).allow('', null)
});

// Esquema de validación para el checkout público (tienda en línea)
const publicCheckoutSchema = Joi.object({
  cliente: Joi.object({
    nombre: Joi.string().min(2).max(100).required()
      .messages({ 'any.required': 'El nombre del cliente es obligatorio' }),
    email: Joi.string().email().required()
      .messages({ 
        'any.required': 'El correo del cliente es obligatorio',
        'string.email': 'El correo electrónico no es válido' 
      }),
    telefono: Joi.string().pattern(/^[0-9+\-\s()]+$/).max(20).required()
      .messages({ 
        'any.required': 'El teléfono del cliente es obligatorio',
        'string.pattern.base': 'El formato de teléfono no es válido' 
      }),
    direccion: Joi.string().max(200).required()
      .messages({ 'any.required': 'La dirección de entrega es obligatoria' })
  }).required(),
  items: Joi.array().items(
    Joi.object({
      id: Joi.number().integer().positive().required()
        .messages({ 'any.required': 'El ID del producto es obligatorio' }),
      quantity: Joi.number().integer().min(1).required()
        .messages({ 
          'any.required': 'La cantidad de producto es obligatoria',
          'number.min': 'La cantidad mínima es 1' 
        })
    })
  ).min(1).required()
    .messages({ 
      'any.required': 'Los productos del carrito son obligatorios',
      'array.min': 'El carrito debe contener al menos un producto' 
    }),
  periodo: Joi.string().valid('mañana', 'tarde').required()
    .messages({ 'any.only': 'El periodo debe ser "mañana" o "tarde"' }),
  notas: Joi.string().max(500).allow('', null),
  total: Joi.number().optional() // Se recalculará de forma segura en backend
});

/**
 * Middleware genérico de validación.
 * Uso: router.post('/', validate(pedidoSchema), handler)
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
    if (error) {
      const messages = error.details.map(d => d.message).join('; ');
      return res.status(400).json({ error: messages });
    }
    req.body = value; // Usar los valores sanitizados
    next();
  };
};

module.exports = {
  loginSchema,
  clienteSchema,
  productoSchema,
  registerSchema,
  pedidoSchema,
  facturaSchema,
  detallePedidoSchema,
  publicCheckoutSchema,
  validate
};
