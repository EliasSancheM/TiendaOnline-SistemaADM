# ADM Panadería - Sistema de Gestión

Sistema completo de gestión para panadería con frontend en React y backend en Node.js.

## 🚀 Características

- **Gestión de Productos**: CRUD completo de productos de panadería
- **Sistema de Pedidos**: Creación y seguimiento de pedidos
- **Autenticación**: Sistema de login y registro de usuarios
- **Notificaciones**: Envío de emails automáticos
- **Responsive**: Interfaz adaptable a dispositivos móviles
- **Base de Datos**: SQLite para almacenamiento local

## 🛠️ Tecnologías

### Frontend
- React 18
- Material-UI (MUI)
- React Router
- Axios

### Backend
- Node.js
- Express.js
- SQLite3
- Nodemailer
- JWT Authentication
- Winston (Logging)

## 📋 Requisitos Previos

- Node.js (versión 14 o superior)
- npm o yarn
- Git

## 🔧 Instalación

### 1. Clonar el repositorio
```bash
git clone <URL_DEL_REPOSITORIO>
cd ADMPanaderia
```

### 2. Instalar dependencias del backend
```bash
cd backend
npm install
```

### 3. Instalar dependencias del frontend
```bash
cd ../frontend
npm install
```

### 4. Configurar variables de entorno

#### Backend (.env)
```env
PORT=5000
JWT_SECRET=tu_jwt_secret_aqui
EMAIL_USER=tu_email@gmail.com
EMAIL_PASS=tu_app_password_gmail
```

#### Frontend (.env)
```env
REACT_APP_API_URL=http://localhost:5000
```

### 5. Inicializar la base de datos
```bash
cd backend
node init_database.js
node insert_productos.js
```

## 🚀 Uso

### Desarrollo

#### Iniciar el backend
```bash
cd backend
npm start
# o
node server.js
```

#### Iniciar el frontend
```bash
cd frontend
npm start
```

La aplicación estará disponible en:
- Frontend: http://localhost:3000
- Backend API: http://localhost:5000

### Producción

Para despliegue en producción, consulta la [Guía de Hosting](GUIA_HOSTING_SERVIDOR.md).

## 🌐 Acceso desde la Red

Para acceder desde otros dispositivos en la red local:

1. Ejecuta `configurar_firewall.bat` como administrador
2. Usa la IP de tu máquina en lugar de localhost
3. Consulta [ACCESO_RED.md](ACCESO_RED.md) para más detalles

## 📁 Estructura del Proyecto

```
ADMPanaderia/
├── backend/
│   ├── database/           # Base de datos SQLite
│   ├── logs/              # Archivos de log
│   ├── utils/             # Utilidades (email, logger)
│   ├── server.js          # Servidor principal
│   └── package.json
├── frontend/
│   ├── public/
│   ├── src/
│   │   ├── components/    # Componentes React
│   │   ├── contexts/      # Context API
│   │   ├── pages/         # Páginas principales
│   │   └── config/        # Configuración API
│   └── package.json
├── docs/                  # Documentación
└── README.md
```

## 🔐 Configuración de Email

Para habilitar las notificaciones por email:

1. Consulta [CONFIGURACION_GMAIL.md](CONFIGURACION_GMAIL.md)
2. Configura las variables de entorno en el backend
3. Reinicia el servidor

## 🛡️ Seguridad

- Las contraseñas se almacenan hasheadas
- JWT para autenticación
- Variables de entorno para datos sensibles
- Validación de datos en frontend y backend

Consulta [RECOMENDACIONES_SEGURIDAD.md](RECOMENDACIONES_SEGURIDAD.md) para más información.

## 🐛 Solución de Problemas

### Problemas comunes:

1. **Error de conexión a la base de datos**
   - Verifica que el archivo `panaderia.db` existe
   - Ejecuta `node init_database.js`

2. **Error de CORS**
   - Verifica la configuración de `REACT_APP_API_URL`
   - Reinicia ambos servidores

3. **No se pueden enviar emails**
   - Verifica la configuración de Gmail
   - Revisa las variables de entorno

## 📝 Scripts Disponibles

### Backend
- `npm start`: Inicia el servidor
- `node init_database.js`: Inicializa la base de datos
- `node insert_productos.js`: Inserta productos de ejemplo

### Frontend
- `npm start`: Inicia el servidor de desarrollo
- `npm run build`: Construye la aplicación para producción
- `npm test`: Ejecuta las pruebas

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto está bajo la Licencia MIT - ver el archivo [LICENSE](LICENSE) para detalles.

## 📞 Contacto

Para soporte o consultas, contacta al desarrollador.

## 🔄 Changelog

### v1.0.0
- Sistema básico de gestión de productos
- Autenticación de usuarios
- Sistema de pedidos
- Notificaciones por email
- Interfaz responsive

---

**Desarrollado con ❤️ para la gestión eficiente de panaderías**