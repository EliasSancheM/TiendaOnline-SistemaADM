/**
 * Tests del alta de rescate del administrador (ADMIN_PASSWORD).
 *
 * Motivación real: en el despliegue a Railway se perdió la contraseña aleatoria
 * que el sistema imprime una sola vez al crear la base, y la consola SQL del
 * proveedor no permitía escribir. Sin una vía como esta, el panel queda
 * inaccesible salvo conectándose a la base con un cliente externo.
 */
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

process.env.DB_TYPE = 'sqlite';
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-key-for-testing-only';

let mockDb;
let bootstrapAdmin;

const usuarioDe = (username) =>
  mockDb.getAsync('SELECT * FROM usuarios WHERE username = ?', [username]);

beforeAll(async () => {
  mockDb = new sqlite3.Database(':memory:');
  mockDb.getAsync = function (sql, p = []) {
    return new Promise((res, rej) => this.get(sql, p, (e, r) => (e ? rej(e) : res(r))));
  };
  mockDb.allAsync = function (sql, p = []) {
    return new Promise((res, rej) => this.all(sql, p, (e, r) => (e ? rej(e) : res(r))));
  };
  mockDb.runAsync = function (sql, p = []) {
    return new Promise((res, rej) => this.run(sql, p, function (e) {
      if (e) rej(e); else res({ lastID: this.lastID, changes: this.changes });
    }));
  };

  await mockDb.runAsync(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL, role TEXT NOT NULL,
    nombre_completo TEXT, email TEXT, activo BOOLEAN DEFAULT 1, sesiones_validas_desde INTEGER DEFAULT 0
  )`);

  jest.mock('../config/database', () => mockDb);
  ({ bootstrapAdmin } = require('../utils/bootstrapAdmin'));
});

afterAll((done) => {
  if (mockDb) mockDb.close(() => done()); else done();
});

beforeEach(async () => {
  await mockDb.runAsync('DELETE FROM usuarios');
  delete process.env.ADMIN_PASSWORD;
  delete process.env.ADMIN_USERNAME;
});

describe('Sin ADMIN_PASSWORD', () => {
  it('no hace nada, que es el caso normal', async () => {
    const r = await bootstrapAdmin();
    expect(r.aplicado).toBe(false);
    expect(await usuarioDe('administrador')).toBeFalsy();
  });
});

describe('Creación', () => {
  it('crea el administrador cuando no existe', async () => {
    process.env.ADMIN_PASSWORD = 'unaClaveSegura123';

    const r = await bootstrapAdmin({ intentos: 1 });

    expect(r).toEqual({ aplicado: true, accion: 'creado' });
    const u = await usuarioDe('administrador');
    expect(u.role).toBe('admin');
    expect(bcrypt.compareSync('unaClaveSegura123', u.password_hash)).toBe(true);
  });

  it('respeta ADMIN_USERNAME si se define', async () => {
    process.env.ADMIN_PASSWORD = 'unaClaveSegura123';
    process.env.ADMIN_USERNAME = 'jefa';

    await bootstrapAdmin({ intentos: 1 });

    const u = await usuarioDe('jefa');
    expect(u).not.toBeNull();
    expect(u.role).toBe('admin');
  });
});

describe('Restablecimiento', () => {
  it('cambia la contraseña de un administrador que ya existe', async () => {
    await mockDb.runAsync(
      `INSERT INTO usuarios (username, password_hash, role, activo)
       VALUES ('administrador', ?, 'admin', 1)`,
      [bcrypt.hashSync('la-vieja-perdida', 12)]
    );

    process.env.ADMIN_PASSWORD = 'la-nueva-que-si-conozco';
    const r = await bootstrapAdmin({ intentos: 1 });

    expect(r).toEqual({ aplicado: true, accion: 'actualizado' });
    const u = await usuarioDe('administrador');
    expect(bcrypt.compareSync('la-nueva-que-si-conozco', u.password_hash)).toBe(true);
    expect(bcrypt.compareSync('la-vieja-perdida', u.password_hash)).toBe(false);
  });

  it('reactiva una cuenta desactivada y le devuelve el rol admin', async () => {
    await mockDb.runAsync(
      `INSERT INTO usuarios (username, password_hash, role, activo)
       VALUES ('administrador', 'x', 'empleado', 0)`
    );

    process.env.ADMIN_PASSWORD = 'unaClaveSegura123';
    await bootstrapAdmin({ intentos: 1 });

    const u = await usuarioDe('administrador');
    expect(u.role).toBe('admin');
    expect(u.activo == true).toBe(true); // SQLite guarda 1
  });

  it('no crea un duplicado al ejecutarse dos veces', async () => {
    process.env.ADMIN_PASSWORD = 'unaClaveSegura123';
    await bootstrapAdmin({ intentos: 1 });
    await bootstrapAdmin({ intentos: 1 });

    const filas = await mockDb.allAsync("SELECT id FROM usuarios WHERE username = 'administrador'");
    expect(filas).toHaveLength(1);
  });
});

describe('Validación', () => {
  it('rechaza una contraseña de menos de 8 caracteres', async () => {
    process.env.ADMIN_PASSWORD = 'corta';

    const r = await bootstrapAdmin({ intentos: 1 });

    expect(r.aplicado).toBe(false);
    expect(r.motivo).toMatch(/corta/i);
    expect(await usuarioDe('administrador')).toBeFalsy();
  });

  it('no revienta si la tabla todavía no existe', async () => {
    await mockDb.runAsync('DROP TABLE usuarios');
    process.env.ADMIN_PASSWORD = 'unaClaveSegura123';

    const r = await bootstrapAdmin({ intentos: 2, esperaMs: 10 });

    expect(r.aplicado).toBe(false);

    await mockDb.runAsync(`CREATE TABLE usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL, role TEXT NOT NULL,
      nombre_completo TEXT, email TEXT, activo BOOLEAN DEFAULT 1, sesiones_validas_desde INTEGER DEFAULT 0
    )`);
  });
});
