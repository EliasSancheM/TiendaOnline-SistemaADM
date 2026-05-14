const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const dbPath = path.join(__dirname, '../database/panaderia.db');
const db = new sqlite3.Database(dbPath);

db.all('SELECT * FROM facturas LIMIT 5', (err, rows) => {
  if (err) {
    console.error(err);
    process.exit(1);
  }
  console.log('Facturas:', JSON.stringify(rows, null, 2));
  
  db.all('SELECT * FROM clientes LIMIT 5', (err, rows) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    console.log('Clientes:', JSON.stringify(rows, null, 2));
    db.close();
  });
});
