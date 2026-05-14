import React, { useRef } from 'react';
import {
  Box,
  Container,
  Typography,
  Grid,
  Paper,
  Divider,
} from '@mui/material';

// GSAP Imports
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useGSAP } from '@gsap/react';

gsap.registerPlugin(ScrollTrigger);

const Nosotros = () => {
  const containerRef = useRef();
  const storyRef = useRef();
  const philosophyRef = useRef();

  useGSAP(() => {
    // 1. Animación del Header
    gsap.from('.nosotros-header > *', {
      y: 30,
      opacity: 0,
      duration: 1,
      stagger: 0.2,
      ease: 'power3.out',
    });

    // 2. Animación de la historia (Story Section)
    const tlStory = gsap.timeline({
      scrollTrigger: {
        trigger: storyRef.current,
        start: 'top 80%',
      }
    });

    tlStory.from('.story-text > *', {
      x: -50,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'power2.out',
    })
    .from('.story-quote', {
      x: 50,
      opacity: 0,
      duration: 0.8,
      ease: 'power2.out',
    }, '-=0.6');

    // 3. Animación de la Filosofía
    gsap.from('.philosophy-item', {
      scrollTrigger: {
        trigger: philosophyRef.current,
        start: 'top 85%',
      },
      y: 40,
      opacity: 0,
      duration: 0.8,
      stagger: 0.2,
      ease: 'back.out(1.5)',
    });

  }, { scope: containerRef });

  return (
    <Box ref={containerRef} sx={{ py: 8 }}>
      <Container maxWidth="lg">
        {/* Header Section */}
        <Box className="nosotros-header" sx={{ textAlign: 'center', mb: 10 }}>
          <Typography variant="overline" sx={{ color: 'primary.main', fontWeight: 700, letterSpacing: 3 }}>
            NUESTRA ESENCIA
          </Typography>
          <Typography variant="h2" sx={{ mt: 2, mb: 4 }}>
            Pasión por la Tradición
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ maxWidth: 800, mx: 'auto', fontWeight: 400 }}>
            DondeLaEli nació de un sueño sencillo: ser el proveedor de confianza de los locales de nuestra comunidad. Aquel pan que cruje al partirlo, que huele a tradición y que deleita a cada cliente.
          </Typography>
        </Box>

        {/* Story Section */}
        <Grid container spacing={8} alignItems="center" sx={{ mb: 12 }} ref={storyRef}>
          <Grid item xs={12} md={6} className="story-text">
            <Typography variant="h4" sx={{ mb: 3 }}>Nuestra Historia</Typography>
            <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', color: 'text.secondary' }}>
              Todo comenzó en una pequeña cocina familiar hace más de tres décadas. Lo que empezó como un hobby de fin de semana horneando para amigos, pronto se convirtió en una obsesión por la perfección artesanal.
            </Typography>
            <Typography variant="body1" paragraph sx={{ fontSize: '1.1rem', color: 'text.secondary' }}>
              Hoy, DondeLaEli es un referente de calidad, donde combinamos las técnicas milenarias de panificación con un sistema moderno de gestión para que nunca falte lo mejor en tu hogar.
            </Typography>
          </Grid>
          <Grid item xs={12} md={6} className="story-quote">
            <Paper elevation={0} sx={{ p: 4, bgcolor: 'rgba(212, 163, 115, 0.1)', borderRadius: 4 }}>
              <Typography variant="h5" sx={{ mb: 2, color: 'primary.dark' }}>"El pan no es solo alimento, es el centro de la mesa y el corazón de la familia."</Typography>
              <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>— Fundadores de DondeLaEli</Typography>
            </Paper>
          </Grid>
        </Grid>

        <Divider sx={{ mb: 12 }} />

        {/* Philosophy Section */}
        <Grid container spacing={6} ref={philosophyRef}>
          <Grid item xs={12} md={4} className="philosophy-item">
            <Typography variant="h5" gutterBottom sx={{ color: 'primary.main' }}>Dobladas y Empanadas</Typography>
            <Typography variant="body1" color="text.secondary">
              Nuestra especialidad de la casa. Elaboradas con recetas tradicionales que garantizan una masa perfecta y un sabor auténtico en cada bocado.
            </Typography>
          </Grid>
          <Grid item xs={12} md={4} className="philosophy-item">
            <Typography variant="h5" gutterBottom sx={{ color: 'primary.main' }}>Variedad de Panes</Typography>
            <Typography variant="body1" color="text.secondary">
              Desde ciabattas frescas hasta panes de diversos tipos, ofrecemos una gama completa para satisfacer todas las necesidades de tu local.
            </Typography>
          </Grid>
          <Grid item xs={12} md={4} className="philosophy-item">
            <Typography variant="h5" gutterBottom sx={{ color: 'primary.main' }}>Sostenibilidad</Typography>
            <Typography variant="body1" color="text.secondary">
              Trabajamos con productores locales y minimizamos el desperdicio, horneando solo lo que sabemos que alegrará una mesa.
            </Typography>
          </Grid>
        </Grid>
      </Container>
    </Box>
  );
};

export default Nosotros;
