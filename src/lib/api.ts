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
  (error) => Promise.reject(error)
);

export default api;
