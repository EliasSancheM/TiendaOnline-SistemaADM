import React, { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
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
import { Lock, Visibility, VisibilityOff, ArrowBack } from '@mui/icons-material';

const ResetPassword = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (password.length < 6) {
      setError('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (password !== confirmPassword) {
      setError('Las contraseñas no coinciden');
      return;
    }

    setLoading(true);

    try {
      const apiBaseUrl = process.env.REACT_APP_API_URL || 'http://localhost:5000';
      const response = await fetch(`${apiBaseUrl}/api/auth/reset-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password })
      });

      const data = await response.json();

      if (response.ok) {
        setSuccess(true);
      } else {
        setError(data.error || 'Error al restablecer la contraseña');
      }
    } catch (err) {
      setError('Error de conexión. Intenta nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  if (!token) {
    return (
      <Box
        sx={{
          minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'linear-gradient(160deg, #3D2B1F 0%, #5C4433 40%, #D4A373 100%)',
          padding: 2,
        }}
      >
        <Card sx={{ maxWidth: 440, width: '100%', borderRadius: '24px !important', bgcolor: '#FDFBF7' }}>
          <CardContent sx={{ p: 5, textAlign: 'center' }}>
            <Typography variant="h5" sx={{ fontFamily: '"Newsreader", serif', color: '#A26769', mb: 2 }}>
              Token Inválido
            </Typography>
            <Typography sx={{ color: '#5C4433', mb: 3 }}>
              El enlace de restablecimiento es inválido o ha expirado.
            </Typography>
            <Button
              variant="contained" onClick={() => navigate('/forgot-password')}
              sx={{
                borderRadius: '14px !important',
                background: 'linear-gradient(135deg, #D4A373 0%, #B8884D 100%)',
                fontFamily: '"Work Sans", sans-serif',
              }}
            >
              Solicitar nuevo enlace
            </Button>
          </CardContent>
        </Card>
      </Box>
    );
  }

  return (
    <Box
      sx={{
        minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(160deg, #3D2B1F 0%, #5C4433 40%, #D4A373 100%)',
        position: 'relative', overflow: 'hidden', padding: 2,
      }}
    >
      <Box
        sx={{
          position: 'absolute', bottom: '-15%', left: '-8%',
          width: 500, height: 500, borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(162,103,105,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <Card
        sx={{
          maxWidth: 440, width: '100%',
          boxShadow: '0 20px 60px rgba(61,43,31,0.25)',
          borderRadius: '24px !important',
          border: '1px solid rgba(212,163,115,0.2) !important',
          bgcolor: '#FDFBF7', position: 'relative', zIndex: 1,
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
              🔐
            </Box>
            <Typography
              variant="h4" component="h1" gutterBottom
              sx={{
                fontFamily: '"Newsreader", Georgia, serif',
                fontWeight: 700, color: '#3D2B1F',
                fontSize: { xs: '1.4rem', sm: '1.7rem' },
              }}
            >
              Nueva Contraseña
            </Typography>
            <Typography sx={{ fontFamily: '"Work Sans", sans-serif', color: '#A9A196', fontSize: '0.85rem' }}>
              Ingresa tu nueva contraseña
            </Typography>
          </Box>

          {error && (
            <Alert severity="error" sx={{ mb: 2.5, borderRadius: '12px', bgcolor: '#F8EFEF', color: '#7E4E50' }}>
              {error}
            </Alert>
          )}

          {success ? (
            <Box sx={{ textAlign: 'center' }}>
              <Alert severity="success" sx={{ mb: 3, borderRadius: '12px' }}>
                ¡Contraseña restablecida exitosamente! Ya puedes iniciar sesión con tu nueva contraseña.
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
                Ir al Inicio de Sesión
              </Button>
            </Box>
          ) : (
            <Box component="form" onSubmit={handleSubmit}>
              <TextField
                fullWidth label="Nueva Contraseña"
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => { setPassword(e.target.value); setError(''); }}
                margin="normal" required disabled={loading}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Lock sx={{ color: '#D4A373' }} /></InputAdornment>,
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end" sx={{ color: '#A9A196' }}>
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
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

              <TextField
                fullWidth label="Confirmar Contraseña"
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => { setConfirmPassword(e.target.value); setError(''); }}
                margin="normal" required disabled={loading}
                InputProps={{
                  startAdornment: <InputAdornment position="start"><Lock sx={{ color: '#D4A373' }} /></InputAdornment>,
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
                disabled={loading || !password || !confirmPassword}
                sx={{
                  mt: 3, mb: 2, py: 1.4,
                  fontFamily: '"Work Sans", sans-serif', fontWeight: 600,
                  borderRadius: '14px !important',
                  background: 'linear-gradient(135deg, #D4A373 0%, #B8884D 100%)',
                  boxShadow: '0 6px 20px rgba(212,163,115,0.35)',
                  '&:hover': { background: 'linear-gradient(135deg, #C49363 0%, #A67840 100%)' },
                }}
              >
                {loading ? <CircularProgress size={24} sx={{ color: '#FDFBF7' }} /> : 'Restablecer Contraseña'}
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

export default ResetPassword;
