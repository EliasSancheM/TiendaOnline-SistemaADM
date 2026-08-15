# 🚂 Despliegue en Railway

Guía concreta para poner ADM Panadería en producción. Sustituye a
[GUIA_HOSTING_SERVIDOR.md](GUIA_HOSTING_SERVIDOR.md), que es un listado genérico
con precios ya desfasados.

## Por qué Railway y no Vercel

El proyecto es un **monolito**: el backend sirve el build de React
(`server.js`, bloque `NODE_ENV === 'production' && !VERCEL`). Tres cosas del
código exigen un proceso único, de larga vida y con disco escribible:

| Necesidad | Dónde | Qué pasa en serverless |
|---|---|---|
| Subida de imágenes a disco | `routes/productosRoutes.js` (multer) | El filesystem es de solo lectura: falla la subida |
| Blacklist de tokens en memoria | `utils/tokenBlacklist.js` | Cada instancia tiene su propio `Map`: el logout no invalida nada |
| Rate limiting en memoria | `server.js` | El contador se reinicia con cada instancia |

Render también sirve, pero su plan gratuito **duerme el servicio** tras ~15 min
de inactividad, y el callback de pago de Webpay es el peor sitio posible para un
arranque en frío: Transbank redirige ahí al cliente justo después de pagar.

---

## 1. Subir el código a GitHub

Railway despliega desde un repositorio. Asegúrate de que la rama que quieres
desplegar está en GitHub.

```bash
git push -u origin <tu-rama>
```

> `backend/.env` está en `.gitignore` y **no debe subirse**. Las credenciales se
> configuran como variables de entorno en Railway (paso 4).

## 2. Crear el proyecto y la base de datos

1. Entra en [railway.app](https://railway.app) → **New Project** → **Deploy from
   GitHub repo** → elige el repositorio.
2. En el proyecto: **+ New** → **Database** → **Add PostgreSQL**.

El servicio de la app y el de la base de datos conviven en el mismo proyecto,
así que la app puede referenciar las variables de Postgres.

## 3. Build y arranque

Railway detecta el `package.json` de la raíz. Ya trae los scripts necesarios:

```json
"build": "cd frontend && npm ci && npm run build && cd ../backend && npm ci --omit=dev",
"start": "node backend/server.js"
```

`--omit=dev` en el backend es intencional: las devDependencies incluyen
`sqlite3`, un módulo nativo que en producción no se usa (va PostgreSQL) y cuya
compilación puede tumbar el build.

Si Railway no los toma automáticamente, defínelos en **Settings → Build /
Deploy** con esos mismos valores.

## 4. Variables de entorno

En el servicio de la app → **Variables**:

| Variable | Valor | Notas |
|---|---|---|
| `NODE_ENV` | `production` | |
| `JWT_SECRET` | *(generado)* | **Mínimo 32 caracteres o el servidor no arranca** |
| `DB_TYPE` | `postgresql` | |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` | Referencia al servicio de Postgres |
| `PG_SSL` | `true` | |
| `FRONTEND_URL` | `https://<tu-dominio>` | Adonde vuelve el cliente tras pagar |
| `CORS_ORIGIN` | `https://<tu-dominio>` | |
| `BACKEND_URL` | `https://<tu-dominio>` | URL de retorno de Webpay (ver aviso abajo) |
| `TRUST_PROXY` | `1` | Para que el rate limiting use la IP real |

Genera el secreto con:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64'))"
```

Opcionales:

- Correo: `GMAIL_USER`, `GMAIL_APP_PASSWORD`, `FROM_EMAIL`
- Webpay **real**: `WEBPAY_COMMERCE_CODE`, `WEBPAY_API_KEY`,
  `WEBPAY_ENVIRONMENT=production`. Sin ellas se usa el ambiente de
  Integración de Transbank y **los pagos no son reales**.
- Facturación SII: `BILLING_API_KEY`, `BILLING_EMISOR_RUT`,
  `BILLING_ENVIRONMENT`. Sin API key, `billingService` responde en modo
  simulación.

> ⚠️ **`BACKEND_URL` no es opcional en la práctica.** Si falta, la URL de retorno
> de Webpay se deduce de las cabeceras de la petición y detrás del proxy puede
> salir con `http://`, con lo que el retorno del pago falla.

Como el dominio se conoce después del primer deploy, el orden natural es:
desplegar → generar dominio (paso 5) → rellenar las tres URLs → redeploy.

## 5. Dominio

**Settings → Networking → Generate Domain**. Da un `*.up.railway.app` con HTTPS.
Con eso ya puedes rellenar `FRONTEND_URL`, `CORS_ORIGIN` y `BACKEND_URL`.

## 6. Volumen para las imágenes de productos

Sin volumen, cada redeploy borra las imágenes subidas: el filesystem del
contenedor es efímero.

**Settings → Volumes → New Volume**, con punto de montaje:

```
/app/backend/uploads
```

> ⚠️ El volumen **tapa** el contenido que venía en el repositorio. Las imágenes
> de ejemplo versionadas en `backend/uploads/productos/` dejarán de verse y hay
> que volver a subirlas desde el panel de productos.

## 7. Primer arranque

Revisa los logs del deploy. Al crear las tablas por primera vez se imprime el
usuario administrador con una **contraseña aleatoria que solo se muestra una
vez**:

```
════════════════════════════════════════════════
  USUARIO ADMINISTRADOR CREADO (PostgreSQL)
  Usuario:    administrador
  Contraseña: <aleatoria>
════════════════════════════════════════════════
```

**Cópiala antes de cerrar los logs.** Si la pierdes, se recupera con
"olvidé mi contraseña" (requiere tener el correo configurado) o cambiando el
hash directamente en la base de datos.

## 8. Comprobaciones

1. `https://<dominio>/` → la tienda pública carga.
2. `https://<dominio>/api/productos` → responde JSON.
3. `https://<dominio>/admin` → login; entra con el usuario administrador.
4. Sube una imagen a un producto y **haz un redeploy**: si sigue ahí, el volumen
   está bien montado.
5. Haz una compra de prueba en la tienda y verifica que el pedido queda como
   `pendiente` y no como `pendiente_pago`.

---

## Migrar los datos que ya tienes en SQLite

```bash
cd backend
npm run migrate:pg -- "<DATABASE_URL de Railway>"
```

La cadena de conexión pública está en el servicio de Postgres → **Connect**.

## Notas

- `vercel.json` y `api/index.js` quedan sin uso en este despliegue. No estorban,
  pero conviven dos configuraciones distintas en el repositorio.
- El backend **se niega a arrancar con SQLite** en la nube: si ves ese error,
  falta `DATABASE_URL` o `DB_TYPE=postgresql`.
- Railway retiró su plan gratuito; verifica el coste actual antes de decidir.
