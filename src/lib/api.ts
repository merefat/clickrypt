import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
    if (token) {
      if (typeof config.headers?.set === 'function') {
        config.headers.set('Authorization', `Bearer ${token}`);
      } else if (config.headers) {
        config.headers['Authorization'] = `Bearer ${token}`;
      }
    }
    const mode = localStorage.getItem('clickrypt_app_mode') || 'personal';
    if (typeof config.headers?.set === 'function') {
      config.headers.set('X-App-Mode', mode);
    } else if (config.headers) {
      config.headers['X-App-Mode'] = mode;
    }
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (typeof window !== 'undefined' && error?.response?.status === 401) {
      const hasToken = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
      if (hasToken) {
        // Token is no longer valid (suspended or otherwise) — force the session back to login
        sessionStorage.removeItem('access_token');
        localStorage.removeItem('access_token');
        delete api.defaults.headers.common['Authorization'];
        if (window.location.pathname !== '/login') {
          window.location.replace('/login');
        }
      }
    }
    return Promise.reject(error);
  }
);

export default api;
