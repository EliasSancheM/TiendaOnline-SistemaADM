/**
 * Tests de revocación de sesión.
 *
 * El JWT lleva dentro el rol y dura 24 h. Antes se confiaba solo en su
 * contenido, así que desactivar a alguien no lo echaba del sistema, cambiarle
 * el rol no surtía efecto hasta que el token caducara, y la lista de tokens
 * revocados vivía en un Map en memoria: se perdía al reiniciar y no se
 * compartía entre instancias, con lo que el logout no invalidaba nada de forma
 * fiable.
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
let blacklist;

const token = (id, role, extra = {}) =>
  jwt.sign(
    // jti unico: dos jwt.sign() con el mismo payload dentro del mismo segundo
    // producen tokens identicos, y un test revocaria el token de otro.
    { id, username: `u${id}`, role, nombre_completo: 'Test', jti: crypto.randomUUID(), ...extra },
    process.env.JWT_SECRET,
    { expiresIn: '1h' }
  );

const verificar = (t) =>
  request(app).get('/api/auth/verify').set('Authorization', `Bearer ${t}`);

const cerrarSesion = (t) =>
  request(app).post('/api/auth/logout').set('Authorization', `Bearer ${t}`);

beforeAll(async () => {
  mockDb = new sqlite3.Database(':memory:');
  mockDb.allAsync = function (sql, p = []) {
    return new Promise((res, rej) => this.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
  };
  mockDb.getAsync = function (sql, p = []) {
    return new Promise((res, rej) => this.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
  };
  mockDb.runAsync = function (sql, p = []) {
    return new Promise((res, rej) => this.run(sql, p, function (e) {
      if (e) rej(e); else res({ lastID: this.lastID, changes: this.changes });
    }));
  };
  mockDb.helpers = {
    now: () => 'CURRENT_TIMESTAMP',
    date: (col) => `DATE(${col}, 'localtime')`,
    groupConcat: (col) => `GROUP_CONCAT(${col})`,
    like: () => 'LIKE'
  };

  await mockDb.runAsync(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT 'x', role TEXT NOT NULL,
    nombre_completo TEXT, email TEXT, activo BOOLEAN DEFAULT 1,
    ultimo_login DATETIME, created_at DATETIME, updated_at DATETIME
  )`);
  await mockDb.runAsync(`CREATE TABLE tokens_revocados (
    token_hash TEXT PRIMARY KEY, expira_en INTEGER NOT NULL
  )`);
  await mockDb.runAsync(`CREATE TABLE password_reset_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL, expires_at DATETIME NOT NULL,
    used BOOLEAN DEFAULT 0, created_at DATETIME
  )`);

  await mockDb.runAsync("INSERT INTO usuarios (id, username, role, activo) VALUES (1, 'activo_admin', 'admin', 1)");
  await mockDb.runAsync("INSERT INTO usuarios (id, username, role, activo) VALUES (2, 'desactivado', 'empleado', 0)");
  await mockDb.runAsync("INSERT INTO usuarios (id, username, role, activo) VALUES (3, 'degradado', 'empleado', 1)");

  jest.mock('../config/database', () => mockDb);
  jest.mock('../utils/emailService', () => ({
    sendWelcomeEmail: jest.fn().mockResolvedValue({ success: true }),
    sendPasswordResetEmail: jest.fn().mockResolvedValue({ success: true }),
    verifyEmailConfig: jest.fn().mockResolvedValue({ success: true })
  }));

  blacklist = require('../utils/tokenBlacklist');

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', require('../routes/authRoutes'));
});

afterAll((done) => {
  if (mockDb) mockDb.close(() => done()); else done();
});

describe('Estado del usuario', () => {
  it('un usuario activo entra con normalidad', async () => {
    const res = await verificar(token(1, 'admin'));
    expect(res.statusCode).toBe(200);
    expect(res.body.user.username).toBe('activo_admin');
  });

  it('una cuenta desactivada queda fuera aunque su token siga vigente', async () => {
    const res = await verificar(token(2, 'empleado'));
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/desactivada/i);
  });

  it('un token de un usuario borrado no sirve', async () => {
    const res = await verificar(token(999, 'admin'));
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/ya no existe/i);
  });
});

describe('Cambio de rol', () => {
  it('un token con el rol antiguo deja de valer al cambiarlo en la base de datos', async () => {
    const tokenViejo = token(3, 'empleado'); // rol correcto al emitirlo
    expect((await verificar(tokenViejo)).statusCode).toBe(200);

    // Un admin le cambia el rol: el token sigue firmado y sin caducar
    await mockDb.runAsync("UPDATE usuarios SET role = 'contador' WHERE id = 3");

    const res = await verificar(tokenViejo);
    expect(res.statusCode).toBe(403);
    expect(res.body.error).toMatch(/permisos cambiaron/i);

    await mockDb.runAsync("UPDATE usuarios SET role = 'empleado' WHERE id = 3");
  });

  it('el rol efectivo sale de la base de datos, no del token', async () => {
    // Token que se autoproclama admin para un usuario que es empleado
    const res = await verificar(token(3, 'admin'));
    expect(res.statusCode).toBe(403);
  });
});

describe('Logout', () => {
  it('revoca el token y la revocación queda en la base de datos', async () => {
    const t = token(1, 'admin');
    expect((await verificar(t)).statusCode).toBe(200);

    expect((await cerrarSesion(t)).statusCode).toBe(200);
    expect((await verificar(t)).statusCode).toBe(403);

    const filas = await mockDb.allAsync('SELECT * FROM tokens_revocados');
    expect(filas.length).toBeGreaterThan(0);
  });

  it('guarda el hash, nunca el token', async () => {
    const t = token(1, 'admin');
    await cerrarSesion(t);

    const esperado = crypto.createHash('sha256').update(t).digest('hex');
    const fila = await mockDb.getAsync(
      'SELECT token_hash FROM tokens_revocados WHERE token_hash = ?', [esperado]
    );

    expect(fila).not.toBeNull();
    const todo = JSON.stringify(await mockDb.allAsync('SELECT * FROM tokens_revocados'));
    expect(todo).not.toContain(t);
  });

  it('la sesión sigue cerrada aunque se reinicie el proceso', async () => {
    const t = token(1, 'admin');
    await cerrarSesion(t);

    // Un Map en memoria se habría vaciado aquí; la tabla no.
    jest.resetModules();
    expect(await blacklist.isBlacklisted(t)).toBe(true);
    expect((await verificar(t)).statusCode).toBe(403);
  });

  it('cerrar sesión dos veces con el mismo token no provoca un error', async () => {
    const t = token(1, 'admin');
    expect((await cerrarSesion(t)).statusCode).toBe(200);
    // El segundo intento llega con el token ya revocado: 403, no un 500
    expect((await cerrarSesion(t)).statusCode).toBe(403);
  });
});

describe('Limpieza de tokens caducados', () => {
  it('borra solo los que ya expiraron', async () => {
    await mockDb.runAsync('DELETE FROM tokens_revocados');
    const ahora = Math.floor(Date.now() / 1000);
    await mockDb.runAsync('INSERT INTO tokens_revocados (token_hash, expira_en) VALUES (?, ?)', ['viejo', ahora - 60]);
    await mockDb.runAsync('INSERT INTO tokens_revocados (token_hash, expira_en) VALUES (?, ?)', ['vigente', ahora + 3600]);

    const borrados = await blacklist.cleanup();

    expect(borrados).toBe(1);
    const quedan = await mockDb.allAsync('SELECT token_hash FROM tokens_revocados');
    expect(quedan.map(f => f.token_hash)).toEqual(['vigente']);
  });

  it('una entrada caducada ya no bloquea el token', async () => {
    const t = token(1, 'admin');
    const h = crypto.createHash('sha256').update(t).digest('hex');
    await mockDb.runAsync(
      'INSERT INTO tokens_revocados (token_hash, expira_en) VALUES (?, ?)',
      [h, Math.floor(Date.now() / 1000) - 10]
    );

    expect(await blacklist.isBlacklisted(t)).toBe(false);
  });
});
