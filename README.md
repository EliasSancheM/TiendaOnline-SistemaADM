# Sistema de Administración de Panadería

Este sistema permite administrar clientes y pedidos diarios de una panadería, con secciones para pedidos de mañana y tarde.

## Características

- Gestión de clientes
- Registro de pedidos diarios (mañana y tarde)
- Interfaz de usuario intuitiva
- Base de datos local

## Tecnologías utilizadas

- Frontend: React.js
- Backend: Node.js con Express
- Base de datos: SQLite

## Requisitos previos

- Node.js (versión 14.x o superior)
- npm (incluido con Node.js)

## Instalación

### 1. Clonar el repositorio

```
git clone <url-del-repositorio>
cd ADMPanaderia
```

### 2. Instalar Node.js

Si no tienes Node.js instalado:

1. Descarga Node.js desde [nodejs.org](https://nodejs.org/)
2. Instala siguiendo las instrucciones del instalador
3. Verifica la instalación ejecutando en PowerShell o CMD:
   ```
   node --version
   npm --version
   ```

### 3. Solucionar problemas de permisos de PowerShell

Si encuentras el error "la ejecución de scripts está deshabilitada en este sistema":

1. Abre PowerShell como administrador
2. Ejecuta el siguiente comando para permitir la ejecución de scripts:
   ```
   Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
   ```
3. Confirma el cambio escribiendo "S" cuando se te solicite

### 4. Instalar dependencias

**Para el backend:**
```
# Desde el directorio principal del proyecto
cd backend
npm install
```

**Para el frontend:**
```
# Desde el directorio principal del proyecto
cd frontend
npm install
```

**Nota:** Si ya estás dentro del directorio frontend y quieres ir al backend, debes volver primero al directorio principal:
```
cd ..
cd backend
```

### 5. Iniciar la aplicación

**Para iniciar el backend:**
```
# Asegúrate de estar en el directorio principal del proyecto
# Si no estás seguro, ejecuta: cd C:\Users\Elias\Desktop\ADMPanaderia
cd backend
npm start
```

**Para iniciar el frontend (en una nueva terminal):**
```
# Asegúrate de estar en el directorio principal del proyecto
# Si no estás seguro, ejecuta: cd C:\Users\Elias\Desktop\ADMPanaderia
cd frontend
npm start
```

La aplicación frontend debería abrirse automáticamente en tu navegador en http://localhost:3000

**Importante:** Debes tener ambos servicios (backend y frontend) ejecutándose simultáneamente para que la aplicación funcione correctamente.

## Estructura del proyecto

- `/backend`: Servidor API y lógica de negocio
- `/frontend`: Interfaz de usuario React
- `/database`: Archivos de base de datos SQLite

## Funcionalidades implementadas

- **Dashboard**: Vista general con estadísticas de clientes, pedidos y productos
- **Clientes**: Gestión completa de clientes (agregar, editar, eliminar, ver detalles)
- **Pedidos**: Gestión de pedidos diarios con distinción entre mañana y tarde
- **Productos**: Catálogo de productos con precios y detalles

# ADM-Panaderia
