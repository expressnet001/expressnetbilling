export const THEME_STORAGE_KEY = 'tenant_settings';
export const TENANT_THEME_EVENT = 'tenant-theme-change';

export const DEFAULT_TENANT_THEME = {
  themeColor: '#fa8200',
  themeMode: 'dark',
  darkMode: true,
  font: 'Inter',
};

function canUseDom() {
  return typeof window !== 'undefined' && typeof document !== 'undefined';
}

export function normalizeThemeColor(value, fallback = DEFAULT_TENANT_THEME.themeColor) {
  const raw = String(value || '').trim();
  if (/^#[0-9a-f]{6}$/i.test(raw)) return raw.toLowerCase();
  if (/^[0-9a-f]{6}$/i.test(raw)) return `#${raw.toLowerCase()}`;
  return fallback;
}

function mixWithWhite(hex, amount = 0.72) {
  const color = normalizeThemeColor(hex).slice(1);
  const parts = [0, 2, 4].map((start) => parseInt(color.slice(start, start + 2), 16));
  const mixed = parts.map((part) => Math.round(part + (255 - part) * amount));
  return `#${mixed.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function mixWithBlack(hex, amount = 0.18) {
  const color = normalizeThemeColor(hex).slice(1);
  const parts = [0, 2, 4].map((start) => parseInt(color.slice(start, start + 2), 16));
  const mixed = parts.map((part) => Math.round(part * (1 - amount)));
  return `#${mixed.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function mixWithDark(hex, amount = 0.2, dark = '#1f2127') {
  const color = normalizeThemeColor(hex).slice(1).match(/.{2}/g).map((part) => parseInt(part, 16));
  const base = hexToRgb(dark);
  const mixed = color.map((part, index) => Math.round(base[index] + (part - base[index]) * amount));
  return `#${mixed.map((part) => part.toString(16).padStart(2, '0')).join('')}`;
}

function hexToRgb(hex) {
  const color = normalizeThemeColor(hex).slice(1);
  return [0, 2, 4].map((start) => parseInt(color.slice(start, start + 2), 16));
}

function contrastColor(hex) {
  const [r, g, b] = hexToRgb(hex).map((value) => {
    const channel = value / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.58 ? '#111827' : '#ffffff';
}

function normalizeMode(value, darkMode = false) {
  const mode = String(value || '').trim().toLowerCase();
  if (['light', 'dark', 'system'].includes(mode)) return mode;
  return darkMode ? 'dark' : DEFAULT_TENANT_THEME.themeMode;
}

export function resolveThemeMode(mode) {
  if (mode === 'system' && canUseDom()) {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  }
  return mode === 'dark' ? 'dark' : 'light';
}

export function normalizeTenantTheme(settings = {}) {
  const themeColor = normalizeThemeColor(settings.themeColor || settings.theme_color);
  const themeMode = normalizeMode(settings.themeMode || settings.theme_mode, settings.darkMode ?? settings.dark_mode);
  return {
    ...settings,
    themeColor,
    theme_color: themeColor,
    themeMode,
    theme_mode: themeMode,
    darkMode: themeMode === 'dark',
    dark_mode: themeMode === 'dark',
    font: settings.font || DEFAULT_TENANT_THEME.font,
  };
}

export function getStoredTenantSettings() {
  if (!canUseDom()) return DEFAULT_TENANT_THEME;
  try {
    return {
      ...DEFAULT_TENANT_THEME,
      ...(JSON.parse(window.localStorage.getItem(THEME_STORAGE_KEY) || '{}') || {}),
    };
  } catch {
    return DEFAULT_TENANT_THEME;
  }
}

export function applyTenantTheme(settings = getStoredTenantSettings()) {
  if (!canUseDom()) return normalizeTenantTheme(settings);

  const theme = normalizeTenantTheme(settings);
  const persisted = getStoredTenantSettings();
  // Authentication responses contain only partial tenant metadata. Do not let
  // those partial objects reset the persisted appearance to application defaults.
  if (!('themeColor' in settings) && !('theme_color' in settings)) {
    theme.themeColor = normalizeThemeColor(persisted.themeColor || persisted.theme_color);
    theme.theme_color = theme.themeColor;
  }
  if (!('themeMode' in settings) && !('theme_mode' in settings) && !('darkMode' in settings) && !('dark_mode' in settings)) {
    theme.themeMode = normalizeMode(persisted.themeMode || persisted.theme_mode, persisted.darkMode ?? persisted.dark_mode);
    theme.theme_mode = theme.themeMode;
    theme.darkMode = theme.themeMode === 'dark';
    theme.dark_mode = theme.darkMode;
  }
  const root = document.documentElement;
  const accentSoft = mixWithWhite(theme.themeColor);
  const accentStrong = mixWithBlack(theme.themeColor);
  const resolvedMode = resolveThemeMode(theme.themeMode);
  const isDark = resolvedMode === 'dark';
  const accentMuted = isDark ? mixWithDark(theme.themeColor, 0.18) : mixWithWhite(theme.themeColor, 0.9);

  root.style.setProperty('--dashboard-color', theme.themeColor);
  root.style.setProperty('--dashboard-color-soft', accentSoft);
  root.style.setProperty('--app-accent', theme.themeColor);
  root.style.setProperty('--app-accent-soft', accentSoft);
  root.style.setProperty('--app-accent-strong', accentStrong);
  root.style.setProperty('--app-accent-muted', accentMuted);
  root.style.setProperty('--app-metric-card-bg', isDark ? '#1f2127' : accentSoft);
  root.style.setProperty('--app-accent-contrast', contrastColor(theme.themeColor));
  root.style.setProperty('--app-focus-ring', mixWithWhite(theme.themeColor, 0.82));
  root.style.setProperty('--app-tint-bg', isDark ? '#111318' : mixWithWhite(theme.themeColor, 0.96));
  root.style.setProperty('--app-tint-panel', isDark ? '#1f2127' : mixWithWhite(theme.themeColor, 0.985));
  root.style.setProperty('--sidebar-top', isDark ? '#111318' : mixWithBlack(theme.themeColor, 0.12));
  root.style.setProperty('--sidebar-middle', isDark ? '#191c23' : theme.themeColor);
  root.style.setProperty('--sidebar-bottom', isDark ? '#0b0d12' : mixWithBlack(theme.themeColor, 0.28));
  root.style.setProperty('--sidebar-active', isDark ? '#2a2d35' : mixWithWhite(theme.themeColor, 0.18));
  root.style.setProperty('--sidebar-border', isDark ? '#343946' : mixWithWhite(theme.themeColor, 0.34));
  root.style.setProperty('--sidebar-avatar', isDark ? theme.themeColor : mixWithWhite(theme.themeColor, 0.22));
  root.style.setProperty('--app-font-family', `${theme.font}, Roboto, ui-sans-serif, system-ui, sans-serif`);
  root.dataset.theme = resolvedMode;
  root.dataset.themeMode = theme.themeMode;

  return theme;
}

export function storeTenantSettings(settings = {}) {
  if (!canUseDom()) return applyTenantTheme(settings);

  const merged = {
    ...getStoredTenantSettings(),
    ...settings,
  };
  // Never replace stored appearance with defaults supplied by a partial tenant
  // object (for example the tenant object returned at login).
  const hasColor = Object.prototype.hasOwnProperty.call(settings, 'themeColor') || Object.prototype.hasOwnProperty.call(settings, 'theme_color');
  const hasMode = Object.prototype.hasOwnProperty.call(settings, 'themeMode') || Object.prototype.hasOwnProperty.call(settings, 'theme_mode') || Object.prototype.hasOwnProperty.call(settings, 'darkMode') || Object.prototype.hasOwnProperty.call(settings, 'dark_mode');
  const stored = getStoredTenantSettings();
  if (!hasColor) {
    merged.themeColor = stored.themeColor || stored.theme_color || DEFAULT_TENANT_THEME.themeColor;
    merged.theme_color = merged.themeColor;
  }
  if (!hasMode) {
    merged.themeMode = stored.themeMode || stored.theme_mode || DEFAULT_TENANT_THEME.themeMode;
    merged.theme_mode = merged.themeMode;
    merged.darkMode = merged.themeMode === 'dark';
    merged.dark_mode = merged.darkMode;
  }
  const theme = normalizeTenantTheme(merged);
  window.localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  applyTenantTheme(theme);
  window.dispatchEvent(new CustomEvent(TENANT_THEME_EVENT, { detail: theme }));
  return theme;
}

export function clearTenantTheme() {
  if (!canUseDom()) return;
  window.localStorage.removeItem(THEME_STORAGE_KEY);
  applyTenantTheme(DEFAULT_TENANT_THEME);
  window.dispatchEvent(new CustomEvent(TENANT_THEME_EVENT, { detail: DEFAULT_TENANT_THEME }));
}
