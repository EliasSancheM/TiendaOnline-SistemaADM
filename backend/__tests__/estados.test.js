/**
 * Tests de la máquina de estados de pedidos.
 *
 * El hueco que cierran: el estado se validaba contra una lista de valores
 * permitidos sin mirar el estado actual, así que un pedido en 'pendiente_pago'
 * —creado por la tienda y nunca pagado— podía marcarse como 'completado' desde
 * el panel, y un pedido anulado podía revivirse.
 */
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DB_TYPE = 'sqlite';
process.env.NODE_ENV = 'test';

const { validarTransicion } = require('../utils/estadosPedido');

let app;
let mockDb;

const PAN = { id: 1, precio: 1000 };

const TOKEN = jwt.sign(
  { id: 1, username: 'empleado_test', role: 'empleado', nombre_completo: 'Test' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const api = (metodo, url) =>
  request(app)[metodo](url).set('Authorization', `Bearer ${TOKEN}`);

/** Crea un pedido directamente en la BD con el estado que haga falta. */
async function sembrarPedido(estado) {
  const res = await mockDb.runAsync(
    `INSERT INTO pedidos (cliente_id, fecha, periodo, estado, total) VALUES (1, '2026-08-10', 'mañana', ?, 1000)`,
    [estado]
  );
  await mockDb.runAsync(
    'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (?, ?, 1, ?, ?)',
    [res.lastID, PAN.id, PAN.precio, PAN.precio]
  );
  return res.lastID;
}

const estadoDe = async (id) =>
  (await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = ?', [id])).estado;

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
    date: (col) => `DATE(${col}, 'localtime')`,
    groupConcat: (col) => `GROUP_CONCAT(${col})`,
    like: () => 'LIKE'
  };

  await mockDb.runAsync(`CREATE TABLE productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, precio REAL NOT NULL,
    descripcion TEXT, imagen_url TEXT
  )`);
  await mockDb.runAsync(`CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, telefono TEXT,
    direccion TEXT, email TEXT, rut TEXT, giro TEXT
  )`);
  await mockDb.runAsync(`CREATE TABLE pedidos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, fecha DATE NOT NULL,
    periodo TEXT NOT NULL, estado TEXT DEFAULT 'pendiente', total REAL, notas TEXT,
    fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await mockDb.runAsync(`CREATE TABLE detalles_pedido (
    id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER, producto_id INTEGER,
    cantidad INTEGER NOT NULL, precio_unitario REAL NOT NULL, subtotal REAL NOT NULL
  )`);

  await mockDb.runAsync('INSERT INTO productos (id, nombre, precio) VALUES (?, ?, ?)', [PAN.id, 'Pan', PAN.precio]);
  await mockDb.runAsync('INSERT INTO clientes (id, nombre) VALUES (1, ?)', ['Cliente Uno']);

  jest.mock('../config/database', () => mockDb);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/pedidos', require('../routes/pedidosRoutes'));
});

afterAll((done) => {
  mockDb ? mockDb.close(() => done()) : done();
});

describe('validarTransicion()', () => {
  it('deja pasar las transiciones del flujo normal', () => {
    expect(validarTransicion('pendiente', 'en_proceso')).toBeNull();
    expect(validarTransicion('en_proceso', 'completado')).toBeNull();
    expect(validarTransicion('pendiente', 'cancelado')).toBeNull();
    expect(validarTransicion('completado', 'en_proceso')).toBeNull(); // corregir un clic
  });

  it('es idempotente cuando no hay cambio', () => {
    expect(validarTransicion('completado', 'completado')).toBeNull();
    expect(validarTransicion('pendiente_pago', 'pendiente_pago')).toBeNull();
  });

  it('bloquea cualquier salida de pendiente_pago', () => {
    for (const destino of ['pendiente', 'en_proceso', 'completado', 'cancelado']) {
      expect(validarTransicion('pendiente_pago', destino)).toMatch(/pago en curso/i);
    }
  });

  it('no revive un pedido cancelado', () => {
    expect(validarTransicion('cancelado', 'pendiente')).toMatch(/final/i);
  });

  it('nunca permite entrar en pendiente_pago desde el panel', () => {
    for (const origen of ['pendiente', 'en_proceso', 'completado', 'cancelado']) {
      expect(validarTransicion(origen, 'pendiente_pago')).not.toBeNull();
    }
  });
});

describe('PATCH /api/pedidos/:id/estado', () => {
  it('no da por completado un pedido que nadie pagó', async () => {
    const id = await sembrarPedido('pendiente_pago');

    const res = await api('patch', `/api/pedidos/${id}/estado`).send({ estado: 'completado' });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/pago en curso/i);
    expect(await estadoDe(id)).toBe('pendiente_pago');
  });

  it('no revive un pedido cancelado', async () => {
    const id = await sembrarPedido('cancelado');

    const res = await api('patch', `/api/pedidos/${id}/estado`).send({ estado: 'pendiente' });

    expect(res.statusCode).toBe(409);
    expect(await estadoDe(id)).toBe('cancelado');
  });

  it('permite el flujo normal de trabajo', async () => {
    const id = await sembrarPedido('pendiente');

    expect((await api('patch', `/api/pedidos/${id}/estado`).send({ estado: 'en_proceso' })).statusCode).toBe(200);
    expect(await estadoDe(id)).toBe('en_proceso');

    expect((await api('patch', `/api/pedidos/${id}/estado`).send({ estado: 'completado' })).statusCode).toBe(200);
    expect(await estadoDe(id)).toBe('completado');
  });

  it('rechaza un estado inexistente con 400', async () => {
    const id = await sembrarPedido('pendiente');
    const res = await api('patch', `/api/pedidos/${id}/estado`).send({ estado: 'inventado' });
    expect(res.statusCode).toBe(400);
  });

  it('devuelve 404 si el pedido no existe', async () => {
    const res = await api('patch', '/api/pedidos/99999/estado').send({ estado: 'completado' });
    expect(res.statusCode).toBe(404);
  });
});

describe('PUT /api/pedidos/:id', () => {
  const cuerpoBase = {
    cliente_id: 1,
    fecha: '2026-08-10',
    periodo: 'mañana'
  };

  it('no deja editar un pedido con el pago en curso', async () => {
    const id = await sembrarPedido('pendiente_pago');

    const res = await api('put', `/api/pedidos/${id}`).send({
      ...cuerpoBase,
      estado: 'pendiente_pago',
      detalles: [{ producto_id: PAN.id, cantidad: 50 }]
    });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/pago en curso/i);

    // El total tampoco se tocó: si cambiara, el callback de Webpay rechazaría
    // el pago por descuadre de monto.
    const pedido = await mockDb.getAsync('SELECT total, estado FROM pedidos WHERE id = ?', [id]);
    expect(pedido).toEqual({ total: 1000, estado: 'pendiente_pago' });
  });

  it('no permite cancelar por la puerta de atrás un pedido cancelado', async () => {
    const id = await sembrarPedido('cancelado');

    const res = await api('put', `/api/pedidos/${id}`).send({
      ...cuerpoBase,
      estado: 'completado',
      detalles: [{ producto_id: PAN.id, cantidad: 1 }]
    });

    expect(res.statusCode).toBe(409);
    expect(await estadoDe(id)).toBe('cancelado');
  });

  it('permite editar un pedido en curso normalmente', async () => {
    const id = await sembrarPedido('pendiente');

    const res = await api('put', `/api/pedidos/${id}`).send({
      ...cuerpoBase,
      estado: 'en_proceso',
      detalles: [{ producto_id: PAN.id, cantidad: 3 }]
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.total).toBe(3000);
    expect(await estadoDe(id)).toBe('en_proceso');
  });
});
