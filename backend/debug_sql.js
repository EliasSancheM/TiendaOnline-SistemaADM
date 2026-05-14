const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../database/panaderia.db');
const db = new sqlite3.Database(dbPath);

db.all("SELECT id, fecha, DATE(fecha, 'localtime') as date_localtime FROM facturas", (err, rows) => {
  if (err) console.error(err);
  console.log('Resultados:', JSON.stringify(rows, null, 2));
  db.close();
});
