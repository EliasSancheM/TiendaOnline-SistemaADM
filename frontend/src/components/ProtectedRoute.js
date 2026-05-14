import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../contexts/AuthContext';

const ProtectedRoute = ({ children, requiredRoles = [] }) => {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  // Mostrar loading mientras se verifica la autenticación
  if (loading) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2
        }}
      >
        <CircularProgress size={60} />
        <Typography variant="h6" color="text.secondary">
          Verificando autenticación...
        </Typography>
      </Box>
    );
  }

  // Si no está autenticado, redirigir al login
  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Si se requieren roles específicos, verificar
  if (requiredRoles.length > 0 && !requiredRoles.includes(user.role)) {
    return (
      <Box
        sx={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          minHeight: '100vh',
          gap: 2,
          p: 3
        }}
      >
        <Typography variant="h4" color="error" gutterBottom>
          🚫 Acceso Denegado
        </Typography>
        <Typography variant="body1" color="text.secondary" textAlign="center">
          No tienes permisos para acceder a esta sección.
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Tu rol actual: <strong>{user.role}</strong>
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Roles requeridos: <strong>{requiredRoles.join(', ')}</strong>
        </Typography>
      </Box>
    );
  }

  // Si todo está bien, mostrar el contenido protegido
  return children;
};

export default ProtectedRoute;