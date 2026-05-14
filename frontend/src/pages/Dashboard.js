import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  Grid,
  Typography,
  Button,
  Paper,
  Divider,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  IconButton,
  Tooltip,
  Alert,
  CircularProgress,
} from '@mui/material';
import {
  People as PeopleIcon,
  Cake as CakeIcon,
  TrendingUp as TrendingUpIcon,
  AttachMoney as MoneyIcon,
  Today as TodayIcon,
  Refresh as RefreshIcon,
  Visibility as VisibilityIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useAuth } from '../contexts/AuthContext';
import { 
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, Legend, ResponsiveContainer 
} from 'recharts';

// GSAP Imports
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';

function Dashboard() {
  const navigate = useNavigate();
  const { authenticatedFetch } = useAuth();
  const [stats, setStats] = useState({
    clientes: 0,
    pedidosHoy: 0,
    pedidosMañana: 0,
    pedidosTarde: 0,
    productos: 0,
    ventasHoy: 0,
    pedidosPendientes: 0,
    pedidosCompletados: 0,
  });
  const [pedidosRecientes, setPedidosRecientes] = useState([]);
  const [productosPopulares, setProductosPopulares] = useState([]);
  const [ventasSemanales, setVentasSemanales] = useState([]);
  const [ventasMensuales, setVentasMensuales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [lastUpdate, setLastUpdate] = useState(new Date());

  const containerRef = useRef();

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      
      const today = new Date().toISOString().split('T')[0];
      
      // Obtener datos básicos (limit=200 para estadísticas)
      const [clientesRes, pedidosHoyRes, todosPedidosRes, statsRes] = await Promise.all([
        authenticatedFetch('/api/clientes?limit=200'),
        authenticatedFetch(`/api/pedidos?fecha=${today}&limit=200`),
        authenticatedFetch('/api/pedidos?limit=200'),
        authenticatedFetch('/api/pedidos/dashboard-stats')
      ]);

      const clientesJson = await clientesRes.json();
      const pedidosHoyJson = await pedidosHoyRes.json();
      const todosPedidosJson = await todosPedidosRes.json();
      const statsJson = await statsRes.json();

      // Extraer datos del formato paginado
      const clientesData = clientesJson.data || clientesJson;
      const pedidosHoy = pedidosHoyJson.data || pedidosHoyJson;
      const todosPedidos = todosPedidosJson.data || todosPedidosJson;

      // Usar totales de la paginación si están disponibles
      const totalClientes = clientesJson.pagination?.total ?? clientesData.length;
      const totalPedidosPendientes = todosPedidos.filter(p => p.estado === 'pendiente').length;
      const totalPedidosCompletados = todosPedidos.filter(p => p.estado === 'completado').length;
      
      // Calcular estadísticas
      const pedidosMañana = pedidosHoy.filter(p => p.periodo === 'mañana').length;
      const pedidosTarde = pedidosHoy.filter(p => p.periodo === 'tarde').length;
      const ventasHoy = pedidosHoy.reduce((sum, pedido) => sum + parseFloat(pedido.total || 0), 0);
      
      // Obtener pedidos recientes (últimos 5)
      const pedidosRecientesData = todosPedidos
        .sort((a, b) => new Date(b.fecha) - new Date(a.fecha))
        .slice(0, 5);

      setStats({
        clientes: totalClientes,
        pedidosHoy: pedidosHoy.length,
        pedidosMañana,
        pedidosTarde,
        productos: statsJson.productosPopulares?.length || 0, // Mock for total since we don't fetch all products here anymore
        ventasHoy,
        pedidosPendientes: totalPedidosPendientes,
        pedidosCompletados: totalPedidosCompletados,
      });
      
      setPedidosRecientes(pedidosRecientesData);
      setProductosPopulares(statsJson.productosPopulares || []);
      setVentasSemanales(statsJson.ventasSemanales || []);
      setVentasMensuales(statsJson.ventasMensuales || []);
      setLastUpdate(new Date());
      
    } catch (error) {
      console.error('Error al cargar datos del dashboard:', error);
      setError('Error al cargar los datos del dashboard');
    } finally {
      setLoading(false);
    }
  }, [authenticatedFetch]);

  useEffect(() => {
    fetchData();
    
    // Actualizar datos cada 5 minutos
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    
    return () => clearInterval(interval);
  }, [fetchData]);

  useGSAP(() => {
    if (!loading) {
      const tl = gsap.timeline();
      
      // Animar cabecera
      tl.from('.dash-header', {
        y: -20,
        opacity: 0,
        duration: 0.5,
        ease: 'power2.out',
      })
      // Animar tarjetas (Stats)
      .from('.dash-card', {
        y: 30,
        opacity: 0,
        duration: 0.6,
        stagger: 0.1,
        ease: 'back.out(1.2)',
        clearProps: 'all' // Permitir hover de CSS luego de animar
      }, '-=0.2')
      // Animar bloques secundarios (Pedidos recientes, etc)
      .from('.dash-section', {
        y: 20,
        opacity: 0,
        duration: 0.5,
        stagger: 0.15,
        ease: 'power2.out',
      }, '-=0.3');
    }
  }, [loading]);

  const cards = [
    {
      title: 'Total Clientes',
      value: stats.clientes,
      icon: <PeopleIcon fontSize="large" />,
      action: () => navigate('/admin/clientes'),
      color: '#D4A373',
      bgColor: '#FDF5EC',
      iconBg: 'linear-gradient(135deg, #D4A373, #E8C9A5)',
    },
    {
      title: 'Pedidos Hoy',
      value: stats.pedidosHoy,
      icon: <TodayIcon fontSize="large" />,
      action: () => navigate('/admin/pedidos'),
      color: '#6B9B6B',
      bgColor: '#F0F7F0',
      iconBg: 'linear-gradient(135deg, #6B9B6B, #8FBB8F)',
    },
    {
      title: 'Ventas Hoy',
      value: `$${stats.ventasHoy.toLocaleString()}`,
      icon: <MoneyIcon fontSize="large" />,
      action: () => navigate('/admin/pedidos'),
      color: '#B8884D',
      bgColor: '#FFF8EC',
      iconBg: 'linear-gradient(135deg, #B8884D, #D4A373)',
    },
    {
      title: 'Total Productos',
      value: stats.productos,
      icon: <CakeIcon fontSize="large" />,
      action: () => navigate('/admin/productos'),
      color: '#A26769',
      bgColor: '#F8F0F0',
      iconBg: 'linear-gradient(135deg, #A26769, #C08F91)',
    },
    {
      title: 'Pedidos Pendientes',
      value: stats.pedidosPendientes,
      icon: <ScheduleIcon fontSize="large" />,
      action: () => navigate('/admin/pedidos'),
      color: '#C17A3A',
      bgColor: '#FDF5EC',
      iconBg: 'linear-gradient(135deg, #C17A3A, #D4A373)',
    },
    {
      title: 'Completados',
      value: stats.pedidosCompletados,
      icon: <TrendingUpIcon fontSize="large" />,
      action: () => navigate('/admin/pedidos'),
      color: '#5A8A5A',
      bgColor: '#EBF4EB',
      iconBg: 'linear-gradient(135deg, #5A8A5A, #7DAF7D)',
    },
  ];

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="400px">
        <CircularProgress size={60} />
        <Typography variant="h6" sx={{ ml: 2 }}>Cargando dashboard...</Typography>
      </Box>
    );
  }

  return (
    <Box ref={containerRef}>
      <Box className="dash-header" display="flex" justifyContent="space-between" alignItems="center" mb={3}>
        <Typography variant="h4">
          Dashboard
        </Typography>
        <Box display="flex" alignItems="center" gap={2}>
          <Typography variant="body2" color="text.secondary">
            Última actualización: {format(lastUpdate, 'HH:mm:ss', { locale: es })}
          </Typography>
          <Tooltip title="Actualizar datos">
            <IconButton onClick={fetchData} disabled={loading}>
              <RefreshIcon />
            </IconButton>
          </Tooltip>
        </Box>
      </Box>

      {error && (
        <Alert severity="error" sx={{ mb: 3 }}>
          {error}
        </Alert>
      )}

      <Grid container spacing={3} sx={{ mb: 4 }}>
        {cards.map((card, index) => (
          <Grid item xs={12} sm={6} md={4} key={index} className="dash-card">
            <Card sx={{ 
              height: '100%', 
              bgcolor: card.bgColor,
              border: `1px solid ${card.color}18 !important`,
              borderRadius: '18px !important',
              '&:hover': {
                transform: 'translateY(-4px)',
                boxShadow: `0 12px 32px ${card.color}18 !important`,
              },
              transition: 'all 0.3s cubic-bezier(0.4,0,0.2,1)',
              cursor: 'pointer',
            }}
            onClick={card.action}
            >
              <CardContent sx={{ p: 3 }}>
                <Box display="flex" justifyContent="space-between" alignItems="flex-start">
                  <Box>
                    <Typography 
                      variant="body2" 
                      sx={{ 
                        color: '#7D776D', 
                        fontFamily: '"Work Sans", sans-serif',
                        fontWeight: 500,
                        fontSize: '0.82rem',
                        textTransform: 'uppercase',
                        letterSpacing: '0.05em',
                        mb: 0.5,
                      }}
                    >
                      {card.title}
                    </Typography>
                    <Typography 
                      variant="h3" 
                      sx={{ 
                        color: card.color, 
                        fontWeight: 700,
                        fontFamily: '"Newsreader", serif',
                        fontSize: '2rem',
                      }}
                    >
                      {card.value}
                    </Typography>
                  </Box>
                  <Box
                    sx={{
                      width: 48,
                      height: 48,
                      borderRadius: '14px',
                      background: card.iconBg,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#FFFFFF',
                      boxShadow: `0 4px 12px ${card.color}30`,
                    }}
                  >
                    {card.icon}
                  </Box>
                </Box>
                <Button
                  variant="text"
                  size="small"
                  onClick={(e) => { e.stopPropagation(); card.action(); }}
                  sx={{ 
                    mt: 2, 
                    color: card.color,
                    fontFamily: '"Work Sans", sans-serif',
                    fontWeight: 600,
                    fontSize: '0.78rem',
                    p: 0,
                    '&:hover': {
                      bgcolor: 'transparent',
                      textDecoration: 'underline',
                    },
                  }}
                >
                  Ver detalles →
                </Button>
              </CardContent>
            </Card>
          </Grid>
        ))}
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6} className="dash-section">
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h5" gutterBottom>
              Pedidos de Hoy por Período
            </Typography>
            <Divider sx={{ mb: 2 }} />

            <Grid container spacing={2}>
              <Grid item xs={12}>
                <Card sx={{ bgcolor: '#FDF5EC', border: '1px solid #EDD1AF !important', mb: 2 }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="h6" sx={{ color: '#5C4433' }}>Mañana</Typography>
                        <Typography variant="h4" sx={{ color: '#D4A373', fontWeight: 700 }}>{stats.pedidosMañana}</Typography>
                      </Box>
                      <Box sx={{
                        width: 44, height: 44, borderRadius: '12px',
                        background: 'linear-gradient(135deg, #D4A373, #E8C9A5)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#FFF',
                      }}>
                        <TrendingUpIcon />
                      </Box>
                    </Box>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => navigate('/admin/pedidos?periodo=mañana')}
                      sx={{ mt: 2 }}
                      size="small"
                    >
                      Ver pedidos mañana
                    </Button>
                  </CardContent>
                </Card>
              </Grid>

              <Grid item xs={12}>
                <Card sx={{ bgcolor: '#FFF8EC', border: '1px solid #EDD1AF !important' }}>
                  <CardContent>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Box>
                        <Typography variant="h6" sx={{ color: '#5C4433' }}>Tarde</Typography>
                        <Typography variant="h4" sx={{ color: '#B8884D', fontWeight: 700 }}>{stats.pedidosTarde}</Typography>
                      </Box>
                      <Box sx={{
                        width: 44, height: 44, borderRadius: '12px',
                        background: 'linear-gradient(135deg, #B8884D, #D4A373)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: '#FFF',
                      }}>
                        <TrendingUpIcon />
                      </Box>
                    </Box>
                    <Button
                      variant="contained"
                      color="warning"
                      onClick={() => navigate('/admin/pedidos?periodo=tarde')}
                      sx={{ mt: 2 }}
                      size="small"
                    >
                      Ver pedidos tarde
                    </Button>
                  </CardContent>
                </Card>
              </Grid>
            </Grid>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6} className="dash-section">
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h5" gutterBottom>
              Pedidos Recientes
            </Typography>
            <Divider sx={{ mb: 2 }} />
            
            {pedidosRecientes.length === 0 ? (
              <Typography color="text.secondary" textAlign="center" py={4}>
                No hay pedidos recientes
              </Typography>
            ) : (
              <TableContainer>
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell>ID</TableCell>
                      <TableCell>Cliente</TableCell>
                      <TableCell>Fecha</TableCell>
                      <TableCell>Total</TableCell>
                      <TableCell>Estado</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {pedidosRecientes.map((pedido) => (
                      <TableRow key={pedido.id} hover>
                        <TableCell>#{pedido.id}</TableCell>
                        <TableCell>{pedido.cliente_nombre || `Cliente ${pedido.cliente_id}`}</TableCell>
                        <TableCell>
                          {format(new Date(pedido.fecha), 'dd/MM/yyyy', { locale: es })}
                        </TableCell>
                        <TableCell>${parseFloat(pedido.total || 0).toLocaleString()}</TableCell>
                        <TableCell>
                          <Chip 
                            label={pedido.estado} 
                            color={pedido.estado === 'completado' ? 'success' : 
                                   pedido.estado === 'pendiente' ? 'warning' : 'default'}
                            size="small"
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
            
            <Button
              variant="outlined"
              onClick={() => navigate('/admin/pedidos')}
              sx={{ mt: 2, width: '100%' }}
            >
              Ver todos los pedidos
            </Button>
          </Paper>
        </Grid>
      </Grid>

      <Grid container spacing={3} sx={{ mb: 4 }}>
        <Grid item xs={12} md={6} className="dash-section">
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h5" gutterBottom>
              Ventas Semanales (Últimos 7 días)
            </Typography>
            <Divider sx={{ mb: 3 }} />
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={ventasSemanales} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tickFormatter={(val) => {
                      const d = new Date(val + 'T12:00:00');
                      return isNaN(d) ? val : format(d, 'dd MMM', { locale: es });
                    }} 
                  />
                  <YAxis 
                    tickFormatter={(val) => `$${(val/1000)}k`} 
                  />
                  <RechartsTooltip 
                    formatter={(value) => [`$${value.toLocaleString()}`, 'Ventas']}
                    labelFormatter={(label) => {
                      const d = new Date(label + 'T12:00:00');
                      return isNaN(d) ? label : format(d, 'dd MMMM yyyy', { locale: es });
                    }}
                  />
                  <Line type="monotone" dataKey="total" stroke="#D4A373" strokeWidth={3} dot={{ r: 4 }} activeDot={{ r: 6 }} />
                </LineChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>

        <Grid item xs={12} md={6} className="dash-section">
          <Paper sx={{ p: 3, height: '100%' }}>
            <Typography variant="h5" gutterBottom>
              Ventas Mensuales (Último Año)
            </Typography>
            <Divider sx={{ mb: 3 }} />
            <Box sx={{ height: 300 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={ventasMensuales} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis 
                    dataKey="month" 
                    tickFormatter={(val) => {
                      const [year, month] = val.split('-');
                      const d = new Date(year, parseInt(month)-1, 1);
                      return format(d, 'MMM', { locale: es }).toUpperCase();
                    }}
                  />
                  <YAxis 
                    tickFormatter={(val) => `$${(val/1000)}k`}
                  />
                  <RechartsTooltip 
                    formatter={(value) => [`$${value.toLocaleString()}`, 'Ventas']}
                    labelFormatter={(label) => {
                      const [year, month] = label.split('-');
                      const d = new Date(year, parseInt(month)-1, 1);
                      return format(d, 'MMMM yyyy', { locale: es });
                    }}
                    cursor={{fill: 'transparent'}}
                  />
                  <Bar dataKey="total" fill="#6B9B6B" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Box>
          </Paper>
        </Grid>
      </Grid>

      <Paper className="dash-section" sx={{ p: 3 }}>
        <Typography variant="h5" gutterBottom>
          Productos Más Populares
        </Typography>
        <Divider sx={{ mb: 2 }} />
        
        {productosPopulares.length === 0 ? (
          <Typography color="text.secondary" textAlign="center" py={4}>
            No hay datos de productos
          </Typography>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Producto</TableCell>
                  <TableCell>Precio</TableCell>
                  <TableCell align="right">Cantidad Vendida</TableCell>
                  <TableCell align="right">Ingresos Totales</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {productosPopulares.map((producto) => (
                  <TableRow key={producto.id} hover>
                    <TableCell>
                      <Box>
                        <Typography variant="subtitle1" fontWeight="bold">
                          {producto.nombre}
                        </Typography>
                        <Typography variant="body2" color="text.secondary">
                          {producto.descripcion}
                        </Typography>
                      </Box>
                    </TableCell>
                    <TableCell>${parseFloat(producto.precio || 0).toLocaleString()}</TableCell>
                    <TableCell align="right">
                      <Chip 
                        label={producto.cantidadVendida} 
                        color={producto.cantidadVendida > 0 ? 'success' : 'default'}
                        variant={producto.cantidadVendida > 0 ? 'filled' : 'outlined'}
                      />
                    </TableCell>
                    <TableCell align="right">
                      <Typography variant="subtitle1" fontWeight="bold" color="success.main">
                        ${(parseFloat(producto.ingresosTotales || 0)).toLocaleString()}
                      </Typography>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
        
        <Button
          variant="outlined"
          onClick={() => navigate('/admin/productos')}
          sx={{ mt: 2, width: '100%' }}
        >
          Ver todos los productos
        </Button>
      </Paper>
    </Box>
  );
}

export default Dashboard;