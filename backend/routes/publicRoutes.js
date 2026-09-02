const express = require('express');
const router = express.Router();
const db = require('../config/database');
const logger = require('../config/logger');
const { sendOrderConfirmationEmail } = require('../utils/emailService');
const { createTransaction, commitTransaction } = require('../utils/webpayService');
const { validate, publicCheckoutSchema } = require('../middlewares/validatorMiddleware');
const { soloFecha } = require('../utils/fechas');
const { registrarFallo, registrarExito } = require('../utils/estadoPasarela');
const { baseDelBackend, baseDelFrontend } = require('../utils/urlBackend');

// POST /api/public/checkout — Crear pedido e iniciar pago con Webpay
router.post('/checkout', validate(publicCheckoutSchema), async (req, res) => {
  const { cliente, items, periodo, notas } = req.body;

  try {
    // 1. Obtener los IDs de los productos para consultar precios reales de forma masiva
    const productIds = items.map(item => item.id);
    const placeholders = productIds.map(() => '?').join(',');
    const dbProducts = await db.allAsync(
      `SELECT id, precio, nombre FROM productos WHERE id IN (${placeholders})`,
      productIds
    );

    // Crear mapa de consulta rápida de productos
    const productMap = {};
    dbProducts.forEach(p => {
      productMap[p.id] = p;
    });

    // 2. Calcular el total seguro en el backend
    let calculatedTotal = 0;
    const enrichedItems = [];

    for (const item of items) {
      const dbProduct = productMap[item.id];
      if (!dbProduct) {
        return res.status(400).json({ error: `El producto con ID ${item.id} no existe en nuestro catálogo.` });
      }

      const dbPrice = dbProduct.precio;
      const subtotal = dbPrice * item.quantity;
      calculatedTotal += subtotal;
      
      enrichedItems.push({
        id: item.id,
        nombre: dbProduct.nombre,
        quantity: item.quantity,
        precio: dbPrice,
        subtotal: subtotal
      });
    }

    // 3. Buscar o crear cliente (por email)
    let clienteId;
    const existingCliente = await db.getAsync('SELECT id FROM clientes WHERE email = ?', [cliente.email]);

    if (existingCliente) {
      clienteId = existingCliente.id;
      // Los datos del formulario son los de ESTE pedido y mandan sobre lo que
      // hubiera guardado de una compra anterior. Antes se descartaban en
      // silencio: quien ya había comprado y se mudaba escribía su dirección
      // nueva, veía el pedido confirmado, y el reparto salía igualmente a la
      // dirección vieja, porque el panel solo mira la ficha del cliente.
      await db.runAsync(
        'UPDATE clientes SET nombre = ?, telefono = ?, direccion = ? WHERE id = ?',
        [cliente.nombre, cliente.telefono, cliente.direccion, clienteId]
      );
    } else {
      const result = await db.runAsync(
        'INSERT INTO clientes (nombre, email, telefono, direccion) VALUES (?, ?, ?, ?)',
        [cliente.nombre, cliente.email, cliente.telefono, cliente.direccion]
      );
      clienteId = result.lastID;
    }

    // 4. Crear pedido y detalles en una transacción usando el total calculado en backend
    const pedidoId = await db.transaction(async (tx) => {
      // Fecha LOCAL, no UTC: con toISOString() un pedido hecho después de las
      // 20:00 en Chile se guardaba con la fecha del día siguiente y aparecía en
      // la lista de producción equivocada.
      const fecha = soloFecha(new Date());
      // Se crea como pendiente_pago
      const resPedido = await tx.runAsync(
        'INSERT INTO pedidos (cliente_id, fecha, periodo, estado, total, notas) VALUES (?, ?, ?, ?, ?, ?)',
        [clienteId, fecha, periodo, 'pendiente_pago', calculatedTotal, notas]
      );
      const pId = resPedido.lastID;

      for (const item of enrichedItems) {
        await tx.runAsync(
          'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, ?, ?, ?)',
          [pId, item.id, item.quantity, item.precio, item.subtotal]
        );
      }
      return pId;
    });

    logger.info(`Pedido creado pendiente de pago de forma segura: ID ${pedidoId}, Total: ${calculatedTotal}`);

    // 5. Crear transacción en Webpay Plus con el total del servidor
    const buyOrder = `O-${pedidoId}`;
    const sessionId = `S-${clienteId}`;
    const amount = calculatedTotal;
    
    // URL a la que Webpay redirigirá después del pago (soporta Railway y local automáticamente)
    const backendUrl = baseDelBackend(req);
    const returnUrl = `${backendUrl}/api/public/checkout/webpay-return?pedidoId=${pedidoId}`;

    // Si Transbank rechaza la apertura de la transacción (credenciales que aún
    // no están habilitadas, comercio sin activar, caída del servicio), el pedido
    // YA está guardado como 'pendiente_pago'. Sin tratarlo aparte, cada intento
    // fallido dejaba un pedido fantasma en la lista de producción, y el cliente
    // volvía a intentarlo generando otro más.
    let wpResponse;
    try {
      wpResponse = await createTransaction(buyOrder, sessionId, amount, returnUrl);
    } catch (errPasarela) {
      // Se recuerda para poder consultarlo por HTTP mientras la tienda está caída.
      registrarFallo(errPasarela, {
        ambiente: (process.env.WEBPAY_ENVIRONMENT || 'integracion'),
        baseDeRetorno: backendUrl,
        montoEnviado: amount
      });
      logger.error(
        `No se pudo abrir la transacción en Webpay para el pedido ${pedidoId} ` +
        `(ambiente: ${process.env.WEBPAY_ENVIRONMENT || 'integracion'}, ` +
        `comercio: ${process.env.WEBPAY_COMMERCE_CODE ? 'configurado' : 'por defecto'}): ` +
        (errPasarela && errPasarela.message)
      );

      // Para el cliente ese pedido nunca existió: se anula en el acto.
      try {
        await db.runAsync(
          "UPDATE pedidos SET estado = 'cancelado' WHERE id = ? AND estado = 'pendiente_pago'",
          [pedidoId]
        );
      } catch (errAnular) {
        logger.error('Tampoco se pudo anular el pedido fantasma:', errAnular);
      }

      return res.status(502).json({
        error: 'No pudimos conectar con el sistema de pagos. No se ha registrado tu pedido ni se te ha cobrado nada. Inténtalo en unos minutos o llámanos.'
      });
    }

    registrarExito();

    // 6. Retornar token y URL de redirección al frontend
    res.status(200).json({ 
      success: true, 
      token: wpResponse.token,
      url: wpResponse.url
    });

  } catch (err) {
    logger.error('Error en checkout público seguro:', err);
    res.status(500).json({ error: 'Hubo un error al procesar tu pedido. Por favor, intenta de nuevo.' });
  }
});

