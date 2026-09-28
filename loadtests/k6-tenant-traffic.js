import http from 'k6/http';
import { check, fail, sleep } from 'k6';

const baseUrl = String(__ENV.K6_BASE_URL || '').replace(/\/$/, '');
const targetVUs = Number(__ENV.K6_TARGET_VUS || 1);
const rampMinutes = Number(__ENV.K6_RAMP_MINUTES || 5);
const duration = __ENV.K6_DURATION || '';
const email = __ENV.K6_LOGIN_EMAIL || '';
const password = __ENV.K6_LOGIN_PASSWORD || '';
const suppliedToken = __ENV.K6_AUTH_TOKEN || '';
let vuToken = suppliedToken;

function isPrivateOrLocalHost(url) {
  try {
    const hostname = url.match(/^https?:\/\/([^/:]+)/i)?.[1]?.toLowerCase() || '';
    return hostname === 'localhost'
      || hostname === '127.0.0.1'
      || hostname === '::1'
      || hostname.startsWith('10.')
      || hostname.startsWith('192.168.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
  } catch {
    return false;
  }
}

if (!baseUrl) fail('K6_BASE_URL is required.');
if (!isPrivateOrLocalHost(baseUrl) && __ENV.K6_ALLOW_PRODUCTION !== 'YES') {
  fail('Refusing a public/production target. Set K6_ALLOW_PRODUCTION=YES after approval.');
}
if (targetVUs < 1 || targetVUs > 2500) fail('K6_TARGET_VUS must be between 1 and 2500.');
if (!suppliedToken && (!email || !password)) fail('Set K6_LOGIN_EMAIL and K6_LOGIN_PASSWORD, or provide K6_AUTH_TOKEN.');

export const options = {
  scenarios: {
    tenant_traffic: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: `${Math.max(1, rampMinutes)}m`, target: targetVUs },
        { duration: duration || '10m', target: targetVUs },
        { duration: `${Math.max(1, Math.ceil(rampMinutes / 3))}m`, target: 0 },
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.02'],
    http_req_duration: ['p(95)<1500', 'p(99)<3000'],
    checks: ['rate>0.98'],
  },
};

function request(path, token = vuToken) {
  return http.get(`${baseUrl}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    tags: { endpoint: path.split('?')[0] },
  });
}

function login() {
  const response = http.post(
    `${baseUrl}/api/auth/login`,
    JSON.stringify({ email, password }),
    { headers: { 'Content-Type': 'application/json' }, tags: { endpoint: '/api/auth/login' } },
  );

  const payload = response.json() || {};
  if (payload.requires_two_step) {
    fail('Login requires two-step verification. Do not bypass it; use an approved load-test environment or K6_AUTH_TOKEN.');
  }

  const ok = check(response, {
    'login returns 2xx': (item) => item.status >= 200 && item.status < 300,
    'login returns a token': () => Boolean(payload.token),
  });
  if (!ok) fail(`Login failed with HTTP ${response.status}. Check the dedicated test credentials.`);
  vuToken = payload.token;
}

export default function () {
  if (!vuToken) login();

  const paths = [
    '/api/dashboard/stats',
    '/api/customers?page=1&page_size=25',
    '/api/packages?page=1&page_size=25',
    '/api/payments?page=1&page_size=25',
    '/api/invoices?page=1&page_size=25',
    '/api/vouchers?page=1&page_size=25',
    '/api/tickets?page=1&page_size=25',
    '/api/settings/mikrotik',
  ];

  for (const path of paths) {
    const response = request(path);
    check(response, {
      [`${path} returns success`]: (item) => item.status >= 200 && item.status < 300,
    });
    sleep(Math.random() * 1.5 + 0.5);
  }
}
