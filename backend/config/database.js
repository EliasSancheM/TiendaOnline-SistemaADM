const path = require('path');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const logger = require('./logger');

// Autodetectar PostgreSQL si DATABASE_URL existe en el entorno (característico de Railway/Heroku)
const DB_TYPE = (process.env.DB_TYPE || (process.env.DATABASE_URL ? 'postgresql' : 'sqlite')).toLowerCase();

let db;

// ──────────────────────────────────────────────────
//  SQLite Adapter
// ──────────────────────────────────────────────────
function initSQLite() {
  let sqlite3;
  try {
    sqlite3 = require('sqlite3').verbose();
  } catch (err) {
    logger.error('❌ Error fatal: no se pudo cargar la librería nativa sqlite3 en este entorno:', err.message);
    throw new Error('SQLite no está disponible en este sistema (falta la compilación nativa de C++). Si estás en Railway o producción, asegúrate de tener vinculada la base de datos PostgreSQL.');
  }
  const dbPath = path.join(__dirname, '../../database/panaderia.db');

  const conn = new sqlite3.Database(dbPath, (err) => {
    if (err) {
      logger.error('Error al conectar a SQLite:', err.message);
    } else {
      logger.info('Conectado a la base de datos SQLite');
      conn.run('PRAGMA foreign_keys = ON');
      createTables(conn);
    }
  });
 
  // Promisified helpers
  conn.allAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.all(sql, params, (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  };

  conn.getAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.get(sql, params, (err, row) => {
        if (err) reject(err);
        else resolve(row);
      });
    });
  };

  conn.runAsync = function (sql, params = []) {
    return new Promise((resolve, reject) => {
      this.run(sql, params, function (err) {
        if (err) reject(err);
        else resolve({ lastID: this.lastID, changes: this.changes });
      });
    });
  };

  // Dialect helpers
  conn.helpers = {
    now: () => 'CURRENT_TIMESTAMP',
    date: (col) => `DATE(${col}, 'localtime')`,
    groupConcat: (col) => `GROUP_CONCAT(${col})`,
    // LIKE en SQLite ya ignora mayúsculas/minúsculas para ASCII; en PostgreSQL no.
    like: () => 'LIKE'
  };

  // SQLite transaction helper (using the same connection)
  conn.transaction = async function (callback) {
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

  return conn;
}

