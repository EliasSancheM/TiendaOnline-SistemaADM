import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Typography,
  TextField,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  IconButton,
  Snackbar,
  Alert,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

function Clientes() {
  const navigate = useNavigate();
  const { authenticatedFetch, isAdmin } = useAuth();
  const [clientes, setClientes] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentCliente, setCurrentCliente] = useState({
    nombre: '',
    telefono: '',
    direccion: '',
    email: '',
    rut: '',
    giro: '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchClientes = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/clientes?limit=200');
      if (response.ok) {
        const json = await response.json();
        setClientes(json.data || json);
      } else {
        throw new Error('Error al cargar clientes');
      }
    } catch (error) {
      console.error('Error fetching clientes:', error);
      setSnackbar({
        open: true,
        message: 'Error al cargar los clientes',
        severity: 'error',
      });
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    fetchClientes();
  }, [fetchClientes]);

  const handleOpenDialog = (cliente = null) => {
    if (cliente) {
      setCurrentCliente(cliente);
      setIsEditing(true);
    } else {
      setCurrentCliente({
        nombre: '',
        telefono: '',
        direccion: '',
        email: '',
      });
      setIsEditing(false);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCurrentCliente({
      ...currentCliente,
      [name]: value,
    });
  };

  const handleSubmit = async () => {
    try {
      if (!currentCliente.nombre) {
        setSnackbar({
          open: true,
          message: 'El nombre es obligatorio',
          severity: 'error',
        });
        return;
      }

      let response;
      if (isEditing) {
        response = await authenticatedFetch(`/api/clientes/${currentCliente.id}`, {
          method: 'PUT',
          body: JSON.stringify(currentCliente)
        });
      } else {
        response = await authenticatedFetch('/api/clientes', {
          method: 'POST',
          body: JSON.stringify(currentCliente)
        });
      }
      
      if (response.ok) {
        setSnackbar({
          open: true,
          message: isEditing ? 'Cliente actualizado correctamente' : 'Cliente creado correctamente',
          severity: 'success',
        });
        handleCloseDialog();
        fetchClientes();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al guardar cliente');
      }
    } catch (error) {
      console.error('Error al guardar cliente:', error);
      setSnackbar({
        open: true,
        message: error.message || 'Error al guardar el cliente',
        severity: 'error',
      });
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) {
      setSnackbar({
        open: true,
        message: 'No tienes permisos para eliminar clientes',
        severity: 'error',
      });
      return;
    }
    
    if (window.confirm('¿Estás seguro de que quieres eliminar este cliente?')) {
      try {
        const response = await authenticatedFetch(`/api/clientes/${id}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          setClientes(clientes.filter(cliente => cliente.id !== id));
          setSnackbar({
            open: true,
            message: 'Cliente eliminado correctamente',
            severity: 'success',
          });
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Error al eliminar cliente');
        }
      } catch (error) {
        console.error('Error al eliminar cliente:', error);
        setSnackbar({
          open: true,
          message: error.message || 'Error al eliminar el cliente',
          severity: 'error',
        });
      }
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Clientes</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Nuevo Cliente
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell>Teléfono</TableCell>
              <TableCell>Dirección</TableCell>
              <TableCell>Email</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {clientes.map((cliente) => (
              <TableRow key={cliente.id}>
                <TableCell>{cliente.nombre}</TableCell>
                <TableCell>{cliente.telefono}</TableCell>
                <TableCell>{cliente.direccion}</TableCell>
                <TableCell>{cliente.email}</TableCell>
                <TableCell align="center">
                  <IconButton
                    color="primary"
                    onClick={() => navigate(`/admin/clientes/${cliente.id}`)}
                  >
                    <VisibilityIcon />
                  </IconButton>
                  <IconButton
                    color="primary"
                    onClick={() => handleOpenDialog(cliente)}
                  >
                    <EditIcon />
                  </IconButton>
                  {isAdmin && (
                    <IconButton
                      color="error"
                      onClick={() => handleDelete(cliente.id)}
                    >
                      <DeleteIcon />
                    </IconButton>
                  )}
                </TableCell>
              </TableRow>
            ))}
            {clientes.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No hay clientes registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{isEditing ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            name="nombre"
            label="Nombre"
            type="text"
            fullWidth
            variant="outlined"
            value={currentCliente.nombre}
            onChange={handleInputChange}
            required
          />
          <TextField
            margin="dense"
            name="telefono"
            label="Teléfono"
            type="text"
            fullWidth
            variant="outlined"
            value={currentCliente.telefono}
            onChange={handleInputChange}
          />
          <TextField
            margin="dense"
            name="direccion"
            label="Dirección"
            type="text"
            fullWidth
            variant="outlined"
            value={currentCliente.direccion}
            onChange={handleInputChange}
          />
          <TextField
            margin="dense"
            name="email"
            label="Email"
            type="email"
            fullWidth
            variant="outlined"
            value={currentCliente.email}
            onChange={handleInputChange}
          />
          <TextField
            margin="dense"
            name="rut"
            label="RUT"
            type="text"
            fullWidth
            variant="outlined"
            value={currentCliente.rut}
            onChange={handleInputChange}
            placeholder="12.345.678-9"
          />
          <TextField
            margin="dense"
            name="giro"
            label="Giro"
            type="text"
            fullWidth
            variant="outlined"
            value={currentCliente.giro}
            onChange={handleInputChange}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDialog}>Cancelar</Button>
          <Button onClick={handleSubmit} variant="contained" color="primary">
            Guardar
          </Button>
        </DialogActions>
      </Dialog>

      <Snackbar
        open={snackbar.open}
        autoHideDuration={6000}
        onClose={handleCloseSnackbar}
      >
        <Alert
          onClose={handleCloseSnackbar}
          severity={snackbar.severity}
          sx={{ width: '100%' }}
        >
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
}

export default Clientes;