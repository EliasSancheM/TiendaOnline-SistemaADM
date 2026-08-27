/**
 * Tests de las cifras del panel de inicio y del cierre de pedidos sin pagar.
 *
 * Los fallos que cierran:
 *
 *   1. El dashboard sumaba TODOS los pedidos sin mirar el estado. Un pedido
 *      anulado, y sobre todo cada carrito abandonado en Webpay (que queda en
 *      'pendiente_pago'), contaba como venta del día y del mes.
 *   2. Los contadores de "pendientes" y "completados" los calculaba el
 *      navegador sobre /api/pedidos?limit=200, así que a partir del pedido 201
 *      se quedaban congelados.
 *   3. Un pedido abandonado en la pasarela se quedaba en 'pendiente_pago' para
 *      siempre: el retorno de Transbank nunca llegaba y ese estado no admite
 *      ninguna transición desde el panel.
 */
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DB_TYPE = 'sqlite';
process.env.NODE_ENV = 'test';

let app;
let mockDb;
let caducarPendientesDePago;
let hoyStr;

const tokenDe = (role, id) => jwt.sign(
  { id, username: `${role}_test`, role, nombre_completo: 'Test', jti: crypto.randomUUID() },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

let TOKEN_ADMIN;
let TOKEN_CONTADOR;

const stats = (token) =>
  request(app).get('/api/pedidos/dashboard-stats').set('Authorization', `Bearer ${token}`);

/**
 * Inserta un pedido de hoy.
 *
 * `creado` es una expresión SQL, no un parámetro: para envejecer un pedido hay
 * que dejar que SQLite evalúe datetime('now', ...). Pasarla como parámetro
 * guardaría el texto literal en la columna.
 */
const nuevoPedido = (id, estado, total, creado = 'CURRENT_TIMESTAMP') =>
  mockDb.runAsync(
    `INSERT INTO pedidos (id, cliente_id, fecha, periodo, estado, total, fecha_creacion)
     VALUES (?, 1, ?, 'mañana', ?, ?, ${creado})`,
    [id, hoyStr, estado, total]
  );

beforeAll(async () => {
  mockDb = new sqlite3.Database(':memory:');
  mockDb.allAsync = function (sql, p = []) {
    return new Promise((r, j) => this.all(sql, p, (e, x) => (e ? j(e) : r(x))));
  };
  mockDb.getAsync = function (sql, p = []) {
    return new Promise((r, j) => this.get(sql, p, (e, x) => (e ? j(e) : r(x))));
  };
  mockDb.runAsync = function (sql, p = []) {
    return new Promise((r, j) => this.run(sql, p, function (e) {
      if (e) j(e); else r({ lastID: this.lastID, changes: this.changes });
    }));
  };
  mockDb.helpers = {
    now: () => 'CURRENT_TIMESTAMP',
    date: (col) => `DATE(${col})`,
    groupConcat: (col) => `GROUP_CONCAT(${col})`,
    like: () => 'LIKE',
    haceMinutos: (min) => `datetime('now', '-${Number(min)} minutes')`
  };

  await mockDb.runAsync(`CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, telefono TEXT,
    direccion TEXT, email TEXT, rut TEXT, giro TEXT
  )`);
  await mockDb.runAsync(`CREATE TABLE productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, precio REAL NOT NULL,
    descripcion TEXT, imagen_url TEXT
  )`);
  await mockDb.runAsync(`CREATE TABLE pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, fecha DATE NOT NULL,
    periodo TEXT NOT NULL, estado TEXT, total REAL, notas TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await mockDb.runAsync(`CREATE TABLE detalles_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER, producto_id INTEGER,
    cantidad INTEGER NOT NULL, precio_unitario REAL NOT NULL, subtotal REAL NOT NULL
  )`);
  await mockDb.runAsync(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT 'x', role TEXT NOT NULL,
    nombre_completo TEXT, email TEXT, activo BOOLEAN DEFAULT 1,
    sesiones_validas_desde INTEGER DEFAULT 0
  )`);
  await mockDb.runAsync(`CREATE TABLE tokens_revocados (
    token_hash TEXT PRIMARY KEY, expira_en INTEGER NOT NULL
  )`);

  await mockDb.runAsync('INSERT INTO usuarios (id, username, role) VALUES (1, ?, ?)', ['admin_test', 'admin']);
  await mockDb.runAsync('INSERT INTO usuarios (id, username, role) VALUES (2, ?, ?)', ['contador_test', 'contador']);
  await mockDb.runAsync('INSERT INTO clientes (id, nombre) VALUES (1, ?)', ['Panadería Test']);
  await mockDb.runAsync('INSERT INTO productos (id, nombre, precio) VALUES (1, ?, ?)', ['Pan', 1000]);

  TOKEN_ADMIN = tokenDe('admin', 1);
  TOKEN_CONTADOR = tokenDe('contador', 2);

  const hoy = new Date();
  hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;

  jest.mock('../config/database', () => mockDb);
  ({ caducarPendientesDePago } = require('../utils/pedidosCaducados'));

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/pedidos', require('../routes/pedidosRoutes'));
});

