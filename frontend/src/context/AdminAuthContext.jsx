import { createContext, useContext, useEffect, useMemo, useState } from 'react';

const AdminAuthContext = createContext(null);
const ACTIVITY_KEY = 'admin_last_activity';
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

function getStoredAdmin() {
  try {
    return JSON.parse(localStorage.getItem('admin_user')) || null;
  } catch {
    return null;
  }
}

function getStoredToken() {
  const token = localStorage.getItem('admin_token');
  const decoded = token ? decodeToken(token) : null;
  const lastActivity = Number(localStorage.getItem(ACTIVITY_KEY) || 0);
  if (token && lastActivity && Date.now() - lastActivity >= IDLE_TIMEOUT_MS) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem(ACTIVITY_KEY);
    return null;
  }
  if (decoded?.exp && decoded.exp * 1000 < Date.now()) {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem(ACTIVITY_KEY);
    return null;
  }
  return token;
}

export function AdminAuthProvider({ children }) {
  const [token, setToken] = useState(() => getStoredToken());
  const [admin, setAdmin] = useState(() => getStoredAdmin());

  const loginAdmin = (newToken, adminProfile = null) => {
    const decoded = decodeToken(newToken);
    const nextAdmin = adminProfile || decoded;
    localStorage.setItem('admin_token', newToken);
    localStorage.setItem(ACTIVITY_KEY, String(Date.now()));
    localStorage.setItem('admin_user', JSON.stringify(nextAdmin));
    setToken(newToken);
    setAdmin(nextAdmin);
  };

  const logoutAdmin = () => {
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_user');
    localStorage.removeItem(ACTIVITY_KEY);
    setToken(null);
    setAdmin(null);
  };

  useEffect(() => {
    if (!token) return undefined;
    let timer;
    let lastStored = 0;
    const expire = () => {
      localStorage.removeItem('admin_token');
      localStorage.removeItem('admin_user');
      localStorage.removeItem(ACTIVITY_KEY);
      setToken(null);
      setAdmin(null);
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
      admin,
      isAdminAuthenticated: Boolean(token),
      loginAdmin,
      logoutAdmin,
    }),
    [token, admin],
  );

  return <AdminAuthContext.Provider value={value}>{children}</AdminAuthContext.Provider>;
}

export function useAdminAuth() {
  const context = useContext(AdminAuthContext);
  if (!context) {
    throw new Error('useAdminAuth must be used inside AdminAuthProvider');
  }
  return context;
}
