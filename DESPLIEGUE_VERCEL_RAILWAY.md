# Despliegue: frontend en Vercel, backend y base de datos en Railway

Arquitectura: el **frontend** (React) se publica como sitio estático en Vercel y el
**backend** (Express) corre en Railway junto a una base **PostgreSQL**. Son dominios
distintos, y de ahí vienen la mayoría de los detalles de configuración de abajo.

```
Navegador ──> panaderia.vercel.app        (React estático)
                    │
                    └── fetch /api/* ──> panaderia.up.railway.app  (Express)
                                                │
                                                └──> PostgreSQL (Railway)
```

---

## Paso 1 — Base de datos PostgreSQL en Railway

1. Entra en [railway.app](https://railway.app) e inicia sesión con GitHub.
2. **New Project** → **Provision PostgreSQL**.
3. Abre el servicio Postgres → pestaña **Variables**. Verás **dos** URLs distintas
   y no son intercambiables:

| Variable | Host | Cuándo usarla |
|---|---|---|
| `DATABASE_URL` | `postgres.railway.internal` | Desde **dentro** de Railway (el backend desplegado). Es la red privada: más rápida y no gasta tráfico. |
| `DATABASE_PUBLIC_URL` | `...proxy.rlwy.net` | Desde **fuera**: tu equipo, herramientas de escritorio, pruebas locales. |

> Conectarse desde el PC con `DATABASE_URL` falla siempre: el host
> `postgres.railway.internal` no existe fuera de la red de Railway.

> Ambas URLs contienen la contraseña de la base. No las subas a GitHub. Si alguna
> se filtra, se rota desde el propio panel de Postgres.

**Antes de desplegar nada**, conviene probar el backend en local contra esa base
para descartar incompatibilidades de SQL. Usando la URL **pública**:

```bash
cd backend
DATABASE_URL="postgresql://...proxy.rlwy.net:PUERTO/railway" DB_TYPE=postgresql PG_SSL=true npm start
```

El servidor creará las tablas y mostrará por consola el usuario administrador
generado. **Guarda esa contraseña: solo se muestra una vez.**

---

## Paso 2 — Backend en Railway

1. En el mismo proyecto: **New** → **GitHub Repo** → elige `TiendaOnline-SistemaADM`.
2. Abre el servicio → **Settings**:
   - **Root Directory**: `backend`
   - El resto lo detecta solo (Nixpacks lee `backend/railway.json`).
3. **Settings** → **Networking** → **Generate Domain**. Anota la URL resultante,
   por ejemplo `https://panaderia-production.up.railway.app`.

### Variables de entorno (pestaña Variables)

| Variable | Valor | Por qué |
|---|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referencia al servicio Postgres del proyecto. Railway la sustituye sola. |
| `DB_TYPE` | `postgresql` | |
| `PG_SSL` | `true` | Railway exige TLS. |
| `NODE_ENV` | `production` | Activa cookies seguras y `trust proxy`. |
| `JWT_SECRET` | (ver abajo) | **Obligatoria.** Mínimo 32 caracteres o el servidor no arranca. |
| `CORS_ORIGIN` | `https://TU-APP.vercel.app` | Sin esto el navegador bloquea todas las peticiones. Admite varios separados por coma. |
| `FRONTEND_URL` | `https://TU-APP.vercel.app` | Adonde vuelve el cliente tras pagar. |
| `BACKEND_URL` | `https://TU-BACKEND.up.railway.app` | Adonde Webpay envía la confirmación del pago. |
| `SESSION_TIMEOUT` | `24h` | |
| `RATE_LIMIT_WINDOW_MS` | `60000` | |
| `RATE_LIMIT_MAX_REQUESTS` | `1000` | |

Genera el `JWT_SECRET` con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

> `CORS_ORIGIN` y `FRONTEND_URL` se conocen recién después del Paso 3. Puedes
> desplegar primero, obtener la URL de Vercel y volver a rellenarlas.

### Opcional pero recomendado: volumen para las imágenes

El disco de un contenedor es **efímero**: sin esto, las fotos de productos que
suba el cliente desaparecen en el siguiente despliegue.

1. Servicio del backend → **Settings** → **Volumes** → **Add Volume**.
2. Mount path: `/data`
3. Añade la variable `UPLOADS_DIR` = `/data/uploads`.

### Opcional: correos (recuperación de contraseña)

Sin esto, el enlace "olvidé mi contraseña" no envía nada y el cliente no tiene
forma de recuperar el acceso por sí mismo.

| Variable | Valor |
|---|---|
| `GMAIL_USER` | la cuenta de Gmail que envía |
| `GMAIL_APP_PASSWORD` | contraseña de aplicación de 16 caracteres (**no** la del correo) |
| `FROM_EMAIL` | el mismo correo |

La contraseña de aplicación se genera en la cuenta de Google con verificación en
dos pasos activada: **Cuenta de Google → Seguridad → Verificación en 2 pasos →
Contraseñas de aplicaciones**.

---

## Paso 3 — Frontend en Vercel

1. Entra en [vercel.com](https://vercel.com) → **Add New** → **Project** → importa
   el mismo repositorio.
2. **Framework Preset**: Other. No toques Build Command ni Output Directory:
   los define `vercel.json` en la raíz del repositorio.
3. **Environment Variables**, antes del primer despliegue:

| Variable | Valor |
|---|---|
| `REACT_APP_API_URL` | `https://TU-BACKEND.up.railway.app` |

> **Esta variable se incrusta en tiempo de compilación.** Si la cambias después,
> hay que volver a desplegar (Deployments → ⋯ → Redeploy); no basta con guardarla.

4. **Deploy**. Copia la URL resultante y vuelve al Paso 2 a rellenar `CORS_ORIGIN`
   y `FRONTEND_URL` con ella.

---

## Paso 4 — Comprobar que quedó bien

En este orden, porque cada paso depende del anterior:

1. `https://TU-BACKEND.up.railway.app/health` → debe devolver `{"status":"ok",...}`
2. `https://TU-BACKEND.up.railway.app/api/productos` → debe devolver una lista vacía,
   no un error.
3. Abre la web en Vercel, entra con el usuario administrador y **recarga la página**.
   Si sigues dentro, la cookie entre dominios funciona. Si te expulsa, revisa
   `CORS_ORIGIN` y que `NODE_ENV` sea `production`.
4. Entra al Dashboard: debe cargar los gráficos sin error.
5. Crea un producto con foto y compruébalo en la tienda pública.

---

## Problemas frecuentes

**Inicio de sesión que expulsa al recargar.** La cookie es de terceros y necesita
`SameSite=None; Secure`, lo que el backend ya hace cuando `NODE_ENV=production`.
Si falla, es casi siempre que `CORS_ORIGIN` no coincide **exactamente** con la URL
de Vercel (sobra una barra final, o es `http` en vez de `https`).

**Todo devuelve error de CORS.** `CORS_ORIGIN` mal escrita. Las previews de Vercel
tienen URL propia; añádelas separadas por coma si las usas.

**El frontend llama a `localhost:5000`.** Faltó `REACT_APP_API_URL` en Vercel, o se
añadió después de compilar y no se volvió a desplegar.

**El backend no arranca.** Mira los logs en Railway → Deployments. Las dos causas
habituales son `JWT_SECRET` ausente o de menos de 32 caracteres, y `DATABASE_URL`
sin definir (el arranque se aborta a propósito antes que servir mal configurado).

**Las fotos de productos desaparecieron.** Falta el volumen persistente del Paso 2.

---

## Pagos con Webpay

Por defecto se usa el ambiente de **Integración** de Transbank: las compras
funcionan de principio a fin pero **no se cobra dinero real**. Para cobrar de
verdad hay que tener el convenio con Transbank y añadir `WEBPAY_COMMERCE_CODE`,
`WEBPAY_API_KEY` y `WEBPAY_ENVIRONMENT=production`.
