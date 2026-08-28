/**
 * Tests de la administración de credenciales del personal.
 *
 * El hueco que cierran: el sistema tenía roles bien separados pero ningún mando
 * para accionarlos. Crear una cuenta exigía llamar a la API a mano, y
 * /api/auth/register fija el rol 'empleado' por código, así que no había forma
 * de nombrar a un segundo administrador. Desactivar a quien se va o devolver el
 * acceso a quien perdió su contraseña obligaba a escribir en la base de datos.
 */
const request = require('supertest');
const express = require('express');
const cookieParser = require('cookie-parser');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const sqlite3 = require('sqlite3').verbose();

process.env.JWT_SECRET = 'test-secret-key-for-testing-only';
process.env.DB_TYPE = 'sqlite';
process.env.NODE_ENV = 'test';

let app;
let mockDb;

const token = (id, role) => jwt.sign(
  { id, username: `u${id}`, role, nombre_completo: 'Test', jti: crypto.randomUUID() },
  process.env.JWT_SECRET,
  { expiresIn: '1h' }
);

let ADMIN;      // id 1
let EMPLEADO;   // id 2
let OTRO_ADMIN; // id 3, desactivado de partida

const como = (t) => ({
  get: (ruta) => request(app).get(ruta).set('Authorization', `Bearer ${t}`),
  post: (ruta, cuerpo) => request(app).post(ruta).set('Authorization', `Bearer ${t}`).send(cuerpo),
  patch: (ruta, cuerpo) => request(app).patch(ruta).set('Authorization', `Bearer ${t}`).send(cuerpo)
});

const usuarioDe = (username) =>
  mockDb.getAsync('SELECT * FROM usuarios WHERE username = ?', [username]);

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
  mockDb.helpers = { now: () => 'CURRENT_TIMESTAMP', date: (c) => `DATE(${c})`, like: () => 'LIKE' };

  await mockDb.runAsync(`CREATE TABLE usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL DEFAULT 'x', role TEXT NOT NULL,
    nombre_completo TEXT, email TEXT, activo BOOLEAN DEFAULT 1,
    sesiones_validas_desde INTEGER DEFAULT 0,
    ultimo_login DATETIME, created_at DATETIME, updated_at DATETIME
  )`);
  await mockDb.runAsync(`CREATE TABLE tokens_revocados (
    token_hash TEXT PRIMARY KEY, expira_en INTEGER NOT NULL
  )`);

  jest.mock('../config/database', () => mockDb);

  app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/usuarios', require('../routes/usuariosRoutes'));
  app.use('/api/auth', require('../routes/authRoutes'));

  ADMIN = token(1, 'admin');
  EMPLEADO = token(2, 'empleado');
  OTRO_ADMIN = token(3, 'admin');
});

afterAll((done) => {
  mockDb ? mockDb.close(() => done()) : done();
});

beforeEach(async () => {
  await mockDb.runAsync('DELETE FROM usuarios');
  await mockDb.runAsync(
    `INSERT INTO usuarios (id, username, password_hash, role, nombre_completo, activo)
     VALUES (1, 'jefa', ?, 'admin', 'La Jefa', 1)`,
    [bcrypt.hashSync('claveDeLaJefa1', 10)]
  );
  await mockDb.runAsync(
    `INSERT INTO usuarios (id, username, password_hash, role, nombre_completo, activo)
     VALUES (2, 'panadero', ?, 'empleado', 'El Panadero', 1)`,
    [bcrypt.hashSync('claveDelPana1', 10)]
  );
  await mockDb.runAsync(
    `INSERT INTO usuarios (id, username, password_hash, role, nombre_completo, activo)
     VALUES (3, 'suplente', 'x', 'admin', 'Admin Suplente', 0)`
  );
});

describe('Quién puede administrar cuentas', () => {
  it('un empleado no ve la lista del personal', async () => {
    const res = await como(EMPLEADO).get('/api/usuarios');
    expect(res.statusCode).toBe(403);
  });

  it('un empleado no puede crear cuentas', async () => {
    const res = await como(EMPLEADO).post('/api/usuarios', {
      username: 'colado', password: 'Clave1234', nombre_completo: 'Colado'
    });
    expect(res.statusCode).toBe(403);
    expect(await usuarioDe('colado')).toBeFalsy();
  });

  it('un empleado no puede ascenderse a admin', async () => {
    const res = await como(EMPLEADO).patch('/api/usuarios/2', { role: 'admin' });
    expect(res.statusCode).toBe(403);
    expect((await usuarioDe('panadero')).role).toBe('empleado');
  });

  it('sin sesión no se llega a ninguna parte', async () => {
    expect((await request(app).get('/api/usuarios')).statusCode).toBe(401);
  });
});