afterAll((done) => {
  mockDb ? mockDb.close(() => done()) : done();
});

beforeEach(async () => {
  await mockDb.runAsync('DELETE FROM pedidos');
  await mockDb.runAsync('DELETE FROM detalles_pedido');
});

describe('Qué cuenta como venta', () => {
  it('no suma los pedidos anulados ni los que nadie llegó a pagar', async () => {
    await nuevoPedido(1, 'completado', 5000);
    await nuevoPedido(2, 'cancelado', 999999);       // anulado: no es ingreso
    await nuevoPedido(3, 'pendiente_pago', 888888);  // carrito abandonado en Webpay

    const res = await stats(TOKEN_ADMIN);

    expect(res.statusCode).toBe(200);
    expect(res.body.resumen.ventasHoy).toBe(5000);
    expect(res.body.resumen.pedidosHoy).toBe(1);

    const hoy = res.body.ventasSemanales.find(d => d.date === hoyStr);
    expect(hoy.total).toBe(5000);
  });

  it('sí cuenta los tres estados que son trabajo real', async () => {
    await nuevoPedido(1, 'pendiente', 1000);
    await nuevoPedido(2, 'en_proceso', 2000);
    await nuevoPedido(3, 'completado', 3000);

    const res = await stats(TOKEN_ADMIN);

    expect(res.body.resumen.ventasHoy).toBe(6000);
    expect(res.body.resumen.pedidosHoy).toBe(3);
  });

  it('el ranking de productos ignora las líneas de un pedido anulado', async () => {
    await nuevoPedido(1, 'completado', 1000);
    await nuevoPedido(2, 'cancelado', 50000);
    await mockDb.runAsync(
      'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (1, 1, 1, 1000, 1000)'
    );
    await mockDb.runAsync(
      'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (2, 1, 50, 1000, 50000)'
    );

    const res = await stats(TOKEN_ADMIN);
    const pan = res.body.productosPopulares.find(p => p.id === 1);

    expect(pan.cantidadVendida).toBe(1); // y no 51
    expect(pan.ingresosTotales).toBe(1000);
  });
});

describe('Contadores del panel', () => {
  it('cuenta sobre la tabla entera, no sobre la primera página', async () => {
    // Más de 200 pedidos: el navegador solo veía los primeros 200 y el contador
    // se quedaba clavado en ese número.
    for (let i = 1; i <= 205; i++) {
      await nuevoPedido(i, 'pendiente', 100);
    }

    const res = await stats(TOKEN_ADMIN);

    expect(res.body.resumen.pedidosPendientes).toBe(205);
  });

  it('el total de productos es el del catálogo', async () => {
    const res = await stats(TOKEN_ADMIN);
    expect(res.body.resumen.productos).toBe(1);
  });

  it('separa los pedidos de mañana y de tarde del día', async () => {
    await nuevoPedido(1, 'pendiente', 100);
    await mockDb.runAsync(
      `INSERT INTO pedidos (id, cliente_id, fecha, periodo, estado, total)
       VALUES (2, 1, ?, 'tarde', 'pendiente', 200)`, [hoyStr]
    );

    const res = await stats(TOKEN_ADMIN);

    expect(res.body.resumen.pedidosManana).toBe(1);
    expect(res.body.resumen.pedidosTarde).toBe(1);
  });
});

