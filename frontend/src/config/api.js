// Configuración centralizada de la API.
// - Si REACT_APP_API_URL está definida, se usa tal cual (backend externo).
// - En producción sin esa variable (ej: Vercel, backend en el mismo dominio),
//   se usa una base vacía → las peticiones van a rutas relativas /api/...
// - En desarrollo, apunta al backend local por defecto.
export const API_BASE_URL =
  process.env.REACT_APP_API_URL !== undefined && process.env.REACT_APP_API_URL !== ''
    ? process.env.REACT_APP_API_URL
    : (process.env.NODE_ENV === 'production' ? '' : 'http://localhost:5000');

// Helper function para construir URLs de API
export const buildApiUrl = (endpoint) => {
  // Si el endpoint ya es una URL completa, devolverla tal como está
  if (endpoint.startsWith('http')) {
    return endpoint;
  }
  
  // Si el endpoint no empieza con '/', agregarlo
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  
  return `${API_BASE_URL}${cleanEndpoint}`;
};

// Exportar también como default
const apiConfig = {
  API_BASE_URL,
  buildApiUrl
};

export default apiConfig;