// ALL /api/public/checkout/webpay-return — Callback de Webpay Seguro
router.all('/checkout/webpay-return', async (req, res) => {
  let verifiedPedidoId = null;

  try {
    // El retorno de Transbank puede llegar por GET (query) o POST (form body).
    // req.body puede ser undefined si el usuario anula sin enviar cuerpo.
    const body = req.body || {};
    const dato = (nombre) => req.query[nombre] || body[nombre];

    // Transbank usa nombres DISTINTOS según cómo terminó la transacción:
    //
    //   token_ws              el flujo normal: el usuario pagó (o lo intentó) y
    //                         hay que confirmar con commit().
    //   TBK_TOKEN             el usuario pulsó "Anular compra" en el formulario.
    //                         NO se debe confirmar: no existe transacción que
    //                         confirmar y llamar a commit() da error.
    //   TBK_ORDEN_COMPRA      la orden de compra (nuestro buy_order, 'O-<id>').
    //   TBK_ID_SESION         el session_id que enviamos al crear la transacción.
    //
    // Si llegan token_ws y TBK_TOKEN a la vez, la compra se abandonó y luego se
    // reintentó: tampoco se confirma. Ante la duda, no se confirma nunca.
    const tokenWs = dato('token_ws');
    const tbkToken = dato('TBK_TOKEN');
    const tbkOrdenCompra = dato('TBK_ORDEN_COMPRA');
    const tbkIdSesion = dato('TBK_ID_SESION');

    // La orden que manda Transbank identifica el pedido mejor que el pedidoId
    // que añadimos nosotros a la URL de retorno, porque no depende de que ese
    // parámetro sobreviva a la redirección.
    const idDeLaOrden = typeof tbkOrdenCompra === 'string' && tbkOrdenCompra.startsWith('O-')
      ? parseInt(tbkOrdenCompra.slice(2), 10)
      : NaN;
    const idDeLaUrl = parseInt(dato('pedidoId'), 10);
    verifiedPedidoId = Number.isInteger(idDeLaOrden) ? idDeLaOrden
      : (Number.isInteger(idDeLaUrl) ? idDeLaUrl : null);

    // 1. Transacción abandonada: anulada por el usuario, o caducada por tiempo.
    //    En ninguno de los dos casos se llama a commit().
    if (!tokenWs || tbkToken) {
      const motivo = tbkToken
        ? 'anulada por el usuario en el formulario de Webpay'
        : (tbkOrdenCompra ? 'caducada por inactividad en Webpay' : 'retorno sin token');

      logger.warn(
        `Transacción ${motivo} (pedido: ${verifiedPedidoId}, ` +
        `orden: ${tbkOrdenCompra || '—'}, sesión: ${tbkIdSesion || '—'})`
      );

      if (verifiedPedidoId) {
        // Solo se anula si seguía esperando el pago: si ya estaba pagado, este
        // retorno tardío no puede deshacerlo.
        const pedido = await db.getAsync("SELECT estado FROM pedidos WHERE id = ?", [verifiedPedidoId]);
        if (pedido && pedido.estado === 'pendiente_pago') {
          await db.runAsync("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?", [verifiedPedidoId]);
          logger.info(`Pedido ${verifiedPedidoId} anulado sin confirmar el pago.`);
        } else {
          logger.warn(
            `No se anula el pedido ${verifiedPedidoId}: estado actual ` +
            `${pedido ? pedido.estado : 'inexistente'}`
          );
        }
      }

      const frontendUrl = baseDelFrontend();
      return res.redirect(`${frontendUrl}/checkout?status=rejected`);
    }

    const token = tokenWs;

    // 2. Confirmar transacción con Transbank
    const commitResponse = await commitTransaction(token);
    
    // 3. Extraer el pedidoId de forma segura del buy_order oficial de Transbank (formato: "O-pedidoId")
    const buyOrder = commitResponse.buy_order;
    if (!buyOrder || !buyOrder.startsWith('O-')) {
      throw new Error(`buy_order inválido devuelto por Transbank: ${buyOrder}`);
    }
    
    const parsedPedidoId = parseInt(buyOrder.split('-')[1]);
    if (isNaN(parsedPedidoId)) {
      throw new Error(`buy_order no contiene un pedidoId válido: ${buyOrder}`);
    }

    verifiedPedidoId = parsedPedidoId; // Actualizar con el ID verificado por firma
    logger.info(`Respuesta Transbank oficial para Pedido ${verifiedPedidoId}: ${commitResponse.status}`);

    // 4. Buscar información del pedido en la base de datos
    const dbOrder = await db.getAsync(
      `SELECT p.total, p.estado, c.email, c.nombre FROM pedidos p JOIN clientes c ON p.cliente_id = c.id WHERE p.id = ?`, 
      [verifiedPedidoId]
    );

    if (!dbOrder) {
      throw new Error(`Pedido ID ${verifiedPedidoId} no encontrado en la base de datos`);
    }

    // 5. Validaciones estrictas de seguridad de pago
    const isAuthorized = commitResponse.status === 'AUTHORIZED';
    const isPendingPayment = dbOrder.estado === 'pendiente_pago';
    const isAmountCorrect = Math.abs(commitResponse.amount - dbOrder.total) < 0.01;

    if (isAuthorized && isPendingPayment && isAmountCorrect) {
      // Pago exitoso y validado
      await db.runAsync("UPDATE pedidos SET estado = 'pendiente' WHERE id = ?", [verifiedPedidoId]);
      logger.info(`✅ Pedido ${verifiedPedidoId} pagado exitosamente. Monto: ${commitResponse.amount}`);
      
      // Enviar correo de confirmación de forma asíncrona
      if (dbOrder.email) {
        sendOrderConfirmationEmail(dbOrder.email, dbOrder.nombre, verifiedPedidoId, dbOrder.total)
          .catch(err => logger.error(`Error enviando correo post-pago: ${err.message}`));
      }

      const frontendUrl = baseDelFrontend();
      return res.redirect(`${frontendUrl}/checkout?status=success`);
    } else {
      // Registrar razones específicas del fallo de validación
      if (!isAuthorized) {
        logger.warn(`❌ Transacción Webpay no autorizada para Pedido ${verifiedPedidoId}. Estado: ${commitResponse.status}`);
      } else if (!isPendingPayment) {
        logger.warn(`⚠️ Transacción válida pero Pedido ${verifiedPedidoId} ya no está en pendiente_pago (estado actual: ${dbOrder.estado})`);
      } else if (!isAmountCorrect) {
        logger.error(`🚨 DISCREPANCIA DE MONTO DETECTADA. Pedido ${verifiedPedidoId}. DB: ${dbOrder.total}, Transbank: ${commitResponse.amount}`);
      }

      // Solo actualizar a cancelado si el pedido aún estaba pendiente de pago
      if (isPendingPayment) {
        await db.runAsync("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?", [verifiedPedidoId]);
      }
      
      const frontendUrl = baseDelFrontend();
      return res.redirect(`${frontendUrl}/checkout?status=rejected`);
    }
  } catch (error) {
    logger.error('Error procesando el retorno de Webpay:', error);
    try {
      if (verifiedPedidoId) {
        const orderToCheck = await db.getAsync("SELECT estado FROM pedidos WHERE id = ?", [verifiedPedidoId]);
        if (orderToCheck && orderToCheck.estado === 'pendiente_pago') {
          await db.runAsync("UPDATE pedidos SET estado = 'cancelado' WHERE id = ?", [verifiedPedidoId]);
          logger.info(`Pedido ${verifiedPedidoId} cancelado tras error en el procesamiento.`);
        }
      }
    } catch (dbError) {
      logger.error('Error al actualizar pedido a cancelado tras excepción:', dbError);
    }
    const frontendUrl = baseDelFrontend();
    return res.redirect(`${frontendUrl}/checkout?status=error`);
  }
});

module.exports = router;