describe('Dar de alta al personal', () => {
  it('crea una cuenta de empleado, que es el caso normal', async () => {
    const res = await como(ADMIN).post('/api/usuarios', {
      username: 'nuevo', password: 'Clave1234', nombre_completo: 'Repartidor Nuevo'
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.role).toBe('empleado'); // por defecto, sin pedirlo

    const u = await usuarioDe('nuevo');
    expect(u.activo == true).toBe(true);
    expect(bcrypt.compareSync('Clave1234', u.password_hash)).toBe(true);
  });

  it('permite nombrar a otro administrador', async () => {
    // Lo que /api/auth/register no dejaba hacer: fijaba 'empleado' por código.
    const res = await como(ADMIN).post('/api/usuarios', {
      username: 'socia', password: 'Clave1234', nombre_completo: 'La Socia', role: 'admin'
    });

    expect(res.statusCode).toBe(201);
    expect((await usuarioDe('socia')).role).toBe('admin');
  });

  it('no guarda la contraseña en claro', async () => {
    await como(ADMIN).post('/api/usuarios', {
      username: 'otro', password: 'Clave1234', nombre_completo: 'Otro'
    });

    const u = await usuarioDe('otro');
    expect(u.password_hash).not.toBe('Clave1234');
    expect(u.password_hash).toMatch(/^\$2[aby]\$/); // bcrypt
  });

  it('rechaza un nombre de usuario repetido', async () => {
    const res = await como(ADMIN).post('/api/usuarios', {
      username: 'panadero', password: 'Clave1234', nombre_completo: 'Impostor'
    });
    expect(res.statusCode).toBe(409);
  });

  it('exige una contraseña con letras y números', async () => {
    const res = await como(ADMIN).post('/api/usuarios', {
      username: 'flojo', password: '12345678', nombre_completo: 'Sin Letras'
    });
    expect(res.statusCode).toBe(400);
    expect(await usuarioDe('flojo')).toBeFalsy();
  });

  it('rechaza un rol inventado', async () => {
    const res = await como(ADMIN).post('/api/usuarios', {
      username: 'dueno', password: 'Clave1234', nombre_completo: 'X', role: 'superadmin'
    });
    expect(res.statusCode).toBe(400);
  });

  it('no devuelve nunca el hash de la contraseña', async () => {
    const res = await como(ADMIN).get('/api/usuarios');
    expect(res.statusCode).toBe(200);
    for (const u of res.body) {
      expect(u.password_hash).toBeUndefined();
    }
  });
});

describe('Dar de baja a quien se va', () => {
  it('desactivar una cuenta le cierra el paso de inmediato', async () => {
    const res = await como(ADMIN).patch('/api/usuarios/2', { activo: false });
    expect(res.statusCode).toBe(200);

    // authMiddleware comprueba `activo` en cada petición: el token que ya
    // tuviera en la mano deja de servir sin esperar a que caduque.
    const suSesion = await request(app)
      .get('/api/auth/verify').set('Authorization', `Bearer ${EMPLEADO}`);
    expect(suSesion.statusCode).toBe(403);
  });

  it('y se le puede devolver el acceso', async () => {
    await como(ADMIN).patch('/api/usuarios/2', { activo: false });
    await como(ADMIN).patch('/api/usuarios/2', { activo: true });

    const suSesion = await request(app)
      .get('/api/auth/verify').set('Authorization', `Bearer ${EMPLEADO}`);
    expect(suSesion.statusCode).toBe(200);
  });
});

describe('No quedarse sin administradores', () => {
  // Sin esta salvaguarda, el único admin podía desactivarse o rebajarse a
  // empleado de un clic, y el acceso solo se recuperaba tocando la base de
  // datos o reiniciando el servidor con ADMIN_PASSWORD.
  it('el único admin activo no puede desactivarse a sí mismo', async () => {
    const res = await como(ADMIN).patch('/api/usuarios/1', { activo: false });

    expect(res.statusCode).toBe(409);
    expect(res.body.error).toMatch(/único administrador/i);
    expect((await usuarioDe('jefa')).activo == true).toBe(true);
  });

  it('tampoco puede rebajarse a empleado', async () => {
    const res = await como(ADMIN).patch('/api/usuarios/1', { role: 'empleado' });

    expect(res.statusCode).toBe(409);
    expect((await usuarioDe('jefa')).role).toBe('admin');
  });

  it('pero sí en cuanto hay otro admin activo', async () => {
    await como(ADMIN).patch('/api/usuarios/3', { activo: true }); // suplente al mando

    const res = await como(ADMIN).patch('/api/usuarios/1', { role: 'empleado' });

    expect(res.statusCode).toBe(200);
    expect((await usuarioDe('jefa')).role).toBe('empleado');
  });

  it('un admin desactivado no cuenta como respaldo', async () => {
    // El usuario 3 es admin pero está desactivado: no puede entrar, así que
    // dejar el sistema en sus manos es dejarlo sin nadie.
    const res = await como(ADMIN).patch('/api/usuarios/1', { activo: false });
    expect(res.statusCode).toBe(409);
  });
});

describe('Contraseñas', () => {
  it('un admin puede asignar una nueva a quien perdió la suya', async () => {
    const res = await como(ADMIN).post('/api/usuarios/2/password', { password: 'NuevaClave9' });
    expect(res.statusCode).toBe(200);

    const u = await usuarioDe('panadero');
    expect(bcrypt.compareSync('NuevaClave9', u.password_hash)).toBe(true);
  });

  it('al hacerlo se cierran las sesiones que esa persona tuviera abiertas', async () => {
    await como(ADMIN).post('/api/usuarios/2/password', { password: 'NuevaClave9' });

    const u = await usuarioDe('panadero');
    expect(Number(u.sesiones_validas_desde)).toBeGreaterThan(0);
  });

  it('cada cual puede cambiar la suya dando la actual', async () => {
    const res = await como(EMPLEADO).post('/api/usuarios/mi-password', {
      passwordActual: 'claveDelPana1',
      passwordNueva: 'MiClaveNueva1'
    });

    expect(res.statusCode).toBe(200);
    const u = await usuarioDe('panadero');
    expect(bcrypt.compareSync('MiClaveNueva1', u.password_hash)).toBe(true);
  });

  it('no se cambia sin acertar la actual', async () => {
    // Si alguien deja la sesión abierta en el ordenador del local, que no
    // pueda apropiarse de la cuenta.
    const res = await como(EMPLEADO).post('/api/usuarios/mi-password', {
      passwordActual: 'meLaInvento',
      passwordNueva: 'MiClaveNueva1'
    });

    expect(res.statusCode).toBe(400);
    const u = await usuarioDe('panadero');
    expect(bcrypt.compareSync('claveDelPana1', u.password_hash)).toBe(true);
  });

  it('un empleado no puede cambiar la contraseña de otra persona', async () => {
    const res = await como(EMPLEADO).post('/api/usuarios/1/password', { password: 'NuevaClave9' });

    expect(res.statusCode).toBe(403);
    const jefa = await usuarioDe('jefa');
    expect(bcrypt.compareSync('claveDeLaJefa1', jefa.password_hash)).toBe(true);
  });

  it("'mi-password' no se confunde con un identificador", async () => {
    // La ruta va antes que /:id/password; si se colara por ahí daría 404.
    const res = await como(EMPLEADO).post('/api/usuarios/mi-password', {
      passwordActual: 'claveDelPana1', passwordNueva: 'OtraMas123'
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('Usuario inexistente', () => {
  it('devuelve 404 al modificarlo', async () => {
    expect((await como(ADMIN).patch('/api/usuarios/999', { activo: false })).statusCode).toBe(404);
  });

  it('devuelve 404 al cambiarle la contraseña', async () => {
    expect((await como(ADMIN).post('/api/usuarios/999/password', { password: 'Clave1234' })).statusCode).toBe(404);
  });

  it('un id que no es número no revienta la consulta', async () => {
    expect((await como(ADMIN).patch('/api/usuarios/abc', { activo: false })).statusCode).toBe(404);
  });
});
