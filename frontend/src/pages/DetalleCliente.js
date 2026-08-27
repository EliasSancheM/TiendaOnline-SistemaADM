import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Button,
  Paper,
  Typography,
  Grid,
  Card,
  CardContent,
  Divider,
  List,
  ListItem,
  ListItemText,
  Snackbar,
  Alert,
  IconButton,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { formatFecha } from '../utils/fechas';

function DetalleCliente() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authenticatedFetch } = useAuth();
  const [cliente, setCliente] = useState(null);
  const [pedidos, setPedidos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchCliente = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`/api/clientes/${id}`);
      setCliente(await response.json());
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar cliente:', error);
      setSnackbar({
        open: true,
        message: 'Error al cargar los datos del cliente',
        severity: 'error',
      });
      setLoading(false);
    }
  }, [id, authenticatedFetch]);

  const fetchPedidosCliente = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`/api/pedidos?limit=200`);
      const json = await response.json();
      const todosPedidos = json.data || json;
      // Filtrar pedidos por cliente_id
      const pedidosCliente = todosPedidos.filter(pedido => pedido.cliente_id === parseInt(id));
      setPedidos(pedidosCliente);
    } catch (error) {
      console.error('Error al cargar pedidos del cliente:', error);
    }
  }, [id, authenticatedFetch]);

  useEffect(() => {
    fetchCliente();
    fetchPedidosCliente();
  }, [id, fetchCliente, fetchPedidosCliente]);

  const handleDeleteCliente = async () => {
    if (window.confirm('¿Está seguro de eliminar este cliente? Esta acción no se puede deshacer.')) {
      try {
        await authenticatedFetch(`/api/clientes/${id}`, {
          method: 'DELETE'
        });

        setSnackbar({
          open: true,
          message: 'Cliente eliminado correctamente',
          severity: 'success',
        });

        // Redirigir después de un breve retraso para que el usuario vea el mensaje
        setTimeout(() => {
          navigate('/admin/clientes');
        }, 1500);
      } catch (error) {
        console.error('Error al eliminar cliente:', error);
        setSnackbar({
          open: true,
          message: 'Error al eliminar el cliente',
          severity: 'error',
        });
      }
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <Typography>Cargando datos del cliente...</Typography>
      </Box>
    );
  }

  if (!cliente) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/admin/clientes')}
          sx={{ mb: 2 }}
        >
          Volver a Clientes
        </Button>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" color="error">
            Cliente no encontrado
          </Typography>
        </Paper>
      </Box>
    );
  }

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/admin/clientes')}
        >
          Volver a Clientes
        </Button>
        <Box>
          <Button
            variant="contained"
            color="secondary"
            onClick={() => navigate('/admin/pedidos/nuevo', { state: { clienteId: parseInt(id) } })}
            sx={{ mr: 1 }}
          >
            Nuevo Pedido
          </Button>
          <IconButton
            color="primary"
            onClick={() => navigate(`/admin/clientes/${id}/edit`)}
            sx={{ mr: 1 }}
          >
            <EditIcon />
          </IconButton>
          <IconButton color="error" onClick={handleDeleteCliente}>
            <DeleteIcon />
          </IconButton>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Información del Cliente
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h4">{cliente.nombre}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1" color="text.secondary">
                  Teléfono
                </Typography>
                <Typography variant="body1">{cliente.telefono || 'No especificado'}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1" color="text.secondary">
                  Email
                </Typography>
                <Typography variant="body1">{cliente.email || 'No especificado'}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1" color="text.secondary">
                  Dirección
                </Typography>
                <Typography variant="body1">{cliente.direccion || 'No especificada'}</Typography>
              </Grid>
              <Grid item xs={12}>
                <Typography variant="subtitle1" color="text.secondary">
                  Fecha de Registro
                </Typography>
                <Typography variant="body1">
                  {cliente.fecha_registro
                    ? format(new Date(cliente.fecha_registro), 'dd/MM/yyyy HH:mm', { locale: es })
                    : 'No especificada'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Historial de Pedidos
              </Typography>
              <Divider sx={{ mb: 2 }} />

              {pedidos.length > 0 ? (
                <List>
                  {pedidos.map((pedido) => (
                    <ListItem
                      key={pedido.id}
                      button
                      onClick={() => navigate(`/admin/pedidos/${pedido.id}`)}
                      divider
                    >
                      <ListItemText
                        primary={
                          <Typography variant="subtitle1">
                            Pedido #{pedido.id} - {formatFecha(pedido.fecha)}
                          </Typography>
                        }
                        secondary={
                          <>
                            <Typography variant="body2" component="span">
                              {pedido.periodo === 'mañana' ? 'Mañana' : 'Tarde'} - {pedido.estado}
                            </Typography>
                            <Typography
                              variant="body2"
                              component="span"
                              sx={{ display: 'block', fontWeight: 'bold' }}
                            >
                              Total: ${pedido.total.toFixed(2)}
                            </Typography>
                          </>
                        }
                      />
                    </ListItem>
                  ))}
                </List>
              ) : (
                <Typography variant="body1" sx={{ py: 2 }}>
                  Este cliente no tiene pedidos registrados.
                </Typography>
              )}

              <Button
                variant="contained"
                color="primary"
                fullWidth
                sx={{ mt: 2 }}
                onClick={() => navigate('/admin/pedidos', { state: { clienteId: cliente.id } })}
              >
                Crear Nuevo Pedido
              </Button>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

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

export default DetalleCliente;