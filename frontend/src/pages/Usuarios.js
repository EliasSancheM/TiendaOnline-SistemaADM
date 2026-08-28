/**
 * Gestión de las credenciales del personal.
 *
 * Antes no existía esta pantalla: el sistema separaba bien los roles pero no
 * daba forma de accionarlos. Crear una cuenta obligaba a llamar a la API a
 * mano, y desactivar a quien se iba, o devolver el acceso a quien perdía su
 * contraseña, exigía escribir en la base de datos.
 */
import React, { useState, useEffect, useCallback } from 'react';
import {
  Box, Paper, Typography, Button, Table, TableBody, TableCell, TableContainer,
  TableHead, TableRow, Chip, IconButton, Dialog, DialogTitle, DialogContent,
  DialogActions, TextField, MenuItem, Alert, Snackbar, Tooltip, CircularProgress,
  InputAdornment, Divider
} from '@mui/material';
import {
  PersonAdd, Key, Block, CheckCircle, Visibility, VisibilityOff, Lock
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { formatFecha } from '../utils/fechas';

const ROLES = [
  { valor: 'empleado', etiqueta: 'Empleado', ayuda: 'Clientes, pedidos y productos. No ve facturación.' },
  { valor: 'contador', etiqueta: 'Contador', ayuda: 'Solo facturación. No ve los datos personales de los clientes.' },
  { valor: 'admin', etiqueta: 'Administrador', ayuda: 'Acceso completo, incluida esta pantalla.' }
];

const etiquetaDeRol = (r) => (ROLES.find((x) => x.valor === r) || {}).etiqueta || r;

const NUEVO_VACIO = { username: '', password: '', nombre_completo: '', email: '', role: 'empleado' };

const Usuarios = () => {
  const { authenticatedFetch, user } = useAuth();

  const [usuarios, setUsuarios] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [aviso, setAviso] = useState(null);

  const [dialogoAlta, setDialogoAlta] = useState(false);
  const [nuevo, setNuevo] = useState(NUEVO_VACIO);
  const [verClave, setVerClave] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [errorFormulario, setErrorFormulario] = useState(null);

  const [dialogoClave, setDialogoClave] = useState(null); // usuario al que se le cambia
  const [claveNueva, setClaveNueva] = useState('');

  const [dialogoMiClave, setDialogoMiClave] = useState(false);
  const [miClave, setMiClave] = useState({ passwordActual: '', passwordNueva: '' });

  const cargar = useCallback(async () => {
    try {
      setCargando(true);
      setError(null);
      const res = await authenticatedFetch('/api/usuarios');
      if (!res.ok) throw new Error('No se pudo cargar la lista de usuarios');
      setUsuarios(await res.json());
    } catch (e) {
      setError(e.message);
    } finally {
      setCargando(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => { cargar(); }, [cargar]);

  /** Lee el mensaje del backend: es más concreto que cualquiera genérico. */
  const mensajeDe = async (res, porDefecto) => {
    try {
      const cuerpo = await res.json();
      return cuerpo.error || porDefecto;
    } catch (e) {
      return porDefecto;
    }
  };

  const crear = async () => {
    setGuardando(true);
    setErrorFormulario(null);
    try {
      const res = await authenticatedFetch('/api/usuarios', {
        method: 'POST',
        body: JSON.stringify({ ...nuevo, email: nuevo.email || undefined })
      });
      if (!res.ok) {
        setErrorFormulario(await mensajeDe(res, 'No se pudo crear el usuario'));
        return;
      }
      setDialogoAlta(false);
      setNuevo(NUEVO_VACIO);
      setAviso(`Cuenta creada. Entrega a ${nuevo.nombre_completo} su usuario y contraseña.`);
      cargar();
    } catch (e) {
      setErrorFormulario(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarEstado = async (u) => {
    try {
      const res = await authenticatedFetch(`/api/usuarios/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ activo: !u.activo })
      });
      if (!res.ok) {
        setError(await mensajeDe(res, 'No se pudo cambiar el estado'));
        return;
      }
      setAviso(u.activo ? `${u.username} ya no puede entrar.` : `${u.username} vuelve a tener acceso.`);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const cambiarRol = async (u, role) => {
    try {
      const res = await authenticatedFetch(`/api/usuarios/${u.id}`, {
        method: 'PATCH',
        body: JSON.stringify({ role })
      });
      if (!res.ok) {
        setError(await mensajeDe(res, 'No se pudo cambiar el rol'));
        return;
      }
      setAviso(`${u.username} ahora es ${etiquetaDeRol(role).toLowerCase()}.`);
      cargar();
    } catch (e) {
      setError(e.message);
    }
  };

  const asignarClave = async () => {
    setGuardando(true);
    setErrorFormulario(null);
    try {
      const res = await authenticatedFetch(`/api/usuarios/${dialogoClave.id}/password`, {
        method: 'POST',
        body: JSON.stringify({ password: claveNueva })
      });
      if (!res.ok) {
        setErrorFormulario(await mensajeDe(res, 'No se pudo cambiar la contraseña'));
        return;
      }
      setAviso(`Contraseña de ${dialogoClave.username} actualizada. Sus sesiones abiertas se cerraron.`);
      setDialogoClave(null);
      setClaveNueva('');
    } catch (e) {
      setErrorFormulario(e.message);
    } finally {
      setGuardando(false);
    }
  };

  const cambiarMiClave = async () => {
    setGuardando(true);
    setErrorFormulario(null);
    try {
      const res = await authenticatedFetch('/api/usuarios/mi-password', {
        method: 'POST',
        body: JSON.stringify(miClave)
      });
      if (!res.ok) {
        setErrorFormulario(await mensajeDe(res, 'No se pudo cambiar la contraseña'));
        return;
      }
      // Cambiar la propia contraseña invalida también la sesión en curso, así
      // que lo honesto es decirlo antes de que la aplicación empiece a fallar.
      setDialogoMiClave(false);
      setMiClave({ passwordActual: '', passwordNueva: '' });
      setAviso('Contraseña cambiada. Cierra sesión y entra de nuevo con la nueva.');
    } catch (e) {
      setErrorFormulario(e.message);
    } finally {
      setGuardando(false);
    }
  };

  if (cargando) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 2, mb: 3 }}>
        <Box sx={{ flexGrow: 1 }}>
          <Typography variant="h4" sx={{ fontWeight: 700 }}>Usuarios</Typography>
          <Typography variant="body2" color="text.secondary">
            Cuentas de acceso al panel. Los clientes de la tienda no necesitan ninguna.
          </Typography>
        </Box>
        <Button startIcon={<Lock />} onClick={() => { setErrorFormulario(null); setDialogoMiClave(true); }}>
          Mi contraseña
        </Button>
        <Button
          variant="contained"
          startIcon={<PersonAdd />}
          onClick={() => { setErrorFormulario(null); setDialogoAlta(true); }}
        >
          Nuevo usuario
        </Button>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}

      <Paper>
        <TableContainer sx={{ overflowX: 'auto' }}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Usuario</TableCell>
                <TableCell>Nombre</TableCell>
                <TableCell>Rol</TableCell>
                <TableCell>Estado</TableCell>
                <TableCell>Último acceso</TableCell>
                <TableCell align="right">Acciones</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {usuarios.map((u) => {
                const esYo = u.id === user?.id;
                return (
                  <TableRow key={u.id} hover sx={{ opacity: u.activo ? 1 : 0.55 }}>
                    <TableCell>
                      <strong>{u.username}</strong>
                      {esYo && <Chip label="tú" size="small" sx={{ ml: 1 }} />}
                    </TableCell>
                    <TableCell>{u.nombre_completo}</TableCell>
                    <TableCell>
                      <TextField
                        select
                        size="small"
                        value={u.role}
                        onChange={(e) => cambiarRol(u, e.target.value)}
                        variant="standard"
                        sx={{ minWidth: 140 }}
                      >
                        {ROLES.map((r) => (
                          <MenuItem key={r.valor} value={r.valor}>{r.etiqueta}</MenuItem>
                        ))}
                      </TextField>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={u.activo ? 'Activo' : 'Sin acceso'}
                        color={u.activo ? 'success' : 'default'}
                        size="small"
                        variant={u.activo ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell>
                      {u.ultimo_login ? formatFecha(u.ultimo_login, 'dd/MM/yyyy HH:mm') : 'Nunca'}
                    </TableCell>
                    <TableCell align="right">
                      <Tooltip title="Asignar una contraseña nueva">
                        <IconButton
                          size="small"
                          onClick={() => { setErrorFormulario(null); setClaveNueva(''); setDialogoClave(u); }}
                        >
                          <Key fontSize="small" />
                        </IconButton>
                      </Tooltip>
                      <Tooltip title={u.activo ? 'Quitar el acceso' : 'Devolver el acceso'}>
                        <IconButton size="small" onClick={() => cambiarEstado(u)}>
                          {u.activo
                            ? <Block fontSize="small" color="warning" />
                            : <CheckCircle fontSize="small" color="success" />}
                        </IconButton>
                      </Tooltip>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      <Alert severity="info" sx={{ mt: 3 }}>
        Quitar el acceso no borra a la persona ni su historial: deja de poder entrar
        de inmediato, aunque tuviera la sesión abierta. Es lo apropiado cuando
        alguien deja el trabajo, porque los pedidos que registró siguen siendo suyos.
      </Alert>

      {/* ── Alta ── */}
      <Dialog open={dialogoAlta} onClose={() => setDialogoAlta(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Nuevo usuario</DialogTitle>
        <DialogContent>
          {errorFormulario && <Alert severity="error" sx={{ mb: 2 }}>{errorFormulario}</Alert>}
          <TextField
            label="Usuario" fullWidth margin="normal" autoFocus
            value={nuevo.username}
            onChange={(e) => setNuevo({ ...nuevo, username: e.target.value.trim() })}
            helperText="Con el que iniciará sesión. Solo letras y números, sin espacios."
          />
          <TextField
            label="Nombre completo" fullWidth margin="normal"
            value={nuevo.nombre_completo}
            onChange={(e) => setNuevo({ ...nuevo, nombre_completo: e.target.value })}
          />
          <TextField
            label="Contraseña" fullWidth margin="normal"
            type={verClave ? 'text' : 'password'}
            value={nuevo.password}
            onChange={(e) => setNuevo({ ...nuevo, password: e.target.value })}
            helperText="Mínimo 8 caracteres, con al menos una letra y un número."
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setVerClave(!verClave)} edge="end">
                    {verClave ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
          <TextField
            label="Correo (opcional)" fullWidth margin="normal" type="email"
            value={nuevo.email}
            onChange={(e) => setNuevo({ ...nuevo, email: e.target.value.trim() })}
            helperText="Solo se usa para recuperar la contraseña por correo."
          />
          <Divider sx={{ my: 2 }} />
          <TextField
            select label="Rol" fullWidth
            value={nuevo.role}
            onChange={(e) => setNuevo({ ...nuevo, role: e.target.value })}
          >
            {ROLES.map((r) => (
              <MenuItem key={r.valor} value={r.valor}>
                <Box>
                  <Typography variant="body2">{r.etiqueta}</Typography>
                  <Typography variant="caption" color="text.secondary">{r.ayuda}</Typography>
                </Box>
              </MenuItem>
            ))}
          </TextField>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogoAlta(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={crear}
            disabled={guardando || !nuevo.username || !nuevo.password || !nuevo.nombre_completo}
          >
            Crear
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Contraseña de otra persona ── */}
      <Dialog open={!!dialogoClave} onClose={() => setDialogoClave(null)} maxWidth="xs" fullWidth>
        <DialogTitle>Contraseña de {dialogoClave?.username}</DialogTitle>
        <DialogContent>
          {errorFormulario && <Alert severity="error" sx={{ mb: 2 }}>{errorFormulario}</Alert>}
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            Se la tendrás que comunicar en persona. Sus sesiones abiertas se cerrarán.
          </Typography>
          <TextField
            label="Contraseña nueva" fullWidth autoFocus
            type={verClave ? 'text' : 'password'}
            value={claveNueva}
            onChange={(e) => setClaveNueva(e.target.value)}
            helperText="Mínimo 8 caracteres, con al menos una letra y un número."
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton onClick={() => setVerClave(!verClave)} edge="end">
                    {verClave ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              )
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogoClave(null)}>Cancelar</Button>
          <Button variant="contained" onClick={asignarClave} disabled={guardando || !claveNueva}>
            Cambiar
          </Button>
        </DialogActions>
      </Dialog>

      {/* ── Contraseña propia ── */}
      <Dialog open={dialogoMiClave} onClose={() => setDialogoMiClave(false)} maxWidth="xs" fullWidth>
        <DialogTitle>Cambiar mi contraseña</DialogTitle>
        <DialogContent>
          {errorFormulario && <Alert severity="error" sx={{ mb: 2 }}>{errorFormulario}</Alert>}
          <TextField
            label="Contraseña actual" fullWidth margin="normal" type="password" autoFocus
            value={miClave.passwordActual}
            onChange={(e) => setMiClave({ ...miClave, passwordActual: e.target.value })}
          />
          <TextField
            label="Contraseña nueva" fullWidth margin="normal" type="password"
            value={miClave.passwordNueva}
            onChange={(e) => setMiClave({ ...miClave, passwordNueva: e.target.value })}
            helperText="Mínimo 8 caracteres, con al menos una letra y un número."
          />
          <Alert severity="info" sx={{ mt: 2 }}>
            Al cambiarla se cierran todas tus sesiones, incluida esta.
          </Alert>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogoMiClave(false)}>Cancelar</Button>
          <Button
            variant="contained"
            onClick={cambiarMiClave}
            disabled={guardando || !miClave.passwordActual || !miClave.passwordNueva}
          >
            Cambiar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={!!aviso}
        autoHideDuration={6000}
        onClose={() => setAviso(null)}
        anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
      >
        <Alert severity="success" onClose={() => setAviso(null)}>{aviso}</Alert>
      </Snackbar>
    </Box>
  );
};

export default Usuarios;
