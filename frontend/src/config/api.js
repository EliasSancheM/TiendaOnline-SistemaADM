// Configuración centralizada de la API
export const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:5000';

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