import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Menu,
  MenuItem,
  Avatar,
  Chip,
  Divider,
  ListItemIcon,
  ListItemText,
  Tabs,
  Tab,
  IconButton,
  useMediaQuery,
  Drawer,
  List,
  ListItem,
  ListItemButton,
} from '@mui/material';
import {
  Person,
  ExitToApp,
  AdminPanelSettings,
  Work,
  AccountBalance,
  People,
  ShoppingCart,
  Inventory,
  Receipt,
  Home,
  Menu as MenuIcon,
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const Navbar = () => {
  const { user, logout, isAdmin, isContador } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [anchorEl, setAnchorEl] = useState(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const open = Boolean(anchorEl);
  const isMobile = useMediaQuery('(max-width:900px)');

  // Obtener el tab actual basado en la ruta
  const getCurrentTab = () => {
    const path = location.pathname;
    if (path === '/admin' || path === '/admin/') return 0;
    if (path.startsWith('/admin/clientes')) return 1;
    if (path.startsWith('/admin/pedidos')) return 2;
    if (path.startsWith('/admin/productos')) return 3;
    if (path.startsWith('/admin/facturas')) return 4;
    return 0;
  };

  const handleTabChange = (event, newValue) => {
    navigateToTab(newValue);
  };

  const navigateToTab = (value) => {
    const routes = ['/admin', '/admin/clientes', '/admin/pedidos', '/admin/productos', '/admin/facturas'];
    navigate(routes[value] || '/admin');
    setMobileOpen(false);
  };

  // Obtener las tabs disponibles según el rol
  const getAvailableTabs = () => {
    const tabs = [
      { label: 'Inicio', icon: <Home />, value: 0 }
    ];

    if (isAdmin || user?.role === 'empleado') {
      tabs.push(
        { label: 'Clientes', icon: <People />, value: 1 },
        { label: 'Pedidos', icon: <ShoppingCart />, value: 2 },
        { label: 'Productos', icon: <Inventory />, value: 3 }
      );
    }

    if (isAdmin || isContador) {
      tabs.push({ label: 'Facturas', icon: <Receipt />, value: 4 });
    }

    return tabs;
  };

  const handleClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    handleClose();
    logout();
  };

  const getRoleIcon = (role) => {
    switch (role) {
      case 'admin': return <AdminPanelSettings />;
      case 'contador': return <AccountBalance />;
      case 'empleado': return <Work />;
      default: return <Person />;
    }
  };

  const getRoleLabel = (role) => {
    switch (role) {
      case 'admin': return 'Administrador';
      case 'contador': return 'Contador';
      case 'empleado': return 'Empleado';
      default: return role;
    }
  };

  return (
    <>
      <AppBar
        position="sticky"
        elevation={0}
        sx={{
          background: 'linear-gradient(135deg, #3D2B1F 0%, #5C4433 100%)',
          borderBottom: '3px solid #D4A373',
          borderRadius: '0 !important',
          mb: 0,
        }}
      >
        <Toolbar sx={{ minHeight: { xs: 64, md: 72 } }}>
          {/* Logo */}
          <Box
            sx={{
              display: 'flex',
              alignItems: 'center',
              cursor: 'pointer',
              mr: 4,
              '&:hover': { opacity: 0.9 },
              transition: 'opacity 0.2s',
            }}
            onClick={() => navigate('/admin')}
          >
            <Box
              sx={{
                height: 55,
                mr: 1,
                display: 'flex',
                alignItems: 'center',
              }}
            >
              <img 
                src="/LOGO.png" 
                alt="Donde la Eli" 
                style={{ 
                  height: '100%', 
                  objectFit: 'contain',
                  filter: 'grayscale(1) contrast(5) invert(1)',
                  mixBlendMode: 'screen',
                }} 
              />
            </Box>
            <Box>
              <Typography
                sx={{
                  fontFamily: '"Work Sans", sans-serif',
                  fontSize: '0.65rem',
                  color: '#D4A373',
                  letterSpacing: '0.15em',
                  textTransform: 'uppercase',
                  fontWeight: 500,
                  mt: 0.5,
                }}
              >
                Sistema de Gestión
              </Typography>
            </Box>
          </Box>

          {/* Mobile menu button */}
          {isMobile && user && (
            <IconButton
              edge="start"
              color="inherit"
              onClick={() => setMobileOpen(true)}
              sx={{ ml: 'auto', mr: 1 }}
            >
              <MenuIcon />
            </IconButton>
          )}

          {/* Desktop Navigation */}
          {!isMobile && user && (
            <>
              <Box sx={{ flexGrow: 1 }}>
                <Tabs
                  value={getCurrentTab()}
                  onChange={handleTabChange}
                  textColor="inherit"
                  TabIndicatorProps={{
                    style: {
                      backgroundColor: '#D4A373',
                      height: 3,
                      borderRadius: '3px 3px 0 0',
                    }
                  }}
                  sx={{
                    '& .MuiTab-root': {
                      color: 'rgba(253,251,247,0.55)',
                      fontFamily: '"Work Sans", sans-serif',
                      fontWeight: 500,
                      fontSize: '0.85rem',
                      minHeight: 72,
                      transition: 'color 0.25s, background-color 0.25s',
                      borderRadius: '12px 12px 0 0',
                      '&:hover': {
                        color: 'rgba(253,251,247,0.85)',
                        backgroundColor: 'rgba(212,163,115,0.08)',
                      },
                      '&.Mui-selected': {
                        color: '#FDFBF7',
                        fontWeight: 600,
                      },
                    },
                    '& .MuiTab-iconWrapper': {
                      fontSize: '1.2rem',
                    },
                  }}
                >
                  {getAvailableTabs().map((tab) => (
                    <Tab
                      key={tab.value}
                      icon={tab.icon}
                      label={tab.label}
                      value={tab.value}
                    />
                  ))}
                </Tabs>
              </Box>

              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                <Chip
                  icon={getRoleIcon(user.role)}
                  label={getRoleLabel(user.role)}
                  size="small"
                  sx={{
                    bgcolor: 'rgba(212,163,115,0.15)',
                    color: '#E8C9A5',
                    borderColor: 'rgba(212,163,115,0.3)',
                    border: '1px solid',
                    fontFamily: '"Work Sans", sans-serif',
                    fontWeight: 500,
                    fontSize: '0.75rem',
                    '& .MuiChip-icon': {
                      color: '#D4A373',
                      fontSize: '1rem',
                    },
                  }}
                />

                <Button
                  color="inherit"
                  onClick={handleClick}
                  startIcon={
                    <Avatar
                      sx={{
                        width: 34,
                        height: 34,
                        bgcolor: '#D4A373',
                        color: '#3D2B1F',
                        fontFamily: '"Newsreader", serif',
                        fontWeight: 700,
                        fontSize: '0.95rem',
                      }}
                    >
                      {user.nombre_completo ? user.nombre_completo.charAt(0).toUpperCase() : user.username.charAt(0).toUpperCase()}
                    </Avatar>
                  }
                  sx={{
                    textTransform: 'none',
                    color: '#FDFBF7',
                    fontFamily: '"Be Vietnam Pro", sans-serif',
                    fontWeight: 500,
                    borderRadius: '12px',
                    px: 1.5,
                    '&:hover': {
                      bgcolor: 'rgba(212,163,115,0.1)',
                    },
                  }}
                >
                  {user.nombre_completo || user.username}
                </Button>

                <Menu
                  anchorEl={anchorEl}
                  open={open}
                  onClose={handleClose}
                  onClick={handleClose}
                  PaperProps={{
                    elevation: 0,
                    sx: {
                      overflow: 'visible',
                      filter: 'drop-shadow(0px 4px 20px rgba(61,43,31,0.12))',
                      mt: 1.5,
                      minWidth: 220,
                      bgcolor: '#FDFBF7',
                      border: '1px solid #EDE8E0',
                      borderRadius: '16px !important',
                      '&:before': {
                        content: '""',
                        display: 'block',
                        position: 'absolute',
                        top: 0,
                        right: 14,
                        width: 12,
                        height: 12,
                        bgcolor: '#FDFBF7',
                        border: '1px solid #EDE8E0',
                        borderBottom: 'none',
                        borderRight: 'none',
                        transform: 'translateY(-50%) rotate(45deg)',
                        zIndex: 0,
                      },
                    },
                  }}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                  <MenuItem disabled sx={{ opacity: '1 !important' }}>
                    <ListItemIcon>
                      <Person fontSize="small" sx={{ color: '#D4A373' }} />
                    </ListItemIcon>
                    <Box>
                      <Typography variant="subtitle2" sx={{ color: '#3D2B1F', fontWeight: 600 }}>
                        {user.nombre_completo || user.username}
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#A9A196' }}>
                        {user.email}
                      </Typography>
                    </Box>
                  </MenuItem>

                  <Divider sx={{ my: 1 }} />

                  <MenuItem
                    onClick={handleLogout}
                    sx={{
                      color: '#A26769',
                      '&:hover': {
                        bgcolor: '#F8EFEF !important',
                      },
                    }}
                  >
                    <ListItemIcon>
                      <ExitToApp fontSize="small" sx={{ color: '#A26769' }} />
                    </ListItemIcon>
                    <ListItemText>Cerrar Sesión</ListItemText>
                  </MenuItem>
                </Menu>
              </Box>
            </>
          )}
        </Toolbar>
      </AppBar>

      {/* Mobile Drawer */}
      <Drawer
        anchor="right"
        open={mobileOpen}
        onClose={() => setMobileOpen(false)}
        PaperProps={{
          sx: {
            width: 280,
            bgcolor: '#FDFBF7',
            borderLeft: '3px solid #D4A373',
          }
        }}
      >
        <Box sx={{ p: 3, background: 'linear-gradient(135deg, #3D2B1F, #5C4433)', color: '#FDFBF7', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <img 
            src="/LOGO.png" 
            alt="Donde la Eli" 
            style={{ 
              width: '80%', 
              objectFit: 'contain',
              filter: 'grayscale(1) contrast(5) invert(1)',
              mixBlendMode: 'screen',
              marginBottom: '10px'
            }} 
          />
          {user && (
            <Typography variant="body2" sx={{ color: '#D4A373', mt: 0.5, fontFamily: '"Work Sans", sans-serif' }}>
              {user.nombre_completo || user.username}
            </Typography>
          )}
        </Box>
        <List sx={{ pt: 2 }}>
          {getAvailableTabs().map((tab) => (
            <ListItem key={tab.value} disablePadding>
              <ListItemButton
                selected={getCurrentTab() === tab.value}
                onClick={() => navigateToTab(tab.value)}
                sx={{
                  mx: 1.5,
                  borderRadius: '12px',
                  mb: 0.5,
                  '&.Mui-selected': {
                    bgcolor: '#FDF5EC',
                    color: '#B8884D',
                    '&:hover': { bgcolor: '#F8E6D0' },
                  },
                  '&:hover': { bgcolor: '#F7F3ED' },
                }}
              >
                <ListItemIcon sx={{ color: getCurrentTab() === tab.value ? '#D4A373' : '#A9A196', minWidth: 40 }}>
                  {tab.icon}
                </ListItemIcon>
                <ListItemText
                  primary={tab.label}
                  primaryTypographyProps={{
                    fontFamily: '"Work Sans", sans-serif',
                    fontWeight: getCurrentTab() === tab.value ? 600 : 400,
                    fontSize: '0.9rem',
                  }}
                />
              </ListItemButton>
            </ListItem>
          ))}
        </List>
        <Divider sx={{ my: 2 }} />
        <List>
          <ListItem disablePadding>
            <ListItemButton
              onClick={handleLogout}
              sx={{
                mx: 1.5,
                borderRadius: '12px',
                color: '#A26769',
                '&:hover': { bgcolor: '#F8EFEF' },
              }}
            >
              <ListItemIcon sx={{ color: '#A26769', minWidth: 40 }}>
                <ExitToApp />
              </ListItemIcon>
              <ListItemText
                primary="Cerrar Sesión"
                primaryTypographyProps={{
                  fontFamily: '"Work Sans", sans-serif',
                  fontWeight: 500,
                  fontSize: '0.9rem',
                }}
              />
            </ListItemButton>
          </ListItem>
        </List>
      </Drawer>
    </>
  );
};

export default Navbar;