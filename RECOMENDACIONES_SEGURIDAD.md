# Recomendaciones de Seguridad para ADM Panadería

## 🔒 Estado Actual de Seguridad

Actualmente la aplicación **NO tiene implementadas medidas de seguridad**, lo que representa riesgos significativos:

- ❌ Sin autenticación de usuarios
- ❌ Sin autorización/roles
- ❌ APIs completamente abiertas
- ❌ Sin validación de entrada de datos
- ❌ Sin encriptación de datos sensibles
- ❌ Sin logs de auditoría

## 🛡️ Recomendaciones Prioritarias

### 1. **AUTENTICACIÓN Y AUTORIZACIÓN** (Prioridad ALTA)

#### Implementar JWT (JSON Web Tokens)
```javascript
// Instalar dependencias
npm install jsonwebtoken bcryptjs express-rate-limit

// Crear middleware de autenticación
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Token de acceso requerido' });
  }
  
  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: 'Token inválido' });
    req.user = user;
    next();
  });
};
```

#### Sistema de Roles Recomendado
- **Administrador**: Acceso completo
- **Empleado**: Solo lectura de clientes, gestión de pedidos
- **Contador**: Solo acceso a facturas y reportes

### 2. **VALIDACIÓN DE DATOS** (Prioridad ALTA)

#### Implementar validación con Joi
```javascript
npm install joi

const Joi = require('joi');

// Esquema para validar clientes
const clienteSchema = Joi.object({
  nombre: Joi.string().min(2).max(100).required(),
  telefono: Joi.string().pattern(/^[0-9+\-\s()]+$/).max(20),
  email: Joi.string().email().optional(),
  direccion: Joi.string().max(200)
});

// Middleware de validación
const validateCliente = (req, res, next) => {
  const { error } = clienteSchema.validate(req.body);
  if (error) {
    return res.status(400).json({ error: error.details[0].message });
  }
  next();
};
```

### 3. **SEGURIDAD DE BASE DE DATOS** (Prioridad ALTA)

#### Prevenir Inyección SQL
```javascript
// ❌ MALO - Vulnerable a SQL injection
db.run(`SELECT * FROM clientes WHERE nombre = '${nombre}'`);

// ✅ BUENO - Usar parámetros preparados
db.run('SELECT * FROM clientes WHERE nombre = ?', [nombre]);
```

#### Encriptar Datos Sensibles
```javascript
const crypto = require('crypto');

// Encriptar información sensible como números de teléfono
const encrypt = (text) => {
  const cipher = crypto.createCipher('aes-256-cbc', process.env.ENCRYPTION_KEY);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
};
```

### 4. **CONFIGURACIÓN SEGURA** (Prioridad MEDIA)

#### Variables de Entorno
Crear archivo `.env` en backend:
```env
# Secretos
JWT_SECRET=tu_clave_secreta_muy_larga_y_compleja_aqui
ENCRYPTION_KEY=otra_clave_para_encriptacion
DB_ENCRYPTION_KEY=clave_para_base_de_datos

# Configuración
NODE_ENV=production
PORT=5000
CORS_ORIGIN=http://localhost:3000

# Rate limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

#### Configurar CORS correctamente
```javascript
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
};
app.use(cors(corsOptions));
```

### 5. **RATE LIMITING** (Prioridad MEDIA)

```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100, // máximo 100 requests por IP
  message: 'Demasiadas solicitudes, intenta más tarde'
});

app.use('/api/', limiter);
```

### 6. **LOGGING Y AUDITORÍA** (Prioridad MEDIA)

```javascript
const winston = require('winston');

const logger = winston.createLogger({
  level: 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    new winston.transports.File({ filename: 'logs/combined.log' })
  ]
});

// Middleware para logging
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url} - IP: ${req.ip}`);
  next();
});
```

### 7. **FRONTEND SECURITY** (Prioridad MEDIA)

#### Implementar Context para Autenticación
```javascript
// AuthContext.js
import React, { createContext, useContext, useState } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  return useContext(AuthContext);
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(localStorage.getItem('token'));

  const login = async (credentials) => {
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(credentials)
      });
      const data = await response.json();
      
      if (data.token) {
        setToken(data.token);
        setUser(data.user);
        localStorage.setItem('token', data.token);
      }
    } catch (error) {
      console.error('Error de login:', error);
    }
  };

  return (
    <AuthContext.Provider value={{ user, token, login }}>
      {children}
    </AuthContext.Provider>
  );
};
```

#### Proteger Rutas
```javascript
// ProtectedRoute.js
import { useAuth } from './AuthContext';
import { Navigate } from 'react-router-dom';

const ProtectedRoute = ({ children, requiredRole }) => {
  const { user, token } = useAuth();
  
  if (!token) {
    return <Navigate to="/login" />;
  }
  
  if (requiredRole && user?.role !== requiredRole) {
    return <Navigate to="/unauthorized" />;
  }
  
  return children;
};
```

### 8. **HTTPS Y CERTIFICADOS** (Prioridad BAJA para desarrollo)

```javascript
// Para producción, usar HTTPS
const https = require('https');
const fs = require('fs');

if (process.env.NODE_ENV === 'production') {
  const options = {
    key: fs.readFileSync('path/to/private-key.pem'),
    cert: fs.readFileSync('path/to/certificate.pem')
  };
  
  https.createServer(options, app).listen(443, () => {
    console.log('Servidor HTTPS corriendo en puerto 443');
  });
}
```

## 📋 Plan de Implementación Sugerido

### Fase 1 (Crítica - 1-2 semanas)
1. ✅ Implementar autenticación JWT
2. ✅ Crear sistema de usuarios y roles
3. ✅ Validación de datos con Joi
4. ✅ Proteger todas las rutas API

### Fase 2 (Importante - 2-3 semanas)
1. ✅ Rate limiting
2. ✅ Logging y auditoría
3. ✅ Encriptación de datos sensibles
4. ✅ Configuración segura de CORS

### Fase 3 (Mejoras - 1-2 semanas)
1. ✅ Implementar frontend de login
2. ✅ Protección de rutas en React
3. ✅ Manejo de sesiones
4. ✅ Recuperación de contraseñas

## 🚨 Vulnerabilidades Críticas Actuales

1. **Acceso sin restricciones**: Cualquiera puede acceder a todas las APIs
2. **Datos no validados**: Posible inyección SQL y XSS
3. **Sin logs**: No hay trazabilidad de acciones
4. **Información sensible expuesta**: Datos de clientes sin protección
5. **Sin rate limiting**: Vulnerable a ataques de fuerza bruta

## 💡 Recomendaciones Adicionales

- **Backups regulares** de la base de datos
- **Monitoreo** de la aplicación en producción
- **Actualizaciones** regulares de dependencias
- **Pruebas de penetración** periódicas
- **Capacitación** del equipo en seguridad

---

**¿Quieres que implemente alguna de estas medidas de seguridad?** 

Recomiendo empezar con la **Fase 1** (autenticación y validación) ya que son las más críticas para proteger la aplicación.