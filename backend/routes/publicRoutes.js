const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../config/logger');
const { sendOrderConfirmationEmail } = require('../utils/emailService');
const { createTransaction, commitTransaction } = require('../utils/webpayService');

// POST /api/public/checkout — Crear pedido e iniciar pago con Webpay
router.post('/checkout', async (req, res) => {
  const { cliente, items, periodo, notas, total } = req.body;

  try {
    // 1. Buscar o crear cliente (por email)
    let clienteId;
    const existingCliente = await db.getAsync('SELECT id FROM clientes WHERE email = ?', [cliente.email]);

    if (existingCliente) {
      clienteId = existingCliente.id;
    } else {
      const result = await db.runAsync(
        'INSERT INTO clientes (nombre, email, telefono, direccion) VALUES (?, ?, ?, ?)',
        [cliente.nombre, cliente.email, cliente.telefono, cliente.direccion]
      );
      clienteId = result.lastID;
    }

    // 2. Crear pedido y detalles en una transacción
    const pedidoId = await db.transaction(async (tx) => {
      const fecha = new Date().toISOString().split('T')[0];
      // Se crea como pendiente_pago
      const resPedido = await tx.runAsync(
        'INSERT INTO pedidos (cliente_id, fecha, periodo, estado, total, notas) VALUES (?, ?, ?, ?, ?, ?)',
        [clienteId, fecha, periodo, 'pendiente_pago', total, notas]
      );
      const pId = resPedido.lastID;

      for (const item of items) {
        await tx.runAsync(
          'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
          [pId, item.id, item.quantity, item.precio, item.precio * item.quantity]
        );
      }
      return pId;
    });

    logger.info(`Pedido creado pendiente de pago: ID ${pedidoId}`);

    // 3. Crear transacción en Webpay Plus
    const buyOrder = `O-${pedidoId}`;
    const sessionId = `S-${clienteId}`;
    const amount = total;
    // URL a la que Webpay redirigirá después del pago
    const returnUrl = `http://localhost:5000/api/public/checkout/webpay-return?pedidoId=${pedidoId}`;

    const wpResponse = await createTransaction(buyOrder, sessionId, amount, returnUrl);

    // 4. Retornar token y URL de redirección al frontend
    res.status(200).json({ 
      success: true, 
      token: wpResponse.token,
      url: wpResponse.url
    });

  } catch (err) {
    logger.error('Error en checkout público:', err);
    res.status(500).json({ error: 'Hubo un error al procesar tu pedido. Por favor, intenta de nuevo.' });
  }
});

// ALL /api/public/checkout/webpay-return — Callback de Webpay
router.all('/checkout/webpay-return', async (req, res) => {
  try {
    const token = req.query.token_ws || req.body.token_ws;
    const pedidoId = req.query.pedidoId || req.body.pedidoId;

    // Si no hay token, el usuario anuló la transacción o Transbank retornó sin token
    if (!token) {
      logger.warn(`Pago anulado por usuario para pedido ${pedidoId}`);
      if (pedidoId) {
        await db.runAsync("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?", [pedidoId]);
      }
      return res.redirect('http://localhost:3000/checkout?status=rejected');
    }

    // Confirmar transacción con Transbank
    const commitResponse = await commitTransaction(token);
    logger.info(`Respuesta Transbank pedido ${pedidoId}: ${commitResponse.status}`);

    if (commitResponse.status === 'AUTHORIZED') {
      // Pago exitoso
      await db.runAsync("UPDATE pedidos SET estado = 'pendiente' WHERE id = ?", [pedidoId]);
      
      // Obtener email del cliente para notificar
      const pedidoInfo = await db.getAsync(
        `SELECT p.total, c.email, c.nombre FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?`, 
        [pedidoId]
      );
      
      if (pedidoInfo && pedidoInfo.email) {
        sendOrderConfirmationEmail(pedidoInfo.email, pedidoInfo.nombre, pedidoId, pedidoInfo.total)
          .catch(err => logger.error(`Error enviando correo post-pago: ${err.message}`));
      }

      return res.redirect('http://localhost:3000/checkout?status=success');
    } else {
      // Pago rechazado o fallido
      await db.runAsync("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?", [pedidoId]);
      return res.redirect('http://localhost:3000/checkout?status=rejected');
    }
  } catch (error) {
    logger.error('Error procesando el retorno de Webpay:', error);
    try {
      const pedidoIdFallback = req.query.pedidoId || req.body.pedidoId;
      if (pedidoIdFallback) {
        await db.runAsync("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?", [pedidoIdFallback]);
      }
    } catch (dbError) {
      logger.error('Error al actualizar pedido a cancelado:', dbError);
    }
    return res.redirect('http://localhost:3000/checkout?status=error');
  }
});

module.exports = router;
