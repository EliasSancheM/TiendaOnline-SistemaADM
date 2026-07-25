# 🥖 ADM Panadería — Sistema de Administración y Tienda en Línea

Aplicación full-stack para administrar una panadería ("DondeLaEli"). Combina **dos aplicaciones en un mismo proyecto**:

1. **Panel de administración privado** (`/admin/*`) — gestión de clientes, pedidos diarios (mañana/tarde), productos y facturación, con control de acceso por roles.
2. **Tienda pública en línea** (`/`) — catálogo, carrito y checkout con pago real vía **Webpay Plus (Transbank)**.

---

## 🧱 Tecnologías

| Capa | Stack |
|------|-------|
| **Frontend** | React 18, Material UI 5, React Router 6, GSAP + Lenis (scroll), Recharts, axios |
| **Backend** | Node.js + Express 5, JWT (cookie httpOnly), bcrypt, Joi, Winston, Helmet, rate-limiting |
| **Base de datos** | **SQLite** (desarrollo local) o **PostgreSQL** (producción) — adaptador dual automático |
| **Pagos** | Transbank Webpay Plus (`transbank-sdk`) |
| **Correo** | Nodemailer sobre Gmail (bienvenida, reset de contraseña, confirmación de pedido) |
| **Deploy** | Preparado para Railway / Render (el backend sirve el build de React) |

La base de datos se **selecciona automáticamente**: si existe la variable `DATABASE_URL` (típica de Railway/Heroku) o `DB_TYPE=postgresql`, usa PostgreSQL; de lo contrario, SQLite local. Las tablas se crean solas al arrancar.

---

## 📋 Requisitos previos

- Node.js 18+ y npm
- (Opcional) PostgreSQL si vas a probar ese motor localmente

---

## 🚀 Instalación y ejecución (desarrollo)

### 1. Backend

```bash
cd backend
npm install
cp .env.example .env      # y edita las variables (ver abajo)
npm run dev               # nodemon, o `npm start` para producción
```

> ⚠️ **Importante:** el servidor **no arranca** si `JWT_SECRET` no está definido o tiene menos de 32 caracteres. Genera uno con:
> ```bash
> node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
> ```

Al iniciar por primera vez se crea un usuario administrador con **contraseña aleatoria** que se imprime **una sola vez** en la consola. Guárdala.

### 2. Frontend

```bash
cd frontend
npm install
npm start                 # abre http://localhost:3000
```

Ambos servicios deben correr simultáneamente. El frontend usa `proxy` a `http://localhost:5000` en desarrollo.

---

## 🔐 Variables de entorno (backend `.env`)

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `JWT_SECRET` | ✅ | Secreto de firma JWT (mín. 32 caracteres). |
| `PORT` | | Puerto del backend (default `5000`). |
| `NODE_ENV` | | `development` / `production`. |
| `SESSION_TIMEOUT` | | Expiración del token (default `24h`). |
| `CORS_ORIGIN` / `FRONTEND_URL` | | Origen permitido y URL del frontend. |
| `DB_TYPE` | | `sqlite` (default) o `postgresql`. |
| `DATABASE_URL` | | Cadena de conexión PostgreSQL (activa PG automáticamente). |
| `PG_SSL` | | `true` para SSL en la nube. |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | | Límites del rate-limiter general. |
| `GMAIL_USER` / `GMAIL_APP_PASSWORD` / `FROM_EMAIL` | | Envío de correos (opcional). |
| `WEBPAY_COMMERCE_CODE` / `WEBPAY_API_KEY` / `WEBPAY_ENVIRONMENT` | | Credenciales Webpay de producción (por defecto usa el ambiente de **Integración/Pruebas** de Transbank). |

---

## 👥 Roles y permisos

| Rol | Acceso |
|-----|--------|
| `admin` | Todo, incluida creación de usuarios y borrado. |
| `empleado` | Clientes, pedidos y productos (sin borrar). |
| `contador` | Dashboard y facturas. |

El registro de usuarios (`POST /api/auth/register`) está restringido a `admin`.

---

## 🗂️ Estructura del proyecto

```
backend/
  server.js                # App Express, middlewares de seguridad, arranque
  config/
    database.js            # Adaptador dual SQLite ↔ PostgreSQL + creación de tablas
    logger.js              # Winston
  middlewares/
    authMiddleware.js      # JWT (cookie/header) + autorización por rol
    validatorMiddleware.js # Esquemas Joi + política de contraseñas
  routes/                  # auth, clientes, pedidos, productos, facturas, public
  services/                # billingService (facturación)
  utils/                   # webpayService, emailService, tokenBlacklist
  migrate_sqlite_to_pg.js  # Migración de datos SQLite → PostgreSQL
  migrate_rut.js           # Migración: agrega columnas rut/giro a clientes
  __tests__/               # Tests (Jest + Supertest)

frontend/
  src/
    App.js                 # Rutas públicas (/) y privadas (/admin/*), tema MUI
    pages/                 # Home, Tienda, Checkout, Dashboard, Pedidos, Facturas...
    components/            # Navbar, PublicNavbar, CartDrawer, ProtectedRoute...
    contexts/              # AuthContext, CartContext
    config/api.js          # URL base de la API
```

---

## 💳 Flujo de pago (tienda pública)

1. `POST /api/public/checkout` — el backend **recalcula el total con los precios reales de la BD** (nunca confía en el precio enviado por el cliente), crea el pedido como `pendiente_pago` e inicia la transacción en Webpay.
2. El cliente paga en Webpay y Transbank redirige a `/api/public/checkout/webpay-return`.
3. El backend confirma con Transbank y **solo marca el pedido como pagado si**: la transacción está `AUTHORIZED`, el pedido sigue en `pendiente_pago` y el **monto coincide exactamente**. En cualquier otro caso (anulación, monto alterado, reintento) el pedido se cancela y no se cobra.

Este flujo está cubierto por pruebas automatizadas en `backend/__tests__/checkout.test.js`.

---

## 🧪 Tests

```bash
cd backend
npm test
```

Cobertura actual:
- **Autenticación** (`auth.test.js`): login, verificación de token, registro, logout, blacklist, forgot/reset password.
- **Pagos** (`checkout.test.js`): recálculo seguro de totales, validación de productos, y todas las ramas del callback de Webpay (éxito, monto alterado, no autorizado, anulación, reintento, buy_order inválido).

---

## 🛠️ Migración a PostgreSQL (producción)

```bash
cd backend
# Migra los datos de tu SQLite local a la base PostgreSQL destino
npm run migrate:pg -- "postgresql://usuario:clave@host:puerto/basedatos"
```

En Railway/Render define `DB_TYPE=postgresql`, `DATABASE_URL` y `PG_SSL=true`. El backend detecta el entorno de nube y **se niega a arrancar con SQLite** en producción para evitar errores de compilación nativa.

---

## 🔒 Notas de seguridad

- Contraseñas con **bcrypt** (12 rounds); admin inicial con contraseña aleatoria.
- JWT en **cookie httpOnly** + blacklist en logout.
- **Helmet** para cabeceras HTTP y **rate-limiting reforzado** en endpoints de autenticación.
- Todas las consultas SQL usan **parámetros** (sin concatenación).
- El checkout valida montos del lado del servidor contra manipulación de precios.

Ver documentación adicional en [RECOMENDACIONES_SEGURIDAD.md](RECOMENDACIONES_SEGURIDAD.md).
