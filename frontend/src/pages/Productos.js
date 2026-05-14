import React, { useState, useEffect, useCallback } from 'react';
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
  InputAdornment,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

function Productos() {
  const { authenticatedFetch, isAuthenticated } = useAuth();
  const [productos, setProductos] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentProducto, setCurrentProducto] = useState({
    nombre: '',
    precio: '',
    descripcion: '',
    imagen: null,
  });
  const [isEditing, setIsEditing] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchProductos = useCallback(async () => {
    try {
      if (!isAuthenticated) {
        setSnackbar({
          open: true,
          message: 'Debes iniciar sesión para ver los productos',
          severity: 'warning',
        });
        return;
      }
      
      const response = await authenticatedFetch('/api/productos?limit=200');
      
      if (response.ok) {
        const json = await response.json();
        setProductos(json.data || json);
      } else {
        const errorText = await response.text();
        throw new Error(`Error al cargar productos: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error('Error al cargar productos:', error);
      setSnackbar({
        open: true,
        message: `Error al cargar los productos: ${error.message}`,
        severity: 'error',
      });
    }
  }, [authenticatedFetch, isAuthenticated]);

  useEffect(() => {
    fetchProductos();
  }, [fetchProductos]);

  const handleOpenDialog = (producto = null) => {
    if (producto) {
      setCurrentProducto({ ...producto, imagen: null });
      setIsEditing(true);
    } else {
      setCurrentProducto({
        nombre: '',
        precio: '',
        descripcion: '',
        imagen: null,
      });
      setIsEditing(false);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleInputChange = (e) => {
    const { name, value, files } = e.target;
    if (name === 'imagen') {
      setCurrentProducto({
        ...currentProducto,
        imagen: files[0],
      });
    } else {
      setCurrentProducto({
        ...currentProducto,
        [name]: value,
      });
    }
  };

  const handleSubmit = async () => {
    try {
      if (!currentProducto.nombre || !currentProducto.precio) {
        setSnackbar({
          open: true,
          message: 'Nombre y precio son obligatorios',
          severity: 'error',
        });
        return;
      }

      // Validar que el precio sea un número válido
      const precio = parseFloat(currentProducto.precio);
      if (isNaN(precio) || precio <= 0) {
        setSnackbar({
          open: true,
          message: 'El precio debe ser un número mayor que cero',
          severity: 'error',
        });
        return;
      }

      const formData = new FormData();
      formData.append('nombre', currentProducto.nombre);
      formData.append('precio', precio);
      formData.append('descripcion', currentProducto.descripcion || '');
      if (currentProducto.imagen) {
        formData.append('imagen', currentProducto.imagen);
      }

      if (isEditing) {
        const response = await authenticatedFetch(`/api/productos/${currentProducto.id}`, {
          method: 'PUT',
          body: formData,
        });
        
        if (response.ok) {
          const updatedProducto = await response.json();
          setProductos(
            productos.map((p) => (p.id === currentProducto.id ? updatedProducto : p))
          );

          setSnackbar({
            open: true,
            message: 'Producto actualizado correctamente',
            severity: 'success',
          });
        } else {
          throw new Error('Error al actualizar producto');
        }
      } else {
        const response = await authenticatedFetch('/api/productos', {
          method: 'POST',
          body: formData,
        });
        
        if (response.ok) {
          const newProducto = await response.json();
          setProductos([...productos, newProducto]);

          setSnackbar({
            open: true,
            message: 'Producto creado correctamente',
            severity: 'success',
          });
        } else {
          throw new Error('Error al crear producto');
        }
      }

      handleCloseDialog();
    } catch (error) {
      console.error('Error al guardar producto:', error);
      setSnackbar({
        open: true,
        message: 'Error al guardar el producto',
        severity: 'error',
      });
    }
  };

  const handleDelete = async (id) => {
    
    if (window.confirm('¿Está seguro de eliminar este producto?')) {
      try {
        const response = await authenticatedFetch(`/api/productos/${id}`, {
          method: 'DELETE',
        });
        
        if (response.ok) {
          setProductos(productos.filter((p) => p.id !== id));

          setSnackbar({
            open: true,
            message: 'Producto eliminado correctamente',
            severity: 'success',
          });
        } else {
          throw new Error('Error al eliminar producto');
        }
      } catch (error) {
        console.error('Error al eliminar producto:', error);
        setSnackbar({
          open: true,
          message: 'Error al eliminar el producto',
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
        <Typography variant="h4">Productos</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Nuevo Producto
        </Button>
      </Box>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Nombre</TableCell>
              <TableCell align="right">Precio</TableCell>
              <TableCell>Descripción</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {productos.map((producto) => (
              <TableRow key={producto.id}>
                <TableCell>{producto.nombre}</TableCell>
                <TableCell align="right">${producto.precio.toFixed(2)}</TableCell>
                <TableCell>{producto.descripcion}</TableCell>
                <TableCell align="center">
                  <IconButton
                    color="primary"
                    onClick={() => handleOpenDialog(producto)}
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    color="error"
                    onClick={() => handleDelete(producto.id)}
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {productos.length === 0 && (
              <TableRow>
                <TableCell colSpan={4} align="center">
                  No hay productos registrados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="sm" fullWidth>
        <DialogTitle>{isEditing ? 'Editar Producto' : 'Nuevo Producto'}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            name="nombre"
            label="Nombre"
            type="text"
            fullWidth
            variant="outlined"
            value={currentProducto.nombre}
            onChange={handleInputChange}
            required
          />
          <TextField
            margin="dense"
            name="precio"
            label="Precio"
            type="number"
            fullWidth
            variant="outlined"
            value={currentProducto.precio}
            onChange={handleInputChange}
            required
            InputProps={{
              startAdornment: <InputAdornment position="start">$</InputAdornment>,
            }}
          />
          <TextField
            margin="dense"
            name="descripcion"
            label="Descripción"
            type="text"
            fullWidth
            variant="outlined"
            value={currentProducto.descripcion}
            onChange={handleInputChange}
            multiline
            rows={2}
          />
          <Button
            variant="outlined"
            component="label"
            fullWidth
            sx={{ mt: 2 }}
          >
            {currentProducto.imagen ? currentProducto.imagen.name : 'Subir Imagen'}
            <input
              type="file"
              name="imagen"
              hidden
              accept="image/*"
              onChange={handleInputChange}
            />
          </Button>
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

export default Productos;