// ──────────────────────────────────────────────────
//  PostgreSQL Adapter
// ──────────────────────────────────────────────────
function initPostgreSQL() {
  const { Pool, types } = require('pg');

  // Devolver las columnas DATE como texto 'YYYY-MM-DD', igual que SQLite.
  //
  // Por defecto node-postgres convierte DATE (OID 1082) en un objeto Date de
  // JavaScript, y eso rompe el código escrito contra SQLite de dos formas:
  //   1. `pedido.fecha.substring(0, 10)` (dashboard-stats) lanza
  //      «substring is not a function» y tumba el panel de inicio.
  //   2. Un Date se serializa a JSON como '2026-08-24T00:00:00.000Z', y el
  //      frontend lo formatea en horario local: en Chile (UTC-4) mostraría el
  //      día anterior en pedidos y facturas.
  // Fijando el parser, ambos motores entregan exactamente el mismo valor y no
  // hace falta código condicional en las rutas.
  types.setTypeParser(1082, (value) => value);

  // COUNT(*) devuelve BIGINT (OID 20) y node-postgres lo entrega como texto para
  // no perder precisión, así que `pagination.total` viajaba como "5" en vez de 5
  // y los totales del reporte de facturación se concatenaban en lugar de sumarse.
  // Los conteos de una panadería están muy lejos del límite seguro de JS.
  types.setTypeParser(20, (value) => parseInt(value, 10));

  const poolConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PG_HOST || 'localhost',
        port: parseInt(process.env.PG_PORT) || 5432,
        database: process.env.PG_DATABASE || 'panaderia',
        user: process.env.PG_USER || 'postgres',
        password: process.env.PG_PASSWORD || '',
      };

  // Configuración de SSL requerida para Railway, Heroku y la mayoría de nubes
  if (process.env.DATABASE_URL || process.env.PG_SSL === 'true') {
    poolConfig.ssl = {
      rejectUnauthorized: false
    };
  }

  const pool = new Pool({
    ...poolConfig,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

  pool.on('connect', () => {
    logger.info('Conectado a PostgreSQL');
  });

  pool.on('error', (err) => {
    logger.error('Error inesperado en pool PostgreSQL:', err);
  });

  // Dialect helpers
  const helpers = {
    now: () => DB_TYPE === 'sqlite' ? 'CURRENT_TIMESTAMP' : 'NOW()',
    date: (col) => DB_TYPE === 'sqlite' ? `DATE(${col}, 'localtime')` : `${col}::date`,
    groupConcat: (col) => DB_TYPE === 'sqlite' ? `GROUP_CONCAT(${col})` : `STRING_AGG(${col}::text, ',')`,
    // ILIKE para que buscar "pan" encuentre "Pan Amasado", igual que hace SQLite.
    like: () => 'ILIKE'
  };

  // Translate ? placeholders to $1, $2, ... for PostgreSQL
  function translateSQL(sql) {
    let counter = 0;
    return sql.replace(/\?/g, () => `$${++counter}`);
  }

  // Adapter that exposes the same interface as SQLite
  const adapter = {
    helpers,
    allAsync: async function (sql, params = []) {
      const result = await pool.query(translateSQL(sql), params);
      return result.rows;
    },

    getAsync: async function (sql, params = []) {
      const result = await pool.query(translateSQL(sql), params);
      return result.rows[0] || null;
    },

    runAsync: async function (sql, params = []) {
      // Basic transaction commands are handled via the pool which is not ideal,
      // but we keep this for simple non-nested calls.
      // Better to use the .transaction() method for real work.
      const pgSQL = translateSQL(sql);
      const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
      const finalSQL = isInsert && !pgSQL.toUpperCase().includes('RETURNING')
        ? pgSQL + ' RETURNING id'
        : pgSQL;

      const result = await pool.query(finalSQL, params);
      return {
        lastID: isInsert && result.rows[0] ? result.rows[0].id : 0,
        changes: result.rowCount
      };
    },

    // Real transaction support
    transaction: async function (callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        
        // Create a temporary adapter for this transaction
        const txAdapter = {
          helpers,
          allAsync: (sql, params = []) => client.query(translateSQL(sql), params).then(r => r.rows),
          getAsync: (sql, params = []) => client.query(translateSQL(sql), params).then(r => r.rows[0] || null),
          runAsync: async (sql, params = []) => {
            const pgSQL = translateSQL(sql);
            const isInsert = sql.trim().toUpperCase().startsWith('INSERT');
            const finalSQL = isInsert && !pgSQL.toUpperCase().includes('RETURNING')
              ? pgSQL + ' RETURNING id'
              : pgSQL;
            const result = await client.query(finalSQL, params);
            return {
              lastID: isInsert && result.rows[0] ? result.rows[0].id : 0,
              changes: result.rowCount
            };
          }
        };

        const result = await callback(txAdapter);
        await client.query('COMMIT');
        return result;
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      } finally {
        client.release();
      }
    },

    close: function (callback) {
      pool.end().then(() => {
        if (callback) callback(null);
      }).catch((err) => {
        if (callback) callback(err);
      });
    }
  };

  // Initialize tables
  createTablesPostgreSQL(pool).catch(err => {
    logger.error('Error creando tablas en PostgreSQL:', err);
  });

  return adapter;
}

