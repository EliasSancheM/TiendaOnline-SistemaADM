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
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Snackbar,
  Alert,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  ButtonGroup,
} from '@mui/material';
import {
  ArrowBack as ArrowBackIcon,
  Edit as EditIcon,
  Delete as DeleteIcon,
  Person as PersonIcon,
  Print as PrintIcon,
  LocalShipping as LocalShippingIcon,
  Restaurant as RestaurantIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { printStyles } from '../components/PlantillaImpresion';

function DetallePedido() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { authenticatedFetch } = useAuth();
  const [pedido, setPedido] = useState(null);
  const [loading, setLoading] = useState(true);
  const [printDialog, setPrintDialog] = useState(false);
  const [snackbar, setSnackbar] = useState({
    open: false,
    message: '',
    severity: 'success',
  });

  const fetchPedido = useCallback(async () => {
    try {
      const response = await authenticatedFetch(`/api/pedidos/${id}`);
      setPedido(await response.json());
      setLoading(false);
    } catch (error) {
      console.error('Error al cargar pedido:', error);
      setSnackbar({
        open: true,
        message: 'Error al cargar los datos del pedido',
        severity: 'error',
      });
      setLoading(false);
    }
  }, [id, authenticatedFetch]);

  useEffect(() => {
    fetchPedido();
  }, [id, fetchPedido]);

  const handleDeletePedido = async () => {
    if (window.confirm('¿Está seguro de eliminar este pedido? Esta acción no se puede deshacer.')) {
      try {
        await authenticatedFetch(`/api/pedidos/${id}`, {
          method: 'DELETE'
        });

        setSnackbar({
          open: true,
          message: 'Pedido eliminado correctamente',
          severity: 'success',
        });

        // Redirigir después de un breve retraso para que el usuario vea el mensaje
        setTimeout(() => {
          navigate('/admin/pedidos');
        }, 1500);
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

  const handleCloseSnackbar = () => {
    setSnackbar({ ...snackbar, open: false });
  };

  const handlePrint = (tipo) => {
    try {
      // Crear iframe oculto para impresión
      const iframe = document.createElement('iframe');
      iframe.style.position = 'absolute';
      iframe.style.top = '-9999px';
      iframe.style.left = '-9999px';
      iframe.style.width = '1px';
      iframe.style.height = '1px';
      document.body.appendChild(iframe);

      // Escribir contenido en el iframe
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      iframeDoc.open();
      iframeDoc.write(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Impresión - Pedido #${pedido.id}</title>
            <style>
              ${printStyles}
              body { font-family: Arial, sans-serif; margin: 0; padding: 20px; }
            </style>
          </head>
          <body>
            ${tipo === 'repartidor' ? renderPlantillaRepartidor() : renderPlantillaPreparador()}
          </body>
        </html>
      `);
      iframeDoc.close();

      // Esperar a que se cargue el contenido
      iframe.onload = () => {
        try {
          // Imprimir desde el iframe
          iframe.contentWindow.focus();
          iframe.contentWindow.print();
          
          // Limpiar después de un tiempo
          setTimeout(() => {
            document.body.removeChild(iframe);
          }, 1000);
        } catch (printError) {
          console.error('Error al imprimir desde iframe:', printError);
          document.body.removeChild(iframe);
        }
      };
      
      setSnackbar({
        open: true,
        message: 'Impresión enviada correctamente',
        severity: 'success',
      });
      
      setPrintDialog(false);
    } catch (error) {
      console.error('Error al imprimir:', error);
      setSnackbar({
        open: true,
        message: 'Error al generar la impresión',
        severity: 'error',
      });
    }
  };

  const renderPlantillaRepartidor = () => {
    return `
      <div style="max-width: 210mm; margin: auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 2rem; font-weight: bold; margin: 0;">HOJA DE REPARTO</h1>
          <h2 style="color: #1976d2; margin: 10px 0;">Pedido #${pedido.id}</h2>
        </div>

        <div style="margin-bottom: 30px;">
          <h3 style="font-weight: bold; margin-bottom: 10px;">INFORMACIÓN DE ENTREGA</h3>
          <hr style="margin-bottom: 20px;" />
          
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <div>
              <strong>Cliente:</strong><br>
              <span style="font-size: 1.2rem;">${pedido.cliente_nombre}</span>
            </div>
            <div style="text-align: right;">
              <strong>Fecha de Entrega:</strong><br>
              <span style="font-size: 1.2rem;">${format(new Date(pedido.fecha), 'dd/MM/yyyy', { locale: es })}</span>
            </div>
          </div>

          <div style="margin-bottom: 20px;">
            <strong>Período:</strong><br>
            <span style="font-size: 1.2rem; color: #1976d2;">${pedido.periodo === 'mañana' ? 'MAÑANA' : 'TARDE'}</span>
          </div>
        </div>

        <div style="margin-bottom: 30px;">
          <h3 style="font-weight: bold; margin-bottom: 10px;">PRODUCTOS A ENTREGAR</h3>
          <hr style="margin-bottom: 20px;" />
          
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Producto</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: center;">Cantidad</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: right;">Precio</th>
              </tr>
            </thead>
            <tbody>
              ${pedido.detalles?.map(detalle => `
                <tr>
                  <td style="border: 1px solid #ddd; padding: 12px;">${detalle.producto_nombre}</td>
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: center; font-weight: bold; font-size: 1.1rem;">${detalle.cantidad}</td>
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: right;">$${detalle.precio_unitario.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div style="margin-bottom: 30px;">
          <h3 style="font-weight: bold; color: #1976d2;">TOTAL A COBRAR: $${pedido.total.toFixed(2)}</h3>
        </div>

        ${pedido.notas ? `
          <div style="margin-bottom: 30px;">
            <strong>Notas Especiales:</strong><br>
            <em>${pedido.notas}</em>
          </div>
        ` : ''}

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc;">
          <div style="display: flex; justify-content: space-between;">
            <div>Firma del Cliente: ___________________</div>
            <div>Firma del Repartidor: ___________________</div>
          </div>
          <div style="margin-top: 20px;">
            Hora de Entrega: ___________________
          </div>
        </div>
      </div>
    `;
  };

  const renderPlantillaPreparador = () => {
    return `
      <div style="max-width: 210mm; margin: auto; padding: 20px; font-family: Arial, sans-serif;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="font-size: 2rem; font-weight: bold; margin: 0;">HOJA DE PRODUCCIÓN</h1>
          <h2 style="color: #1976d2; margin: 10px 0;">Pedido #${pedido.id}</h2>
        </div>

        <div style="margin-bottom: 30px;">
          <h3 style="font-weight: bold; margin-bottom: 10px;">INFORMACIÓN DEL PEDIDO</h3>
          <hr style="margin-bottom: 20px;" />
          
          <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <div>
              <strong>Cliente:</strong><br>
              <span>${pedido.cliente_nombre}</span>
            </div>
            <div style="text-align: right;">
              <strong>Fecha de Preparación:</strong><br>
              <span>${format(new Date(pedido.fecha), 'dd/MM/yyyy', { locale: es })}</span>
            </div>
          </div>

          <div style="display: flex; justify-content: space-between; margin-bottom: 20px;">
            <div>
              <strong>Período:</strong><br>
              <span style="font-size: 1.2rem; color: #1976d2;">${pedido.periodo === 'mañana' ? 'MAÑANA' : 'TARDE'}</span>
            </div>
            <div style="text-align: right;">
              <strong>Estado:</strong><br>
              <span>${pedido.estado}</span>
            </div>
          </div>
        </div>

        <div style="margin-bottom: 30px;">
          <h3 style="font-weight: bold; margin-bottom: 10px;">PRODUCTOS A PREPARAR</h3>
          <hr style="margin-bottom: 20px;" />
          
          <table style="width: 100%; border-collapse: collapse;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Producto</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: center;">Cantidad</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: center;">Preparado</th>
                <th style="border: 1px solid #ddd; padding: 12px; text-align: left;">Observaciones</th>
              </tr>
            </thead>
            <tbody>
              ${pedido.detalles?.map(detalle => `
                <tr>
                  <td style="border: 1px solid #ddd; padding: 12px; font-weight: bold;">${detalle.producto_nombre}</td>
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: center; font-weight: bold; font-size: 1.2rem; color: #1976d2;">${detalle.cantidad}</td>
                  <td style="border: 1px solid #ddd; padding: 12px; text-align: center;">☐</td>
                  <td style="border: 1px solid #ddd; padding: 12px; border-bottom: 1px solid #ccc; min-height: 20px;">&nbsp;</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        ${pedido.notas ? `
          <div style="margin-bottom: 30px;">
            <strong>Notas Especiales de Preparación:</strong><br>
            <em style="color: #d32f2f;">${pedido.notas}</em>
          </div>
        ` : ''}

        <div style="margin-bottom: 30px;">
          <strong>Notas Adicionales del Preparador:</strong><br>
          <div style="border: 1px solid #ccc; min-height: 60px; padding: 10px; margin-top: 10px;"></div>
        </div>

        <div style="margin-top: 40px; padding-top: 20px; border-top: 1px solid #ccc;">
          <div style="display: flex; justify-content: space-between;">
            <div>Preparado por: ___________________</div>
            <div>Hora de Inicio: ___________________</div>
            <div>Hora de Finalización: ___________________</div>
          </div>
        </div>
      </div>
    `;
  };

  const getEstadoChip = (estado) => {
    switch (estado) {
      case 'pendiente':
        return <Chip label="Pendiente" color="warning" />;
      case 'en_proceso':
        return <Chip label="En proceso" color="info" />;
      case 'completado':
        return <Chip label="Completado" color="success" />;
      case 'cancelado':
        return <Chip label="Cancelado" color="error" />;
      default:
        return <Chip label={estado} />;
    }
  };

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="50vh">
        <Typography>Cargando datos del pedido...</Typography>
      </Box>
    );
  }

  if (!pedido) {
    return (
      <Box>
        <Button
          startIcon={<ArrowBackIcon />}
          onClick={() => navigate('/admin/pedidos')}
          sx={{ mb: 2 }}
        >
          Volver a Pedidos
        </Button>
        <Paper sx={{ p: 3 }}>
          <Typography variant="h5" color="error">
            Pedido no encontrado
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
          onClick={() => navigate('/pedidos')}
        >
          Volver a Pedidos
        </Button>
        <Box>
          <IconButton
            color="success"
            onClick={() => setPrintDialog(true)}
            sx={{ mr: 1 }}
            title="Imprimir plantillas"
          >
            <PrintIcon />
          </IconButton>
          <IconButton
            color="primary"
            onClick={() => navigate(`/admin/pedidos/${id}/edit`)}
            sx={{ mr: 1 }}
          >
            <EditIcon />
          </IconButton>
          <IconButton color="error" onClick={handleDeletePedido}>
            <DeleteIcon />
          </IconButton>
        </Box>
      </Box>

      <Grid container spacing={3}>
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3 }}>
            <Typography variant="h5" gutterBottom>
              Información del Pedido
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Typography variant="h4">Pedido #{pedido.id}</Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1" color="text.secondary">
                  Fecha
                </Typography>
                <Typography variant="body1">
                  {format(new Date(pedido.fecha), 'dd/MM/yyyy', { locale: es })}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1" color="text.secondary">
                  Periodo
                </Typography>
                <Typography variant="body1">
                  {pedido.periodo === 'mañana' ? 'Mañana' : 'Tarde'}
                </Typography>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1" color="text.secondary">
                  Estado
                </Typography>
                <Box>{getEstadoChip(pedido.estado)}</Box>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Typography variant="subtitle1" color="text.secondary">
                  Total
                </Typography>
                <Typography variant="body1" fontWeight="bold">
                  ${pedido.total.toFixed(2)}
                </Typography>
              </Grid>
              {pedido.notas && (
                <Grid item xs={12}>
                  <Typography variant="subtitle1" color="text.secondary">
                    Notas
                  </Typography>
                  <Typography variant="body1">{pedido.notas}</Typography>
                </Grid>
              )}
              <Grid item xs={12}>
                <Typography variant="subtitle1" color="text.secondary">
                  Fecha de Creación
                </Typography>
                <Typography variant="body1">
                  {pedido.fecha_creacion
                    ? format(new Date(pedido.fecha_creacion), 'dd/MM/yyyy HH:mm', {
                        locale: es,
                      })
                    : 'No especificada'}
                </Typography>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6}>
          <Card>
            <CardContent>
              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="h5" gutterBottom>
                  Cliente
                </Typography>
                <IconButton
                  color="primary"
                  onClick={() => navigate(`/admin/clientes/${pedido.cliente_id}`)}
                >
                  <PersonIcon />
                </IconButton>
              </Box>
              <Divider sx={{ mb: 2 }} />

              <Typography variant="h6">{pedido.cliente_nombre}</Typography>
            </CardContent>
          </Card>

          <Card sx={{ mt: 3 }}>
            <CardContent>
              <Typography variant="h5" gutterBottom>
                Detalles del Pedido
              </Typography>
              <Divider sx={{ mb: 2 }} />

              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Producto</TableCell>
                      <TableCell align="right">Cantidad</TableCell>
                      <TableCell align="right">Precio Unit.</TableCell>
                      <TableCell align="right">Subtotal</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pedido.detalles.map((detalle) => (
                      <TableRow key={detalle.id}>
                        <TableCell>{detalle.producto_nombre}</TableCell>
                        <TableCell align="right">{detalle.cantidad}</TableCell>
                        <TableCell align="right">
                          ${detalle.precio_unitario.toFixed(2)}
                        </TableCell>
                        <TableCell align="right">
                          ${detalle.subtotal.toFixed(2)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow>
                      <TableCell colSpan={3} align="right">
                        <Typography variant="subtitle1" fontWeight="bold">
                          Total:
                        </Typography>
                      </TableCell>
                      <TableCell align="right">
                        <Typography variant="subtitle1" fontWeight="bold">
                          ${pedido.total.toFixed(2)}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Diálogo de impresión */}
      <Dialog
        open={printDialog}
        onClose={() => setPrintDialog(false)}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>
          <Box display="flex" alignItems="center">
            <PrintIcon sx={{ mr: 1 }} />
            Imprimir Plantillas - Pedido #{pedido?.id}
          </Box>
        </DialogTitle>
        <DialogContent>
          <Typography variant="body1" gutterBottom>
            Seleccione el tipo de plantilla que desea imprimir:
          </Typography>
          <Box mt={2}>
            <ButtonGroup
              orientation="vertical"
              variant="outlined"
              fullWidth
              size="large"
            >
              <Button
                startIcon={<LocalShippingIcon />}
                onClick={() => handlePrint('repartidor')}
                sx={{ mb: 2, py: 2 }}
              >
                <Box textAlign="left">
                  <Typography variant="subtitle1" fontWeight="bold">
                    Hoja de Reparto
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Para repartidores - Incluye información de entrega, cliente y productos
                  </Typography>
                </Box>
              </Button>
              <Button
                startIcon={<RestaurantIcon />}
                onClick={() => handlePrint('preparador')}
                sx={{ py: 2 }}
              >
                <Box textAlign="left">
                  <Typography variant="subtitle1" fontWeight="bold">
                    Hoja de Producción
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    Para preparadores - Incluye lista de productos y cantidades a preparar
                  </Typography>
                </Box>
              </Button>
            </ButtonGroup>
          </Box>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setPrintDialog(false)}>
            Cancelar
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

export default DetallePedido;