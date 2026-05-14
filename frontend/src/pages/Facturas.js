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
  Grid,
  Card,
  CardContent,
  Chip,
  MenuItem,
  Select,
  FormControl,
  InputLabel,
  Checkbox,
  List,
  ListItem,
  ListItemText,
  ListItemIcon,
  Divider,
  Tab,
  Tabs,
} from '@mui/material';
import {
  Add as AddIcon,
  Edit as EditIcon,
  Delete,
  Print as PrintIcon,
  CloudUpload as CloudUploadIcon,
  Assessment as AssessmentIcon,
} from '@mui/icons-material';
import { DatePicker } from '@mui/x-date-pickers/DatePicker';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';

function Facturas() {
  const { authenticatedFetch, isAdmin } = useAuth();
  const [facturas, setFacturas] = useState([]);
  const [clientes, setClientes] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [openDialog, setOpenDialog] = useState(false);
  const [currentFactura, setCurrentFactura] = useState({
    cliente_id: '',
    pedidos_ids: [],
    fecha: new Date(),
    numero_factura: '',
    subtotal: 0,
    impuestos: 0,
    total: 0,
    estado: 'pendiente',
    notas: '',
  });
  const [selectedPedidos, setSelectedPedidos] = useState([]);
  const [filtrosPedidos, setFiltrosPedidos] = useState({
    fechaInicio: new Date(),
    fechaFin: new Date(),
    cliente: '',
    periodo: 'dia' // dia, semana, mes
  });
  const [tabValue, setTabValue] = useState(0);
  const [isEditing, setIsEditing] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });
  const [filtroFecha, setFiltroFecha] = useState(null);
  const [filtroEstado, setFiltroEstado] = useState('todos');
  const [reporteData, setReporteData] = useState(null);
  const [isUploading, setIsUploading] = useState(false);

  const fetchFacturas = useCallback(async () => {
    try {
      const params = {};
      if (filtroFecha && !isNaN(filtroFecha.getTime())) {
        params.fecha = format(filtroFecha, 'yyyy-MM-dd');
      }
      if (filtroEstado !== 'todos') {
        params.estado = filtroEstado;
      }
      const queryString = new URLSearchParams(params).toString();
      const response = await authenticatedFetch(`/api/facturas${queryString ? '?' + queryString : ''}`);
      if (response.ok) {
        const json = await response.json();
        setFacturas(json.data || json);
      } else {
        throw new Error('Error al cargar facturas');
      }
    } catch (error) {
      console.error('Error al cargar facturas:', error);
      setSnackbar({
        open: true,
        message: 'Error al cargar las facturas',
        severity: 'error',
      });
    }
  }, [filtroFecha, filtroEstado, authenticatedFetch]);

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
    }
  }, [authenticatedFetch]);

  const fetchPedidos = useCallback(async () => {
    try {
      const params = {
        fechaInicio: filtrosPedidos.fechaInicio && !isNaN(filtrosPedidos.fechaInicio.getTime()) ? format(filtrosPedidos.fechaInicio, 'yyyy-MM-dd') : '',
        fechaFin: filtrosPedidos.fechaFin && !isNaN(filtrosPedidos.fechaFin.getTime()) ? format(filtrosPedidos.fechaFin, 'yyyy-MM-dd') : '',
        cliente: filtrosPedidos.cliente || undefined,
      };
      const queryString = new URLSearchParams(params).toString();
      const response = await authenticatedFetch(`/api/facturas/pedidos-disponibles?${queryString}`);
      if (response.ok) {
        const data = await response.json();
        setPedidos(Array.isArray(data) ? data : (data.data || []));
      } else {
        throw new Error('Error al cargar pedidos');
      }
    } catch (error) {
      console.error('Error al cargar pedidos:', error);
    }
  }, [filtrosPedidos, authenticatedFetch]);

  const fetchReporte = useCallback(async () => {
    try {
      const fechaParaReporte = (filtroFecha && !isNaN(filtroFecha.getTime())) ? filtroFecha : new Date();
      const mes = fechaParaReporte.getMonth() + 1;
      const anio = fechaParaReporte.getFullYear();
      const response = await authenticatedFetch(`/api/facturas/reporte?mes=${mes}&anio=${anio}`);
      if (response.ok) {
        setReporteData(await response.json());
      }
    } catch (error) {
      console.error('Error al cargar reporte:', error);
    }
  }, [filtroFecha, authenticatedFetch]);

  useEffect(() => {
    fetchFacturas();
    fetchClientes();
    fetchReporte();
  }, [fetchFacturas, fetchClientes, fetchReporte]);
  
  useEffect(() => {
    fetchPedidos();
  }, [fetchPedidos]);

  const handleOpenDialog = (factura = null) => {
    if (factura) {
      setCurrentFactura({
        ...factura,
        fecha: factura.fecha ? new Date(factura.fecha + 'T00:00:00') : new Date(),
        pedidos_ids: factura.pedidos_ids || []
      });
      setSelectedPedidos(factura.pedidos_ids || []);
      setIsEditing(true);
    } else {
      setCurrentFactura({
        cliente_id: '',
        pedidos_ids: [],
        fecha: new Date(),
        numero_factura: generateNumeroFactura(),
        subtotal: 0,
        impuestos: 0,
        total: 0,
        estado: 'pendiente',
        notas: '',
      });
      setSelectedPedidos([]);
      setIsEditing(false);
    }
    setOpenDialog(true);
  };

  const handleCloseDialog = () => {
    setOpenDialog(false);
  };

  const generateNumeroFactura = () => {
    const fecha = new Date();
    const year = fecha.getFullYear();
    const month = String(fecha.getMonth() + 1).padStart(2, '0');
    const day = String(fecha.getDate()).padStart(2, '0');
    const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');
    return `F${year}${month}${day}${random}`;
  };

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setCurrentFactura({
      ...currentFactura,
      [name]: value,
    });
  };

  const handlePedidoSelection = (pedidoId, isSelected) => {
    let newSelectedPedidos;
    if (isSelected) {
      newSelectedPedidos = [...selectedPedidos, pedidoId];
    } else {
      newSelectedPedidos = selectedPedidos.filter(id => id !== pedidoId);
    }
    
    setSelectedPedidos(newSelectedPedidos);
    
    // Calcular totales basados en pedidos seleccionados
    const pedidosSeleccionados = pedidos.filter(p => newSelectedPedidos.includes(p.id));
    const subtotal = pedidosSeleccionados.reduce((sum, p) => sum + (p.total || 0), 0);
    const impuestos = subtotal * 0.21; // 21% IVA
    const total = subtotal + impuestos;
    
    // Determinar cliente común (si todos los pedidos son del mismo cliente)
    const clienteIds = [...new Set(pedidosSeleccionados.map(p => p.cliente_id))];
    const clienteId = clienteIds.length === 1 ? clienteIds[0] : '';
    
    setCurrentFactura({
      ...currentFactura,
      pedidos_ids: newSelectedPedidos,
      cliente_id: clienteId,
      subtotal: subtotal,
      impuestos: impuestos,
      total: total,
    });
  };
  
  const handlePeriodoChange = (periodo) => {
    const hoy = new Date();
    let fechaInicio, fechaFin;
    
    switch (periodo) {
      case 'dia':
        fechaInicio = new Date(hoy);
        fechaFin = new Date(hoy);
        break;
      case 'semana':
        fechaInicio = new Date(hoy.getTime() - 7 * 24 * 60 * 60 * 1000);
        fechaFin = new Date(hoy);
        break;
      case 'mes':
        fechaInicio = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
        fechaFin = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0);
        break;
      default:
        fechaInicio = new Date(hoy);
        fechaFin = new Date(hoy);
    }
    
    setFiltrosPedidos({
      ...filtrosPedidos,
      periodo,
      fechaInicio,
      fechaFin
    });
  };

  const handleSubmit = async () => {
    try {
      if (!currentFactura.cliente_id || currentFactura.pedidos_ids.length === 0) {
        setSnackbar({
          open: true,
          message: 'Cliente y al menos un pedido son obligatorios',
          severity: 'error',
        });
        return;
      }

      const facturaData = {
        ...currentFactura,
        fecha: currentFactura.fecha && !isNaN(currentFactura.fecha.getTime()) ? format(currentFactura.fecha, 'yyyy-MM-dd') : '',
      };

      let response;
      if (isEditing) {
        response = await authenticatedFetch(`/api/facturas/${currentFactura.id}`, {
          method: 'PUT',
          body: JSON.stringify(facturaData)
        });
      } else {
        response = await authenticatedFetch('/api/facturas', {
          method: 'POST',
          body: JSON.stringify(facturaData)
        });
      }

      if (response.ok) {
        setSnackbar({
          open: true,
          message: isEditing ? 'Factura actualizada correctamente' : 'Factura creada correctamente',
          severity: 'success',
        });
        fetchFacturas();
        handleCloseDialog();
      } else {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Error al guardar factura');
      }
    } catch (error) {
      console.error('Error al guardar factura:', error);
      setSnackbar({
        open: true,
        message: error.message || 'Error al guardar la factura',
        severity: 'error',
      });
    }
  };

  const handleDelete = async (id) => {
    if (!isAdmin) {
      setSnackbar({
        open: true,
        message: 'Solo los administradores pueden eliminar facturas',
        severity: 'error',
      });
      return;
    }
    
    if (window.confirm('¿Está seguro de eliminar esta factura?')) {
      try {
        const response = await authenticatedFetch(`/api/facturas/${id}`, {
          method: 'DELETE'
        });
        
        if (response.ok) {
          setFacturas(facturas.filter((f) => f.id !== id));
          setSnackbar({
            open: true,
            message: 'Factura eliminada correctamente',
            severity: 'success',
          });
        } else {
          const errorData = await response.json();
          throw new Error(errorData.error || 'Error al eliminar factura');
        }
      } catch (error) {
        console.error('Error al eliminar factura:', error);
        setSnackbar({
          open: true,
          message: error.message || 'Error al eliminar la factura',
          severity: 'error',
        });
      }
    }
  };

  const handlePrint = async (factura) => {
    try {
      // 1. Fetch full details of the invoice
      const response = await authenticatedFetch(`/api/facturas/${factura.id}`);
      if (!response.ok) throw new Error('No se pudo cargar el detalle de la factura');
      const data = await response.json();

      // 2. Open new window
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        alert('Por favor permite las ventanas emergentes (pop-ups) para imprimir la factura.');
        return;
      }
      
      // 3. Generate HTML
      const html = `
        <html>
          <head>
            <title>Factura Electrónica N° ${data.numero_factura}</title>
            <style>
              body { font-family: 'Arial', sans-serif; padding: 20px; color: #000; font-size: 12px; }
              .header { display: flex; justify-content: space-between; margin-bottom: 20px; }
              .company-info { width: 55%; display: flex; align-items: flex-start; }
              .logo { width: 140px; height: 140px; object-fit: contain; margin-right: 15px; }
              .company-details h1 { margin: 0; color: #ff0000; font-size: 16px; font-weight: bold; }
              .company-details p { margin: 2px 0; color: #0000ff; font-size: 11px; }
              .sii-box-container { width: 40%; text-align: center; }
              .sii-box { border: 3px solid #ff0000; padding: 15px; text-align: center; color: #ff0000; font-weight: bold; }
              .sii-box h2 { margin: 5px 0; font-size: 18px; }
              .sii-box p { margin: 5px 0; font-size: 16px; }
              .sii-city { color: #ff0000; font-weight: bold; font-size: 14px; margin-top: 5px; }
              
              .client-info-container { display: flex; justify-content: space-between; margin-bottom: 10px; }
              .client-info { border: 1px solid #000; padding: 5px; width: 60%; }
              .client-info table { width: 100%; font-size: 11px; }
              .client-info td { padding: 2px; }
              .client-info .label { color: #0000ff; width: 100px; }
              
              .fecha-emision { width: 35%; text-align: left; padding-top: 10px; font-size: 11px; }
              .fecha-emision span { color: #0000ff; }
              
              .items-table { width: 100%; border-collapse: collapse; margin-bottom: 10px; border: 1px solid #000; }
              .items-table th { border: 1px solid #000; padding: 5px; color: #0000ff; font-size: 11px; font-weight: normal; text-align: center; }
              .items-table td { border-left: 1px solid #000; border-right: 1px solid #000; padding: 5px; font-size: 11px; }
              .items-table tr { height: 20px; }
              
              .bottom-section { display: flex; justify-content: space-between; margin-top: 10px; }
              .payment-barcode { width: 50%; }
              .forma-pago { color: #0000ff; font-size: 11px; margin-bottom: 15px; }
              .barcode-container { text-align: center; margin-top: 20px; }
              .barcode-container img { width: 250px; height: 80px; }
              .barcode-text { font-size: 10px; text-align: center; margin-top: 5px; }
              
              .totals-box { border: 1px solid #000; width: 40%; padding: 10px; }
              .totals-table { width: 100%; font-size: 11px; }
              .totals-table td { padding: 4px; }
              .totals-table .label { color: #0000ff; text-align: right; }
              .totals-table .value { text-align: right; }
            </style>
          </head>
          <body>
            <div class="header">
              <div class="company-info">
                <img src="${window.location.origin}/LOGO.png" alt="Logo" class="logo" />
                <div class="company-details">
                  <h1>DONDE LA ELI SPA</h1>
                  <p>Giro: PANADERIA, PASTELERIA Y ELABORACION DE ALIMENTOS</p>
                  <p>AVENIDA PRINCIPAL 123 - SANTIAGO</p>
                  <p>eMail: contacto@dondelaeli.cl Telefono: +56 9 1234 5678</p>
                  <p>TIPO DE VENTA: DEL GIRO</p>
                </div>
              </div>
              <div class="sii-box-container">
                <div class="sii-box">
                  <p>R.U.T.: 76.123.456-7</p>
                  <h2>FACTURA ELECTRONICA</h2>
                  <p>Nº ${data.numero_factura.replace('F', '')}</p>
                </div>
                <div class="sii-city">S.I.I. - SANTIAGO CENTRO</div>
              </div>
            </div>

            <div class="client-info-container">
              <div class="client-info">
                <table>
                  <tr><td class="label">SEÑOR(ES):</td><td colspan="3">${data.cliente_nombre.toUpperCase()}</td></tr>
                  <tr><td class="label">R.U.T.:</td><td colspan="3">${data.cliente_rut || '11.111.111-1'}</td></tr>
                  <tr><td class="label">GIRO:</td><td colspan="3">${data.cliente_giro || 'PARTICULAR'}</td></tr>
                  <tr>
                    <td class="label">DIRECCION:</td><td>${(data.cliente_direccion || 'No registrada').toUpperCase()}</td>
                  </tr>
                  <tr>
                    <td class="label">COMUNA:</td><td>${(data.cliente_comuna || 'SANTIAGO').toUpperCase()}</td>
                    <td class="label">CIUDAD:</td><td>${(data.cliente_ciudad || 'SANTIAGO').toUpperCase()}</td>
                  </tr>
                  <tr><td class="label">CONTACTO:</td><td colspan="3">${data.cliente_telefono || ''}</td></tr>
                  <tr><td class="label">TIPO DE<br>COMPRA:</td><td colspan="3">DEL GIRO</td></tr>
                </table>
              </div>
              <div class="fecha-emision">
                <span>Fecha Emision:</span> ${new Date(data.fecha + 'T00:00:00').toLocaleDateString('es-CL', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>

            <table class="items-table">
              <thead>
                <tr>
                  <th style="width: 10%;">Codigo</th>
                  <th style="width: 40%;">Descripcion</th>
                  <th style="width: 10%;">Cantidad</th>
                  <th style="width: 10%;">Precio</th>
                  <th style="width: 10%;">%Impto<br>Adic.*</th>
                  <th style="width: 10%;">%Desc.</th>
                  <th style="width: 10%;">Valor</th>
                </tr>
              </thead>
              <tbody>
                ${data.pedidos && data.pedidos.length > 0 
                  ? data.pedidos.map((p, index) => `
                    <tr>
                      <td>${index + 1}</td>
                      <td>PEDIDO FECHA ${new Date(p.fecha + 'T00:00:00').toLocaleDateString('es-CL')}</td>
                      <td style="text-align: right;">1 un</td>
                      <td style="text-align: right;">${Math.round(p.total / 1.19)}</td>
                      <td></td>
                      <td></td>
                      <td style="text-align: right;">${Math.round(p.total / 1.19)}</td>
                    </tr>
                  `).join('')
                  : `<tr>
                      <td>1</td>
                      <td>CONSUMO GENERAL</td>
                      <td style="text-align: right;">1 un</td>
                      <td style="text-align: right;">${Math.round(data.subtotal || 0)}</td>
                      <td></td>
                      <td></td>
                      <td style="text-align: right;">${Math.round(data.subtotal || 0)}</td>
                    </tr>`
                }
                <!-- Fill empty rows to make table look complete -->
                <tr style="height: 100px;">
                  <td></td><td></td><td></td><td></td><td></td><td></td><td></td>
                </tr>
              </tbody>
            </table>

            <div class="bottom-section">
              <div class="payment-barcode">
                <div class="forma-pago">
                  Forma de Pago: Contado
                </div>
                <div class="barcode-container">
                  <!-- Barcode placeholder. In a real scenario, this is a base64 PDF417 image generated from the SII XML string -->
                  <div style="width: 250px; height: 80px; background: repeating-linear-gradient(90deg, #000, #000 2px, #fff 2px, #fff 4px, #000 4px, #000 5px, #fff 5px, #fff 8px); margin: 0 auto;"></div>
                  <div class="barcode-text">Timbre Electrónico SII<br>Res.99 de 2014 Verifique documento: www.sii.cl</div>
                </div>
              </div>
              
              <div class="totals-box">
                <table class="totals-table">
                  <tr>
                    <td class="label">MONTO NETO</td>
                    <td class="label">$</td>
                    <td class="value">${Math.round(data.subtotal || 0).toLocaleString('es-CL')}</td>
                  </tr>
                  <tr>
                    <td class="label">I.V.A. 19%</td>
                    <td class="label">$</td>
                    <td class="value">${Math.round(data.impuestos || 0).toLocaleString('es-CL')}</td>
                  </tr>
                  <tr>
                    <td class="label">IMPUESTO ADICIONAL</td>
                    <td class="label">$</td>
                    <td class="value">0</td>
                  </tr>
                  <tr>
                    <td class="label" style="font-weight: bold;">TOTAL</td>
                    <td class="label" style="font-weight: bold;">$</td>
                    <td class="value" style="font-weight: bold;">${Math.round(data.total || 0).toLocaleString('es-CL')}</td>
                  </tr>
                </table>
              </div>
            </div>
            
            <script>
              window.onload = function() {
                setTimeout(function() { window.print(); }, 500);
              }
            </script>
          </body>
        </html>
      `;
      printWindow.document.write(html);
      printWindow.document.close();
      
    } catch (err) {
      console.error(err);
      setSnackbar({
        open: true,
        message: 'Error al generar la factura para imprimir.',
        severity: 'error',
      });
    }
  };

  const handleSubirSII = async (facturaId) => {
    if (!window.confirm('¿Desea enviar este documento al SII?')) return;
    
    setIsUploading(true);
    try {
      const response = await authenticatedFetch(`/api/facturas/${facturaId}/subir-sii`, {
        method: 'POST'
      });
      const data = await response.json();
      
      if (response.ok) {
        setSnackbar({
          open: true,
          message: data.message || 'Factura subida con éxito',
          severity: 'success'
        });
        fetchFacturas();
        fetchReporte();
      } else {
        throw new Error(data.error || 'Error al subir al SII');
      }
    } catch (error) {
      console.error('Error SII:', error);
      setSnackbar({
        open: true,
        message: error.message,
        severity: 'error'
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const getEstadoColor = (estado) => {
    switch (estado) {
      case 'pagada':
        return 'success';
      case 'pendiente':
        return 'warning';
      case 'vencida':
        return 'error';
      default:
        return 'default';
    }
  };

  return (
    <Box>
      <Box display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">Facturas</Typography>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={() => handleOpenDialog()}
        >
          Nueva Factura
        </Button>
      </Box>

      {/* Reporte de Facturación (Dashboard) */}
      {reporteData && (
        <Grid container spacing={2} sx={{ mb: 3 }}>
          <Grid item xs={12} sm={3}>
            <Card sx={{ bgcolor: 'primary.light', color: 'primary.contrastText' }}>
              <CardContent>
                <Box display="flex" justifyContent="space-between" alignItems="center">
                  <Typography variant="subtitle2">Documentos</Typography>
                  <AssessmentIcon fontSize="small" />
                </Box>
                <Typography variant="h4">{reporteData.stats.total_documentos}</Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Card sx={{ bgcolor: 'white', border: '1px solid #ddd' }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">Monto Neto</Typography>
                <Typography variant="h5" color="primary.main">
                  ${reporteData.stats.neto?.toLocaleString() || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Card sx={{ bgcolor: 'white', border: '1px solid #ddd' }}>
              <CardContent>
                <Typography variant="subtitle2" color="text.secondary">IVA (19%)</Typography>
                <Typography variant="h5" color="secondary.main">
                  ${reporteData.stats.iva?.toLocaleString() || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Card sx={{ bgcolor: 'success.light', color: 'success.contrastText' }}>
              <CardContent>
                <Typography variant="subtitle2">Recaudado</Typography>
                <Typography variant="h5">
                  ${reporteData.stats.recaudado?.toLocaleString() || 0}
                </Typography>
              </CardContent>
            </Card>
          </Grid>
        </Grid>
      )}

      {/* Filtros */}
      <Card sx={{ mb: 3 }}>
        <CardContent>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <DatePicker
                label="Fecha (Dejar vacío para ver todas)"
                value={filtroFecha}
                onChange={(newValue) => setFiltroFecha(newValue)}
                slotProps={{ textField: { fullWidth: true, clearable: true } }}
              />
            </Grid>
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Estado</InputLabel>
                <Select
                  value={filtroEstado}
                  label="Estado"
                  onChange={(e) => setFiltroEstado(e.target.value)}
                >
                  <MenuItem value="todos">Todos</MenuItem>
                  <MenuItem value="pendiente">Pendiente</MenuItem>
                  <MenuItem value="pagada">Pagada</MenuItem>
                  <MenuItem value="vencida">Vencida</MenuItem>
                </Select>
              </FormControl>
            </Grid>
          </Grid>
        </CardContent>
      </Card>

      <TableContainer component={Paper}>
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Número</TableCell>
              <TableCell>Cliente</TableCell>
              <TableCell>Fecha</TableCell>
              <TableCell align="right">Subtotal</TableCell>
              <TableCell align="right">Impuestos</TableCell>
              <TableCell align="right">Total</TableCell>
              <TableCell align="center">Estado</TableCell>
              <TableCell align="center">Acciones</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {facturas.map((factura) => (
              <TableRow key={factura.id}>
                <TableCell>{factura.numero_factura}</TableCell>
                <TableCell>{factura.cliente_nombre}</TableCell>
                <TableCell>
                  {(() => {
                    try {
                      const d = new Date(factura.fecha + 'T12:00:00'); // Forzar mediodía para evitar saltos de zona horaria
                      return isNaN(d.getTime()) ? factura.fecha : format(d, 'dd/MM/yyyy', { locale: es });
                    } catch (e) {
                      return factura.fecha;
                    }
                  })()}
                </TableCell>
                <TableCell align="right">${factura.subtotal?.toFixed(2)}</TableCell>
                <TableCell align="right">${factura.impuestos?.toFixed(2)}</TableCell>
                <TableCell align="right">${factura.total?.toFixed(2)}</TableCell>
                <TableCell align="center">
                  <Chip
                    label={factura.estado}
                    color={getEstadoColor(factura.estado)}
                    size="small"
                  />
                </TableCell>
                <TableCell align="center">
                  <IconButton
                    color="primary"
                    onClick={() => handleOpenDialog(factura)}
                    size="small"
                  >
                    <EditIcon />
                  </IconButton>
                  <IconButton
                    color="secondary"
                    onClick={() => handlePrint(factura)}
                    size="small"
                  >
                    <PrintIcon />
                  </IconButton>
                  {isAdmin && (
                        <IconButton
                          color="error"
                          onClick={() => handleDelete(factura.id)}
                          size="small"
                          title="Eliminar"
                        >
                          <Delete />
                        </IconButton>
                      )}
                      <IconButton
                        color="info"
                        onClick={() => handleSubirSII(factura.id)}
                        size="small"
                        disabled={isUploading || factura.estado === 'pagada'}
                        title="Subir al SII"
                      >
                        <CloudUploadIcon />
                      </IconButton>
                </TableCell>
              </TableRow>
            ))}
            {facturas.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} align="center">
                  No hay facturas para la fecha y estado seleccionados
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* Dialog para crear/editar factura */}
      <Dialog open={openDialog} onClose={handleCloseDialog} maxWidth="lg" fullWidth>
        <DialogTitle>
          {isEditing ? 'Editar Factura' : 'Nueva Factura'}
        </DialogTitle>
        <DialogContent>
          <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
            <Tabs value={tabValue} onChange={(e, newValue) => setTabValue(newValue)}>
              <Tab label="Información General" />
              <Tab label="Seleccionar Pedidos" />
            </Tabs>
          </Box>
          
          {/* Tab 1: Información General */}
          {tabValue === 0 && (
            <Grid container spacing={2} sx={{ mt: 1 }}>
              <Grid item xs={12} sm={6}>
                <TextField
                  name="numero_factura"
                  label="Número de Factura"
                  value={currentFactura.numero_factura}
                  onChange={handleInputChange}
                  fullWidth
                  disabled
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <DatePicker
                  label="Fecha"
                  value={currentFactura.fecha}
                  onChange={(newValue) => setCurrentFactura({ ...currentFactura, fecha: newValue })}
                  slotProps={{ textField: { fullWidth: true } }}
                />
              </Grid>
              <Grid item xs={12}>
                <FormControl fullWidth>
                  <InputLabel>Cliente</InputLabel>
                  <Select
                    value={currentFactura.cliente_id}
                    label="Cliente"
                    onChange={(e) => setCurrentFactura({ ...currentFactura, cliente_id: e.target.value })}
                    disabled={selectedPedidos.length > 0}
                  >
                    {clientes.map((cliente) => (
                      <MenuItem key={cliente.id} value={cliente.id}>
                        {cliente.nombre}
                      </MenuItem>
                    ))}
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  name="subtotal"
                  label="Subtotal"
                  type="number"
                  value={currentFactura.subtotal.toFixed(2)}
                  fullWidth
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  name="impuestos"
                  label="Impuestos (21%)"
                  type="number"
                  value={currentFactura.impuestos.toFixed(2)}
                  fullWidth
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={4}>
                <TextField
                  name="total"
                  label="Total"
                  type="number"
                  value={currentFactura.total.toFixed(2)}
                  fullWidth
                  InputProps={{ readOnly: true }}
                />
              </Grid>
              <Grid item xs={12} sm={6}>
                <FormControl fullWidth>
                  <InputLabel>Estado</InputLabel>
                  <Select
                    name="estado"
                    value={currentFactura.estado}
                    label="Estado"
                    onChange={handleInputChange}
                  >
                    <MenuItem value="pendiente">Pendiente</MenuItem>
                    <MenuItem value="pagada">Pagada</MenuItem>
                    <MenuItem value="vencida">Vencida</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12}>
                <TextField
                  name="notas"
                  label="Notas"
                  value={currentFactura.notas}
                  onChange={handleInputChange}
                  fullWidth
                  multiline
                  rows={3}
                />
              </Grid>
            </Grid>
          )}
          
          {/* Tab 2: Seleccionar Pedidos */}
          {tabValue === 1 && (
            <Box>
              {/* Filtros de período */}
              <Card sx={{ mb: 2 }}>
                <CardContent>
                  <Typography variant="h6" gutterBottom>
                    Filtrar Pedidos por Período
                  </Typography>
                  <Grid container spacing={2} alignItems="center">
                    <Grid item xs={12} sm={3}>
                      <FormControl fullWidth>
                        <InputLabel>Período</InputLabel>
                        <Select
                          value={filtrosPedidos.periodo}
                          label="Período"
                          onChange={(e) => handlePeriodoChange(e.target.value)}
                        >
                          <MenuItem value="dia">Hoy</MenuItem>
                          <MenuItem value="semana">Esta Semana</MenuItem>
                          <MenuItem value="mes">Este Mes</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <DatePicker
                        label="Fecha Inicio"
                        value={filtrosPedidos.fechaInicio}
                        onChange={(newValue) => setFiltrosPedidos({ ...filtrosPedidos, fechaInicio: newValue })}
                        renderInput={(params) => <TextField {...params} fullWidth />}
                      />
                    </Grid>
                    <Grid item xs={12} sm={4}>
                      <DatePicker
                        label="Fecha Fin"
                        value={filtrosPedidos.fechaFin}
                        onChange={(newValue) => setFiltrosPedidos({ ...filtrosPedidos, fechaFin: newValue })}
                        renderInput={(params) => <TextField {...params} fullWidth />}
                      />
                    </Grid>
                  </Grid>
                </CardContent>
              </Card>
              
              {/* Lista de pedidos para seleccionar */}
              <Typography variant="h6" gutterBottom>
                Pedidos Disponibles ({pedidos.length})
              </Typography>
              <Paper sx={{ maxHeight: 400, overflow: 'auto' }}>
                <List>
                  {pedidos.map((pedido) => (
                    <React.Fragment key={pedido.id}>
                      <ListItem>
                        <ListItemIcon>
                          <Checkbox
                            checked={selectedPedidos.includes(pedido.id)}
                            onChange={(e) => handlePedidoSelection(pedido.id, e.target.checked)}
                          />
                        </ListItemIcon>
                        <ListItemText
                          primary={`Pedido #${pedido.id} - ${pedido.cliente_nombre}`}
                          secondary={
                            <Box>
                              <Typography variant="body2" color="text.secondary">
                                Fecha: {(() => {
                                  try {
                                    return format(new Date(pedido.fecha), 'dd/MM/yyyy', { locale: es });
                                  } catch (e) {
                                    return pedido.fecha;
                                  }
                                })()}
                              </Typography>
                              <Typography variant="body2" color="text.secondary">
                                Total: ${pedido.total?.toFixed(2)}
                              </Typography>
                            </Box>
                          }
                        />
                      </ListItem>
                      <Divider />
                    </React.Fragment>
                  ))}
                  {pedidos.length === 0 && (
                    <ListItem>
                      <ListItemText
                        primary="No hay pedidos disponibles"
                        secondary="No se encontraron pedidos completados para el período seleccionado"
                      />
                    </ListItem>
                  )}
                </List>
              </Paper>
              
              {selectedPedidos.length > 0 && (
                <Box sx={{ mt: 2 }}>
                  <Typography variant="h6">
                    Resumen: {selectedPedidos.length} pedido(s) seleccionado(s)
                  </Typography>
                  <Typography variant="body1">
                    Subtotal: ${currentFactura.subtotal.toFixed(2)}
                  </Typography>
                  <Typography variant="body1">
                    Impuestos (21%): ${currentFactura.impuestos.toFixed(2)}
                  </Typography>
                  <Typography variant="h6" color="primary">
                    Total: ${currentFactura.total.toFixed(2)}
                  </Typography>
                </Box>
              )}
            </Box>
          )}
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

export default Facturas;