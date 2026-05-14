# 🌐 Acceso a ADM Panadería desde la Red

## 📋 Configuración Completada

La aplicación ADM Panadería ha sido configurada para ser accesible desde cualquier dispositivo en la red local.

## 🌐 URLs de Acceso

### Acceso Local (mismo equipo)
- **Frontend:** http://localhost:3000
- **Backend API:** http://localhost:5000

### Acceso desde la Red Local
**Opción 1 (Red principal):**
- **Frontend:** http://192.168.100.17:3000
- **Backend API:** http://192.168.100.17:5000

**Opción 2 (Red alternativa):**
- **Frontend:** http://25.39.120.143:3000
- **Backend API:** http://25.39.120.143:5000

> **Nota:** La IP `25.39.120.143` es la IP actual de tu equipo en la red. Esta IP puede cambiar si reinicias el router o el equipo.

## 📱 Cómo Acceder desde Otros Dispositivos

### 1. Desde la misma red WiFi/LAN:
- Conecta tu dispositivo (móvil, tablet, otra PC) a la misma red WiFi
- Abre el navegador web
- Visita: `http://25.39.120.143:3000`

### 2. Verificar la IP actual:
Si la aplicación no carga, la IP puede haber cambiado. Para verificar:

**En Windows:**
```cmd
ipconfig
```
Busca la "Dirección IPv4" en la sección de tu adaptador de red.

**En el servidor:**
Cuando inicies el servidor backend, verás:
```
Servidor corriendo en:
  - Local:   http://localhost:5000
  - Red:     http://[TU_IP]:5000
```

## 🔒 Configuración de Firewall

Si no puedes acceder desde otros dispositivos, verifica:

### Windows Defender Firewall:
1. Abre "Windows Defender Firewall"
2. Clic en "Permitir una aplicación o característica a través de Windows Defender Firewall"
3. Busca "Node.js" y asegúrate de que esté marcado para "Red privada"
4. Si no aparece, clic en "Cambiar configuración" > "Permitir otra aplicación" > Buscar `node.exe`

### Puertos utilizados:
- **Frontend:** Puerto 3000
- **Backend:** Puerto 5000

## 🌍 Acceso desde Internet (Opcional)

Para acceder desde fuera de tu red local:

### 1. Configurar Port Forwarding en tu Router:
- Accede a la configuración de tu router (usualmente http://192.168.1.1)
- Busca "Port Forwarding" o "Reenvío de puertos"
- Configura:
  - Puerto externo: 3000 → IP interna: 25.39.120.143 → Puerto interno: 3000
  - Puerto externo: 5000 → IP interna: 25.39.120.143 → Puerto interno: 5000

### 2. Obtener tu IP pública:
- Visita https://whatismyipaddress.com/
- Anota tu IP pública
- Accede con: `http://[TU_IP_PUBLICA]:3000`

⚠️ **Advertencia de Seguridad:** Exponer la aplicación a Internet sin autenticación adicional puede ser un riesgo de seguridad.

## 🔧 Solución de Problemas

### Problema: "No se puede conectar"
**Soluciones:**
1. Verifica que ambos dispositivos estén en la misma red
2. Confirma que el firewall permita las conexiones
3. Verifica que la IP sea correcta
4. Reinicia los servidores si es necesario

### Problema: "CORS Error"
**Solución:** La aplicación está configurada para permitir conexiones desde cualquier origen en desarrollo. Si persiste el error, verifica que ambos servidores estén ejecutándose.

### Problema: "IP ha cambiado"
**Solución:** 
1. Reinicia los servidores
2. Verifica la nueva IP con `ipconfig`
3. Actualiza las URLs de acceso

## 📞 Comandos Útiles

### Iniciar servidores:
```bash
# Backend
cd backend
node server.js

# Frontend (en otra terminal)
cd frontend
npm start
```

### Verificar IP:
```cmd
ipconfig | findstr "IPv4"
```

### Verificar puertos en uso:
```cmd
netstat -an | findstr :3000
netstat -an | findstr :5000
```

---

✅ **Estado Actual:** Configuración completada y funcionando
🌐 **Acceso Local:** http://localhost:3000
🌍 **Acceso Red:** http://25.39.120.143:3000
📧 **Correo:** Configurado y funcionando
🔒 **Seguridad:** CORS configurado para desarrollo

---

*Última actualización: $(Get-Date)*