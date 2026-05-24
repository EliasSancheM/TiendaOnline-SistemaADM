import React, { useState, useEffect, useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Card,
  CardContent,
  CardMedia,
  Button,
  CircularProgress,
  Snackbar,
  Alert,
  TextField,
  InputAdornment,
} from '@mui/material';
import { Search as SearchIcon, ShoppingBasket as BasketIcon, AddShoppingCart as AddIcon } from '@mui/icons-material';
import { useCart } from '../contexts/CartContext';
import axios from 'axios';
import { API_BASE_URL } from '../config/api';

// GSAP Imports
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

const Tienda = () => {
  const [productos, setProductos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filtro, setFiltro] = useState('');
  const { addToCart } = useCart();
  const [snackbar, setSnackbar] = useState({ open: false, message: '' });

  // Referencia principal para el contenedor
  const containerRef = useRef();

  useEffect(() => {
    const fetchProductos = async () => {
      try {
        setLoading(true);
        // Use public endpoint if available, otherwise fetch normally 
        const response = await axios.get(`${API_BASE_URL}/api/productos?limit=100`);
        setProductos(response.data.data || []);
      } catch (err) {
        console.error('Error fetching productos:', err);
        setError('No pudimos cargar los productos en este momento. Por favor, intenta más tarde.');
      } finally {
        setLoading(false);
      }
    };

    fetchProductos();
  }, []);

  const handleAddToCart = (producto) => {
    addToCart(producto);
    setSnackbar({ open: true, message: `${producto.nombre} añadido al pedido` });
  };

  const productosFiltrados = productos.filter(p => 
    p.nombre.toLowerCase().includes(filtro.toLowerCase()) || 
    (p.descripcion && p.descripcion.toLowerCase().includes(filtro.toLowerCase()))
  );

  useGSAP(() => {
    // Animaciones iniciales (cabecera y buscador)
    const tl = gsap.timeline();
    
    tl.from('.tienda-header > *', {
      y: -30,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power3.out',
    })
    .from('.tienda-search', {
      scale: 0.9,
      opacity: 0,
      duration: 0.5,
      ease: 'back.out(1.5)',
    }, '-=0.4');

  }, { scope: containerRef }); // Usar scope permite ejecutar la animación al cargar

  // Re-animar los productos cuando la lista cambie (loading o filtro)
  useGSAP(() => {
    if (!loading && productosFiltrados.length > 0) {
      gsap.from('.producto-card', {
        y: 40,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'power2.out',
        clearProps: 'all' // Limpia las propiedades para que funcione bien el hover CSS
      });
    }
  }, [loading, productosFiltrados.length]);

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress color="primary" />
      </Box>
    );
  }

  return (
    <Box ref={containerRef} sx={{ py: 8 }}>
      <Container maxWidth="lg">
        <Box className="tienda-header" sx={{ mb: 6, textAlign: 'center' }}>
          <Typography variant="h2" sx={{ mb: 2 }}>Nuestra Tienda</Typography>
          <Typography variant="h6" color="text.secondary" sx={{ fontWeight: 400 }}>
            Productos recién horneados, listos para tu mesa.
          </Typography>
        </Box>

        <Box className="tienda-search" sx={{ mb: 6, display: 'flex', justifyContent: 'center' }}>
          <TextField
            fullWidth
            maxWidth="md"
            variant="outlined"
            placeholder="Buscar pan, pasteles..."
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            sx={{ 
              maxWidth: 600,
              bgcolor: 'white',
              '& .MuiOutlinedInput-root': { borderRadius: 50 }
            }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="primary" />
                </InputAdornment>
              ),
            }}
          />
        </Box>

        {error && <Alert severity="info" sx={{ mb: 4 }}>{error}</Alert>}

        <Grid container spacing={4}>
          {productosFiltrados.map((producto) => (
            <Grid item xs={12} sm={6} md={4} key={producto.id} className="producto-card">
              <Card sx={{ 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column',
                transition: 'transform 0.3s ease, box-shadow 0.3s ease',
                '&:hover': {
                  transform: 'translateY(-8px)',
                  boxShadow: '0 12px 30px rgba(61,43,31,0.12)',
                }
              }}>
                <Box 
                  sx={{ 
                    height: 200, 
                    bgcolor: 'rgba(212, 163, 115, 0.1)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    position: 'relative',
                    backgroundImage: producto.imagen_url ? `url(${producto.imagen_url.startsWith('http') ? producto.imagen_url : `${API_BASE_URL}${producto.imagen_url}`})` : 'none',
                    backgroundSize: 'cover',
                    backgroundPosition: 'center'
                  }}
                >
                  {!producto.imagen_url && <BasketIcon sx={{ fontSize: 60, color: 'rgba(212, 163, 115, 0.3)' }} />}
                  <Box 
                    sx={{ 
                      position: 'absolute', 
                      bottom: 0, 
                      left: 0, 
                      right: 0, 
                      p: 1.5,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.4), transparent)',
                      textAlign: 'right'
                    }}
                  >
                    <Typography variant="h6" sx={{ color: 'white', fontWeight: 700 }}>
                      ${producto.precio.toLocaleString('es-CL')}
                    </Typography>
                  </Box>
                </Box>
                <CardContent sx={{ flexGrow: 1 }}>
                  <Typography variant="h5" gutterBottom sx={{ color: 'primary.dark' }}>
                    {producto.nombre}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">
                    {producto.descripcion || 'Sin descripción disponible.'}
                  </Typography>
                </CardContent>
                <Box sx={{ p: 2, pt: 0 }}>
                  <Button 
                    fullWidth 
                    variant="outlined" 
                    onClick={() => handleAddToCart(producto)}
                    startIcon={<AddIcon />}
                    sx={{ 
                      borderRadius: 2,
                      textTransform: 'none',
                      fontWeight: 600
                    }}
                  >
                    Añadir al pedido
                  </Button>
                </Box>
              </Card>
            </Grid>
          ))}
        </Grid>

        {productosFiltrados.length === 0 && !loading && (
          <Box className="producto-card" sx={{ textAlign: 'center', py: 10 }}>
            <Typography variant="h6" color="text.secondary">
              No encontramos productos que coincidan con tu búsqueda.
            </Typography>
          </Box>
        )}
      </Container>

      <Snackbar 
        open={snackbar.open} 
        autoHideDuration={3000} 
        onClose={() => setSnackbar({ ...snackbar, open: false })}
      >
        <Alert severity="success" sx={{ width: '100%' }}>
          {snackbar.message}
        </Alert>
      </Snackbar>
    </Box>
  );
};

export default Tienda;
