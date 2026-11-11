import axios from 'axios';

const API_BASE_URL = (import.meta as any).env?.VITE_API_URL || '/api/v1';

export const apiClient = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request interceptor to attach JWT access token
apiClient.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('aquaflow_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response interceptor for token refresh & license expiration handling
apiClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;

    // Handle 401 Unauthorized (expired token)
    if (error.response?.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      const refreshToken = localStorage.getItem('aquaflow_refresh_token');

      if (refreshToken) {
        try {
          const res = await axios.post(`${API_BASE_URL}/auth/refresh?refresh_token=${refreshToken}`);
          const newToken = res.data.access_token;
          localStorage.setItem('aquaflow_token', newToken);
          localStorage.setItem('aquaflow_refresh_token', res.data.refresh_token);
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
          return apiClient(originalRequest);
        } catch (refreshErr) {
          localStorage.removeItem('aquaflow_token');
          localStorage.removeItem('aquaflow_refresh_token');
          window.location.href = '/auth/login';
          return Promise.reject(refreshErr);
        }
      } else {
        localStorage.removeItem('aquaflow_token');
        localStorage.removeItem('aquaflow_refresh_token');
        if (window.location.pathname !== '/auth/login' && window.location.pathname !== '/auth/register') {
          window.location.href = '/auth/login';
        }
      }
    }

    return Promise.reject(error);
  }
);
