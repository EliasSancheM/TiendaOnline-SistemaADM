/**
 * Tests de separación de roles (RBAC) en el servidor.
 *
 * El panel oculta secciones por rol en el frontend (ProtectedRoute), pero eso
 * es solo cosmético: cualquiera con sesión puede llamar a la API directamente.
 * Estas pruebas fijan la política en el backend, que es donde se aplica de verdad.
 *
 * Política verificada:
 *   - clientes y pedidos (lectura)  → admin, empleado.  contador NO.
 *   - facturas y sus auxiliares     → admin, contador.  empleado NO.
 *   - /api/facturas/clientes-facturables es la vía del contador para facturar,
 *     y no puede filtrar email ni teléfono.
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

// Un token por rol. authenticateToken confía en el payload del JWT, así que
// firmarlos directamente equivale a haber hecho login con ese usuario.
const tokenPara = (role) =>
  jwt.sign(
    { id: 1, username: `user_${role}`, role, nombre_completo: `Test ${role}` },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const TOKENS = {
  admin: tokenPara('admin'),
  empleado: tokenPara('empleado'),
  contador: tokenPara('contador')
};

const get = (url, role) =>
  request(app).get(url).set('Authorization', `Bearer ${TOKENS[role]}`);

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
  mockDb.helpers = {
    now: () => 'CURRENT_TIMESTAMP',
    date: (col) => `DATE(${col}, 'localtime')`,
    groupConcat: (col) => `GROUP_CONCAT(${col})`
  };

  await mockDb.runAsync(`CREATE TABLE clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL, telefono TEXT, direccion TEXT, email TEXT,
    rut TEXT, giro TEXT,
    fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
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
  await mockDb.runAsync(`CREATE TABLE productos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL, precio REAL NOT NULL, descripcion TEXT, imagen_url TEXT
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

  await mockDb.runAsync(
    `INSERT INTO clientes (id, nombre, telefono, direccion, email, rut, giro)
     VALUES (1, 'Panadería Cliente', '+56911111111', 'Calle Falsa 123', 'cliente@test.com', '11.111.111-1', 'Comercio')`
  );
  await mockDb.runAsync(
    `INSERT INTO pedidos (id, cliente_id, fecha, periodo, estado, total)
     VALUES (1, 1, '2026-08-01', 'mañana', 'pendiente', 5000)`
  );

  jest.mock('../config/database', () => mockDb);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/clientes', require('../routes/clientesRoutes'));
  app.use('/api/pedidos', require('../routes/pedidosRoutes'));
  app.use('/api/facturas', require('../routes/facturasRoutes'));
});

afterAll((done) => {
  mockDb ? mockDb.close(() => done()) : done();
});

describe('Datos de clientes (PII)', () => {
  const rutas = ['/api/clientes', '/api/clientes/1'];

  it.each(rutas)('el contador no puede leer %s', async (ruta) => {
    const res = await get(ruta, 'contador');
    expect(res.statusCode).toBe(403);
  });

  it.each(rutas)('admin y empleado sí pueden leer %s', async (ruta) => {
    expect((await get(ruta, 'admin')).statusCode).toBe(200);
    expect((await get(ruta, 'empleado')).statusCode).toBe(200);
  });

  it('sin token responde 401, no 403', async () => {
    const res = await request(app).get('/api/clientes');
    expect(res.statusCode).toBe(401);
  });
});

describe('Pedidos', () => {
  const rutas = ['/api/pedidos', '/api/pedidos/1'];

  it.each(rutas)('el contador no puede leer %s', async (ruta) => {
    const res = await get(ruta, 'contador');
    expect(res.statusCode).toBe(403);
  });

  it.each(rutas)('admin y empleado sí pueden leer %s', async (ruta) => {
    expect((await get(ruta, 'admin')).statusCode).toBe(200);
    expect((await get(ruta, 'empleado')).statusCode).toBe(200);
  });

  it('dashboard-stats sigue abierto a los tres roles', async () => {
    for (const role of ['admin', 'empleado', 'contador']) {
      expect((await get('/api/pedidos/dashboard-stats', role)).statusCode).toBe(200);
    }
  });
});

describe('GET /api/facturas/clientes-facturables', () => {
  it('el contador puede usarlo para facturar', async () => {
    const res = await get('/api/facturas/clientes-facturables', 'contador');
    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].nombre).toBe('Panadería Cliente');
  });

  it('no filtra email ni teléfono', async () => {
    const res = await get('/api/facturas/clientes-facturables', 'contador');
    const cliente = res.body[0];

    expect(cliente).not.toHaveProperty('email');
    expect(cliente).not.toHaveProperty('telefono');
    expect(Object.keys(cliente).sort()).toEqual(['direccion', 'giro', 'id', 'nombre', 'rut']);
    expect(JSON.stringify(res.body)).not.toContain('cliente@test.com');
    expect(JSON.stringify(res.body)).not.toContain('+56911111111');
  });

  it('devuelve el rut y el giro, que son los que exige el DTE', async () => {
    const res = await get('/api/facturas/clientes-facturables', 'contador');
    expect(res.body[0].rut).toBe('11.111.111-1');
    expect(res.body[0].giro).toBe('Comercio');
  });

  it('el empleado no entra (no factura)', async () => {
    expect((await get('/api/facturas/clientes-facturables', 'empleado')).statusCode).toBe(403);
  });

  it('no lo captura la ruta /:id', async () => {
    // Si el orden de registro fuera el inverso, "clientes-facturables" se
    // interpretaría como un id de factura y esto devolvería 404.
    const res = await get('/api/facturas/clientes-facturables', 'admin');
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
  });
});

describe('Facturación', () => {
  it('el empleado no puede leer facturas ni pedidos-disponibles', async () => {
    expect((await get('/api/facturas', 'empleado')).statusCode).toBe(403);
    expect((await get('/api/facturas/pedidos-disponibles', 'empleado')).statusCode).toBe(403);
    expect((await get('/api/facturas/reporte', 'empleado')).statusCode).toBe(403);
  });

  it('el contador conserva su flujo de facturación completo', async () => {
    expect((await get('/api/facturas', 'contador')).statusCode).toBe(200);
    expect((await get('/api/facturas/pedidos-disponibles', 'contador')).statusCode).toBe(200);
    expect((await get('/api/facturas/reporte', 'contador')).statusCode).toBe(200);
  });

  it('el reporte mensual filtra por rango de fechas sin usar LIKE', async () => {
    await mockDb.runAsync(
      `INSERT INTO facturas (cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado)
       VALUES (1, 'F-001', '2026-08-15', 1000, 190, 1190, 'pagada')`
    );
    await mockDb.runAsync(
      `INSERT INTO facturas (cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado)
       VALUES (1, 'F-002', '2026-09-01', 2000, 380, 2380, 'pendiente')`
    );

    const res = await get('/api/facturas/reporte?mes=8&anio=2026', 'contador');

    expect(res.statusCode).toBe(200);
    // Solo la factura de agosto: la del 1 de septiembre queda fuera del rango.
    expect(res.body.stats.total_documentos).toBe(1);
    expect(res.body.stats.total).toBe(1190);
    expect(res.body.stats.recaudado).toBe(1190);
  });

  it('el reporte de diciembre no se desborda al año siguiente', async () => {
    await mockDb.runAsync(
      `INSERT INTO facturas (cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado)
       VALUES (1, 'F-003', '2026-12-31', 500, 95, 595, 'pagada')`
    );
    await mockDb.runAsync(
      `INSERT INTO facturas (cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado)
       VALUES (1, 'F-004', '2027-01-01', 700, 133, 833, 'pagada')`
    );

    const res = await get('/api/facturas/reporte?mes=12&anio=2026', 'contador');

    expect(res.statusCode).toBe(200);
    expect(res.body.stats.total_documentos).toBe(1);
    expect(res.body.stats.total).toBe(595);
  });
});
