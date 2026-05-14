import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  Container,
  InputAdornment,
  IconButton,
  Link as MuiLink,
} from '@mui/material';
import { 
  Person as PersonIcon, 
  Lock as LockIcon, 
  Visibility, 
  VisibilityOff,
  KeyboardArrowRight
} from '@mui/icons-material';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate, Link } from 'react-router-dom';

const Login = () => {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    try {
      setError('');
      setLoading(true);
      await login(username, password);
      navigate('/admin');
    } catch (err) {
      setError('Credenciales inválidas. Por favor, intenta de nuevo.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box 
      sx={{ 
        minHeight: '80vh', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        background: 'radial-gradient(circle at 20% 30%, rgba(212, 163, 115, 0.05) 0%, transparent 50%), radial-gradient(circle at 80% 70%, rgba(162, 103, 105, 0.05) 0%, transparent 50%)',
      }}
    >
      <Container maxWidth="sm">
        <Card sx={{ 
          boxShadow: '0 20px 60px rgba(61, 43, 31, 0.12)', 
          borderRadius: 6,
          border: '1px solid',
          borderColor: 'divider',
          overflow: 'hidden'
        }}>
          <Box sx={{ bgcolor: 'primary.main', py: 4, textAlign: 'center', color: 'white' }}>
            <Typography variant="h4" sx={{ fontWeight: 700, fontFamily: '"Newsreader", serif' }}>
              Acceso Personal
            </Typography>
            <Typography variant="body2" sx={{ opacity: 0.9, mt: 1 }}>
              Portal de administración y empleados
            </Typography>
          </Box>
          <CardContent sx={{ p: 5 }}>
            {error && <Alert severity="error" sx={{ mb: 4, borderRadius: 2 }}>{error}</Alert>}
            
            <form onSubmit={handleSubmit}>
              <TextField
                fullWidth
                label="Usuario"
                variant="outlined"
                margin="normal"
                required
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <PersonIcon color="primary" />
                    </InputAdornment>
                  ),
                }}
              />
              <TextField
                fullWidth
                label="Contraseña"
                type={showPassword ? 'text' : 'password'}
                variant="outlined"
                margin="normal"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <LockIcon color="primary" />
                    </InputAdornment>
                  ),
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton onClick={() => setShowPassword(!showPassword)} edge="end">
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
              
              <Box sx={{ textAlign: 'right', mt: 1, mb: 3 }}>
                <MuiLink component={Link} to="/forgot-password" variant="body2" color="primary">
                  ¿Olvidaste tu contraseña?
                </MuiLink>
              </Box>

              <Button
                fullWidth
                type="submit"
                variant="contained"
                size="large"
                disabled={loading}
                endIcon={<KeyboardArrowRight />}
                sx={{ 
                  py: 1.5, 
                  borderRadius: 50, 
                  fontSize: '1.1rem',
                  boxShadow: '0 8px 16px rgba(212, 163, 115, 0.3)'
                }}
              >
                {loading ? 'Iniciando...' : 'Entrar al Sistema'}
              </Button>
            </form>
          </CardContent>
          <Box sx={{ p: 3, textAlign: 'center', bgcolor: 'background.default', borderTop: '1px solid', borderColor: 'divider' }}>
            <Typography variant="body2" color="text.secondary">
              ¿No tienes acceso? Contacta al administrador.
            </Typography>
          </Box>
        </Card>
      </Container>
    </Box>
  );
};

export default Login;
