const sqlite3 = require('sqlite3').verbose();
const { Pool } = require('pg');
const path = require('path');
require('dotenv').config();

// 1. Obtener la DATABASE_URL desde los argumentos o variables de entorno
const connectionString = process.argv[2] || process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ Error: Debes proporcionar la DATABASE_URL de PostgreSQL.');
  console.error('Uso: node migrate_sqlite_to_pg.js "postgresql://usuario:clave@host:puerto/bd"');
  process.exit(1);
}

// 2. Conectar a SQLite
const sqliteDbPath = path.join(__dirname, '../database/panaderia.db');
console.log(`📂 Conectando a SQLite local en: ${sqliteDbPath}`);
const sqliteDb = new sqlite3.Database(sqliteDbPath, (err) => {
  if (err) {
    console.error('❌ Error al conectar a SQLite:', err.message);
    process.exit(1);
  }
});

// Promisificar consulta SQLite
const sqliteAll = (sql, params = []) => {
  return new Promise((resolve, reject) => {
    sqliteDb.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
};

// 3. Conectar a PostgreSQL en Railway
console.log('🔌 Conectando a PostgreSQL en Railway (con SSL habilitado)...');
const pgPool = new Pool({
  connectionString,
  ssl: {
    rejectUnauthorized: false
  }
});

async function runMigration() {
  let pgClient;
  try {
    pgClient = await pgPool.connect();
    console.log('✅ Conexión exitosa a PostgreSQL en Railway');

    // 4. Crear estructura de tablas en PostgreSQL
    console.log('🛠️ Creando estructura de tablas en PostgreSQL si no existen...');
    
    await pgClient.query(`CREATE TABLE IF NOT EXISTS clientes (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      telefono TEXT,
      direccion TEXT,
      email TEXT,
      rut TEXT,
      giro TEXT,
      fecha_registro TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await pgClient.query(`CREATE TABLE IF NOT EXISTS usuarios (
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

    await pgClient.query(`CREATE TABLE IF NOT EXISTS productos (
      id SERIAL PRIMARY KEY,
      nombre TEXT NOT NULL,
      precio REAL NOT NULL,
      descripcion TEXT,
      imagen_url TEXT
    )`);

    await pgClient.query(`CREATE TABLE IF NOT EXISTS pedidos (
      id SERIAL PRIMARY KEY,
      cliente_id INTEGER REFERENCES clientes(id),
      fecha DATE NOT NULL,
      periodo TEXT CHECK(periodo IN ('mañana', 'tarde')) NOT NULL,
      estado TEXT DEFAULT 'pendiente',
      total REAL,
      notas TEXT,
      fecha_creacion TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    await pgClient.query(`CREATE TABLE IF NOT EXISTS detalles_pedido (
      id SERIAL PRIMARY KEY,
      pedido_id INTEGER REFERENCES pedidos(id) ON DELETE CASCADE,
      producto_id INTEGER REFERENCES productos(id),
      cantidad INTEGER NOT NULL,
      precio_unitario REAL NOT NULL,
      subtotal REAL NOT NULL
    )`);

    await pgClient.query(`CREATE TABLE IF NOT EXISTS facturas (
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

    await pgClient.query(`CREATE TABLE IF NOT EXISTS factura_pedidos (
      id SERIAL PRIMARY KEY,
      factura_id INTEGER NOT NULL REFERENCES facturas(id) ON DELETE CASCADE,
      pedido_id INTEGER NOT NULL REFERENCES pedidos(id)
    )`);

    await pgClient.query(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES usuarios(id),
      token TEXT UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )`);

    console.log('✅ Estructura de tablas verificada.');

    // Iniciar transacción de migración
    await pgClient.query('BEGIN');

    // 5. Migrar CLIENTES
    console.log('📦 Migrando tabla "clientes"...');
    const clientes = await sqliteAll('SELECT * FROM clientes');
    for (const c of clientes) {
      await pgClient.query(
        `INSERT INTO clientes (id, nombre, telefono, direccion, email, fecha_registro) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (id) DO UPDATE SET 
           nombre = EXCLUDED.nombre, telefono = EXCLUDED.telefono, 
           direccion = EXCLUDED.direccion, email = EXCLUDED.email`,
        [c.id, c.nombre, c.telefono, c.direccion, c.email, c.fecha_registro]
      );
    }
    console.log(`   - ${clientes.length} clientes migrados.`);

    // 6. Migrar USUARIOS
    console.log('📦 Migrando tabla "usuarios"...');
    const usuarios = await sqliteAll('SELECT * FROM usuarios');
    for (const u of usuarios) {
      await pgClient.query(
        `INSERT INTO usuarios (id, username, password_hash, role, nombre_completo, email, activo, ultimo_login, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) 
         ON CONFLICT (id) DO UPDATE SET 
           username = EXCLUDED.username, password_hash = EXCLUDED.password_hash, 
           role = EXCLUDED.role, nombre_completo = EXCLUDED.nombre_completo, email = EXCLUDED.email`,
        [u.id, u.username, u.password_hash, u.role, u.nombre_completo, u.email, u.activo, u.ultimo_login, u.created_at, u.updated_at]
      );
    }
    console.log(`   - ${usuarios.length} usuarios migrados.`);

    // 7. Migrar PRODUCTOS
    console.log('📦 Migrando tabla "productos"...');
    const productos = await sqliteAll('SELECT * FROM productos');
    for (const p of productos) {
      await pgClient.query(
        `INSERT INTO productos (id, nombre, precio, descripcion, imagen_url) 
         VALUES ($1, $2, $3, $4, $5) 
         ON CONFLICT (id) DO UPDATE SET 
           nombre = EXCLUDED.nombre, precio = EXCLUDED.precio, 
           descripcion = EXCLUDED.descripcion, imagen_url = EXCLUDED.imagen_url`,
        [p.id, p.nombre, p.precio, p.descripcion, p.imagen_url || null]
      );
    }
    console.log(`   - ${productos.length} productos migrados.`);

    // 8. Migrar PEDIDOS
    console.log('📦 Migrando tabla "pedidos"...');
    const pedidos = await sqliteAll('SELECT * FROM pedidos');
    for (const ped of pedidos) {
      await pgClient.query(
        `INSERT INTO pedidos (id, cliente_id, fecha, periodo, estado, total, notas, fecha_creacion) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) 
         ON CONFLICT (id) DO UPDATE SET 
           cliente_id = EXCLUDED.cliente_id, fecha = EXCLUDED.fecha, 
           periodo = EXCLUDED.periodo, estado = EXCLUDED.estado, 
           total = EXCLUDED.total, notas = EXCLUDED.notas`,
        [ped.id, ped.cliente_id, ped.fecha, ped.periodo, ped.estado, ped.total, ped.notas, ped.fecha_creacion]
      );
    }
    console.log(`   - ${pedidos.length} pedidos migrados.`);

    // 9. Migrar DETALLES_PEDIDO
    console.log('📦 Migrando tabla "detalles_pedido"...');
    const detalles = await sqliteAll('SELECT * FROM detalles_pedido');
    for (const d of detalles) {
      await pgClient.query(
        `INSERT INTO detalles_pedido (id, pedido_id, producto_id, cantidad, precio_unitario, subtotal) 
         VALUES ($1, $2, $3, $4, $5, $6) 
         ON CONFLICT (id) DO NOTHING`,
        [d.id, d.pedido_id, d.producto_id, d.cantidad, d.precio_unitario, d.subtotal]
      );
    }
    console.log(`   - ${detalles.length} detalles de pedidos migrados.`);

    // 10. Migrar FACTURAS
    console.log('📦 Migrando tabla "facturas"...');
    const facturas = await sqliteAll('SELECT * FROM facturas');
    for (const f of facturas) {
      await pgClient.query(
        `INSERT INTO facturas (id, cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado, notas, created_at, updated_at) 
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) 
         ON CONFLICT (id) DO UPDATE SET 
           cliente_id = EXCLUDED.cliente_id, numero_factura = EXCLUDED.numero_factura, 
           fecha = EXCLUDED.fecha, subtotal = EXCLUDED.subtotal, impuestos = EXCLUDED.impuestos, 
           total = EXCLUDED.total, estado = EXCLUDED.estado`,
        [f.id, f.cliente_id, f.numero_factura, f.fecha, f.subtotal, f.impuestos, f.total, f.estado, f.notas, f.created_at, f.updated_at]
      );
    }
    console.log(`   - ${facturas.length} facturas migradas.`);

    // 11. Migrar FACTURA_PEDIDOS (junction table)
    console.log('📦 Migrando tabla "factura_pedidos"...');
    const facturaPedidos = await sqliteAll('SELECT * FROM factura_pedidos');
    for (const fp of facturaPedidos) {
      await pgClient.query(
        `INSERT INTO factura_pedidos (id, factura_id, pedido_id) 
         VALUES ($1, $2, $3) 
         ON CONFLICT (id) DO NOTHING`,
        [fp.id, fp.factura_id, fp.pedido_id]
      );
    }
    console.log(`   - ${facturaPedidos.length} enlaces de facturas-pedidos migrados.`);

    // 12. Resetear las secuencias de IDs SERIAL en PostgreSQL para evitar colisiones
    console.log('🔄 Reseteando secuencias de ID en PostgreSQL...');
    const tablesWithSerial = ['clientes', 'usuarios', 'productos', 'pedidos', 'detalles_pedido', 'facturas', 'factura_pedidos'];
    for (const table of tablesWithSerial) {
      const maxIdResult = await pgClient.query(`SELECT MAX(id) as max_id FROM ${table}`);
      const maxId = maxIdResult.rows[0].max_id;
      if (maxId) {
        await pgClient.query(`SELECT setval('${table}_id_seq', $1)`, [maxId]);
        console.log(`   - Secuencia '${table}_id_seq' reseteada a ${maxId}.`);
      }
    }

    // Confirmar transacción
    await pgClient.query('COMMIT');
    console.log('🎉 ¡MIGRACIÓN COMPLETADA EXITOSAMENTE! Todos los datos están en PostgreSQL en la nube.');

  } catch (error) {
    if (pgClient) {
      await pgClient.query('ROLLBACK');
    }
    console.error('❌ Error crítico durante la migración:', error);
  } finally {
    if (pgClient) {
      pgClient.release();
    }
    sqliteDb.close();
    await pgPool.end();
  }
}

runMigration();
