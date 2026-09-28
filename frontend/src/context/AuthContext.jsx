import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { clearTenantTheme, storeTenantSettings } from '../utils/theme';

const AuthContext = createContext(null);

const TOKEN_KEY = 'billing_saas_token';
const TENANT_KEY = 'billing_saas_tenant';
const ACTIVITY_KEY = 'billing_saas_last_activity';
const IDLE_TIMEOUT_MS = Number(import.meta.env.VITE_SESSION_IDLE_TIMEOUT_MS || 10 * 60 * 1000);

function decodeToken(token) {
  try {
    const payload = token.split('.')[1];
    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(window.atob(padded));
  } catch {
    return null;
  }
}

function getStoredToken() {
  const storedToken = localStorage.getItem(TOKEN_KEY);
  const decoded = storedToken ? decodeToken(storedToken) : null;
  const lastActivity = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
  if (storedToken && lastActivity && Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    return null;
  }
  if (decoded?.exp && decoded.exp * 1000 < Date.now()) {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    return null;
  }

  return storedToken;
}

function getStoredTenant() {
  try {
    return JSON.parse(localStorage.getItem(TENANT_KEY)) || null;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [tenant, setTenant] = useState(() => getStoredTenant());

  const login = (nextToken, nextTenant = null) => {
    const decoded = decodeToken(nextToken);
    const tenantInfo = nextTenant || (decoded ? { id: decoded.id } : null);

    localStorage.setItem(TOKEN_KEY, nextToken);
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    if (tenantInfo) {
      localStorage.setItem(TENANT_KEY, JSON.stringify(tenantInfo));
      storeTenantSettings(tenantInfo);
    }

    setToken(nextToken);
    setTenant(tenantInfo);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(TENANT_KEY);
    localStorage.removeItem(ACTIVITY_KEY);
    clearTenantTheme();
    setToken(null);
    setTenant(null);
  };

  useEffect(() => {
    if (!token) return undefined;
    let timer;
    let lastStored = 0;
    const expire = () => {
      localStorage.removeItem(TOKEN_KEY);
      localStorage.removeItem(TENANT_KEY);
      localStorage.removeItem(ACTIVITY_KEY);
      clearTenantTheme();
      setToken(null);
      setTenant(null);
    };
    const arm = () => {
      window.clearTimeout(timer);
      timer = window.setTimeout(expire, IDLE_TIMEOUT_MS);
    };
    const activity = () => {
      const now = Date.now();
      if (now - lastStored > 10000) {
        localStorage.setItem(ACTIVITY_KEY, String(now));
        lastStored = now;
      }
      arm();
    };
    ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach((event) => window.addEventListener(event, activity, { passive: true }));
    activity();
    return () => {
      window.clearTimeout(timer);
      ['mousedown', 'keydown', 'touchstart', 'scroll', 'mousemove'].forEach((event) => window.removeEventListener(event, activity));
    };
  }, [token]);

  const value = useMemo(
    () => ({
      token,
      tenant,
      isAuthenticated: Boolean(token),
      login,
      logout,
    }),
    [token, tenant],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);

  if (!context) {
    throw new Error('useAuth must be used inside AuthProvider');
  }

  return context;
}
