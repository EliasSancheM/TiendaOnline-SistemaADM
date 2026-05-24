import React, { useState, useEffect } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Paper,
  TextField,
  Button,
  Divider,
  Stack,
  FormControl,
  FormLabel,
  RadioGroup,
  FormControlLabel,
  Radio,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  LocalShipping as ShippingIcon,
  CheckCircle as CheckIcon,
  ArrowBack as BackIcon,
  ErrorOutline as ErrorIcon,
  CancelOutlined as CancelIcon,
} from '@mui/icons-material';
import { useCart } from '../contexts/CartContext';
import { useNavigate, useLocation } from 'react-router-dom';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

const Checkout = () => {
  const { cart, cartTotal, clearCart } = useCart();
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState(null);
  const [paymentStatus, setPaymentStatus] = useState(null);

  const [formData, setFormData] = useState({
    nombre: '',
    email: '',
    telefono: '',
    direccion: '',
    periodo: 'mañana',
    notas: '',
  });

  useEffect(() => {
    // Check url for webpay return status
    const params = new URLSearchParams(location.search);
    const status = params.get('status');
    
    // Siempre actualizamos el estado, incluso si es null
    setPaymentStatus(status);
    
    if (status === 'success') {
      setSuccess(true);
      clearCart();
    }
  }, [location.search, clearCart]);

  if (cart.length === 0 && !success && !paymentStatus) {
    return (
      <Container maxWidth="md" sx={{ py: 10, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>Tu carrito está vacío</Typography>
        <Button variant="contained" onClick={() => navigate('/tienda')} sx={{ mt: 2 }}>
          Ir a la Tienda
        </Button>
      </Container>
    );
  }

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const payload = {
        cliente: {
          nombre: formData.nombre,
          email: formData.email,
          telefono: formData.telefono,
          direccion: formData.direccion,
        },
        items: cart,
        periodo: formData.periodo,
        notas: formData.notas,
        total: cartTotal,
      };

      const response = await axios.post(`${API_BASE_URL}/api/public/checkout`, payload);
      
      if (response.data.success && response.data.token && response.data.url) {
        // Redirigir a Webpay
        const form = document.createElement('form');
        form.action = response.data.url;
        form.method = 'POST';
        
        const inputToken = document.createElement('input');
        inputToken.type = 'hidden';
        inputToken.name = 'token_ws';
        inputToken.value = response.data.token;
        
        form.appendChild(inputToken);
        document.body.appendChild(form);
        form.submit();
      } else {
        throw new Error('No se pudo iniciar el pago. Respuesta inválida del servidor.');
      }
    } catch (err) {
      console.error('Checkout error:', err);
      setError(err.response?.data?.error || err.message || 'Hubo un problema al procesar tu pedido.');
      setLoading(false);
    }
  };

  if (success) {
    return (
      <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
        <CheckIcon sx={{ fontSize: 80, color: 'success.main', mb: 3 }} />
        <Typography variant="h3" gutterBottom>¡Pago Exitoso!</Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
          Gracias por preferir DondeLaEli. Tu pago ha sido aprobado y el pedido se está procesando. Te hemos enviado un correo con los detalles.
        </Typography>
        <Button variant="contained" size="large" onClick={() => navigate('/')} sx={{ borderRadius: 50, px: 4 }}>
          Volver al Inicio
        </Button>
      </Container>
    );
  }

  if (paymentStatus === 'rejected' || paymentStatus === 'error') {
    return (
      <Container maxWidth="sm" sx={{ py: 10, textAlign: 'center' }}>
        {paymentStatus === 'rejected' ? (
          <CancelIcon sx={{ fontSize: 80, color: 'error.main', mb: 3 }} />
        ) : (
          <ErrorIcon sx={{ fontSize: 80, color: 'warning.main', mb: 3 }} />
        )}
        <Typography variant="h3" gutterBottom>
          {paymentStatus === 'rejected' ? 'Pago Rechazado' : 'Error en el Pago'}
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
          {paymentStatus === 'rejected' 
            ? 'Tu tarjeta fue rechazada o anulaste la transacción.' 
            : 'Ocurrió un error de conexión con Transbank.'}
          Puedes intentar pagar nuevamente.
        </Typography>
        <Button variant="contained" size="large" onClick={() => navigate('/checkout')} sx={{ borderRadius: 50, px: 4 }}>
          Intentar de Nuevo
        </Button>
      </Container>
    );
  }

  return (
    <Box sx={{ py: 8, bgcolor: 'background.default', minHeight: '80vh' }}>
      <Container maxWidth="lg">
        <Button 
          startIcon={<BackIcon />} 
          onClick={() => navigate('/tienda')}
          sx={{ mb: 4 }}
        >
          Volver a la Tienda
        </Button>

        <Typography variant="h3" sx={{ mb: 6 }}>Confirmar Pedido</Typography>

        <Grid container spacing={6}>
          {/* Form Section */}
          <Grid item xs={12} md={7}>
            <Paper sx={{ p: 4, borderRadius: 4 }}>
              <Typography variant="h5" sx={{ mb: 4, fontWeight: 700 }}>
                Datos de Entrega
              </Typography>
              
              {error && <Alert severity="error" sx={{ mb: 4 }}>{error}</Alert>}

              <form onSubmit={handleSubmit}>
                <Grid container spacing={3}>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Nombre Completo"
                      name="nombre"
                      required
                      value={formData.nombre}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Correo Electrónico"
                      name="email"
                      type="email"
                      required
                      value={formData.email}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12} sm={6}>
                    <TextField
                      fullWidth
                      label="Teléfono de Contacto"
                      name="telefono"
                      required
                      value={formData.telefono}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Dirección de Entrega"
                      name="direccion"
                      required
                      multiline
                      rows={2}
                      value={formData.direccion}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <FormControl component="fieldset">
                      <FormLabel component="legend" sx={{ mb: 1, fontWeight: 600 }}>Horario de Entrega</FormLabel>
                      <RadioGroup
                        row
                        name="periodo"
                        value={formData.periodo}
                        onChange={handleChange}
                      >
                        <FormControlLabel value="mañana" control={<Radio />} label="Mañana (09:00 - 13:00)" />
                        <FormControlLabel value="tarde" control={<Radio />} label="Tarde (15:00 - 19:00)" />
                      </RadioGroup>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12}>
                    <TextField
                      fullWidth
                      label="Notas adicionales (opcional)"
                      name="notas"
                      multiline
                      rows={2}
                      placeholder="Ej: Tocar el timbre fuerte, dejar en conserjería..."
                      value={formData.notas}
                      onChange={handleChange}
                    />
                  </Grid>
                  <Grid item xs={12}>
                    <Button
                      fullWidth
                      type="submit"
                      variant="contained"
                      size="large"
                      disabled={loading}
                      sx={{ 
                        mt: 2, 
                        py: 2, 
                        borderRadius: 50, 
                        fontSize: '1.1rem',
                        fontWeight: 700
                      }}
                    >
                      {loading ? <CircularProgress size={24} color="inherit" /> : 'Pagar con Webpay'}
                    </Button>
                  </Grid>
                </Grid>
              </form>
            </Paper>
          </Grid>

          {/* Summary Section */}
          <Grid item xs={12} md={5}>
            <Paper sx={{ p: 4, borderRadius: 4, bgcolor: 'primary.dark', color: 'white' }}>
              <Typography variant="h5" sx={{ mb: 4, fontWeight: 700 }}>
                Resumen del Pedido
              </Typography>
              
              <Stack spacing={3}>
                {cart.map((item) => (
                  <Box key={item.id} sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Box>
                      <Typography variant="body1" fontWeight={700}>{item.nombre}</Typography>
                      <Typography variant="body2" sx={{ opacity: 0.8 }}>
                        {item.quantity} x ${item.precio.toLocaleString('es-CL')}
                      </Typography>
                    </Box>
                    <Typography variant="body1" fontWeight={700}>
                      ${(item.precio * item.quantity).toLocaleString('es-CL')}
                    </Typography>
                  </Box>
                ))}
              </Stack>

              <Divider sx={{ my: 4, bgcolor: 'rgba(255,255,255,0.1)' }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="h6">Total a Pagar</Typography>
                <Typography variant="h4" fontWeight={800}>
                  ${cartTotal.toLocaleString('es-CL')}
                </Typography>
              </Box>
              
              <Stack direction="row" spacing={1} alignItems="center" sx={{ mt: 4, opacity: 0.8 }}>
                <ShippingIcon fontSize="small" />
                <Typography variant="body2">Pago seguro vía Transbank</Typography>
              </Stack>
            </Paper>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Checkout;
