import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Chip,
  Grid,
  Tabs,
  Tab,
  Checkbox,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Visibility as VisibilityIcon,
  Repeat as RepeatIcon,
  LocalShipping as LocalShippingIcon,
  Restaurant as RestaurantIcon,
  CheckCircle as CheckCircleIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

import {
  printViaIframe,
  renderPlantillaRepartidor,
  renderPlantillaPreparador,
  renderPlanillaRepartoDiaria,
  renderPlanillaProduccionDiaria,
} from '../utils/printUtils';

function Pedidos() {
  const navigate = useNavigate();
  const location = useLocation();
  const { authenticatedFetch } = useAuth();
  const queryParams = new URLSearchParams(location.search);
  const initialPeriodo = queryParams.get('periodo') || 'todos';

  const [pedidos, setPedidos] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentPedido, setCurrentPedido] = useState({
    cliente_id: '',
    fecha: new Date(),
    periodo: 'mañana',
    estado: 'pendiente',
    total: 0,
    notas: '',
    detalles: [],
  });
  // eslint-disable-next-line no-unused-vars
  const [isEditing, setIsEditing] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });
  const [filtroFecha, setFiltroFecha] = useState(null);
  const [filtroPeriodo, setFiltroPeriodo] = useState(initialPeriodo);
  const [tabValue, setTabValue] = useState(initialPeriodo === 'tarde' ? 1 : 0);

  const [pedidosSeleccionados, setPedidosSeleccionados] = useState([]);
  const [seleccionarTodos, setSeleccionarTodos] = useState(false);

  // ─── Data Fetching ─────────────────────────────────────────────────

  const fetchPedidos = useCallback(async () => {
    try {
      let url = '/api/pedidos';
      const params = new URLSearchParams();
      
      if (filtroFecha && !isNaN(filtroFecha.getTime())) {
        const fechaFormateada = format(filtroFecha, 'yyyy-MM-dd');
        params.append('fecha', fechaFormateada);
      }
      
      if (filtroPeriodo !== 'todos') {
        params.append('periodo', filtroPeriodo);
      }

      params.append('limit', '200');
      url += '?' + params.toString();
      
      const response = await authenticatedFetch(url);
      if (response.ok) {
        const json = await response.json();
        setPedidos(json.data || json);
      } else {
        throw new Error('Error al cargar pedidos');
      }
    } catch (error) {
      console.error('Error al cargar pedidos:', error);
      setSnackbar({
        open: true,
        message: 'Error al cargar los pedidos',
        severity: 'error',
      });
    }
  }, [filtroFecha, filtroPeriodo, authenticatedFetch]);

  const fetchClientes = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/clientes?limit=200');
      if (response.ok) {
        const json = await response.json();
        setClientes(json.data || json);
      }
    } catch (error) {
      console.error('Error al cargar clientes:', error);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    fetchPedidos();
    fetchClientes();
  }, [filtroFecha, filtroPeriodo, fetchPedidos, fetchClientes]);

  // ─── Dialog Handlers ───────────────────────────────────────────────

  const handleOpenDialog = (pedido = null) => {
    if (pedido) {
      navigate(`/admin/pedidos/${pedido.id}/edit`);
    } else {
      navigate('/admin/pedidos/nuevo');
    }
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCurrentPedido({
      ...currentPedido,
      [name]: value,
    });
  };

  const handleDateChange = (newDate) => {
    setCurrentPedido({
      ...currentPedido,
      fecha: newDate,
    });
  };

  const handleSubmit = async () => {
    try {
      if (!currentPedido.cliente_id) {
        setSnackbar({
          open: true,
          message: 'Debe seleccionar un cliente',
          severity: 'error',
        });
        return;
      }

      const pedidoToSave = {
        ...currentPedido,
        fecha: currentPedido.fecha && !isNaN(currentPedido.fecha.getTime()) ? format(currentPedido.fecha, 'yyyy-MM-dd') : '',
      };

      if (isEditing) {
        const response = await authenticatedFetch(`/api/pedidos/${currentPedido.id}`, {
          method: 'PUT',
          body: JSON.stringify(pedidoToSave)
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Error al actualizar pedido');
        }
        fetchPedidos();

        setSnackbar({
          open: true,
          message: 'Pedido actualizado correctamente',
          severity: 'success',
        });
      } else {
        const response = await authenticatedFetch('/api/pedidos', {
          method: 'POST',
          body: JSON.stringify(pedidoToSave)
        });
        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || 'Error al crear pedido');
        }
        fetchPedidos();

        setSnackbar({
          open: true,
          message: 'Pedido creado correctamente',
          severity: 'success',
        });
      }

      handleCloseDialog();
    } catch (error) {
      console.error('Error al guardar pedido:', error);
      setSnackbar({
        open: true,
        message: error.message || 'Error al guardar el pedido',
        severity: 'error',
      });
    }
   };

  // ─── Print Handlers ────────────────────────────────────────────────

  const handlePrint = async (pedido, tipo) => {
    try {
      const response = await authenticatedFetch(`/api/pedidos/${pedido.id}`);
      const pedidoCompleto = await response.json();

      const title = tipo === 'repartidor' ? 'Hoja de Reparto' : 'Hoja de Producción';
      const htmlContent = tipo === 'repartidor'
        ? renderPlantillaRepartidor(pedidoCompleto)
        : renderPlantillaPreparador(pedidoCompleto);

      printViaIframe(title, htmlContent);
      
      setSnackbar({
        open: true,
        message: 'Impresión enviada correctamente',
        severity: 'success',
      });
    } catch (error) {
      console.error('Error al imprimir:', error);
      setSnackbar({
        open: true,
        message: 'Error al generar la impresión',
        severity: 'error',
      });
    }
  };

  const handlePrintPlanillaDiaria = async (tipo) => {
    try {
      const pedidosFiltrados = pedidos.filter(pedido => {
        if (!pedido.fecha) return false;
        
        const fechaPedidoDate = new Date(pedido.fecha);
        if (isNaN(fechaPedidoDate)) return false;
        
        if (filtroFecha) {
          const fechaPedido = format(fechaPedidoDate, 'yyyy-MM-dd');
          const fechaFiltro = format(new Date(filtroFecha), 'yyyy-MM-dd');
          if (fechaPedido !== fechaFiltro) return false;
        }
        
        const periodoMatch = filtroPeriodo === 'todos' || pedido.periodo === filtroPeriodo;
        return periodoMatch;
      });

      if (pedidosFiltrados.length === 0) {
        setSnackbar({
          open: true,
          message: 'No hay pedidos para imprimir en la fecha y período seleccionados',
          severity: 'warning',
        });
        return;
      }

      // Fetch full details for all filtered orders
      const pedidosCompletos = await Promise.all(
        pedidosFiltrados.map(async (pedido) => {
          const response = await authenticatedFetch(`/api/pedidos/${pedido.id}`);
          return await response.json();
        })
      );

      const title = `Planilla ${tipo === 'repartidor' ? 'de Reparto' : 'de Producción'} - ${filtroFecha && !isNaN(filtroFecha.getTime()) ? format(filtroFecha, 'dd/MM/yyyy', { locale: es }) : 'Todas las fechas'}`;
      const htmlContent = tipo === 'repartidor'
        ? renderPlanillaRepartoDiaria(pedidosCompletos, filtroFecha, filtroPeriodo)
        : renderPlanillaProduccionDiaria(pedidosCompletos, filtroFecha, filtroPeriodo);

      printViaIframe(title, htmlContent);
      
      setSnackbar({
        open: true,
        message: 'Planilla diaria enviada a impresión correctamente',
        severity: 'success',
      });
    } catch (error) {
      console.error('Error al imprimir planilla diaria:', error);
      setSnackbar({
        open: true,
        message: 'Error al generar la planilla diaria',
        severity: 'error',
      });
    }
  };

  // ─── CRUD & Bulk Actions ───────────────────────────────────────────

  const handleDelete = async (id) => {
    if (window.confirm('¿Está seguro de eliminar este pedido?')) {
      try {
        const response = await authenticatedFetch(`/api/pedidos/${id}`, {
          method: 'DELETE'
        });
        if (!response.ok) throw new Error('Error al eliminar pedido');
        fetchPedidos();

        setSnackbar({
          open: true,
          message: 'Pedido eliminado correctamente',
          severity: 'success',
        });
      } catch (error) {
        console.error('Error al eliminar pedido:', error);
        setSnackbar({
          open: true,
          message: 'Error al eliminar el pedido',
          severity: 'error',
        });
      }
    }
  };

  const handleRepeatOrder = async (pedido) => {
    try {
      const nuevoPedido = {
        cliente_id: pedido.cliente_id,
        fecha: new Date().toISOString(),
        periodo: pedido.periodo,
        estado: 'pendiente',
        notas: `Repetición del pedido #${pedido.id}`,
        detalles: pedido.detalles || [],
        total: pedido.total,
      };

      const response = await authenticatedFetch('/api/pedidos', {
        method: 'POST',
        body: JSON.stringify(nuevoPedido)
      });
      const data = await response.json();
      const nuevoPedidoId = data.id;

      setSnackbar({
        open: true,
        message: `Pedido repetido correctamente. Nuevo pedido #${nuevoPedidoId}`,
        severity: 'success',
      });

      fetchPedidos();

      setTimeout(() => {
        navigate(`/admin/pedidos/${nuevoPedidoId}`);
      }, 2000);
    } catch (error) {
       console.error('Error al repetir pedido:', error);
       setSnackbar({
         open: true,
         message: 'Error al repetir el pedido',
         severity: 'error',
       });
     }
   };

  // ─── Selection Logic ───────────────────────────────────────────────

  const handleSeleccionarPedido = (pedidoId) => {
    setPedidosSeleccionados(prev => {
      return prev.includes(pedidoId) 
        ? prev.filter(id => id !== pedidoId)
        : [...prev, pedidoId];
    });
  };

  const handleSeleccionarTodos = () => {
    if (seleccionarTodos) {
      setPedidosSeleccionados([]);
      setSeleccionarTodos(false);
    } else {
      const pedidosPendientes = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'en_proceso');
      const idsPendientes = pedidosPendientes.map(p => p.id);
      setPedidosSeleccionados(idsPendientes);
      setSeleccionarTodos(true);
    }
  };

  // Sync "select all" checkbox state when individual selections change
  useEffect(() => {
    const pedidosPendientes = pedidos.filter(p => p.estado === 'pendiente' || p.estado === 'en_proceso');
    const todosPendientesSeleccionados = pedidosPendientes.length > 0 && 
      pedidosPendientes.every(p => pedidosSeleccionados.includes(p.id));
    setSeleccionarTodos(todosPendientesSeleccionados);
  }, [pedidosSeleccionados, pedidos]);

  const handleMarcarSeleccionadosCompletados = async () => {
    try {
      if (pedidosSeleccionados.length === 0) {
        setSnackbar({
          open: true,
          message: 'No hay pedidos seleccionados para marcar como completados',
          severity: 'warning',
        });
        return;
      }
      
      if (window.confirm(`¿Está seguro de marcar ${pedidosSeleccionados.length} pedido(s) seleccionado(s) como completados?`)) {
        // Process orders sequentially to avoid transaction conflicts
        for (let i = 0; i < pedidosSeleccionados.length; i++) {
          const pedidoId = pedidosSeleccionados[i];
          const updateResponse = await authenticatedFetch(`/api/pedidos/${pedidoId}/estado`, {
            method: 'PATCH',
            body: JSON.stringify({ estado: 'completado' })
          });
          if (!updateResponse.ok) {
            const errorData = await updateResponse.json().catch(() => ({}));
            throw new Error(errorData.error || 'Error al actualizar pedido');
          }
        }
        
        // Clear selection and reload
        setPedidosSeleccionados([]);
        setSeleccionarTodos(false);
        fetchPedidos();

        setSnackbar({
          open: true,
          message: `${pedidosSeleccionados.length} pedido(s) seleccionado(s) marcado(s) como completados`,
          severity: 'success',
        });
      }
    } catch (error) {
      console.error('Error al marcar pedidos como completados:', error);
      setSnackbar({
        open: true,
        message: 'Error al marcar los pedidos como completados: ' + error.message,
        severity: 'error',
      });
    }
  };

  // ─── Filter & UI Helpers ───────────────────────────────────────────

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handleFiltroFechaChange = (newDate) => {
    setFiltroFecha(newDate);
  };

  const handleFiltroPeriodoChange = (event, newValue) => {
    setTabValue(newValue);
    const periodos = ['mañana', 'tarde', 'todos'];
    setFiltroPeriodo(periodos[newValue]);
  };

  const getEstadoChip = (estado) => {
    switch (estado) {
      case 'pendiente':
        return <Chip label="Pendiente" color="warning" size="small" />;
      case 'en_proceso':
        return <Chip label="En proceso" color="info" size="small" />;
      case 'completado':
        return <Chip label="Completado" color="success" size="small" />;
      case 'cancelado':
        return <Chip label="Cancelado" color="error" size="small" />;
      default:
        return <Chip label={estado} size="small" />;
    }
  };

  // ─── Render ────────────────────────────────────────────────────────

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Pedidos</Typography>
        <Box display="flex" gap={2}>

          <Button
            variant="outlined"
            color="success"
            startIcon={<CheckCircleIcon />}
            onClick={handleMarcarSeleccionadosCompletados}
            disabled={pedidosSeleccionados.length === 0}
          >
            Marcar Seleccionados Completados {pedidosSeleccionados.length > 0 && `(${pedidosSeleccionados.length})`}
          </Button>
          <Button
            variant="outlined"
            color="error"
            startIcon={<DeleteIcon />}
            onClick={() => setPedidosSeleccionados([])}
            disabled={pedidosSeleccionados.length === 0}
          >
            Vaciar Selección
          </Button>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<LocalShippingIcon />}
            onClick={() => handlePrintPlanillaDiaria('repartidor')}
            disabled={pedidos.length === 0}
          >
            Planilla de Reparto
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            startIcon={<RestaurantIcon />}
            onClick={() => handlePrintPlanillaDiaria('preparador')}
            disabled={pedidos.length === 0}
          >
            Planilla de Producción
          </Button>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddIcon />}
            onClick={() => handleOpenDialog()}
          >
            Nuevo Pedido
          </Button>
        </Box>
      </Box>

      <Paper sx={{ mb: 3, p: 2 }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4}>
            <DatePicker
              label="Fecha"
              value={filtroFecha}
              onChange={handleFiltroFechaChange}
              format="dd/MM/yyyy"
              slotProps={{ textField: { fullWidth: true, variant: 'outlined' } }}
            />
          </Grid>
          <Grid item xs={12} sm={8}>
            <Tabs
              value={tabValue}
              onChange={handleFiltroPeriodoChange}
              indicatorColor="primary"
              textColor="primary"
              variant="fullWidth"
            >
              <Tab label="Mañana" />
              <Tab label="Tarde" />
              <Tab label="Todos" />
            </Tabs>
          </Grid>
        </Grid>
      </Paper>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell padding="checkbox">
                <Checkbox
                  checked={seleccionarTodos}
                  onChange={handleSeleccionarTodos}
                  indeterminate={pedidosSeleccionados.length > 0 && pedidosSeleccionados.length < pedidos.length}
                />
              </TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>Fecha</TableCell>
              <TableCell>Periodo</TableCell>
              <TableCell>Estado</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell>Notas</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pedidos.map((pedido) => (
              <TableRow key={pedido.id}>
                <TableCell padding="checkbox">
                  <Checkbox
                    checked={pedidosSeleccionados.includes(pedido.id)}
                    onChange={() => handleSeleccionarPedido(pedido.id)}
                  />
                </TableCell>
                <TableCell>{pedido.cliente_nombre}</TableCell>
                <TableCell>
                  {(() => {
                    try {
                      return format(new Date(pedido.fecha), 'dd/MM/yyyy', { locale: es });
                    } catch (e) {
                      return pedido.fecha;
                    }
                  })()}
                </TableCell>
                <TableCell>
                  {pedido.periodo === 'mañana' ? 'Mañana' : 'Tarde'}
                </TableCell>
                <TableCell>{getEstadoChip(pedido.estado)}</TableCell>
                <TableCell align="right">${pedido.total.toFixed(2)}</TableCell>
                <TableCell>{pedido.notas}</TableCell>
                <TableCell align="center">
                  <IconButton
                    color="info"
                    size="small"
                    onClick={() => navigate(`/admin/pedidos/${pedido.id}`)}
                    title="Ver detalles"
                  >
                    <VisibilityIcon />
                  </IconButton>
                  <IconButton
                    color="primary"
                    size="small"
                    onClick={() => navigate(`/admin/pedidos/${pedido.id}/edit`)}
                    title="Editar pedido"
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    color="success"
                    size="small"
                    onClick={() => handleRepeatOrder(pedido)}
                    title="Repetir pedido"
                  >
                    <RepeatIcon />
                  </IconButton>
                  <IconButton
                    color="warning"
                    size="small"
                    onClick={() => handlePrint(pedido, 'repartidor')}
                    title="Imprimir hoja de reparto"
                  >
                    <LocalShippingIcon />
                  </IconButton>
                  <IconButton
                    color="secondary"
                    size="small"
                    onClick={() => handlePrint(pedido, 'preparador')}
                    title="Imprimir hoja de producción"
                  >
                    <RestaurantIcon />
                  </IconButton>
                  <IconButton
                    color="error"
                    size="small"
                    onClick={() => handleDelete(pedido.id)}
                    title="Eliminar pedido"
                  >
                    <DeleteIcon />
                  </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {pedidos.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No hay pedidos para la fecha y periodo seleccionados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="md" fullWidth>
        <DialogTitle>{isEditing ? 'Editar Pedido' : 'Nuevo Pedido'}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="dense">
                <InputLabel id="cliente-label">Cliente</InputLabel>
                <Select
                  labelId="cliente-label"
                  name="cliente_id"
                  value={currentPedido.cliente_id}
                  onChange={handleInputChange}
                  label="Cliente"
                  required
                >
                  <MenuItem value="">
                    <em>Seleccione un cliente</em>
                  </MenuItem>
                  {clientes.map((cliente) => (
                    <MenuItem key={cliente.id} value={cliente.id}>
                      {cliente.nombre}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <DatePicker
                label="Fecha"
                value={currentPedido.fecha}
                onChange={handleDateChange}
                format="dd/MM/yyyy"
                slotProps={{ textField: { fullWidth: true, margin: 'dense' } }}
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="dense">
                <InputLabel id="periodo-label">Periodo</InputLabel>
                <Select
                  labelId="periodo-label"
                  name="periodo"
                  value={currentPedido.periodo}
                  onChange={handleInputChange}
                  label="Periodo"
                >
                  <MenuItem value="mañana">Mañana</MenuItem>
                  <MenuItem value="tarde">Tarde</MenuItem>
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={6}>
              <FormControl fullWidth margin="dense">
                <InputLabel id="estado-label">Estado</InputLabel>
                <Select
                  labelId="estado-label"
                  name="estado"
                  value={currentPedido.estado}
                  onChange={handleInputChange}
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
                margin="dense"
                name="notas"
                label="Notas"
                type="text"
                fullWidth
                multiline
                rows={2}
                variant="outlined"
                value={currentPedido.notas}
                onChange={handleInputChange}
              />
            </Grid>
          </Grid>
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

export default Pedidos;