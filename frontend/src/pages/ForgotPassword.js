import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Card,
  CardContent,
  TextField,
  Button,
  Typography,
  Alert,
  CircularProgress,
  InputAdornment,
  IconButton,
} from '@mui/material';
import { Email, ArrowBack } from '@mui/icons-material';

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiBaseUrl}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Error al procesar la solicitud');
      }
    } catch (err) {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #3D2B1F 0%, #5C4433 40%, #D4A373 100%)',
        position: 'relative',
        overflow: 'hidden',
        padding: 2,
      }}
    >
      <Box
        sx={{
          position: 'absolute', top: '-10%', right: '-5%',
          width: 400, height: 400, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,163,115,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <Card
        sx={{
          maxWidth: 440, width: '100%',
          boxShadow: '0 20px 60px rgba(61,43,31,0.25)',
          borderRadius: '24px !important',
          border: '1px solid rgba(212,163,115,0.2) !important',
          bgcolor: '#FDFBF7',
          position: 'relative', zIndex: 1,
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <Box
              sx={{
                width: 72, height: 72, borderRadius: '20px',
                background: 'linear-gradient(135deg, #D4A373 0%, #E8C9A5 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                mx: 'auto', mb: 2.5, fontSize: '2rem',
                boxShadow: '0 8px 24px rgba(212,163,115,0.3)',
              }}
            >
              ✉️
            </Box>
            <Typography
              variant="h4" component="h1" gutterBottom
              sx={{
                fontFamily: '"Newsreader", Georgia, serif',
                fontWeight: 700, color: '#3D2B1F',
                fontSize: { xs: '1.4rem', sm: '1.7rem' },
              }}
            >
              Recuperar Contraseña
            </Typography>
            <Typography
              sx={{
                fontFamily: '"Work Sans", sans-serif',
                color: '#A9A196', fontSize: '0.85rem',
                letterSpacing: '0.04em',
              }}
            >
              Ingresa tu correo electrónico registrado
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: '12px', bgcolor: '#F8EFEF', color: '#7E4E50', border: '1px solid rgba(162,103,105,0.2)' }}>
              {error}
            </Alert>
          )}

          {success ? (
            <Box sx={{ textAlign: 'center' }}>
              <Alert severity="success" sx={{ mb: 3, borderRadius: '12px' }}>
                Si el correo está registrado, recibirás instrucciones para restablecer tu contraseña. Revisa tu bandeja de entrada y carpeta de spam.
              </Alert>
              <Button
                fullWidth variant="contained" size="large"
                onClick={() => navigate('/')}
                sx={{
                  py: 1.4, borderRadius: '14px !important',
                  background: 'linear-gradient(135deg, #D4A373 0%, #B8884D 100%)',
                  fontFamily: '"Work Sans", sans-serif', fontWeight: 600,
                }}
              >
                Volver al Inicio de Sesión
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth name="email" label="Correo Electrónico"
                type="email" value={email}
                onChange={(e) => { setEmail(e.target.value); setError(''); }}
                margin="normal" required disabled={loading}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <Email sx={{ color: '#D4A373' }} />
                    </InputAdornment>
                  )
                }}
                sx={{
                  '& .MuiOutlinedInput-root': {
                    borderRadius: '14px', bgcolor: '#F7F3ED',
                    '& fieldset': { borderColor: '#EDE8E0' },
                    '&:hover fieldset': { borderColor: '#D4A373' },
                    '&.Mui-focused fieldset': { borderColor: '#B8884D', borderWidth: 2 },
                  },
                }}
              />

              <Button
                type="submit" fullWidth variant="contained" size="large"
                disabled={loading || !email}
                sx={{
                  mt: 3, mb: 2, py: 1.4,
                  fontFamily: '"Work Sans", sans-serif', fontWeight: 600,
                  borderRadius: '14px !important',
                  background: 'linear-gradient(135deg, #D4A373 0%, #B8884D 100%)',
                  boxShadow: '0 6px 20px rgba(212,163,115,0.35)',
                  '&:hover': {
                    background: 'linear-gradient(135deg, #C49363 0%, #A67840 100%)',
                  },
                }}
              >
                {loading ? <CircularProgress size={24} sx={{ color: '#FDFBF7' }} /> : 'Enviar Instrucciones'}
              </Button>

              <Button
                fullWidth startIcon={<ArrowBack />}
                onClick={() => navigate('/')}
                sx={{ color: '#A9A196', fontFamily: '"Work Sans", sans-serif' }}
              >
                Volver al inicio de sesión
              </Button>
            </Box>
          )}
        </CardContent>
      </Card>
    </Box>
  );
};

export default ForgotPassword;
