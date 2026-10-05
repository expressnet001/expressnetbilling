import axios from 'axios';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 20000,
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('billing_saas_token');

  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
    config.__hadTenantToken = true;
  }

  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.code === 'ECONNABORTED') {
      return Promise.reject(new Error('The server took too long to respond. Please try again.'));
    }

    if (error.response?.status === 401 && error.config?.__hadTenantToken) {
      localStorage.removeItem('billing_saas_token');
      localStorage.removeItem('billing_saas_tenant');
      localStorage.removeItem('billing_saas_last_activity');

      if (window.location.pathname !== '/login') {
        window.location.assign('/login');
      }
    }

    if (error.response?.status === 402 && error.response?.data?.code === 'SUBSCRIPTION_PAYMENT_REQUIRED') {
      const target = error.response.data.redirect || '/billing/payment';
      if (window.location.pathname !== target) {
        window.location.assign(target);
      }
    }

    return Promise.reject(error);
  },
);

export default api;
