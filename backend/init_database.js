const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const bcrypt = require('bcryptjs');

// Conectar a la base de datos SQLite
const dbPath = path.join(__dirname, '../database/panaderia.db');
const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error al conectar a la base de datos:', err.message);
  } else {
    console.log('Conectado a la base de datos SQLite');
    // Crear tablas si no existen
    db.serialize(() => {
      // Tabla de clientes
      db.run(`CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        telefono TEXT,
        direccion TEXT,
        email TEXT,
        fecha_registro DATETIME DEFAULT CURRENT_TIMESTAMP
      )`);

      // Tabla de pedidos
      db.run(`CREATE TABLE IF NOT EXISTS pedidos (
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

      // Tabla de usuarios
      db.run(`CREATE TABLE IF NOT EXISTS usuarios (
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

      // Tabla de productos
      db.run(`CREATE TABLE IF NOT EXISTS productos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL,
        precio REAL NOT NULL,
        descripcion TEXT
      )`);

      // Tabla de detalles de pedido
      db.run(`CREATE TABLE IF NOT EXISTS detalles_pedido (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        pedido_id INTEGER,
        producto_id INTEGER,
        cantidad INTEGER NOT NULL,
        precio_unitario REAL NOT NULL,
        subtotal REAL NOT NULL,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id),
        FOREIGN KEY (producto_id) REFERENCES productos (id)
      )`);

      // Tabla de facturas
      db.run(`CREATE TABLE IF NOT EXISTS facturas (
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

      // Tabla de relación facturas-pedidos
      db.run(`CREATE TABLE IF NOT EXISTS factura_pedidos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        factura_id INTEGER NOT NULL,
        pedido_id INTEGER NOT NULL,
        FOREIGN KEY (factura_id) REFERENCES facturas (id) ON DELETE CASCADE,
        FOREIGN KEY (pedido_id) REFERENCES pedidos (id)
      )`);

      // Crear usuario admin por defecto si no existe
      db.get('SELECT COUNT(*) as count FROM usuarios WHERE role = "admin"', (err, row) => {
        if (!err && row.count === 0) {
          const defaultPassword = 'panaderia2024';
          const saltRounds = 10;
          bcrypt.hash(defaultPassword, saltRounds, (err, hash) => {
            if (!err) {
              db.run(
                'INSERT INTO usuarios (username, password_hash, role, nombre_completo, email) VALUES (?, ?, ?, ?, ?)',
                ['administrador', hash, 'admin', 'Administrador', 'admin@panaderia.com'],
                function(err) {
                  if (!err) {
                    console.log('Usuario administrador creado - Username: administrador, Password: panaderia2024');
                  }
                }
              );
            }
          });
        }
      });

      // Insertar algunos productos de ejemplo
      const productosEjemplo = [
        { nombre: 'Pan Ciabatta', precio: 2500, descripcion: 'Pan artesanal tipo ciabatta' },
        { nombre: 'Pan Doblado', precio: 1800, descripcion: 'Pan tradicional doblado' },
        { nombre: 'Empanada de Pino', precio: 1200, descripcion: 'Empanada tradicional chilena' },
        { nombre: 'Pan Valdiviano', precio: 2200, descripcion: 'Pan especial valdiviano' },
        { nombre: 'Pan Amarillo', precio: 1500, descripcion: 'Pan dulce amarillo' }
      ];

      db.get('SELECT COUNT(*) as count FROM productos', (err, row) => {
        if (!err && row.count === 0) {
          productosEjemplo.forEach(producto => {
            db.run(
              'INSERT INTO productos (nombre, precio, descripcion) VALUES (?, ?, ?)',
              [producto.nombre, producto.precio, producto.descripcion],
              function(err) {
                if (!err) {
                  console.log(`Producto creado: ${producto.nombre}`);
                }
              }
            );
          });
        }
      });

      console.log('Base de datos inicializada correctamente');
      // db.close(); // Comentamos esto para evitar el cierre prematuro
    });
  }
});