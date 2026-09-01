/**
 * Tests del diagnóstico de pagos.
 *
 * Nace de un caso real: al pasar Webpay a producción, el checkout empezó a
 * fallar y lo único visible era el mensaje que ve el cliente. El motivo de
 * Transbank quedaba en los registros del servidor, donde no todo el mundo sabe
 * (ni puede) llegar, así que no había forma de distinguir "las credenciales
 * están mal copiadas" de "el comercio aún no está habilitado".
 */
const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sqlite3 = require('sqlite3').verbose();

process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DB_TYPE = 'sqlite';
process.env.NODE_ENV = 'test';

const mockCreateTransaction = jest.fn();

let app;
let mockDb;

const token = (id, role) => jwt.sign(
  { id, username: `u${id}`, role, nombre_completo: 'Test', jti: crypto.randomUUID() },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

const diagnosticar = (t) =>
  request(app).get('/api/diagnostico/pagos').set('Authorization', `Bearer ${t}`);

beforeAll(async () => {
  mockDb = new sqlite3.Database(':memory:');
  mockDb.getAsync = function (sql, p = []) {
    return new Promise((r, j) => this.get(sql, p, (e, x) => (e ? j(e) : r(x))));
  };
  mockDb.allAsync = function (sql, p = []) {
    return new Promise((r, j) => this.all(sql, p, (e, x) => (e ? j(e) : r(x))));
  };
  mockDb.runAsync = function (sql, p = []) {
    return new Promise((r, j) => this.run(sql, p, function (e) {
      if (e) j(e); else r({ lastID: this.lastID, changes: this.changes });
    }));
  };
  mockDb.helpers = { now: () => 'CURRENT_TIMESTAMP', date: (c) => `DATE(${c})`, like: () => 'LIKE' };

  await mockDb.runAsync(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT 'x', role TEXT NOT NULL,
    nombre_completo TEXT, email TEXT, activo BOOLEAN DEFAULT 1,
    sesiones_validas_desde INTEGER DEFAULT 0
  )`);
  await mockDb.runAsync(`CREATE TABLE tokens_revocados (
    token_hash TEXT PRIMARY KEY, expira_en INTEGER NOT NULL
  )`);
  await mockDb.runAsync("INSERT INTO usuarios (id, username, role) VALUES (1, 'jefa', 'admin')");
  await mockDb.runAsync("INSERT INTO usuarios (id, username, role) VALUES (2, 'pana', 'empleado')");

  jest.mock('../config/database', () => mockDb);
  jest.mock('../utils/webpayService', () => ({
    createTransaction: mockCreateTransaction,
    commitTransaction: jest.fn()
  }));

  app = express();
  app.use(express.json());
  app.use('/api/diagnostico', require('../routes/diagnosticoRoutes'));
});

afterAll((done) => {
  mockDb ? mockDb.close(() => done()) : done();
});

beforeEach(() => {
  mockCreateTransaction.mockReset();
  delete process.env.WEBPAY_ENVIRONMENT;
  delete process.env.WEBPAY_COMMERCE_CODE;
  delete process.env.WEBPAY_API_KEY;
});

describe('Quién puede consultarlo', () => {
  it('un empleado no ve la configuración del servidor', async () => {
    mockCreateTransaction.mockResolvedValue({ url: 'https://x', token: 't' });
    expect((await diagnosticar(token(2, 'empleado'))).statusCode).toBe(403);
  });

  it('sin sesión tampoco', async () => {
    expect((await request(app).get('/api/diagnostico/pagos')).statusCode).toBe(401);
  });
});

describe('Cuando Transbank responde bien', () => {
  it('informa de que la conexión es correcta', async () => {
    mockCreateTransaction.mockResolvedValue({ url: 'https://webpay.test/pay', token: 'tok' });

    const res = await diagnosticar(token(1, 'admin'));

    expect(res.statusCode).toBe(200);
    expect(res.body.conexion).toBe('correcta');
  });

  it('avisa de que los cobros son reales cuando está en producción', async () => {
    process.env.WEBPAY_ENVIRONMENT = 'production';
    mockCreateTransaction.mockResolvedValue({ url: 'https://webpay.cl/pay', token: 'tok' });

    const res = await diagnosticar(token(1, 'admin'));

    expect(res.body.configuracion.ambiente).toBe('produccion');
    expect(res.body.diagnostico).toMatch(/REALES/);
  });
});

describe('Cuando Transbank rechaza', () => {
  it('devuelve el mensaje literal, que es lo accionable', async () => {
    process.env.WEBPAY_ENVIRONMENT = 'production';
    process.env.WEBPAY_COMMERCE_CODE = '597053097973';
    process.env.WEBPAY_API_KEY = 'una-llave';
    mockCreateTransaction.mockRejectedValue(new Error('Api Key or Commerce Code is invalid'));

    const res = await diagnosticar(token(1, 'admin'));

    expect(res.statusCode).toBe(502);
    expect(res.body.errorDeTransbank).toBe('Api Key or Commerce Code is invalid');
    expect(res.body.diagnostico).toMatch(/no reconoce el par|habilitado/i);
  });

  it('detecta credenciales de producción apuntando al servidor de pruebas', async () => {
    // El error que hace perder horas: cambiar solo WEBPAY_ENVIRONMENT no
    // revierte nada, porque las credenciales propias siguen puestas.
    process.env.WEBPAY_COMMERCE_CODE = '597053097973';
    process.env.WEBPAY_API_KEY = 'una-llave';
    // WEBPAY_ENVIRONMENT ausente => integracion
    mockCreateTransaction.mockRejectedValue(new Error('Unauthorized'));

    const res = await diagnosticar(token(1, 'admin'));

    expect(res.body.configuracion.combinacionIncoherente).toBe(true);
    expect(res.body.diagnostico).toMatch(/servidor de pruebas/i);
  });
});

describe('No filtrar credenciales', () => {
  it('nunca devuelve la llave secreta', async () => {
    process.env.WEBPAY_ENVIRONMENT = 'production';
    process.env.WEBPAY_COMMERCE_CODE = '597053097973';
    process.env.WEBPAY_API_KEY = 'ESTA-LLAVE-NO-DEBE-SALIR-NUNCA';
    mockCreateTransaction.mockResolvedValue({ url: 'https://x', token: 't' });

    const res = await diagnosticar(token(1, 'admin'));

    expect(JSON.stringify(res.body)).not.toContain('ESTA-LLAVE-NO-DEBE-SALIR-NUNCA');
    expect(res.body.configuracion.llaveSecreta).toBe('configurada');
  });

  it('del código de comercio solo muestra los últimos dígitos', async () => {
    process.env.WEBPAY_ENVIRONMENT = 'production';
    process.env.WEBPAY_COMMERCE_CODE = '597053097973';
    mockCreateTransaction.mockResolvedValue({ url: 'https://x', token: 't' });

    const res = await diagnosticar(token(1, 'admin'));

    expect(res.body.configuracion.codigoComercio).toContain('7973');
    expect(res.body.configuracion.codigoComercio).not.toContain('597053');
  });
});
