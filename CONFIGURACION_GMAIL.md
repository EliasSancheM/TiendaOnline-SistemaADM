# Configuración de Gmail para ADM Panadería

## 📧 Configuración del Servicio de Correo

Para que el sistema pueda enviar correos de bienvenida y notificaciones, necesitas configurar una cuenta de Gmail con contraseñas de aplicación.

## 🔧 Pasos para Configurar Gmail

### 1. Preparar tu Cuenta de Gmail

1. **Habilitar la verificación en 2 pasos:**
   - Ve a [myaccount.google.com](https://myaccount.google.com)
   - Selecciona "Seguridad" en el panel izquierdo
   - En "Iniciar sesión en Google", selecciona "Verificación en 2 pasos"
   - Sigue las instrucciones para habilitarla

### 2. Generar una Contraseña de Aplicación

1. **Crear contraseña de aplicación:**
   - Ve a [myaccount.google.com](https://myaccount.google.com)
   - Selecciona "Seguridad"
   - En "Iniciar sesión en Google", selecciona "Contraseñas de aplicaciones"
   - Selecciona "Correo" y "Otro (nombre personalizado)"
   - Escribe "ADM Panadería" como nombre
   - Copia la contraseña generada (16 caracteres)

### 3. Configurar las Variables de Entorno

Edita el archivo `backend/.env` y actualiza estas líneas:

```env
# Configuración de correo Gmail
GMAIL_USER=tu_correo@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
FROM_EMAIL=ADM Panadería <tu_correo@gmail.com>
```

**Reemplaza:**
- `tu_correo@gmail.com` con tu dirección de Gmail real
- `abcd efgh ijkl mnop` con la contraseña de aplicación generada

### 4. Reiniciar el Servidor

Después de configurar las variables:

```bash
cd backend
node server.js
```

## ✅ Verificación

Cuando el servidor se inicie correctamente, verás:

```
✅ Servicio de correo configurado correctamente
Servidor corriendo en http://localhost:5000
```

Si hay problemas, verás:

```
⚠️ Problema con configuración de correo: [error]
El registro funcionará pero no se enviarán correos de bienvenida
```

## 📋 Funcionalidades del Correo

### Correo de Bienvenida
- Se envía automáticamente cuando un usuario se registra
- Incluye información de la cuenta creada
- Diseño profesional con el branding de la panadería
- Enlace directo al sistema

### Contenido del Correo
- Saludo personalizado con el nombre del usuario
- Detalles de la cuenta (correo, rol, estado)
- Instrucciones para acceder al sistema
- Diseño responsive y profesional

## 🔒 Seguridad

### Buenas Prácticas
- ✅ Usa contraseñas de aplicación (no tu contraseña principal)
- ✅ Mantén las credenciales en el archivo `.env`
- ✅ No compartas las contraseñas de aplicación
- ✅ Revoca contraseñas de aplicación si no las usas

### Variables de Entorno Seguras
- Las credenciales están en `.env` (no se suben al repositorio)
- Usa diferentes cuentas para desarrollo y producción
- Considera usar servicios de correo profesionales para producción

## 🚨 Solución de Problemas

### Error: "Invalid login"
- Verifica que la verificación en 2 pasos esté habilitada
- Asegúrate de usar la contraseña de aplicación, no tu contraseña normal
- Verifica que el correo esté escrito correctamente

### Error: "Connection timeout"
- Verifica tu conexión a internet
- Algunos firewalls corporativos bloquean SMTP
- Intenta desde una red diferente

### Error: "Service unavailable"
- Gmail puede tener límites de envío
- Espera unos minutos e intenta de nuevo
- Verifica el estado de Gmail en [status.google.com](https://status.google.com)

## 📞 Soporte

Si tienes problemas con la configuración:

1. Verifica los logs del servidor en `backend/logs/`
2. Revisa que todas las variables estén configuradas
3. Prueba con una cuenta de Gmail diferente
4. Consulta la documentación de nodemailer

---

**¡Listo!** Una vez configurado, todos los nuevos usuarios recibirán un correo de bienvenida profesional al registrarse en el sistema.