describe('El contador no recibe la operación diaria', () => {
  it('obtiene las gráficas pero no el resumen ni los nombres de clientes', async () => {
    await nuevoPedido(1, 'completado', 5000);

    const res = await stats(TOKEN_CONTADOR);

    expect(res.statusCode).toBe(200);
    expect(res.body.ventasMensuales).toHaveLength(12);
    expect(res.body.resumen).toBeUndefined();
    expect(res.body.pedidosRecientes).toBeUndefined();
  });
});

describe('Pedidos que se quedaron esperando el pago', () => {
  it('cancela los que llevan demasiado tiempo sin confirmarse', async () => {
    await nuevoPedido(1, 'pendiente_pago', 5000, "datetime('now', '-5 hours')");

    const cancelados = await caducarPendientesDePago(120);

    expect(cancelados).toBe(1);
    const p = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = 1');
    expect(p.estado).toBe('cancelado');
  });

  it('no toca un pago que todavía puede estar en curso', async () => {
    await nuevoPedido(1, 'pendiente_pago', 5000); // recién creado

    const cancelados = await caducarPendientesDePago(120);

    expect(cancelados).toBe(0);
    const p = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = 1');
    expect(p.estado).toBe('pendiente_pago');
  });

  it('no toca un pedido ya pagado por muy antiguo que sea', async () => {
    await nuevoPedido(1, 'pendiente', 5000, "datetime('now', '-30 days')");

    await caducarPendientesDePago(120);

    const p = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = 1');
    expect(p.estado).toBe('pendiente');
  });
});

describe('Identificadores que no son números', () => {
  it('responde 404 y no un error de servidor', async () => {
    // En PostgreSQL `WHERE id = 'undefined'` aborta la consulta y el catch lo
    // convertía en 500. El frontend produce esa URL cuando un id llega vacío.
    const res = await request(app)
      .get('/api/pedidos/undefined')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);

    expect(res.statusCode).toBe(404);
  });

  it('sigue aceptando un id normal', async () => {
    await nuevoPedido(7, 'pendiente', 100);

    const res = await request(app)
      .get('/api/pedidos/7')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.id).toBe(7);
  });
});

describe('Filtrar pedidos por fecha', () => {
  it('encuentra los pedidos del día que se pide', async () => {
    // El helper de SQLite usaba DATE(fecha, 'localtime'), que interpreta la
    // fecha guardada como si fuera UTC: '2026-08-27' se convertía en
    // '2026-08-26' en Chile, así que el filtro NO devolvía ningún pedido.
    // En producción no se veía porque PostgreSQL usa ::date, que es correcto,
    // y los dos motores daban resultados distintos con los mismos datos.
    await nuevoPedido(1, 'pendiente', 1000);

    const res = await request(app)
      .get(`/api/pedidos?fecha=${hoyStr}`)
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
    expect(res.body.pagination.total).toBe(1);
  });

  it('no devuelve los de otro día', async () => {
    await nuevoPedido(1, 'pendiente', 1000);

    const res = await request(app)
      .get('/api/pedidos?fecha=2001-01-01')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);

    expect(res.body.data).toHaveLength(0);
  });

  it('un limit sin sentido no tumba el listado', async () => {
    // ?limit=abc producía NaN y llegaba así a la consulta: 500 (SQLITE_MISMATCH).
    await nuevoPedido(1, 'pendiente', 1000);

    const res = await request(app)
      .get('/api/pedidos?limit=abc&page=xyz')
      .set('Authorization', `Bearer ${TOKEN_ADMIN}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.data).toHaveLength(1);
  });
});
