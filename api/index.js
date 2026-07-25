// Punto de entrada serverless para Vercel.
// Reutiliza la MISMA app Express del backend (server.js la exporta sin app.listen).
// Vercel enruta aquí todo lo que empiece con /api/* (ver vercel.json).
module.exports = require('../backend/server.js');
