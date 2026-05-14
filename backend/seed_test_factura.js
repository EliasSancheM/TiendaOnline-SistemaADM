const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../database/panaderia.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  // 1. Actualizar cliente 1 con RUT y Giro
  db.run('UPDATE clientes SET rut = "76.123.456-7", giro = "VENTA DE PAN" WHERE id = 1');
  
  // 2. Crear una factura de prueba para el cliente 1
  const fecha = new Date().toISOString().split('T')[0];
  db.run(
    'INSERT INTO facturas (cliente_id, numero_factura, fecha, subtotal, impuestos, total, estado, notas) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    [1, 'F-1001', fecha, 10000, 1900, 11900, 'pendiente', 'Factura de prueba para integración SII'],
    function(err) {
      if (err) {
        console.error('Error creando factura:', err);
      } else {
        console.log('Factura de prueba creada con ID:', this.lastID);
      }
      db.close();
    }
  );
});
