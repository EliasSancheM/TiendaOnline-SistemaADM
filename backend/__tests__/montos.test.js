/**
 * Tests de integridad de importes en el panel de administración.
 *
 * El checkout público ya recalculaba todo en el servidor, pero las rutas del
 * admin aceptaban total, precio_unitario y subtotal tal como llegaban en el
 * body: un empleado podía reescribir el total de un pedido ya pagado y un
 * contador emitir una factura por $0 sobre pedidos de cualquier monto.
 *
 * Estas pruebas fijan la garantía equivalente:
 *   - pedidos  → importes derivados del precio real del catálogo.
 *   - facturas → importes derivados de los pedidos que agrupan (+19% IVA).
 */
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DB_TYPE = 'sqlite';
process.env.NODE_ENV = 'test';

let app;
let mockDb;

const PAN = { id: 1, precio: 1500 };
const TORTA = { id: 2, precio: 20000 };

const TOKEN = jwt.sign(
  { id: 1, username: 'empleado_test', role: 'admin', nombre_completo: 'Test' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const api = (metodo, url) =>
  request(app)[metodo](url).set('Authorization', `Bearer ${TOKEN}`);

beforeAll(async () => {
  mockDb = new sqlite3.Database(':memory:');

  mockDb.allAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)));
    });
  };
  mockDb.getAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)));
    });
  };
  mockDb.runAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };
  mockDb.transaction = async function (callback) {
    try {
      await this.runAsync('BEGIN TRANSACTION');
      const result = await callback(this);
      await this.runAsync('COMMIT');
      return result;
    } catch (e) {
      await this.runAsync('ROLLBACK');
      throw e;
    }
  };
  mockDb.helpers = {
    now: () => 'CURRENT_TIMESTAMP',
    date: (col) => `DATE(${col})`,
    groupConcat: (col) => `GROUP_CONCAT(${col})`,
    like: () => 'LIKE'
  };

  await mockDb.runAsync(`CREATE TABLE productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL, precio REAL NOT NULL, descripcion TEXT, imagen_url TEXT
  )`);
  await mockDb.runAsync(`CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL, telefono TEXT, direccion TEXT, email TEXT, rut TEXT, giro TEXT
  )`);
  await mockDb.runAsync(`CREATE TABLE pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER, fecha DATE NOT NULL, periodo TEXT NOT NULL,
    estado TEXT DEFAULT 'pendiente', total REAL, notas TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await mockDb.runAsync(`CREATE TABLE detalles_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER, producto_id INTEGER, cantidad INTEGER NOT NULL,
    precio_unitario REAL NOT NULL, subtotal REAL NOT NULL
  )`);
  await mockDb.runAsync(`CREATE TABLE facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL, numero_factura TEXT UNIQUE NOT NULL, fecha DATE NOT NULL,
    subtotal REAL NOT NULL DEFAULT 0, impuestos REAL NOT NULL DEFAULT 0,
    total REAL NOT NULL DEFAULT 0, estado TEXT NOT NULL DEFAULT 'pendiente', notas TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await mockDb.runAsync(`CREATE TABLE factura_pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    factura_id INTEGER NOT NULL, pedido_id INTEGER NOT NULL
  )`);


  await mockDb.runAsync(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT 'x', role TEXT NOT NULL,
    nombre_completo TEXT, email TEXT, activo BOOLEAN DEFAULT 1, sesiones_validas_desde INTEGER DEFAULT 0,
    ultimo_login DATETIME, created_at DATETIME, updated_at DATETIME
  )`);
  await mockDb.runAsync(`CREATE TABLE tokens_revocados (
    token_hash TEXT PRIMARY KEY, expira_en INTEGER NOT NULL
  )`);
  await mockDb.runAsync('INSERT INTO usuarios (id, username, role) VALUES (?, ?, ?)', [1, 'empleado_test', 'admin']);

  await mockDb.runAsync('INSERT INTO productos (id, nombre, precio) VALUES (?, ?, ?)', [PAN.id, 'Pan', PAN.precio]);
  await mockDb.runAsync('INSERT INTO productos (id, nombre, precio) VALUES (?, ?, ?)', [TORTA.id, 'Torta', TORTA.precio]);
  await mockDb.runAsync('INSERT INTO clientes (id, nombre) VALUES (1, ?)', ['Cliente Uno']);
  await mockDb.runAsync('INSERT INTO clientes (id, nombre) VALUES (2, ?)', ['Cliente Dos']);

  jest.mock('../config/database', () => mockDb);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/pedidos', require('../routes/pedidosRoutes'));
  app.use('/api/facturas', require('../routes/facturasRoutes'));
});

afterAll((done) => {
  mockDb ? mockDb.close(() => done()) : done();
});

const pedidoBase = {
  cliente_id: 1,
  fecha: '2026-08-10',
  periodo: 'mañana',
  estado: 'pendiente'
};

describe('POST /api/pedidos', () => {
  it('ignora el total y los precios enviados y usa el catálogo', async () => {
    const res = await api('post', '/api/pedidos').send({
      ...pedidoBase,
      total: 1, // total falso
      detalles: [
        { producto_id: PAN.id, cantidad: 2, precio_unitario: 1, subtotal: 2 },   // precio falso
        { producto_id: TORTA.id, cantidad: 1, precio_unitario: 0, subtotal: 0 }
      ]
    });

    expect(res.statusCode).toBe(201);
    // 2 × 1500 + 1 × 20000 = 23000, no el "1" que venía en el body
    expect(res.body.total).toBe(23000);

    const guardado = await mockDb.getAsync('SELECT total FROM pedidos WHERE id = ?', [res.body.id]);
    expect(guardado.total).toBe(23000);

    const lineas = await mockDb.allAsync(
      'SELECT producto_id, precio_unitario, subtotal FROM detalles_pedido WHERE pedido_id = ? ORDER BY producto_id',
      [res.body.id]
    );
    expect(lineas).toEqual([
      { producto_id: PAN.id, precio_unitario: 1500, subtotal: 3000 },
      { producto_id: TORTA.id, precio_unitario: 20000, subtotal: 20000 }
    ]);
  });

  it('acepta detalles sin precio_unitario (ahora es derivado)', async () => {
    const res = await api('post', '/api/pedidos').send({
      ...pedidoBase,
      detalles: [{ producto_id: PAN.id, cantidad: 3 }]
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.total).toBe(4500);
  });

  it('rechaza un producto que no existe en el catálogo', async () => {
    const res = await api('post', '/api/pedidos').send({
      ...pedidoBase,
      detalles: [{ producto_id: 9999, cantidad: 1 }]
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/9999/);
  });

  it('no deja el pedido a medias si un producto es inválido', async () => {
    const antes = await mockDb.getAsync('SELECT COUNT(*) as n FROM pedidos');
    await api('post', '/api/pedidos').send({
      ...pedidoBase,
      detalles: [{ producto_id: PAN.id, cantidad: 1 }, { producto_id: 9999, cantidad: 1 }]
    });
    const despues = await mockDb.getAsync('SELECT COUNT(*) as n FROM pedidos');

    expect(despues.n).toBe(antes.n);
  });
});

describe('PUT /api/pedidos/:id', () => {
  it('no permite reescribir el total de un pedido ya pagado', async () => {
    const creado = await api('post', '/api/pedidos').send({
      ...pedidoBase,
      detalles: [{ producto_id: TORTA.id, cantidad: 1 }]
    });
    expect(creado.body.total).toBe(20000);

    const res = await api('put', `/api/pedidos/${creado.body.id}`).send({
      ...pedidoBase,
      total: 1, // intento de rebaja
      detalles: [{ producto_id: TORTA.id, cantidad: 1, precio_unitario: 1, subtotal: 1 }]
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(20000);

    const guardado = await mockDb.getAsync('SELECT total FROM pedidos WHERE id = ?', [creado.body.id]);
    expect(guardado.total).toBe(20000);
  });

  it('sin detalles, conserva los importes históricos e ignora el total del body', async () => {
    const creado = await api('post', '/api/pedidos').send({
      ...pedidoBase,
      detalles: [{ producto_id: PAN.id, cantidad: 2 }]
    });
    expect(creado.body.total).toBe(3000);

    // Sube el precio del catálogo después de crear el pedido
    await mockDb.runAsync('UPDATE productos SET precio = ? WHERE id = ?', [9999, PAN.id]);

    // Edición que no toca las líneas (solo las notas)
    const res = await api('put', `/api/pedidos/${creado.body.id}`).send({
      ...pedidoBase,
      total: 999999,
      notas: 'Solo cambio la nota'
    });

    expect(res.statusCode).toBe(200);
    // Ni el total del body ni el precio nuevo: se respeta lo ya facturado
    expect(res.body.total).toBe(3000);

    await mockDb.runAsync('UPDATE productos SET precio = ? WHERE id = ?', [PAN.precio, PAN.id]);
  });

  it('devuelve 404 si el pedido no existe', async () => {
    const res = await api('put', '/api/pedidos/9999').send({
      ...pedidoBase,
      detalles: [{ producto_id: PAN.id, cantidad: 1 }]
    });
    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/facturas', () => {
  let pedidoA;
  let pedidoB;

  beforeAll(async () => {
    const a = await api('post', '/api/pedidos').send({
      ...pedidoBase, detalles: [{ producto_id: TORTA.id, cantidad: 5 }]  // 100000
    });
    const b = await api('post', '/api/pedidos').send({
      ...pedidoBase, detalles: [{ producto_id: PAN.id, cantidad: 10 }]   // 15000
    });
    pedidoA = a.body.id;
    pedidoB = b.body.id;
  });

  it('calcula los importes desde los pedidos e ignora los del body', async () => {
    const res = await api('post', '/api/facturas').send({
      cliente_id: 1,
      pedidos_ids: [pedidoA, pedidoB],
      numero_factura: 'F-100',
      fecha: '2026-08-10',
      subtotal: 0,   // intento de factura por cero
      impuestos: 0,
      total: 0
    });

    expect(res.statusCode).toBe(201);
    // Los precios del catalogo son con IVA incluido, asi que 115000 es el total
    // de la factura y el impuesto se desglosa hacia atras (115000 / 1.19).
    expect(res.body.total).toBe(115000);
    expect(res.body.subtotal).toBe(96638.66);
    expect(res.body.impuestos).toBe(18361.34);
    // Invariante: el desglose tiene que cuadrar con el total
    expect(res.body.subtotal + res.body.impuestos).toBeCloseTo(res.body.total, 2);

    const guardada = await mockDb.getAsync('SELECT subtotal, impuestos, total FROM facturas WHERE id = ?', [res.body.id]);
    expect(guardada).toEqual({ subtotal: 96638.66, impuestos: 18361.34, total: 115000 });
  });

  it('rechaza pedidos de otro cliente', async () => {
    const ajeno = await api('post', '/api/pedidos').send({
      ...pedidoBase, cliente_id: 2, detalles: [{ producto_id: PAN.id, cantidad: 1 }]
    });

    const res = await api('post', '/api/facturas').send({
      cliente_id: 1,
      pedidos_ids: [ajeno.body.id],
      numero_factura: 'F-101',
      fecha: '2026-08-10'
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/otro cliente/i);
  });

  it('rechaza un pedido ya incluido en otra factura', async () => {
    const res = await api('post', '/api/facturas').send({
      cliente_id: 1,
      pedidos_ids: [pedidoA], // ya facturado en F-100
      numero_factura: 'F-102',
      fecha: '2026-08-10'
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/ya está incluido en otra factura/i);
  });

  it('rechaza un pedido inexistente', async () => {
    const res = await api('post', '/api/facturas').send({
      cliente_id: 1,
      pedidos_ids: [9999],
      numero_factura: 'F-103',
      fecha: '2026-08-10'
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.error).toMatch(/no existe/i);
  });
});

describe('PUT /api/facturas/:id', () => {
  it('recalcula al editar y no confunde sus propios pedidos con duplicados', async () => {
    const pedido = await api('post', '/api/pedidos').send({
      ...pedidoBase, detalles: [{ producto_id: PAN.id, cantidad: 4 }] // 6000
    });

    const creada = await api('post', '/api/facturas').send({
      cliente_id: 1,
      pedidos_ids: [pedido.body.id],
      numero_factura: 'F-200',
      fecha: '2026-08-10'
    });
    expect(creada.statusCode).toBe(201);

    // Reeditar la misma factura con los mismos pedidos debe funcionar
    const res = await api('put', `/api/facturas/${creada.body.id}`).send({
      cliente_id: 1,
      pedidos_ids: [pedido.body.id],
      numero_factura: 'F-200',
      fecha: '2026-08-10',
      subtotal: 1, // intento de rebaja
      impuestos: 1,
      total: 1
    });

    expect(res.statusCode).toBe(200);

    const guardada = await mockDb.getAsync(
      'SELECT subtotal, impuestos, total FROM facturas WHERE id = ?', [creada.body.id]
    );
    expect(guardada).toEqual({ subtotal: 5042.02, impuestos: 957.98, total: 6000 });
  });
});
