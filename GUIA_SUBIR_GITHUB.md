# 📚 Guía para Subir el Código a GitHub

## ✅ Estado Actual

✅ **Repositorio Git inicializado**  
✅ **Archivos agregados y commit realizado**  
✅ **Archivo .gitignore configurado**  
✅ **README.md creado**  

## 🚀 Pasos para Subir a GitHub

### 1. Crear Repositorio en GitHub

1. Ve a [GitHub.com](https://github.com) e inicia sesión
2. Haz clic en el botón **"New"** o **"+"** → **"New repository"**
3. Configura el repositorio:
   - **Repository name**: `ADM-Panaderia` (o el nombre que prefieras)
   - **Description**: `Sistema completo de gestión para panadería con React y Node.js`
   - **Visibility**: Elige **Public** o **Private**
   - ❌ **NO marques** "Add a README file" (ya tenemos uno)
   - ❌ **NO marques** "Add .gitignore" (ya tenemos uno)
   - ❌ **NO marques** "Choose a license"
4. Haz clic en **"Create repository"**

### 2. Conectar Repositorio Local con GitHub

Después de crear el repositorio, GitHub te mostrará comandos. Usa estos comandos en tu terminal:

```powershell
# Agregar el repositorio remoto (reemplaza <TU_USUARIO> con tu nombre de usuario)
& "C:\Program Files\Git\bin\git.exe" remote add origin https://github.com/<TU_USUARIO>/ADM-Panaderia.git

# Cambiar a la rama main (GitHub usa 'main' por defecto)
& "C:\Program Files\Git\bin\git.exe" branch -M main

# Subir el código a GitHub
& "C:\Program Files\Git\bin\git.exe" push -u origin main
```

### 3. Comandos Específicos para Tu Proyecto

Ejecuta estos comandos en PowerShell desde la carpeta `C:\Users\Elias\Desktop\ADMPanaderia`:

```powershell
# 1. Agregar repositorio remoto (REEMPLAZA <TU_USUARIO>)
& "C:\Program Files\Git\bin\git.exe" remote add origin https://github.com/<TU_USUARIO>/ADM-Panaderia.git

# 2. Cambiar a rama main
& "C:\Program Files\Git\bin\git.exe" branch -M main

# 3. Subir código
& "C:\Program Files\Git\bin\git.exe" push -u origin main
```

### 4. Autenticación

Cuando ejecutes el comando `push`, GitHub te pedirá autenticación:

#### Opción A: Personal Access Token (Recomendado)
1. Ve a GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)
2. Genera un nuevo token con permisos de `repo`
3. Usa tu **username** y el **token** como contraseña

#### Opción B: GitHub CLI
```powershell
# Instalar GitHub CLI (opcional)
winget install --id GitHub.cli

# Autenticarse
gh auth login
```

## 📋 Verificación

Después de subir el código:

1. ✅ Ve a tu repositorio en GitHub
2. ✅ Verifica que todos los archivos estén presentes
3. ✅ Confirma que el README.md se muestre correctamente
4. ✅ Revisa que los archivos sensibles (.env, database/) NO estén subidos

## 🔄 Comandos para Futuras Actualizaciones

Para subir cambios futuros:

```powershell
# 1. Agregar cambios
& "C:\Program Files\Git\bin\git.exe" add .

# 2. Hacer commit
& "C:\Program Files\Git\bin\git.exe" commit -m "Descripción de los cambios"

# 3. Subir cambios
& "C:\Program Files\Git\bin\git.exe" push
```

## 🛠️ Comandos Útiles

```powershell
# Ver estado del repositorio
& "C:\Program Files\Git\bin\git.exe" status

# Ver historial de commits
& "C:\Program Files\Git\bin\git.exe" log --oneline

# Ver repositorios remotos
& "C:\Program Files\Git\bin\git.exe" remote -v

# Ver diferencias
& "C:\Program Files\Git\bin\git.exe" diff
```

## 🚨 Archivos Excluidos (por .gitignore)

Estos archivos NO se subirán a GitHub (es correcto):
- `node_modules/` - Dependencias (se instalan con npm install)
- `.env` - Variables de entorno sensibles
- `*.db` - Base de datos local
- `logs/` - Archivos de log
- `planilla.pdf` - Archivo específico del proyecto
- `configurar_firewall.bat` - Script específico de Windows

## 📝 Notas Importantes

1. **Nunca subas archivos .env** - Contienen información sensible
2. **La base de datos no se sube** - Cada instalación debe crear su propia BD
3. **node_modules no se sube** - Se regenera con `npm install`
4. **Documenta bien los cambios** en los mensajes de commit

## 🆘 Solución de Problemas

### Error: "remote origin already exists"
```powershell
& "C:\Program Files\Git\bin\git.exe" remote remove origin
& "C:\Program Files\Git\bin\git.exe" remote add origin https://github.com/<TU_USUARIO>/ADM-Panaderia.git
```

### Error de autenticación
- Verifica tu username y token
- Asegúrate de que el token tenga permisos de `repo`

### Error: "failed to push some refs"
```powershell
& "C:\Program Files\Git\bin\git.exe" pull origin main --allow-unrelated-histories
& "C:\Program Files\Git\bin\git.exe" push -u origin main
```

---

## 🎉 ¡Listo!

Una vez completados estos pasos, tu código estará disponible en GitHub y podrás:
- Compartir el enlace del repositorio
- Colaborar con otros desarrolladores
- Usar servicios de hosting que se conecten a GitHub
- Tener un respaldo seguro de tu código

**¡Tu proyecto ADM Panadería estará listo para ser compartido con el mundo!** 🌟