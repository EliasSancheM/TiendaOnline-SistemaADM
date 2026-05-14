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
import { Visibility, VisibilityOff, Person, Lock } from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';

const Login = () => {
  const navigate = useNavigate();
  const [credentials, setCredentials] = useState({
    username: '',
    password: ''
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  
  const { login } = useAuth();

  const handleChange = (e) => {
    setCredentials({
      ...credentials,
      [e.target.name]: e.target.value
    });
    setError('');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    const result = await login(credentials.username, credentials.password);
    
    if (!result.success) {
      setError(result.error);
    }
    
    setLoading(false);
  };

  const togglePasswordVisibility = () => {
    setShowPassword(!showPassword);
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
      {/* Decorative Elements */}
      <Box
        sx={{
          position: 'absolute',
          top: '-10%',
          right: '-5%',
          width: '400px',
          height: '400px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(212,163,115,0.2) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '-15%',
          left: '-8%',
          width: '500px',
          height: '500px',
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(162,103,105,0.15) 0%, transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      <Card
        sx={{
          maxWidth: 440,
          width: '100%',
          boxShadow: '0 20px 60px rgba(61,43,31,0.25)',
          borderRadius: '24px !important',
          border: '1px solid rgba(212,163,115,0.2) !important',
          bgcolor: '#FDFBF7',
          position: 'relative',
          zIndex: 1,
          overflow: 'visible',
        }}
      >
        <CardContent sx={{ p: { xs: 3, sm: 5 } }}>
          {/* Logo & Header */}
          <Box sx={{ textAlign: 'center', mb: 4 }}>
            <img 
              src="/LOGO.png" 
              alt="Donde la Eli" 
              style={{ 
                height: 120, 
                objectFit: 'contain',
                mixBlendMode: 'multiply',
                marginBottom: '1rem'
              }} 
            />
            <Typography
              sx={{
                fontFamily: '"Work Sans", sans-serif',
                color: '#A9A196',
                fontSize: '0.85rem',
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                fontWeight: 500,
              }}
            >
              Inicia sesión para continuar
            </Typography>
          </Box>

          {error && (
            <Alert
              severity="error"
              sx={{
                mb: 2.5,
                borderRadius: '12px',
                bgcolor: '#F8EFEF',
                color: '#7E4E50',
                border: '1px solid rgba(162,103,105,0.2)',
                '& .MuiAlert-icon': { color: '#A26769' },
              }}
            >
              {error}
            </Alert>
          )}

          <Box component="form" onSubmit={handleSubmit}>
            <TextField
              fullWidth
              name="username"
              label="Usuario"
              value={credentials.username}
              onChange={handleChange}
              margin="normal"
              required
              disabled={loading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Person sx={{ color: '#D4A373' }} />
                  </InputAdornment>
                )
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '14px',
                  bgcolor: '#F7F3ED',
                  '& fieldset': { borderColor: '#EDE8E0' },
                  '&:hover fieldset': { borderColor: '#D4A373' },
                  '&.Mui-focused fieldset': { borderColor: '#B8884D', borderWidth: 2 },
                },
                '& .MuiInputLabel-root': {
                  fontFamily: '"Work Sans", sans-serif',
                  '&.Mui-focused': { color: '#B8884D' },
                },
              }}
            />

            <TextField
              fullWidth
              name="password"
              label="Contraseña"
              type={showPassword ? 'text' : 'password'}
              value={credentials.password}
              onChange={handleChange}
              margin="normal"
              required
              disabled={loading}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <Lock sx={{ color: '#D4A373' }} />
                  </InputAdornment>
                ),
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      onClick={togglePasswordVisibility}
                      edge="end"
                      disabled={loading}
                      sx={{ color: '#A9A196' }}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                )
              }}
              sx={{
                '& .MuiOutlinedInput-root': {
                  borderRadius: '14px',
                  bgcolor: '#F7F3ED',
                  '& fieldset': { borderColor: '#EDE8E0' },
                  '&:hover fieldset': { borderColor: '#D4A373' },
                  '&.Mui-focused fieldset': { borderColor: '#B8884D', borderWidth: 2 },
                },
                '& .MuiInputLabel-root': {
                  fontFamily: '"Work Sans", sans-serif',
                  '&.Mui-focused': { color: '#B8884D' },
                },
              }}
            />

            <Button
              type="submit"
              fullWidth
              variant="contained"
              size="large"
              disabled={loading || !credentials.username || !credentials.password}
              sx={{
                mt: 3.5,
                mb: 2,
                py: 1.6,
                fontSize: '1rem',
                fontWeight: 600,
                fontFamily: '"Work Sans", sans-serif',
                borderRadius: '14px !important',
                background: 'linear-gradient(135deg, #D4A373 0%, #B8884D 100%)',
                boxShadow: '0 6px 20px rgba(212,163,115,0.35)',
                letterSpacing: '0.04em',
                '&:hover': {
                  background: 'linear-gradient(135deg, #C49363 0%, #A67840 100%)',
                  boxShadow: '0 8px 28px rgba(212,163,115,0.45)',
                  transform: 'translateY(-1px)',
                },
                '&:active': {
                  transform: 'translateY(0)',
                },
                transition: 'all 0.25s ease',
                '&.Mui-disabled': {
                  background: '#EDE8E0',
                  color: '#A9A196',
                },
              }}
            >
              {loading ? (
                <CircularProgress size={24} sx={{ color: '#FDFBF7' }} />
              ) : (
                'Iniciar Sesión'
              )}
            </Button>

            <Box sx={{ textAlign: 'center', mt: 2 }}>
              <Button
                onClick={() => navigate('/forgot-password')}
                sx={{
                  color: '#D4A373',
                  fontFamily: '"Work Sans", sans-serif',
                  fontSize: '0.85rem',
                  textTransform: 'none',
                  '&:hover': { color: '#B8884D', bgcolor: 'transparent', textDecoration: 'underline' },
                }}
              >
                ¿Olvidaste tu contraseña?
              </Button>
              <Typography
                variant="body2"
                sx={{
                  color: '#A9A196',
                  fontFamily: '"Be Vietnam Pro", sans-serif',
                  fontSize: '0.82rem',
                  mt: 1,
                }}
              >
                Contacta al administrador para obtener una cuenta
              </Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
};

export default Login;