// ──────────────────────────────────────────────────
//  Table Creation — SQLite
// ──────────────────────────────────────────────────
function createTables(conn) {
  conn.serialize(() => {
    // rut/giro deben existir aquí igual que en el esquema de PostgreSQL: los usa
    // el detalle de factura (`c.rut`). Si solo se añaden con migrate_rut.js, una
    // instalación nueva arranca con la tabla incompleta y ese endpoint responde 500.
    conn.run(`CREATE TABLE IF NOT EXISTS clientes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      telefono TEXT,
      direccion TEXT,
      email TEXT,
      rut TEXT,
      giro TEXT,
      fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
    )`, () => {
      // Bases de datos creadas antes de este cambio: añadir las columnas que falten.
      // SQLite no admite ADD COLUMN IF NOT EXISTS, así que se ignora el error de duplicado.
      conn.run(`ALTER TABLE clientes ADD COLUMN rut TEXT`, () => {});
      conn.run(`ALTER TABLE clientes ADD COLUMN giro TEXT`, () => {});
    });

    conn.run(`CREATE TABLE IF NOT EXISTS pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER,
      fecha DATE NOT NULL,
      periodo TEXT CHECK(periodo IN ('mañana', 'tarde')) NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      total REAL,
      notas TEXT,
      fecha_creacion DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    )`);

    conn.run(`CREATE TABLE IF NOT EXISTS usuarios (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'empleado' CHECK(role IN ('admin', 'empleado', 'contador')),
      nombre_completo TEXT,
      email TEXT,
      activo BOOLEAN DEFAULT 1,
      ultimo_login DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )`);

    conn.run(`CREATE TABLE IF NOT EXISTS productos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      descripcion TEXT,
      imagen_url TEXT
    )`, () => {
      conn.run(`ALTER TABLE productos ADD COLUMN imagen_url TEXT`, (err) => {
        // Ignore error if column already exists
      });
    });

    conn.run(`CREATE TABLE IF NOT EXISTS detalles_pedido (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      pedido_id INTEGER,
      producto_id INTEGER,
      cantidad INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL,
      FOREIGN KEY (pedido_id) REFERENCES pedidos (id) ON DELETE CASCADE,
      FOREIGN KEY (producto_id) REFERENCES productos (id)
    )`);

    conn.run(`CREATE TABLE IF NOT EXISTS facturas (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cliente_id INTEGER NOT NULL,
      numero_factura TEXT UNIQUE NOT NULL,
      fecha DATE NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      impuestos REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      notas TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (cliente_id) REFERENCES clientes (id)
    )`);

    conn.run(`CREATE TABLE IF NOT EXISTS factura_pedidos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      factura_id INTEGER NOT NULL,
      pedido_id INTEGER NOT NULL,
      FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE CASCADE,
      FOREIGN KEY (pedido_id) REFERENCES pedidos (id)
    )`, () => {
      // Un pedido solo puede estar en una factura. La regla ya se valida en
      // routes/facturasRoutes.js; el índice es la red de seguridad en la BD.
      conn.run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_factura_pedidos_pedido ON factura_pedidos(pedido_id)`, (err) => {
        if (err) {
          logger.warn(`No se pudo crear el índice único de factura_pedidos: ${err.message}`);
          logger.warn('Probablemente ya existan pedidos facturados más de una vez. Revísalos y vuelve a arrancar.');
        }
      });
    });

    // Tokens revocados en el logout. Persistido: antes era un Map en memoria,
    // que se perdia al reiniciar y no se comparte entre instancias.
    // expira_en es el claim exp del JWT (epoch en segundos): un entero, sin
    // diferencias de tipo entre motores.
    conn.run(`CREATE TABLE IF NOT EXISTS tokens_revocados (
      token_hash TEXT PRIMARY KEY,
      expira_en INTEGER NOT NULL
    )`);

    // Password reset tokens table
    conn.run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token TEXT UNIQUE NOT NULL,
      expires_at DATETIME NOT NULL,
      used BOOLEAN DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES usuarios (id)
    )`);

    // Create default admin user if none exists
    conn.get('SELECT COUNT(*) as count FROM usuarios WHERE role = "admin"', (err, row) => {
      if (!err && row.count === 0) {
        // Generar contraseña aleatoria segura en lugar de una hardcodeada
        const defaultPassword = crypto.randomBytes(12).toString('base64url');
        bcrypt.hash(defaultPassword, 12, (err, hash) => {
          if (!err) {
            conn.run(
              'INSERT INTO usuarios (username, password_hash, role, nombre_completo, email) VALUES (?, ?, ?, ?, ?)',
              ['administrador', hash, 'admin', 'Administrador', 'admin@panaderia.com'],
              function (err) {
                if (!err) {
                  logger.info('════════════════════════════════════════════════');
                  logger.info('  USUARIO ADMINISTRADOR CREADO');
                  logger.info(`  Usuario:    administrador`);
                  logger.info(`  Contraseña: ${defaultPassword}`);
                  logger.info('  ⚠️  GUARDA ESTA CONTRASEÑA, NO SE MOSTRARÁ DE NUEVO');
                  logger.info('════════════════════════════════════════════════');
                  console.log('\n════════════════════════════════════════════════');
                  console.log('  USUARIO ADMINISTRADOR CREADO');
                  console.log(`  Usuario:    administrador`);
                  console.log(`  Contraseña: ${defaultPassword}`);
                  console.log('  ⚠️  GUARDA ESTA CONTRASEÑA, NO SE MOSTRARÁ DE NUEVO');
                  console.log('════════════════════════════════════════════════\n');
                }
              }
            );
          }
        });
      }
    });
  });
}

// ──────────────────────────────────────────────────
//  Table Creation — PostgreSQL
// ──────────────────────────────────────────────────
async function createTablesPostgreSQL(pool) {
  const client = await pool.connect();
  try {
    await client.query(`CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      telefono TEXT,
      direccion TEXT,
      email TEXT,
      rut TEXT,
      giro TEXT,
      fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER REFERENCES clientes(id),
      fecha DATE NOT NULL,
      periodo TEXT CHECK(periodo IN ('mañana', 'tarde')) NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      total REAL,
      notas TEXT,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS usuarios (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT DEFAULT 'empleado' CHECK(role IN ('admin', 'empleado', 'contador')),
      nombre_completo TEXT,
      email TEXT,
      activo BOOLEAN DEFAULT true,
      ultimo_login TIMESTAMP,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      descripcion TEXT,
      imagen_url TEXT
    )`);
    try {
      await client.query(`ALTER TABLE productos ADD COLUMN IF NOT EXISTS imagen_url TEXT`);
    } catch (err) {
      // Ignore
    }

    await client.query(`CREATE TABLE IF NOT EXISTS detalles_pedido (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
      producto_id INTEGER REFERENCES productos(id),
      cantidad INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS facturas (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER NOT NULL REFERENCES clientes(id),
      numero_factura TEXT UNIQUE NOT NULL,
      fecha DATE NOT NULL,
      subtotal REAL NOT NULL DEFAULT 0,
      impuestos REAL NOT NULL DEFAULT 0,
      total REAL NOT NULL DEFAULT 0,
      estado TEXT NOT NULL DEFAULT 'pendiente',
      notas TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS factura_pedidos (
      id SERIAL PRIMARY KEY,
      factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id)
    )`);
    // Un pedido solo puede estar en una factura (ver routes/facturasRoutes.js).
    try {
      await client.query(`CREATE UNIQUE INDEX IF NOT EXISTS idx_factura_pedidos_pedido ON factura_pedidos(pedido_id)`);
    } catch (err) {
      logger.warn(`No se pudo crear el índice único de factura_pedidos: ${err.message}`);
      logger.warn('Probablemente ya existan pedidos facturados más de una vez. Revísalos y vuelve a arrancar.');
    }


    await client.query(`CREATE TABLE IF NOT EXISTS tokens_revocados (
      token_hash TEXT PRIMARY KEY,
      expira_en BIGINT NOT NULL
    )`);

    await client.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES usuarios(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    // Create default admin
    const adminCheck = await client.query("SELECT COUNT(*) as count FROM usuarios WHERE role = 'admin'");
    if (parseInt(adminCheck.rows[0].count) === 0) {
      // Generar contraseña aleatoria segura en lugar de una hardcodeada
      const defaultPassword = crypto.randomBytes(12).toString('base64url');
      const hash = await bcrypt.hash(defaultPassword, 12);
      await client.query(
        'INSERT INTO usuarios (username, password_hash, role, nombre_completo, email) VALUES ($1, $2, $3, $4, $5)',
        ['administrador', hash, 'admin', 'Administrador', 'admin@panaderia.com']
      );
      logger.info('════════════════════════════════════════════════');
      logger.info('  USUARIO ADMINISTRADOR CREADO (PostgreSQL)');
      logger.info(`  Usuario:    administrador`);
      logger.info(`  Contraseña: ${defaultPassword}`);
      logger.info('  ⚠️  GUARDA ESTA CONTRASEÑA, NO SE MOSTRARÁ DE NUEVO');
      logger.info('════════════════════════════════════════════════');
      console.log('\n════════════════════════════════════════════════');
      console.log('  USUARIO ADMINISTRADOR CREADO (PostgreSQL)');
      console.log(`  Usuario:    administrador`);
      console.log(`  Contraseña: ${defaultPassword}`);
      console.log('  ⚠️  GUARDA ESTA CONTRASEÑA, NO SE MOSTRARÁ DE NUEVO');
      console.log('════════════════════════════════════════════════\n');
    }

    logger.info('Tablas de PostgreSQL inicializadas correctamente');
  } finally {
    client.release();
  }
}

// ──────────────────────────────────────────────────
//  Initialize the correct adapter
// ──────────────────────────────────────────────────
if (DB_TYPE === 'postgresql' || DB_TYPE === 'postgres') {
  logger.info('Usando base de datos PostgreSQL');
  db = initPostgreSQL();
} else {
  // Evitar cargar SQLite en entornos de producción en la nube para prevenir errores de GLIBC / dependencias nativas
  if (process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT ||
      process.env.RAILWAY_STATIC_URL || process.env.RENDER) {
    logger.error('❌ ERROR CRÍTICO DE CONFIGURACIÓN: Se detectó un entorno de producción o nube (Railway/Render) pero NO se ha configurado la variable de entorno DATABASE_URL ni DB_TYPE=postgresql.');
    logger.error('👉 ACCIÓN REQUERIDA: Ingresa al panel de tu servicio en Railway, ve a la pestaña "Variables" y agrega:');
    logger.error('   1. DB_TYPE = postgresql');
    logger.error('   2. DATABASE_URL = ${{Postgres.DATABASE_URL}} (o el enlace de conexión de tu base de datos)');
    logger.error('   3. PG_SSL = true');
    throw new Error('Base de datos no configurada para producción. SQLite no está permitido en este entorno de nube.');
  }

  logger.info('Usando base de datos SQLite');
  db = initSQLite();
}

module.exports = db;
