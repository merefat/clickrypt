import axios from 'axios';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = sessionStorage.getItem('access_token') || localStorage.getItem('access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const mode = localStorage.getItem('clickrypt_app_mode') || 'personal';
    config.headers['X-App-Mode'] = mode;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      const url = error.config?.url || '';
      const fallbackData = url.includes('/auth/me') ? { user: null } : [];
      return Promise.resolve({
        data: fallbackData,
        status: 200,
        statusText: 'OK',
        headers: error.response?.headers || {},
        config: error.config,
      });
    }
    return Promise.reject(error);
  }
);

export default api;
