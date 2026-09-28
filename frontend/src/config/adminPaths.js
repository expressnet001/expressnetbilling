function normalizePath(value, fallback) {
  const raw = String(value || fallback || '').trim();
  const cleaned = raw.replace(/^\/+|\/+$/g, '');
  return `/${cleaned || String(fallback || 'admin').replace(/^\/+|\/+$/g, '')}`;
}

export const ADMIN_PATH = normalizePath(import.meta.env.VITE_ADMIN_PATH, '/admin');
export const ADMIN_API_PATH = normalizePath(import.meta.env.VITE_ADMIN_API_PATH, '/admin');
export const ADMIN_LOGIN_PATH = `${ADMIN_PATH}/login`;
export const ADMIN_DASHBOARD_PATH = `${ADMIN_PATH}/dashboard`;
const ADMIN_SUBDOMAIN = String(import.meta.env.VITE_ADMIN_SUBDOMAIN || 'admin').trim().toLowerCase();

export function isAdminHost() {
  const hostname = window.location.hostname.toLowerCase();
  return hostname === ADMIN_SUBDOMAIN || hostname.startsWith(`${ADMIN_SUBDOMAIN}.`);
}

export function adminLoginUrl() {
  return isAdminHost() ? '/' : ADMIN_LOGIN_PATH;
}

export function adminPath(path = '') {
  const suffix = String(path).replace(/^\/+/, '');
  return suffix ? `${ADMIN_PATH}/${suffix}` : ADMIN_PATH;
}

export function adminApiPath(path = '') {
  const suffix = String(path).replace(/^\/+/, '').replace(/^admin\/?/, '');
  return suffix ? `${ADMIN_API_PATH}/${suffix}` : ADMIN_API_PATH;
}
