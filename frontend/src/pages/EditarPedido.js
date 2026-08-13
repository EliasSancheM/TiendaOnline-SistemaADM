import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Grid,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Snackbar,
  Alert,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Autocomplete,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Delete as DeleteIcon,
  Add as AddIcon,
} from '@mui/icons-material';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { LocalizationProvider, DatePicker } from '@mui/x-date-pickers';
import { es } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';

function EditarPedido() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authenticatedFetch } = useAuth();
  const [pedido, setPedido] = useState({
    cliente_id: '',
    fecha: new Date(),
    periodo: 'mañana',
    estado: 'pendiente',
    notas: '',
    detalles: [],
  });
  const [clientes, setClientes] = useState([]);
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [nuevoDetalle, setNuevoDetalle] = useState({
    producto_id: '',
    cantidad: 1,
  });
  const [clienteSeleccionado, setClienteSeleccionado] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      const [pedidoResponse, clientesResponse, productosResponse] = await Promise.all([
        authenticatedFetch(`/api/pedidos/${id}`),
        authenticatedFetch('/api/clientes?limit=200'),
        authenticatedFetch('/api/productos?limit=200')
      ]);

      const pedidoData = await pedidoResponse.json();
      const clientesJson = await clientesResponse.json();
      const productosJson = await productosResponse.json();

      const clientesData = clientesJson.data || clientesJson;
      const productosData = productosJson.data || productosJson;

      // Formatear la fecha correctamente
      const pedidoFormateado = {
        ...pedidoData,
        fecha: new Date(pedidoData.fecha),
      };
      
      setPedido(pedidoFormateado);
      setClientes(clientesData);
      setProductos(productosData);
      
      // Encontrar el cliente seleccionado
      const cliente = clientesData.find(c => c.id === pedidoData.cliente_id);
      setClienteSeleccionado(cliente);
      
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar datos:', error);
      setSnackbar({
        open: true,
        message: 'Error al cargar los datos',
        severity: 'error',
      });
      setLoading(false);
    }
  }, [id, authenticatedFetch]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setPedido({ ...pedido, [name]: value });
  };

  const handleClienteChange = (event, newValue) => {
    setClienteSeleccionado(newValue);
    if (newValue) {
      setPedido({ ...pedido, cliente_id: newValue.id });
    } else {
      setPedido({ ...pedido, cliente_id: '' });
    }
  };

  const handleFechaChange = (newDate) => {
    setPedido({ ...pedido, fecha: newDate });
  };

  const handleDetalleChange = (e, index) => {
    const { name, value } = e.target;
    const nuevosDetalles = [...pedido.detalles];
    nuevosDetalles[index] = { ...nuevosDetalles[index], [name]: value };

    // Recalcular subtotal si cambia la cantidad
    if (name === 'cantidad') {
      const producto = productos.find(p => p.id === nuevosDetalles[index].producto_id);
      if (producto) {
        nuevosDetalles[index].subtotal = producto.precio * value;
      }
    }

    setPedido({ ...pedido, detalles: nuevosDetalles });
  };

  const handleProductoChange = (e, index) => {
    const productoId = e.target.value;
    const nuevosDetalles = [...pedido.detalles];
    const producto = productos.find(p => p.id === productoId);

    nuevosDetalles[index] = {
      ...nuevosDetalles[index],
      producto_id: productoId,
      precio_unitario: producto ? producto.precio : 0,
      subtotal: producto ? producto.precio * nuevosDetalles[index].cantidad : 0,
    };

    setPedido({ ...pedido, detalles: nuevosDetalles });
  };

  const handleNuevoDetalleChange = (e) => {
    const { name, value } = e.target;
    setNuevoDetalle({ ...nuevoDetalle, [name]: value });
  };

  const handleNuevoProductoChange = (e) => {
    const productoId = e.target.value;
    const producto = productos.find(p => p.id === productoId);

    setNuevoDetalle({
      ...nuevoDetalle,
      producto_id: productoId,
      precio_unitario: producto ? producto.precio : 0,
    });
  };

  const handleAgregarDetalle = () => {
    if (!nuevoDetalle.producto_id) {
      setSnackbar({
        open: true,
        message: 'Debe seleccionar un producto',
        severity: 'error',
      });
      return;
    }

    const producto = productos.find(p => p.id === nuevoDetalle.producto_id);
    const nuevoDetalleCompleto = {
      ...nuevoDetalle,
      precio_unitario: producto.precio,
      subtotal: producto.precio * nuevoDetalle.cantidad,
    };

    setPedido({
      ...pedido,
      detalles: [...pedido.detalles, nuevoDetalleCompleto],
    });

    setNuevoDetalle({
      producto_id: '',
      cantidad: 1,
    });

    setDialogOpen(false);
  };

  const handleEliminarDetalle = (index) => {
    const nuevosDetalles = [...pedido.detalles];
    nuevosDetalles.splice(index, 1);
    setPedido({ ...pedido, detalles: nuevosDetalles });
  };

  const calcularTotal = () => {
    return pedido.detalles.reduce((total, detalle) => total + (detalle.subtotal || 0), 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!pedido.cliente_id) {
      setSnackbar({
        open: true,
        message: 'Debe seleccionar un cliente',
        severity: 'error',
      });
      return;
    }
    
    if (pedido.detalles.length === 0) {
      setSnackbar({
        open: true,
        message: 'Debe agregar al menos un producto al pedido',
        severity: 'error',
      });
      return;
    }

    try {
      const pedidoActualizado = {
        ...pedido,
        total: calcularTotal(),
      };

      const response = await authenticatedFetch(`/api/pedidos/${id}`, {
        method: 'PUT',
        body: JSON.stringify(pedidoActualizado)
      });

      // El servidor puede rechazar la edición (p. ej. un pedido con el pago en
      // curso o ya cancelado); sin esta comprobación se anunciaba éxito y se
      // navegaba fuera aunque no se hubiera guardado nada.
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Error al actualizar el pedido');
      }

      setSnackbar({
        open: true,
        message: 'Pedido actualizado correctamente',
        severity: 'success',
      });

      // Redirigir después de un breve retraso para que el usuario vea el mensaje
      setTimeout(() => {
        navigate(`/admin/pedidos/${id}`);
      }, 1500);
    } catch (error) {
      console.error('Error al actualizar pedido:', error);
      setSnackbar({
        open: true,
        message: error.message || 'Error al actualizar el pedido',
        severity: 'error',
      });
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <Typography>Cargando datos...</Typography>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate(`/admin/pedidos/${id}`)}
        >
          Volver al Pedido
        </Button>
        <Typography variant="h5">Editar Pedido #{id}</Typography>
      </Box>

      <Paper sx={{ p: 3 }}>
        <form onSubmit={handleSubmit}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <Typography variant="h6" gutterBottom>
                Información del Pedido
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <Grid container spacing={2}>
                <Grid item xs={12}>
                  <Autocomplete
                    options={clientes}
                    getOptionLabel={(option) => `${option.nombre} (${option.telefono})`}
                    value={clienteSeleccionado}
                    onChange={handleClienteChange}
                    renderInput={(params) => (
                      <TextField
                        {...params}
                        label="Cliente"
                        required
                        fullWidth
                      />
                    )}
                  />
                </Grid>
                <Grid item xs={12} sm={6}>
                  <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
                    <DatePicker
                      label="Fecha"
                      value={pedido.fecha}
                      onChange={handleFechaChange}
                      renderInput={(params) => (
                        <TextField {...params} fullWidth required />
                      )}
                    />
                  </LocalizationProvider>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <FormControl fullWidth required>
                    <InputLabel>Periodo</InputLabel>
                    <Select
                      name="periodo"
                      value={pedido.periodo}
                      onChange={handleChange}
                      label="Periodo"
                    >
                      <MenuItem value="mañana">Mañana</MenuItem>
                      <MenuItem value="tarde">Tarde</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <FormControl fullWidth>
                    <InputLabel>Estado</InputLabel>
                    <Select
                      name="estado"
                      value={pedido.estado}
                      onChange={handleChange}
                      label="Estado"
                    >
                      <MenuItem value="pendiente">Pendiente</MenuItem>
                      <MenuItem value="en_proceso">En proceso</MenuItem>
                      <MenuItem value="completado">Completado</MenuItem>
                      <MenuItem value="cancelado">Cancelado</MenuItem>
                    </Select>
                  </FormControl>
                </Grid>
                <Grid item xs={12}>
                  <TextField
                    name="notas"
                    label="Notas"
                    value={pedido.notas || ''}
                    onChange={handleChange}
                    fullWidth
                    multiline
                    rows={3}
                  />
                </Grid>
              </Grid>
            </Grid>

            <Grid item xs={12} md={6}>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h6" gutterBottom>
                  Detalles del Pedido
                </Typography>
                <Button
                  startIcon={<AddIcon />}
                  onClick={() => setDialogOpen(true)}
                  variant="outlined"
                  size="small"
                >
                  Agregar Producto
                </Button>
              </Box>
              <Divider sx={{ mb: 2 }} />

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Producto</TableCell>
                      <TableCell align="right">Cantidad</TableCell>
                      <TableCell align="right">Precio Unit.</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                      <TableCell align="right">Acciones</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pedido.detalles.map((detalle, index) => {
                      const producto = productos.find(p => p.id === detalle.producto_id);
                      return (
                        <TableRow key={index}>
                          <TableCell>
                            <FormControl fullWidth size="small">
                              <Select
                                value={detalle.producto_id}
                                onChange={(e) => handleProductoChange(e, index)}
                              >
                                {productos.map((producto) => (
                                  <MenuItem key={producto.id} value={producto.id}>
                                    {producto.nombre}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          </TableCell>
                          <TableCell align="right">
                            <TextField
                              name="cantidad"
                              type="number"
                              value={detalle.cantidad}
                              onChange={(e) => handleDetalleChange(e, index)}
                              inputProps={{ min: 1 }}
                              size="small"
                              sx={{ width: '80px' }}
                            />
                          </TableCell>
                          <TableCell align="right">
                            ${producto ? producto.precio.toFixed(2) : '0.00'}
                          </TableCell>
                          <TableCell align="right">
                            ${detalle.subtotal ? detalle.subtotal.toFixed(2) : '0.00'}
                          </TableCell>
                          <TableCell align="right">
                            <IconButton
                              color="error"
                              onClick={() => handleEliminarDetalle(index)}
                              size="small"
                            >
                              <DeleteIcon />
                            </IconButton>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                    {pedido.detalles.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          No hay productos en este pedido
                        </TableCell>
                      </TableRow>
                    )}
                    <TableRow>
                      <TableCell colSpan={3} align="right">
                        <Typography variant="subtitle1" fontWeight="bold">
                          Total:
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="subtitle1" fontWeight="bold">
                          ${calcularTotal().toFixed(2)}
                        </Typography>
                      </TableCell>
                      <TableCell />
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </Grid>

            <Grid item xs={12} display="flex" justifyContent="flex-end">
              <Button
                variant="contained"
                color="primary"
                type="submit"
                size="large"
              >
                Guardar Cambios
              </Button>
            </Grid>
          </Grid>
        </form>
      </Paper>

      {/* Diálogo para agregar nuevo producto */}
      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)}>
        <DialogTitle>Agregar Producto</DialogTitle>
        <DialogContent>
          <Grid container spacing={2} sx={{ mt: 1 }}>
            <Grid item xs={12}>
              <FormControl fullWidth required>
                <InputLabel>Producto</InputLabel>
                <Select
                  name="producto_id"
                  value={nuevoDetalle.producto_id}
                  onChange={handleNuevoProductoChange}
                  label="Producto"
                >
                  {productos.map((producto) => (
                    <MenuItem key={producto.id} value={producto.id}>
                      {producto.nombre} - ${producto.precio.toFixed(2)}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12}>
              <TextField
                name="cantidad"
                label="Cantidad"
                type="number"
                value={nuevoDetalle.cantidad}
                onChange={handleNuevoDetalleChange}
                fullWidth
                required
                inputProps={{ min: 1 }}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button onClick={handleAgregarDetalle} variant="contained">
            Agregar
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

export default EditarPedido;