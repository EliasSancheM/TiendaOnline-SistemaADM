const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../database/panaderia.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run('ALTER TABLE clientes ADD COLUMN rut TEXT', (err) => {
    if (err) console.log('RUT column already exists or error:', err.message);
  });
  db.run('ALTER TABLE clientes ADD COLUMN giro TEXT', (err) => {
    if (err) console.log('GIRO column already exists or error:', err.message);
  });
  console.log('Migración de columnas RUT/GIRO completada.');
  db.close();
});
