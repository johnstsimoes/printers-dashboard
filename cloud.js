// Minimal Bambu Cloud client: login, token persistence, and the bound-printer list.

const fs = require('fs');
const path = require('path');

const SESSION_PATH = path.join(__dirname, 'bambu-cloud.json');

const REGIONS = {
  global: { api: 'https://api.bambulab.com', web: 'https://bambulab.com', mqtt: 'us.mqtt.bambulab.com' },
  china: { api: 'https://api.bambulab.cn', web: 'https://bambulab.cn', mqtt: 'cn.mqtt.bambulab.com' },
};

// The API sits behind Cloudflare and is picky about clients; present as a slicer.
const HEADERS = {
  'Content-Type': 'application/json',
  'User-Agent': 'bambu_network_agent/01.09.05.01',
  'X-BBL-Client-Name': 'OrcaSlicer',
  'X-BBL-Client-Type': 'slicer',
  'X-BBL-Client-Version': '01.09.05.51',
  'X-BBL-Language': 'en-US',
  'X-BBL-OS-Type': 'windows',
};

const DEFAULT_TOKEN_LIFETIME_S = 90 * 24 * 3600;

class CloudError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(url, { method = 'GET', body, token } = {}) {
  const headers = { ...HEADERS };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(url, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = {};
  }
  if (!res.ok) {
    const msg = data.message || data.error || (res.status === 403 ? 'Request blocked by Bambu Cloud (HTTP 403)' : `HTTP ${res.status}`);
    throw new CloudError(msg, res.status);
  }
  return { data, res };
}

function region(name) {
  const r = REGIONS[name];
  if (!r) throw new Error(`Unknown region "${name}" (use "global" or "china")`);
  return r;
}

function tokenResult(data) {
  return {
    accessToken: data.accessToken,
    refreshToken: data.refreshToken || null,
    expiresAt: Date.now() + (data.expiresIn || DEFAULT_TOKEN_LIFETIME_S) * 1000,
  };
}

// Returns tokens, or { needs: 'code' } / { needs: 'tfa', tfaKey } when another step is required.
async function login(regionName, account, password) {
  const { data } = await request(`${region(regionName).api}/v1/user-service/user/login`, {
    method: 'POST',
    body: { account, password, apiError: '' },
  });
  if (data.accessToken) return tokenResult(data);
  if (data.loginType === 'verifyCode') return { needs: 'code' };
  if (data.loginType === 'tfa') return { needs: 'tfa', tfaKey: data.tfaKey };
  throw new CloudError('Login failed: unexpected response from Bambu Cloud');
}

async function sendEmailCode(regionName, email) {
  await request(`${region(regionName).api}/v1/user-service/user/sendemail/code`, {
    method: 'POST',
    body: { email, type: 'codeLogin' },
  });
}

async function loginWithCode(regionName, account, code) {
  const { data } = await request(`${region(regionName).api}/v1/user-service/user/login`, {
    method: 'POST',
    body: { account, code },
  });
  if (!data.accessToken) throw new CloudError('Verification code was not accepted');
  return tokenResult(data);
}

async function loginWithTfa(regionName, tfaKey, tfaCode) {
  const { res } = await request(`${region(regionName).web}/api/sign-in/tfa`, {
    method: 'POST',
    body: { tfaKey, tfaCode },
  });
  const match = /(?:^|[;,]\s*)token=([^;]+)/.exec(res.headers.get('set-cookie') || '');
  if (!match) throw new CloudError('Two-factor code was not accepted');
  return tokenResult({ accessToken: match[1] });
}

async function refresh(session) {
  if (!session.refreshToken) throw new CloudError('No refresh token stored');
  const { data } = await request(`${region(session.region).api}/v1/user-service/user/refreshtoken`, {
    method: 'POST',
    body: { refreshToken: session.refreshToken },
  });
  if (!data.accessToken) throw new CloudError('Token refresh was rejected');
  return { ...session, ...tokenResult({ ...data, refreshToken: data.refreshToken || session.refreshToken }) };
}

// MQTT username is "u_<uid>".
async function getUsername(regionName, token) {
  const { data } = await request(`${region(regionName).api}/v1/user-service/my/profile`, { token });
  if (!data.uid) throw new CloudError('Could not read user id from Bambu Cloud profile');
  return `u_${data.uid}`;
}

async function getDevices(session) {
  const { data } = await request(`${region(session.region).api}/v1/iot-service/api/user/bind`, {
    token: session.accessToken,
  });
  return Array.isArray(data.devices) ? data.devices : [];
}

function loadSession() {
  if (!fs.existsSync(SESSION_PATH)) return null;
  return JSON.parse(fs.readFileSync(SESSION_PATH, 'utf8'));
}

function saveSession(session) {
  fs.writeFileSync(SESSION_PATH, JSON.stringify(session, null, 2));
}

module.exports = {
  REGIONS,
  SESSION_PATH,
  CloudError,
  login,
  sendEmailCode,
  loginWithCode,
  loginWithTfa,
  refresh,
  getUsername,
  getDevices,
  loadSession,
  saveSession,
};
