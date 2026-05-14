import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth debe ser usado dentro de un AuthProvider');
  }
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const apiBaseUrl = process.env.REACT_APP_API_URL || '';

  // Verificar sesión al cargar (cookie is sent automatically)
  useEffect(() => {
    const verifySession = async () => {
      try {
        const response = await fetch(`${apiBaseUrl}/api/auth/verify`, {
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' }
        });

        if (response.ok) {
          const data = await response.json();
          setUser(data.user);
        } else {
          setUser(null);
        }
      } catch (error) {
        console.error('Error verificando sesión:', error);
        setUser(null);
      }
      setLoading(false);
    };

    verifySession();
  }, [apiBaseUrl]);

  const login = async (username, password) => {
    try {
      const response = await fetch(`${apiBaseUrl}/api/auth/login`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });

      const data = await response.json();

      if (response.ok) {
        setUser(data.user);
        return { success: true };
      } else {
        return { success: false, error: data.error };
      }
    } catch (error) {
      console.error('Error en login:', error);
      return { success: false, error: 'Error de conexión' };
    }
  };

  const logout = useCallback(async () => {
    try {
      await fetch(`${apiBaseUrl}/api/auth/logout`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' }
      });
    } catch (error) {
      console.error('Error en logout:', error);
    } finally {
      setUser(null);
    }
  }, [apiBaseUrl]);

  // Función para hacer peticiones autenticadas (cookie is sent automatically)
  const authenticatedFetch = useCallback(async (url, options = {}) => {
    const headers = { ...options.headers };

    // Si no es FormData, por defecto usamos application/json
    if (!(options.body instanceof FormData) && !headers['Content-Type']) {
      headers['Content-Type'] = 'application/json';
    }

    // Build full URL
    const fullUrl = url.startsWith('http') ? url : `${apiBaseUrl}${url}`;

    const response = await fetch(fullUrl, {
      ...options,
      headers,
      credentials: 'include'
    });

    // If session expired, auto-logout
    if (response.status === 401 || response.status === 403) {
      setUser(null);
      throw new Error('Sesión expirada');
    }

    return response;
  }, [apiBaseUrl]);

  const value = {
    user,
    loading,
    login,
    logout,
    authenticatedFetch,
    isAuthenticated: !!user,
    isAdmin: user?.role === 'admin',
    isContador: user?.role === 'contador',
    isEmpleado: user?.role === 'empleado'
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
};