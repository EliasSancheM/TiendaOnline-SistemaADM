/**
 * Tests del flujo de pagos público (tienda en línea → Webpay Plus).
 *
 * Cubre las dos rutas críticas de dinero:
 *   - POST /api/public/checkout            (crea pedido + inicia pago)
 *   - ALL  /api/public/checkout/webpay-return  (callback de Transbank)
 *
 * Se enfoca en las garantías de seguridad del negocio:
 *   1. El total SIEMPRE se recalcula en el backend con los precios reales de la BD.
 *   2. Solo se confirma un pedido si Transbank autoriza, el estado es 'pendiente_pago'
 *      y el monto coincide exactamente.
 *   3. Anulaciones, montos alterados y reintentos no confirman ni doble-cobran.
 */
const request = require('supertest');
const express = require('express');
const sqlite3 = require('sqlite3').verbose();

process.env.NODE_ENV = 'test';
process.env.DB_TYPE = 'sqlite';
process.env.FRONTEND_URL = 'http://frontend.test';
process.env.BACKEND_URL = 'http://backend.test';

// Mocks de servicios externos (Webpay + correo). Prefijo "mock" permite
// referenciarlos dentro de la factory de jest.mock (regla de hoisting de Jest).
const mockCreateTransaction = jest.fn();
const mockCommitTransaction = jest.fn();
const mockSendOrderConfirmationEmail = jest.fn().mockResolvedValue({ success: true });

let app;
let mockDb;

// IDs de productos sembrados con sus precios reales en BD
const PAN = { id: 1, precio: 1500 };
const CROISSANT = { id: 2, precio: 2000 };

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
  // Transacción sobre la misma conexión (igual que el adaptador SQLite real)
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
    nombre TEXT NOT NULL, telefono TEXT, direccion TEXT, email TEXT,
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

  await mockDb.runAsync('INSERT INTO productos (id, nombre, precio) VALUES (?, ?, ?)', [PAN.id, 'Pan', PAN.precio]);
  await mockDb.runAsync('INSERT INTO productos (id, nombre, precio) VALUES (?, ?, ?)', [CROISSANT.id, 'Croissant', CROISSANT.precio]);

  jest.mock('../config/database', () => mockDb);
  jest.mock('../utils/webpayService', () => ({
    createTransaction: mockCreateTransaction,
    commitTransaction: mockCommitTransaction
  }));
  jest.mock('../utils/emailService', () => ({
    sendOrderConfirmationEmail: mockSendOrderConfirmationEmail
  }));

  app = express();
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));
  const publicRoutes = require('../routes/publicRoutes');
  app.use('/api/public', publicRoutes);
});

afterAll((done) => {
  mockDb ? mockDb.close(() => done()) : done();
});

beforeEach(() => {
  jest.clearAllMocks();
  mockCreateTransaction.mockResolvedValue({ token: 'tok-abc', url: 'https://webpay.test/pay' });
});

const validCliente = {
  nombre: 'Cliente Test',
  email: 'cliente@test.com',
  telefono: '+56911111111',
  direccion: 'Calle Falsa 123'
};

