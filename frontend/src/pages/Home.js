import React, { useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Button,
  Grid,
  Stack,
  useTheme,
  IconButton,
} from '@mui/material';
import { Link } from 'react-router-dom';
import {
  CheckCircle as CheckIcon,
  LocalShipping as ShippingIcon,
  Schedule as ScheduleIcon,
} from '@mui/icons-material';

// GSAP Imports
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger);

const Home = () => {
  const theme = useTheme();
  
  // Refs para las animaciones
  const heroRef = useRef();
  const heroBgRef = useRef();
  const featuresRef = useRef();
  const aboutRef = useRef();
  const ctaRef = useRef();

  useGSAP(() => {
    // 1. Animación del Hero (al cargar la página)
    const tlHero = gsap.timeline();
    tlHero.from('.hero-text > *', {
      y: 60,
      opacity: 0,
      duration: 1.5,
      stagger: 0.15,
      ease: 'expo.out',
    });

    // Parallax del Hero Background
    gsap.to(heroBgRef.current, {
      yPercent: 30,
      ease: 'none',
      scrollTrigger: {
        trigger: heroRef.current,
        start: 'top top',
        end: 'bottom top',
        scrub: true
      }
    });

    // 2. Animación de las características (Features) con ScrollTrigger
    gsap.from('.feature-item', {
      scrollTrigger: {
        trigger: featuresRef.current,
        start: 'top 80%',
      },
      y: 60,
      opacity: 0,
      duration: 1.2,
      stagger: 0.15,
      ease: 'expo.out',
    });

    // 3. Animación de la sección "Nosotros" (About) con ScrollTrigger
    const tlAbout = gsap.timeline({
      scrollTrigger: {
        trigger: aboutRef.current,
        start: 'top 75%',
      }
    });

    tlAbout.fromTo('.about-image', {
      clipPath: 'polygon(0% 0%, 0% 0%, 0% 100%, 0% 100%)',
      scale: 1.2
    }, {
      clipPath: 'polygon(0% 0%, 100% 0%, 100% 100%, 0% 100%)',
      scale: 1,
      duration: 1.5,
      ease: 'expo.inOut',
    }, 0)
    .from('.about-text > *', {
      y: 40,
      opacity: 0,
      duration: 1.2,
      stagger: 0.15,
      ease: 'expo.out',
    }, 0.5);

    // 4. Animación del Call to Action (CTA)
    gsap.from(ctaRef.current, {
      scrollTrigger: {
        trigger: ctaRef.current,
        start: 'top 85%',
      },
      y: 50,
      opacity: 0,
      duration: 1.2,
      ease: 'expo.out',
    });

  }, []);

  return (
    <Box>
      {/* Hero Section */}
      <Box
        ref={heroRef}
        sx={{
          position: 'relative',
          height: { xs: '80vh', md: '70vh' },
          display: 'flex',
          alignItems: 'center',
          overflow: 'hidden',
          bgcolor: '#3D2B1F',
        }}
      >
        <Box
          ref={heroBgRef}
          component="img"
          src="/pan_artesanal_hero.png" 
          sx={{
            position: 'absolute',
            top: '-15%',
            left: 0,
            width: '100%',
            height: '130%', // Más alto para el parallax
            objectFit: 'cover',
            opacity: 0.5,
          }}
        />
        <Box
          sx={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: '100%',
            height: '100%',
            background: 'linear-gradient(to right, rgba(0,0,0,0.8) 0%, rgba(0,0,0,0.4) 50%, rgba(0,0,0,0.2) 100%)',
            zIndex: 0,
          }}
        />
        <Container maxWidth="lg" sx={{ position: 'relative', zIndex: 1, color: 'white' }}>
          <Grid container spacing={4}>
            <Grid item xs={12} md={7} className="hero-text">
              <Typography
                variant="overline"
                sx={{
                  color: 'primary.light',
                  fontWeight: 700,
                  letterSpacing: 4,
                  display: 'block',
                  mb: 2,
                  textShadow: '0 2px 4px rgba(0,0,0,0.3)'
                }}
              >
                DESDE 1985
              </Typography>
              <Typography
                variant="h1"
                sx={{
                  fontSize: { xs: '3rem', md: '5rem' },
                  mb: 3,
                  lineHeight: 1.1,
                  color: '#FFFFFF',
                  textShadow: '0 4px 12px rgba(0,0,0,0.6)'
                }}
              >
                El Aroma de lo <br />
                <Box component="span" sx={{ color: 'primary.main' }}>Auténtico</Box>
              </Typography>
              <Typography variant="h6" sx={{ mb: 5, opacity: 1, fontWeight: 500, maxWidth: 500, color: '#FFFFFF', textShadow: '0 2px 8px rgba(0,0,0,0.6)' }}>
                Panadería artesanal con alma. Recuperamos los sabores de siempre con procesos lentos y materias primas excepcionales.
              </Typography>
              <Stack direction={{ xs: 'column', sm: 'row' }} spacing={2}>
                <Button
                  variant="contained"
                  size="large"
                  component={Link}
                  to="/tienda"
                  sx={{
                    px: 6,
                    py: 2,
                    borderRadius: 50,
                    fontSize: '1.1rem'
                  }}
                >
                  Ver Productos
                </Button>
                <Button
                  variant="outlined"
                  size="large"
                  component={Link}
                  to="/nosotros"
                  sx={{
                    px: 6,
                    py: 2,
                    borderRadius: 50,
                    fontSize: '1.1rem',
                    color: 'white',
                    borderColor: 'white',
                    '&:hover': {
                      borderColor: 'primary.light',
                      bgcolor: 'rgba(255,255,255,0.1)'
                    }
                  }}
                >
                  Nuestra Historia
                </Button>
              </Stack>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Features Section */}
      <Container ref={featuresRef} maxWidth="lg" sx={{ py: { xs: 8, md: 12 } }}>
        <Grid container spacing={6}>
          <Grid item xs={12} md={4} className="feature-item">
            <Box sx={{ textAlign: 'center' }}>
              <IconButton sx={{ bgcolor: 'rgba(212, 163, 115, 0.1)', mb: 2, p: 2 }}>
                <CheckIcon color="primary" sx={{ fontSize: 40 }} />
              </IconButton>
              <Typography variant="h5" sx={{ mb: 1 }}>Ingredientes de Calidad</Typography>
              <Typography variant="body1" color="text.secondary">
                Seleccionamos las mejores harinas y materias primas para garantizar productos consistentes y de sabor superior.
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4} className="feature-item">
            <Box sx={{ textAlign: 'center' }}>
              <IconButton sx={{ bgcolor: 'rgba(212, 163, 115, 0.1)', mb: 2, p: 2 }}>
                <ScheduleIcon color="primary" sx={{ fontSize: 40 }} />
              </IconButton>
              <Typography variant="h5" sx={{ mb: 1 }}>Variedad Artesanal</Typography>
              <Typography variant="body1" color="text.secondary">
                Desde nuestras famosas dobladas hasta exquisitas ciabattas y empanadas, horneadas con el toque tradicional de siempre.
              </Typography>
            </Box>
          </Grid>
          <Grid item xs={12} md={4} className="feature-item">
            <Box sx={{ textAlign: 'center' }}>
              <IconButton sx={{ bgcolor: 'rgba(212, 163, 115, 0.1)', mb: 2, p: 2 }}>
                <ShippingIcon color="primary" sx={{ fontSize: 40 }} />
              </IconButton>
              <Typography variant="h5" sx={{ mb: 1 }}>Reparto a Locales</Typography>
              <Typography variant="body1" color="text.secondary">
                Llevamos el pedido directamente a tu local en dos turnos diarios, asegurando frescura para tu negocio.
              </Typography>
            </Box>
          </Grid>
        </Grid>
      </Container>

      {/* Featured Section */}
      <Box ref={aboutRef} sx={{ bgcolor: 'rgba(212, 163, 115, 0.05)', py: { xs: 8, md: 12 }, overflow: 'hidden' }}>
        <Container maxWidth="lg">
          <Grid container spacing={8} alignItems="center">
            <Grid item xs={12} md={6}>
              <Box sx={{ overflow: 'hidden', borderRadius: 8, boxShadow: '0 24px 48px rgba(61,43,31,0.15)' }}>
                <Box
                  className="about-image"
                  component="img"
                  src="/bakery_interior_about.png"
                  sx={{
                    width: '100%',
                    display: 'block',
                    transformOrigin: 'center',
                  }}
                />
              </Box>
            </Grid>
            <Grid item xs={12} md={6} className="about-text">
              <Typography variant="h3" sx={{ mb: 4 }}>
                Horneado con <br />
                Pasión y Tiempo
              </Typography>
              <Typography variant="body1" sx={{ mb: 3, fontSize: '1.1rem', color: 'text.secondary' }}>
                En DondeLaEli, creemos que el buen pan requiere maestría y dedicación. Nos especializamos en dobladas, empanadas y una gran variedad de panes tradicionales, horneados diariamente con la textura y sabor que tus clientes merecen.
              </Typography>
              <Typography variant="body1" sx={{ mb: 5, fontSize: '1.1rem', color: 'text.secondary' }}>
                Utilizamos harinas locales de molienda tradicional para apoyar a nuestros agricultores y garantizar que cada miga cuente una historia de tierra y tradición.
              </Typography>
              <Button
                variant="text"
                color="primary"
                component={Link}
                to="/nosotros"
                sx={{
                  fontSize: '1rem',
                  fontWeight: 700,
                  '&:hover': { bgcolor: 'transparent', textDecoration: 'underline' }
                }}
              >
                Conoce más sobre nosotros →
              </Button>
            </Grid>
          </Grid>
        </Container>
      </Box>

      {/* Call to Action */}
      <Container maxWidth="md" sx={{ py: { xs: 10, md: 15 }, textAlign: 'center' }}>
        <Box ref={ctaRef}>
          <Typography variant="h2" sx={{ mb: 3 }}>¿Listo para probar?</Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 6, fontWeight: 400 }}>
            Realiza tu pedido hoy y recíbelo fresco mañana por la mañana.
            Envíos gratis en pedidos superiores a $8.000.
          </Typography>
          <Button
            variant="contained"
            size="large"
            component={Link}
            to="/tienda"
            sx={{ px: 8, py: 2.5, borderRadius: 50, fontSize: '1.2rem' }}
          >
            Ir a la Tienda Online
          </Button>
        </Box>
      </Container>
    </Box>
  );
};

export default Home;
