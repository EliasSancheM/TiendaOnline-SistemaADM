import React, { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  Button,
  Box,
  Container,
  IconButton,
  Drawer,
  List,
  ListItem,
  ListItemText,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Menu as MenuIcon, Close as CloseIcon, ShoppingCart as CartIcon } from '@mui/icons-material';
import { Link, useNavigate, useLocation } from 'react-router-dom';
import { useCart } from '../contexts/CartContext';
import { Badge } from '@mui/material';

// GSAP
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

import CartDrawer from './CartDrawer';

gsap.registerPlugin(ScrollTrigger);

const PublicNavbar = () => {
  const [mobileOpen, setMobileOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const navigate = useNavigate();
  const location = useLocation();
  const { cartCount } = useCart();
  const [cartOpen, setCartOpen] = useState(false);
  const navbarRef = React.useRef();

  useGSAP(() => {
    // Smart Navbar hide/show on scroll
    const showAnim = gsap.from(navbarRef.current, { 
      yPercent: -100,
      paused: true,
      duration: 0.4,
      ease: "power3.out"
    }).progress(1);

    ScrollTrigger.create({
      start: "top top",
      end: 99999,
      onUpdate: (self) => {
        if (self.direction === -1) {
          showAnim.play();
        } else if (self.direction === 1 && self.scroll() > 100) {
          showAnim.reverse();
        }
      }
    });
  }, []);

  const navItems = [
    { label: 'Inicio', path: '/' },
    { label: 'Nuestra Historia', path: '/nosotros' },
    { label: 'Tienda', path: '/tienda' },
  ];

  const handleDrawerToggle = () => {
    setMobileOpen(!mobileOpen);
  };

  const isActive = (path) => location.pathname === path;

  const drawer = (
    <Box sx={{ textAlign: 'center', p: 3 }}>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
        <IconButton onClick={handleDrawerToggle}>
          <CloseIcon />
        </IconButton>
      </Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', mb: 4 }}>
        <img 
          src="/LOGO.png" 
          alt="Donde la Eli" 
          style={{ height: 40, marginRight: '10px', mixBlendMode: 'multiply' }} 
        />
        <Typography variant="h5" sx={{ fontFamily: '"Newsreader", serif', color: 'primary.main' }}>
          DondeLaEli
        </Typography>
      </Box>
      <List>
        {navItems.map((item) => (
          <ListItem 
            button 
            key={item.label} 
            component={Link} 
            to={item.path}
            onClick={handleDrawerToggle}
            sx={{ 
              textAlign: 'center',
              borderRadius: 2,
              mb: 1,
              bgcolor: isActive(item.path) ? 'rgba(212, 163, 115, 0.1)' : 'transparent',
              color: isActive(item.path) ? 'primary.main' : 'text.primary',
            }}
          >
            <ListItemText primary={item.label} primaryTypographyProps={{ fontWeight: 600 }} />
          </ListItem>
        ))}
        <ListItem 
          button 
          component={Link} 
          to="/login"
          onClick={handleDrawerToggle}
          sx={{ 
            textAlign: 'center',
            borderRadius: 2,
            mt: 2,
            bgcolor: 'primary.main',
            color: 'white',
            '&:hover': { bgcolor: 'primary.dark' }
          }}
        >
          <ListItemText primary="Iniciar Sesión" primaryTypographyProps={{ fontWeight: 600 }} />
        </ListItem>
      </List>
    </Box>
  );

  return (
    <AppBar 
      ref={navbarRef}
      position="sticky" 
      elevation={0} 
      sx={{ 
        bgcolor: 'rgba(253, 251, 247, 0.95)', 
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid',
        borderColor: 'divider',
        color: 'text.primary',
        transition: 'background-color 0.3s ease',
      }}
    >
      <Container maxWidth="lg">
        <Toolbar sx={{ justifyContent: 'space-between', height: 80 }}>
          {/* Logo */}
          <Typography
            variant="h5"
            component={Link}
            to="/"
            sx={{
              fontFamily: '"Newsreader", serif',
              fontWeight: 700,
              textDecoration: 'none',
              color: 'primary.main',
              display: 'flex',
              alignItems: 'center',
            }}
          >
            <img 
              src="/LOGO.png" 
              alt="Donde la Eli" 
              style={{ 
                height: 48, 
                marginRight: '12px',
                mixBlendMode: 'multiply' 
              }} 
            />
            DondeLaEli
          </Typography>

          {/* Desktop Nav */}
          {!isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              {navItems.map((item) => (
                <Button
                  key={item.label}
                  component={Link}
                  to={item.path}
                  sx={{
                    px: 2,
                    color: isActive(item.path) ? 'primary.main' : 'text.primary',
                    fontWeight: 600,
                    '&:hover': { color: 'primary.main', bgcolor: 'transparent' },
                    position: 'relative',
                    '&::after': isActive(item.path) ? {
                      content: '""',
                      position: 'absolute',
                      bottom: 5,
                      left: 16,
                      right: 16,
                      height: 2,
                      bgcolor: 'primary.main',
                      borderRadius: 1,
                    } : {}
                  }}
                >
                  {item.label}
                </Button>
              ))}
                <Button
                  variant="contained"
                  onClick={() => navigate('/login')}
                  sx={{
                    ml: 2,
                    px: 3,
                    borderRadius: 50,
                    boxShadow: '0 4px 12px rgba(212, 163, 115, 0.2)',
                  }}
                >
                  Acceso Personal
                </Button>
                
                <IconButton 
                  color="primary" 
                  onClick={() => setCartOpen(true)}
                  sx={{ 
                    ml: 1, 
                    bgcolor: 'rgba(212, 163, 115, 0.1)',
                    '&:hover': { bgcolor: 'rgba(212, 163, 115, 0.2)' }
                  }}
                >
                  <Badge badgeContent={cartCount} color="error">
                    <CartIcon />
                  </Badge>
                </IconButton>
              </Box>
          )}

          {/* Mobile Menu Toggle */}
          {isMobile && (
            <Box sx={{ display: 'flex', alignItems: 'center' }}>
              <IconButton 
                color="primary" 
                onClick={() => setCartOpen(true)}
                sx={{ mr: 1 }}
              >
                <Badge badgeContent={cartCount} color="error">
                  <CartIcon />
                </Badge>
              </IconButton>
              <IconButton
                color="inherit"
                aria-label="open drawer"
                edge="start"
                onClick={handleDrawerToggle}
              >
                <MenuIcon />
              </IconButton>
            </Box>
          )}
        </Toolbar>
      </Container>

      {/* Mobile Drawer */}
      <Drawer
        variant="temporary"
        open={mobileOpen}
        onClose={handleDrawerToggle}
        ModalProps={{ keepMounted: true }}
        sx={{
          display: { xs: 'block', md: 'none' },
          '& .MuiDrawer-paper': { boxSizing: 'border-box', width: '100%', maxWidth: 300 },
        }}
      >
        {drawer}
      </Drawer>

      <CartDrawer 
        open={cartOpen} 
        onClose={() => setCartOpen(false)} 
      />
    </AppBar>
  );
};

export default PublicNavbar;