describe('POST /api/public/checkout', () => {
  it('recalcula el total en backend ignorando cualquier precio enviado por el cliente', async () => {
    const res = await request(app).post('/api/public/checkout').send({
      cliente: validCliente,
      periodo: 'mañana',
      items: [
        { id: PAN.id, quantity: 2, precio: 1 },        // precio falso: debe ignorarse
        { id: CROISSANT.id, quantity: 1, precio: 0 }
      ]
    });

    expect(res.statusCode).toBe(200);
    expect(res.body.token).toBe('tok-abc');
    expect(res.body.url).toBe('https://webpay.test/pay');

    // Total correcto = 2*1500 + 1*2000 = 5000, NO el precio manipulado del cliente
    const expectedTotal = 2 * PAN.precio + 1 * CROISSANT.precio;
    expect(mockCreateTransaction).toHaveBeenCalledTimes(1);
    const amountArg = mockCreateTransaction.mock.calls[0][2];
    expect(amountArg).toBe(expectedTotal);

    // El pedido se guardó como pendiente_pago con el total del servidor
    const buyOrder = mockCreateTransaction.mock.calls[0][0]; // "O-<id>"
    const pedidoId = parseInt(buyOrder.split('-')[1]);
    const pedido = await mockDb.getAsync('SELECT * FROM pedidos WHERE id = ?', [pedidoId]);
    expect(pedido.estado).toBe('pendiente_pago');
    expect(pedido.total).toBe(expectedTotal);
  });

  it('reutiliza el cliente existente por email en lugar de duplicarlo', async () => {
    await request(app).post('/api/public/checkout').send({
      cliente: validCliente, periodo: 'tarde', items: [{ id: PAN.id, quantity: 1 }]
    });
    const clientes = await mockDb.allAsync('SELECT * FROM clientes WHERE email = ?', [validCliente.email]);
    expect(clientes.length).toBe(1);
  });

  it('rechaza un producto inexistente sin crear transacción de pago', async () => {
    const res = await request(app).post('/api/public/checkout').send({
      cliente: validCliente, periodo: 'mañana', items: [{ id: 9999, quantity: 1 }]
    });
    expect(res.statusCode).toBe(400);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('rechaza payload inválido (carrito vacío) por validación de esquema', async () => {
    const res = await request(app).post('/api/public/checkout').send({
      cliente: validCliente, periodo: 'mañana', items: []
    });
    expect(res.statusCode).toBe(400);
    expect(mockCreateTransaction).not.toHaveBeenCalled();
  });

  it('rechaza cliente con email inválido', async () => {
    const res = await request(app).post('/api/public/checkout').send({
      cliente: { ...validCliente, email: 'no-es-email' },
      periodo: 'mañana', items: [{ id: PAN.id, quantity: 1 }]
    });
    expect(res.statusCode).toBe(400);
  });
});

// Helper: crea un pedido pendiente_pago y devuelve su id + total
async function crearPedidoPendiente(total = PAN.precio) {
  const cli = await mockDb.runAsync(
    'INSERT INTO clientes (nombre, email) VALUES (?, ?)', ['Pagador', 'pagador@test.com']
  );
  const ped = await mockDb.runAsync(
    "INSERT INTO pedidos (cliente_id, fecha, periodo, estado, total) VALUES (?, date('now'), 'mañana', 'pendiente_pago', ?)",
    [cli.lastID, total]
  );
  return { pedidoId: ped.lastID, total };
}

describe('GET/POST /api/public/checkout/webpay-return', () => {
  it('confirma el pedido cuando Transbank autoriza y el monto coincide', async () => {
    const { pedidoId, total } = await crearPedidoPendiente(3000);
    mockCommitTransaction.mockResolvedValue({
      status: 'AUTHORIZED', buy_order: `O-${pedidoId}`, amount: total
    });

    const res = await request(app)
      .get(`/api/public/checkout/webpay-return?token_ws=tok-ok&pedidoId=${pedidoId}`);

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toContain('status=success');

    const pedido = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = ?', [pedidoId]);
    expect(pedido.estado).toBe('pendiente'); // pagado → pasa a la cola normal
    expect(mockSendOrderConfirmationEmail).toHaveBeenCalledTimes(1);
  });

  it('NO confirma si el monto de Transbank difiere del total en BD (fraude de monto)', async () => {
    const { pedidoId } = await crearPedidoPendiente(5000);
    mockCommitTransaction.mockResolvedValue({
      status: 'AUTHORIZED', buy_order: `O-${pedidoId}`, amount: 100 // monto alterado
    });

    const res = await request(app)
      .get(`/api/public/checkout/webpay-return?token_ws=tok-x&pedidoId=${pedidoId}`);

    expect(res.headers.location).toContain('status=rejected');
    const pedido = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = ?', [pedidoId]);
    expect(pedido.estado).toBe('cancelado');
    expect(mockSendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it('cancela el pedido si Transbank no autoriza el pago', async () => {
    const { pedidoId, total } = await crearPedidoPendiente(3000);
    mockCommitTransaction.mockResolvedValue({
      status: 'FAILED', buy_order: `O-${pedidoId}`, amount: total
    });

    const res = await request(app)
      .get(`/api/public/checkout/webpay-return?token_ws=tok-fail&pedidoId=${pedidoId}`);

    expect(res.headers.location).toContain('status=rejected');
    const pedido = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = ?', [pedidoId]);
    expect(pedido.estado).toBe('cancelado');
  });

  it('cancela el pedido pendiente cuando el usuario anula (sin token_ws)', async () => {
    const { pedidoId } = await crearPedidoPendiente(3000);

    const res = await request(app)
      .get(`/api/public/checkout/webpay-return?pedidoId=${pedidoId}`);

    expect(res.headers.location).toContain('status=rejected');
    const pedido = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = ?', [pedidoId]);
    expect(pedido.estado).toBe('cancelado');
    expect(mockCommitTransaction).not.toHaveBeenCalled();
  });

  it('no reconfirma ni reenvía correo si el pedido ya fue procesado (protección de reintento)', async () => {
    const { pedidoId, total } = await crearPedidoPendiente(3000);
    // Simular que ya se pagó previamente
    await mockDb.runAsync("UPDATE pedidos SET estado = 'pendiente' WHERE id = ?", [pedidoId]);

    mockCommitTransaction.mockResolvedValue({
      status: 'AUTHORIZED', buy_order: `O-${pedidoId}`, amount: total
    });

    const res = await request(app)
      .get(`/api/public/checkout/webpay-return?token_ws=tok-replay&pedidoId=${pedidoId}`);

    expect(res.headers.location).toContain('status=rejected');
    // El estado no debe cambiar a cancelado ni reenviar correo
    const pedido = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = ?', [pedidoId]);
    expect(pedido.estado).toBe('pendiente');
    expect(mockSendOrderConfirmationEmail).not.toHaveBeenCalled();
  });

  it('rechaza un buy_order con formato inválido devuelto por Transbank', async () => {
    const { pedidoId } = await crearPedidoPendiente(3000);
    mockCommitTransaction.mockResolvedValue({
      status: 'AUTHORIZED', buy_order: 'INVALIDO', amount: 3000
    });

    const res = await request(app)
      .get(`/api/public/checkout/webpay-return?token_ws=tok-bad&pedidoId=${pedidoId}`);

    // El handler cae al catch → redirige con status=error y cancela el pendiente
    expect(res.headers.location).toContain('status=error');
    const pedido = await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = ?', [pedidoId]);
    expect(pedido.estado).toBe('cancelado');
  });
});

describe('Cuando Transbank no acepta abrir la transaccion', () => {
  // El caso real: al pasar a produccion, las credenciales todavia no estaban
  // habilitadas y createTransaction lanzaba. El pedido ya se habia guardado
  // como 'pendiente_pago', asi que cada intento fallido dejaba un pedido
  // fantasma en la lista de produccion y el cliente, al reintentar, generaba
  // otro. Ademas veia "Hubo un error al procesar tu pedido", que no dice si le
  // cobraron o no.
  const pedidoValido = {
    cliente: {
      nombre: 'Cliente Prueba',
      email: 'cliente.prueba@example.com',
      telefono: '912345678',
      direccion: 'Av. Siempre Viva 742'
    },
    items: [{ id: PAN.id, quantity: 2 }],
    periodo: 'mañana'
  };

  beforeEach(async () => {
    mockCreateTransaction.mockRejectedValue(new Error('Api Key or Commerce Code is invalid'));
    // Los pedidos de los tests anteriores no cuentan aqui: lo que se comprueba
    // es que ESTE flujo no deje ninguno vivo.
    await mockDb.runAsync('DELETE FROM pedidos');
    await mockDb.runAsync('DELETE FROM detalles_pedido');
  });

  it('responde 502 y explica que no se cobro nada', async () => {
    const res = await request(app).post('/api/public/checkout').send(pedidoValido);

    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/no se ha registrado tu pedido/i);
    expect(res.body.error).toMatch(/se te ha cobrado nada/i);
  });

  it('no deja el pedido colgado en pendiente_pago', async () => {
    await request(app).post('/api/public/checkout').send(pedidoValido);

    const colgados = await mockDb.allAsync(
      "SELECT id FROM pedidos WHERE estado = 'pendiente_pago'"
    );
    expect(colgados).toHaveLength(0);
  });

  it('el pedido queda anulado, no borrado, para que exista rastro', async () => {
    await request(app).post('/api/public/checkout').send(pedidoValido);

    const ultimo = await mockDb.getAsync(
      'SELECT estado FROM pedidos ORDER BY id DESC LIMIT 1'
    );
    expect(ultimo.estado).toBe('cancelado');
  });

  it('cada reintento no acumula pedidos vivos', async () => {
    await request(app).post('/api/public/checkout').send(pedidoValido);
    await request(app).post('/api/public/checkout').send(pedidoValido);
    await request(app).post('/api/public/checkout').send(pedidoValido);

    const vivos = await mockDb.allAsync(
      "SELECT id FROM pedidos WHERE estado NOT IN ('cancelado')"
    );
    expect(vivos).toHaveLength(0);
  });
});

describe('Compra anulada por el usuario en el formulario de Webpay', () => {
  // Transbank usa nombres DISTINTOS cuando el usuario pulsa "Anular compra":
  // manda TBK_TOKEN en lugar de token_ws, mas TBK_ORDEN_COMPRA y TBK_ID_SESION.
  // Y en ese caso NO se debe confirmar la transaccion: no hay ninguna que
  // confirmar, y llamar a commit() da error.
  let pedidoId;

  beforeEach(async () => {
    mockCommitTransaction.mockReset();
    await mockDb.runAsync('DELETE FROM pedidos');
    const r = await mockDb.runAsync(
      `INSERT INTO pedidos (cliente_id, fecha, periodo, estado, total)
       VALUES (1, '2026-09-01', 'mañana', 'pendiente_pago', 1500)`
    );
    pedidoId = r.lastID;
  });

  const estadoDelPedido = async () =>
    (await mockDb.getAsync('SELECT estado FROM pedidos WHERE id = ?', [pedidoId])).estado;

  it('NO confirma la transaccion cuando llega TBK_TOKEN', async () => {
    await request(app)
      .post('/api/public/checkout/webpay-return')
      .type('form')
      .send({
        TBK_TOKEN: 'e8b3f2a1c4d5',
        TBK_ORDEN_COMPRA: `O-${pedidoId}`,
        TBK_ID_SESION: 'S-1'
      });

    expect(mockCommitTransaction).not.toHaveBeenCalled();
  });

  it('anula el pedido y devuelve al cliente a la tienda', async () => {
    const res = await request(app)
      .post('/api/public/checkout/webpay-return')
      .type('form')
      .send({
        TBK_TOKEN: 'e8b3f2a1c4d5',
        TBK_ORDEN_COMPRA: `O-${pedidoId}`,
        TBK_ID_SESION: 'S-1'
      });

    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toMatch(/status=rejected/);
    expect(await estadoDelPedido()).toBe('cancelado');
  });

  it('identifica el pedido por TBK_ORDEN_COMPRA, sin depender de nuestro pedidoId', async () => {
    // La orden la manda Transbank; el pedidoId lo añadimos nosotros a la URL de
    // retorno y podria no sobrevivir a la redireccion.
    await request(app)
      .post('/api/public/checkout/webpay-return')
      .type('form')
      .send({ TBK_TOKEN: 'abc', TBK_ORDEN_COMPRA: `O-${pedidoId}`, TBK_ID_SESION: 'S-1' });

    expect(await estadoDelPedido()).toBe('cancelado');
  });

  it('tampoco confirma si llegan token_ws y TBK_TOKEN a la vez', async () => {
    // Compra abandonada y reintentada: ante la duda, no se confirma.
    await request(app)
      .post('/api/public/checkout/webpay-return')
      .type('form')
      .send({ token_ws: 'tok-abc', TBK_TOKEN: 'abc', TBK_ORDEN_COMPRA: `O-${pedidoId}` });

    expect(mockCommitTransaction).not.toHaveBeenCalled();
    expect(await estadoDelPedido()).toBe('cancelado');
  });

  it('trata la sesion caducada igual: sin confirmar', async () => {
    // Transbank manda la orden y la sesion, pero ningun token.
    await request(app)
      .post('/api/public/checkout/webpay-return')
      .type('form')
      .send({ TBK_ORDEN_COMPRA: `O-${pedidoId}`, TBK_ID_SESION: 'S-1' });

    expect(mockCommitTransaction).not.toHaveBeenCalled();
    expect(await estadoDelPedido()).toBe('cancelado');
  });

  it('un retorno tardio no deshace un pedido ya pagado', async () => {
    await mockDb.runAsync("UPDATE pedidos SET estado = 'pendiente' WHERE id = ?", [pedidoId]);

    await request(app)
      .post('/api/public/checkout/webpay-return')
      .type('form')
      .send({ TBK_TOKEN: 'abc', TBK_ORDEN_COMPRA: `O-${pedidoId}` });

    expect(await estadoDelPedido()).toBe('pendiente');
  });

  it('acepta el retorno tambien por GET', async () => {
    const res = await request(app)
      .get(`/api/public/checkout/webpay-return?TBK_TOKEN=abc&TBK_ORDEN_COMPRA=O-${pedidoId}&TBK_ID_SESION=S-1`);

    expect(mockCommitTransaction).not.toHaveBeenCalled();
    expect(res.headers.location).toMatch(/status=rejected/);
    expect(await estadoDelPedido()).toBe('cancelado');
  });
});
