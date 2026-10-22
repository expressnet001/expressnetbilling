const PUBLIC_BASE_DOMAIN = String(
  import.meta.env.VITE_TENANT_BASE_DOMAIN || import.meta.env.VITE_PUBLIC_BASE_DOMAIN || 'expressnetbilling.com',
)
  .trim()
  .toLowerCase()
  .replace(/^https?:\/\//, '')
  .split(/[/?#]/)[0]
  .replace(/:\d+$/, '')
  .replace(/^\.+|\.+$/g, '');
const APP_SUBDOMAIN = String(import.meta.env.VITE_APP_SUBDOMAIN || 'app').trim().toLowerCase();
const ADMIN_SUBDOMAIN = String(import.meta.env.VITE_ADMIN_SUBDOMAIN || 'admin').trim().toLowerCase();

function hostnameForSubdomain(label) {
  if (window.location.hostname === 'localhost' || window.location.hostname.endsWith('.localhost')) {
    return `${label}.localhost`;
  }
  return `${label}.${PUBLIC_BASE_DOMAIN}`;
}

export function isAdminHost() {
  const hostname = window.location.hostname.toLowerCase();
  return hostname === `${ADMIN_SUBDOMAIN}.localhost`
    || hostname === `${ADMIN_SUBDOMAIN}.${PUBLIC_BASE_DOMAIN}`;
}

export function isAppHost() {
  const hostname = window.location.hostname.toLowerCase();
  return hostname === `${APP_SUBDOMAIN}.localhost`
    || hostname === `${APP_SUBDOMAIN}.${PUBLIC_BASE_DOMAIN}`;
}

export function isTenantHost() {
  const hostname = window.location.hostname.toLowerCase();
  if (hostname === PUBLIC_BASE_DOMAIN || hostname === `www.${PUBLIC_BASE_DOMAIN}`) return false;
  const isLocalSubdomain = hostname.endsWith('.localhost')
    && hostname.split('.').length === 2;
  const domainSuffix = `.${PUBLIC_BASE_DOMAIN}`;
  const isProductionSubdomain = hostname.endsWith(domainSuffix)
    && hostname.slice(0, -domainSuffix.length).split('.').length === 1;
  if (!isLocalSubdomain && !isProductionSubdomain) return false;

  const label = hostname.slice(0, hostname.indexOf('.'));
  return ![APP_SUBDOMAIN, ADMIN_SUBDOMAIN, 'www'].includes(label);
}

function subdomainRootUrl(label) {
  const url = new URL(window.location.href);
  url.hostname = hostnameForSubdomain(label);
  url.pathname = '/';
  url.search = '';
  url.hash = '';
  return url.toString();
}

export function appLoginUrl() {
  return subdomainRootUrl(APP_SUBDOMAIN);
}

export function adminHostLoginUrl() {
  return subdomainRootUrl(ADMIN_SUBDOMAIN);
}
