/**
 * Tests de normalización de fechas entre SQLite y PostgreSQL.
 *
 * El bug que cierran: dashboard-stats hacía `p.fecha.substring(0, 10)`. SQLite
 * devuelve las columnas DATE como texto, pero el driver de PostgreSQL las
 * entrega como objetos Date, así que en producción el dashboard respondía 500
 * con "p.fecha.substring is not a function".
 *
 * config/database.js ahora fuerza a PostgreSQL a devolver texto, pero eso no se
 * puede verificar sin una base real; lo que sí se comprueba aquí es que el
 * cálculo funciona con las dos formas.
 */
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const sqlite3 = require('sqlite3').verbose();

process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DB_TYPE = 'sqlite';
process.env.NODE_ENV = 'test';

const { soloFecha, soloMes } = require('../utils/fechas');

let app;
let mockDb;
let hoyStr; // fecha local de hoy, con la que se siembra el pedido de referencia

/** Deja la tabla de pedidos en su estado inicial: un pedido de hoy por 5000. */
async function sembrarPedidoDeHoy() {
  await mockDb.runAsync('DELETE FROM pedidos');
  await mockDb.runAsync(
    'INSERT INTO pedidos (id, cliente_id, fecha, periodo, estado, total) VALUES (1, 1, ?, ?, ?, ?)',
    [hoyStr, 'mañana', 'completado', 5000]
  );
}

const TOKEN = jwt.sign(
  { id: 1, username: 'admin_test', role: 'admin', nombre_completo: 'Test' },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

describe('soloFecha() / soloMes()', () => {
  it('acepta el texto que devuelve SQLite', () => {
    expect(soloFecha('2026-08-10')).toBe('2026-08-10');
    expect(soloFecha('2026-08-10 13:45:00')).toBe('2026-08-10');
    expect(soloMes('2026-08-10')).toBe('2026-08');
  });

  it('acepta el Date que devuelve el driver de PostgreSQL', () => {
    // Medianoche local, que es como lo construye el parser de pg
    const fecha = new Date(2026, 7, 10);
    expect(soloFecha(fecha)).toBe('2026-08-10');
    expect(soloMes(fecha)).toBe('2026-08');
  });

  it('no desplaza el día en zonas con offset positivo', () => {
    // Con toISOString(), la medianoche local en UTC+X cae en el día anterior.
    // Se usan los componentes locales justamente para evitarlo.
    const finDeMes = new Date(2026, 11, 31, 0, 0, 0);
    expect(soloFecha(finDeMes)).toBe('2026-12-31');
    expect(soloMes(finDeMes)).toBe('2026-12');
  });

  it('tolera valores vacíos o inválidos sin reventar', () => {
    expect(soloFecha(null)).toBe('');
    expect(soloFecha(undefined)).toBe('');
    expect(soloFecha('')).toBe('');
    expect(soloFecha(new Date('no es una fecha'))).toBe('');
    expect(soloMes(null)).toBe('');
  });
});

describe('GET /api/pedidos/dashboard-stats', () => {
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
      groupConcat: (col) => `GROUP_CONCAT(${col})`,
      like: () => 'LIKE'
    };

    await mockDb.runAsync(`CREATE TABLE productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, precio REAL NOT NULL,
      descripcion TEXT, imagen_url TEXT
    )`);
    await mockDb.runAsync(`CREATE TABLE pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER, fecha DATE NOT NULL,
      periodo TEXT NOT NULL, estado TEXT, total REAL, notas TEXT
    )`);
    await mockDb.runAsync(`CREATE TABLE detalles_pedido (
      id INTEGER PRIMARY KEY AUTOINCREMENT, pedido_id INTEGER, producto_id INTEGER,
      cantidad INTEGER NOT NULL, precio_unitario REAL NOT NULL, subtotal REAL NOT NULL
    )`);

    await mockDb.runAsync('INSERT INTO productos (id, nombre, precio) VALUES (1, ?, ?)', ['Pan', 1000]);

    const hoy = new Date();
    hoyStr = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, '0')}-${String(hoy.getDate()).padStart(2, '0')}`;
    await sembrarPedidoDeHoy();
    await mockDb.runAsync(
      'INSERT INTO detalles_pedido (pedido_id, producto_id, cantidad, precio_unitario, subtotal) VALUES (1, 1, 5, 1000, 5000)'
    );

    jest.mock('../config/database', () => mockDb);

    app = express();
    app.use(express.json());
    app.use(cookieParser());
    app.use('/api/pedidos', require('../routes/pedidosRoutes'));
  });

  afterAll((done) => {
    mockDb ? mockDb.close(() => done()) : done();
  });

  it('responde con las series calculadas', async () => {
    const res = await request(app)
      .get('/api/pedidos/dashboard-stats')
      .set('Authorization', `Bearer ${TOKEN}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.ventasSemanales).toHaveLength(7);
    expect(res.body.ventasMensuales).toHaveLength(12);
    expect(res.body.productosPopulares[0].cantidadVendida).toBe(5);

    // La venta de hoy tiene que haber caído en el último día de la serie semanal
    expect(res.body.ventasSemanales[6].total).toBe(5000);
  });

  it('imputa la venta al día local aunque en UTC ya sea mañana', async () => {
    // 23:30 en Chile (UTC-4) son las 03:30 UTC del día siguiente. Con las claves
    // construidas por toISOString(), el bucket "de hoy" se etiquetaba con la
    // fecha de mañana y las ventas del día salían en cero: durante cuatro horas
    // cada noche el dashboard mentía.
    jest.useFakeTimers({
      now: new Date(2026, 7, 14, 23, 30, 0),
      doNotFake: [
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval',
        'setImmediate', 'clearImmediate', 'nextTick', 'queueMicrotask',
        'performance', 'hrtime'
      ]
    });

    try {
      await mockDb.runAsync('DELETE FROM pedidos');
      await mockDb.runAsync(
        `INSERT INTO pedidos (id, cliente_id, fecha, periodo, estado, total)
         VALUES (99, 1, '2026-08-14', 'tarde', 'completado', 7000)`
      );

      const res = await request(app)
        .get('/api/pedidos/dashboard-stats')
        .set('Authorization', `Bearer ${TOKEN}`);

      expect(res.statusCode).toBe(200);

      const hoy = res.body.ventasSemanales[6];
      expect(hoy.date).toBe('2026-08-14'); // no '2026-08-15'
      expect(hoy.total).toBe(7000);

      expect(res.body.ventasMensuales[11].month).toBe('2026-08');
      expect(res.body.ventasMensuales[11].total).toBe(7000);
    } finally {
      jest.useRealTimers();
      await sembrarPedidoDeHoy(); // devuelve la tabla a su estado inicial
    }
  });

  it('no revienta cuando las fechas llegan como Date, que es lo que hace PostgreSQL', async () => {
    const fechasComoTexto = mockDb.allAsync;

    // Se simula el driver de pg: las columnas DATE llegan como objetos Date.
    mockDb.allAsync = async function (sql, params = []) {
      const filas = await fechasComoTexto.call(this, sql, params);
      return filas.map((fila) => (
        fila.fecha ? { ...fila, fecha: new Date(`${fila.fecha}T00:00:00`) } : fila
      ));
    };

    try {
      const res = await request(app)
        .get('/api/pedidos/dashboard-stats')
        .set('Authorization', `Bearer ${TOKEN}`);

      expect(res.statusCode).toBe(200);
      expect(res.body.ventasSemanales[6].total).toBe(5000);
      expect(res.body.ventasMensuales[11].total).toBe(5000);
    } finally {
      mockDb.allAsync = fechasComoTexto;
    }
  });
});
