const nodemailer = require('nodemailer');
const logger = require('../config/logger');

// Configurar el transportador de Gmail
const createTransporter = () => {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_USER,
      pass: process.env.GMAIL_APP_PASSWORD
    }
  });
};

// Función para enviar correo de bienvenida
const sendWelcomeEmail = async (userEmail, userName) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: userEmail,
      subject: '¡Bienvenido a ADM Panadería! 🥖',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #8D6E63; margin: 0; font-size: 28px;">🥖 ADM Panadería</h1>
              <p style="color: #666; margin: 10px 0 0 0; font-size: 16px;">Sistema de Administración</p>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">¡Bienvenido, ${userName}!</h2>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
              Tu cuenta ha sido creada exitosamente en nuestro sistema de administración de panadería.
            </p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #8D6E63; margin-top: 0;">Detalles de tu cuenta:</h3>
              <p style="margin: 5px 0; color: #555;"><strong>Correo:</strong> ${userEmail}</p>
              <p style="margin: 5px 0; color: #555;"><strong>Rol:</strong> Empleado</p>
              <p style="margin: 5px 0; color: #555;"><strong>Estado:</strong> Activo</p>
            </div>
            
            <div style="background-color: #e8f5e8; padding: 15px; border-radius: 8px; border-left: 4px solid #4CAF50; margin: 20px 0;">
              <p style="margin: 0; color: #2e7d32;">
                <strong>¡Ya puedes acceder al sistema!</strong><br>
                Utiliza tus credenciales para iniciar sesión y comenzar a gestionar pedidos y clientes.
              </p>
            </div>
            
            <div style="text-align: center; margin-top: 30px;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}" style="background-color: #8D6E63; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Acceder al Sistema</a>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #999; font-size: 14px; margin: 0;">
                Si tienes alguna pregunta, contacta al administrador del sistema.
              </p>
              <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
                © ${new Date().getFullYear()} ADM Panadería - Sistema de Administración
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Correo de bienvenida enviado a ${userEmail}`);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    logger.error('Error enviando correo de bienvenida:', error);
    return { success: false, error: error.message };
  }
};

// Función para enviar correo de restablecimiento de contraseña
const sendPasswordResetEmail = async (userEmail, userName, resetToken) => {
  try {
    const transporter = createTransporter();
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: userEmail,
      subject: 'Restablecimiento de Contraseña - ADM Panadería',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #8D6E63; margin: 0; font-size: 28px;">🥖 ADM Panadería</h1>
              <p style="color: #666; margin: 10px 0 0 0; font-size: 16px;">Sistema de Administración</p>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">Restablecimiento de Contraseña</h2>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
              Hola ${userName},
            </p>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
              Hemos recibido una solicitud para restablecer la contraseña de tu cuenta. Si no realizaste esta solicitud, puedes ignorar este correo.
            </p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${resetUrl}" style="background-color: #FF6B6B; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Restablecer Contraseña</a>
            </div>
            
            <div style="background-color: #fff3cd; padding: 15px; border-radius: 8px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <p style="margin: 0; color: #856404;">
                <strong>Importante:</strong> Este enlace expirará en 1 hora por seguridad.
              </p>
            </div>
            
            <p style="color: #555; line-height: 1.6; font-size: 14px;">
              Si el botón no funciona, copia y pega el siguiente enlace en tu navegador:<br>
              <a href="${resetUrl}" style="color: #8D6E63; word-break: break-all;">${resetUrl}</a>
            </p>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #999; font-size: 14px; margin: 0;">
                Si tienes problemas, contacta al administrador del sistema.
              </p>
              <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
                © ${new Date().getFullYear()} ADM Panadería - Sistema de Administración
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Correo de restablecimiento enviado a ${userEmail}`);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    logger.error('Error enviando correo de restablecimiento:', error);
    return { success: false, error: error.message };
  }
};

// Función para enviar correo de confirmación de pedido
const sendOrderConfirmationEmail = async (userEmail, userName, pedidoId, total) => {
  try {
    const transporter = createTransporter();
    
    const mailOptions = {
      from: process.env.FROM_EMAIL,
      to: userEmail,
      subject: `Confirmación de Pedido #${pedidoId} - ADM Panadería 🥖`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f9f9f9;">
          <div style="background-color: white; padding: 30px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
            <div style="text-align: center; margin-bottom: 30px;">
              <h1 style="color: #8D6E63; margin: 0; font-size: 28px;">🥖 ADM Panadería</h1>
            </div>
            
            <h2 style="color: #333; margin-bottom: 20px;">¡Gracias por tu compra, ${userName}!</h2>
            
            <p style="color: #555; line-height: 1.6; margin-bottom: 20px;">
              Hemos recibido tu pedido correctamente. Nos pondremos en contacto contigo pronto para coordinar la entrega.
            </p>
            
            <div style="background-color: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="color: #8D6E63; margin-top: 0;">Detalles del Pedido:</h3>
              <p style="margin: 5px 0; color: #555;"><strong>Nº de Pedido:</strong> #${pedidoId}</p>
              <p style="margin: 5px 0; color: #555;"><strong>Total:</strong> $${total.toLocaleString('es-CL')}</p>
              <p style="margin: 5px 0; color: #555;"><strong>Estado:</strong> Recibido / Pendiente</p>
            </div>
            
            <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center;">
              <p style="color: #999; font-size: 14px; margin: 0;">
                Si tienes alguna pregunta, por favor contáctanos.
              </p>
              <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
                © ${new Date().getFullYear()} ADM Panadería
              </p>
            </div>
          </div>
        </div>
      `
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info(`Correo de confirmación de pedido enviado a ${userEmail}`);
    return { success: true, messageId: result.messageId };
    
  } catch (error) {
    logger.error('Error enviando correo de confirmación de pedido:', error);
    return { success: false, error: error.message };
  }
};

// Función para verificar la configuración del correo
const verifyEmailConfig = async () => {
  try {
    if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
      logger.info('Credenciales de correo no configuradas. Se omite la verificación y no se enviarán correos.');
      return { success: false, error: 'Credenciales de correo no proporcionadas en .env' };
    }
    const transporter = createTransporter();
    await transporter.verify();
    logger.info('Configuración de correo verificada correctamente');
    return { success: true };
  } catch (error) {
    logger.error('Error en configuración de correo:', error);
    return { success: false, error: error.message };
  }
};

module.exports = {
  sendWelcomeEmail,
  sendPasswordResetEmail,
  sendOrderConfirmationEmail,
  verifyEmailConfig
};