import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { CssBaseline, Container, Box, Typography } from '@mui/material';
import { LocalizationProvider } from '@mui/x-date-pickers';
import { AdapterDateFns } from '@mui/x-date-pickers/AdapterDateFns';
import { es } from 'date-fns/locale';
import { CartProvider } from './contexts/CartContext';
import ProtectedRoute from './components/ProtectedRoute';
import SmoothScroll from './components/SmoothScroll';
import { AuthProvider } from './contexts/AuthContext';
import Navbar from './components/Navbar';

// Componentes
import Dashboard from './pages/Dashboard';
import Clientes from './pages/Clientes';
import DetalleCliente from './pages/DetalleCliente';
import Pedidos from './pages/Pedidos';
import DetallePedido from './pages/DetallePedido';
import EditarPedido from './pages/EditarPedido';
import NuevoPedido from './pages/NuevoPedido';
import Productos from './pages/Productos';
import Facturas from './pages/Facturas';
import ForgotPassword from './pages/ForgotPassword';
import ResetPassword from './pages/ResetPassword';
import Login from './pages/Login';
import Home from './pages/Home';
import Nosotros from './pages/Nosotros';
import Tienda from './pages/Tienda';
import Checkout from './pages/Checkout';
import PublicNavbar from './components/PublicNavbar';

// Tema personalizado — Design System Panadería
const theme = createTheme({
  palette: {
    primary: {
      main: '#D4A373',
      light: '#E8C9A5',
      dark: '#B8884D',
      contrastText: '#FFFFFF',
    },
    secondary: {
      main: '#A26769',
      light: '#C08F91',
      dark: '#7E4E50',
      contrastText: '#FFFFFF',
    },
    background: {
      default: '#FDFBF7',
      paper: '#FFFFFF',
    },
    text: {
      primary: '#3D2B1F',
      secondary: '#5C4433',
    },
    success: {
      main: '#6B9B6B',
      light: '#E8F2E8',
      contrastText: '#FFFFFF',
    },
    warning: {
      main: '#D4A348',
      light: '#FFF8EC',
      contrastText: '#FFFFFF',
    },
    error: {
      main: '#A26769',
      light: '#F8EFEF',
      contrastText: '#FFFFFF',
    },
    info: {
      main: '#7D8FAF',
      light: '#EEF1F6',
      contrastText: '#FFFFFF',
    },
    divider: '#EDE8E0',
  },
  typography: {
    fontFamily: '"Be Vietnam Pro", "Segoe UI", sans-serif',
    h1: { fontFamily: '"Newsreader", Georgia, serif', fontWeight: 700 },
    h2: { fontFamily: '"Newsreader", Georgia, serif', fontWeight: 700 },
    h3: { fontFamily: '"Newsreader", Georgia, serif', fontWeight: 600 },
    h4: { fontFamily: '"Newsreader", Georgia, serif', fontWeight: 600 },
    h5: { fontFamily: '"Newsreader", Georgia, serif', fontWeight: 600 },
    h6: { fontFamily: '"Newsreader", Georgia, serif', fontWeight: 600 },
    subtitle1: { fontWeight: 500 },
    subtitle2: { fontWeight: 500 },
    button: { fontFamily: '"Work Sans", sans-serif', fontWeight: 600, textTransform: 'none' },
    overline: { fontFamily: '"Work Sans", sans-serif', letterSpacing: '0.08em' },
  },
  shape: {
    borderRadius: 12,
  },
  components: {
    MuiButton: {
      styleOverrides: {
        root: {
          borderRadius: 12,
          padding: '8px 20px',
          fontWeight: 600,
        },
        containedPrimary: {
          background: 'linear-gradient(135deg, #D4A373 0%, #B8884D 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #C49363 0%, #A67840 100%)',
          },
        },
        containedSecondary: {
          background: 'linear-gradient(135deg, #A26769 0%, #7E4E50 100%)',
          '&:hover': {
            background: 'linear-gradient(135deg, #925B5D 0%, #6E4244 100%)',
          },
        },
      },
    },
    MuiCard: {
      styleOverrides: {
        root: {
          borderRadius: 16,
          border: '1px solid #EDE8E0',
        },
      },
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          borderRadius: 16,
        },
      },
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontFamily: '"Work Sans", sans-serif',
          fontWeight: 500,
        },
      },
    },
    MuiTableCell: {
      styleOverrides: {
        head: {
          fontFamily: '"Work Sans", sans-serif',
          fontWeight: 600,
          textTransform: 'uppercase',
          fontSize: '0.78rem',
          letterSpacing: '0.05em',
        },
      },
    },
  },
});

// Layout for public pages
function PublicLayout() {
  return (
    <SmoothScroll>
      <Box sx={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
        <PublicNavbar />
        <Box component="main" sx={{ flexGrow: 1 }}>
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/nosotros" element={<Nosotros />} />
            <Route path="/tienda" element={<Tienda />} />
            <Route path="/checkout" element={<Checkout />} />
            <Route path="/login" element={<Login />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
          </Routes>
        </Box>
        <Box sx={{ py: 4, textAlign: 'center', bgcolor: 'primary.dark', color: 'white' }}>
          <Typography variant="body2">
            © {new Date().getFullYear()} DondeLaEli — Panadería Artesanal. Todos los derechos reservados.
          </Typography>
        </Box>
      </Box>
    </SmoothScroll>
  );
}

// Layout for protected pages (Navbar + content)
function ProtectedLayout() {
  return (
    <ProtectedRoute>
      <Box sx={{ minHeight: '100vh', bgcolor: '#FDFBF7' }}>
        <Navbar />
        <Container maxWidth="lg" sx={{ py: 2 }}>
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route 
              path="/clientes" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'empleado']}>
                  <Clientes />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/clientes/:id" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'empleado']}>
                  <DetalleCliente />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/pedidos" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'empleado']}>
                  <Pedidos />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/pedidos/nuevo" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'empleado']}>
                  <NuevoPedido />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/pedidos/:id" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'empleado']}>
                  <DetallePedido />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/pedidos/:id/edit" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'empleado']}>
                  <EditarPedido />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/productos" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'empleado']}>
                  <Productos />
                </ProtectedRoute>
              } 
            />
            <Route 
              path="/facturas" 
              element={
                <ProtectedRoute requiredRoles={['admin', 'contador']}>
                  <Facturas />
                </ProtectedRoute>
              } 
            />
          </Routes>
        </Container>
      </Box>
    </ProtectedRoute>
  );
}

function App() {
  return (
    <ThemeProvider theme={theme}>
      <LocalizationProvider dateAdapter={AdapterDateFns} adapterLocale={es}>
        <CssBaseline />
        <AuthProvider>
          <CartProvider>
            <Router>
              <Routes>
                <Route path="/admin/*" element={<ProtectedLayout />} />
                <Route path="/*" element={<PublicLayout />} />
              </Routes>
            </Router>
          </CartProvider>
        </AuthProvider>
      </LocalizationProvider>
    </ThemeProvider>
  );
}

export default App;
