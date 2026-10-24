// Printer farm dashboard server.
// Printers come from Bambu Cloud (after `npm run login`) and/or printers.json.
// Status reports arrive over MQTT, either from the Bambu Cloud broker or directly
// from a printer's local broker (port 8883) when an IP is configured, and are
// streamed to browsers as a normalized view via SSE.

const http = require('http');
const fs = require('fs');
const path = require('path');
const mqtt = require('mqtt');
const cloud = require('./cloud');

const PORT = Number(process.env.PORT) || 3000;
const DEMO = process.argv.includes('--demo');
const CONFIG_PATH = path.join(__dirname, 'printers.json');
const PUBLIC_DIR = path.join(__dirname, 'public');
// P1/A1 series only send deltas and are sensitive to frequent full-state requests,
// so ask for a full refresh sparingly.
const PUSHALL_INTERVAL_MS = 5 * 60 * 1000;
const STALE_AFTER_MS = 2 * 60 * 1000;
const DEVICE_LIST_REFRESH_MS = 10 * 60 * 1000;
const TOKEN_REFRESH_MARGIN_MS = 7 * 24 * 3600 * 1000;

// Serial-number prefixes used to guess the model when nothing else says.
const MODEL_PREFIXES = {
  '00M': 'X1 Carbon',
  '03W': 'X1E',
  '01S': 'P1P',
  '01P': 'P1S',
  '030': 'A1 mini',
  '039': 'A1',
};

// print.stg_cur values -> human readable sub-stage.
const STAGES = {
  0: 'Printing', 1: 'Auto bed leveling', 2: 'Heatbed preheating', 3: 'Sweeping XY mech mode',
  4: 'Changing filament', 5: 'M400 pause', 6: 'Paused: filament runout', 7: 'Heating hotend',
  8: 'Calibrating extrusion', 9: 'Scanning bed surface', 10: 'Inspecting first layer',
  11: 'Identifying build plate', 12: 'Calibrating micro lidar', 13: 'Homing toolhead',
  14: 'Cleaning nozzle tip', 15: 'Checking extruder temperature', 16: 'Paused by user',
  17: 'Paused: front cover falling', 18: 'Calibrating micro lidar', 19: 'Calibrating extrusion flow',
  20: 'Paused: nozzle temperature malfunction', 21: 'Paused: heatbed temperature malfunction',
  22: 'Unloading filament', 23: 'Paused: skip step', 24: 'Loading filament',
  25: 'Calibrating motor noise', 26: 'Paused: AMS lost', 27: 'Paused: heat break fan speed low',
  28: 'Paused: chamber temperature error', 29: 'Cooling chamber', 30: 'Paused by G-code',
  31: 'Motor noise showoff', 32: 'Paused: nozzle filament covered', 33: 'Paused: cutter error',
  34: 'Paused: first layer error', 35: 'Paused: nozzle clog',
};

const printers = new Map(); // serial -> runtime state
const clients = new Set(); // open SSE responses

function fail(lines) {
  for (const line of lines) console.error(line);
  process.exit(1);
}

// printers.json is optional when signed in to Bambu Cloud; there it only adds
// name/model overrides, LAN IPs, or printers not on the account.
function loadConfig({ required }) {
  if (!fs.existsSync(CONFIG_PATH)) {
    if (!required) return [];
    fail([
      'No printers configured.',
      '  - Run "npm run login" to load your printers from Bambu Cloud, or',
      '  - copy printers.example.json to printers.json and fill in your printers.',
      'Or run "npm run demo" to see the dashboard with simulated printers.',
    ]);
  }
  let list;
  try {
    list = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
  } catch (err) {
    fail([`Could not parse printers.json: ${err.message}`]);
  }
  if (!Array.isArray(list)) list = list.printers;
  if (!Array.isArray(list)) fail(['printers.json must contain an array of printers.']);
  list.forEach((p, i) => {
    if (!p.serial) fail([`Printer #${i + 1} (${p.name || 'unnamed'}) in printers.json is missing "serial".`]);
  });
  return list;
}

function guessModel(serial) {
  return MODEL_PREFIXES[String(serial).slice(0, 3)] || 'Bambu Lab';
}

function upsertPrinter({ serial, name, model, source }) {
  let p = printers.get(serial);
  if (!p) {
    p = {
      id: serial,
      connection: 'connecting',
      lastError: null,
      lastUpdate: null,
      etaAt: null,
      print: {},
    };
    printers.set(serial, p);
  }
  p.name = name || p.name || serial;
  p.model = model || p.model || guessModel(serial);
  p.source = source;
  return p;
}

function deepMerge(target, source) {
  for (const [key, value] of Object.entries(source)) {
    if (value && typeof value === 'object' && !Array.isArray(value)) {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) target[key] = {};
      deepMerge(target[key], value);
    } else {
      target[key] = value;
    }
  }
  return target;
}

function num(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}

function summarize(p) {
  const pr = p.print;
  const stale = p.lastUpdate && Date.now() - p.lastUpdate > STALE_AFTER_MS;
  return {
    id: p.id,
    name: p.name,
    model: p.model,
    source: p.source,
    connection: p.connection === 'online' && stale ? 'stale' : p.connection,
    lastError: p.lastError,
    lastUpdate: p.lastUpdate,
    state: pr.gcode_state || 'UNKNOWN',
    stage: pr.stg_cur != null && pr.stg_cur >= 0 ? STAGES[pr.stg_cur] || null : null,
    progress: num(pr.mc_percent),
    remainingMin: num(pr.mc_remaining_time),
    etaAt: p.etaAt,
    layer: num(pr.layer_num),
    totalLayers: num(pr.total_layer_num),
    job: pr.subtask_name || pr.gcode_file || null,
    nozzle: { cur: num(pr.nozzle_temper), target: num(pr.nozzle_target_temper) },
    bed: { cur: num(pr.bed_temper), target: num(pr.bed_target_temper) },
    chamber: num(pr.chamber_temper),
    printError: pr.print_error || 0,
    hmsCount: Array.isArray(pr.hms) ? pr.hms.length : 0,
  };
}

function snapshot() {
  return [...printers.values()].sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })).map(summarize);
}

let broadcastTimer = null;
function scheduleBroadcast() {
  // Printers report roughly once a second each; coalesce bursts into one push.
  if (broadcastTimer) return;
  broadcastTimer = setTimeout(() => {
    broadcastTimer = null;
    const payload = `data: ${JSON.stringify({ printers: snapshot(), serverTime: Date.now() })}\n\n`;
    for (const res of clients) res.write(payload);
  }, 250);
}

function applyReport(p, report) {
  if (!report.print) return;
  deepMerge(p.print, report.print);
  if (typeof report.print.mc_remaining_time === 'number') {
    p.etaAt = Date.now() + report.print.mc_remaining_time * 60 * 1000;
  }
  p.lastUpdate = Date.now();
  p.connection = 'online';
  p.lastError = null;
  scheduleBroadcast();
}

function setOffline(p, msg) {
  p.connection = 'offline';
  p.lastError = msg;
  scheduleBroadcast();
}

function pushallMessage(seq) {
  return JSON.stringify({ pushing: { sequence_id: String(seq), command: 'pushall' } });
}

function friendlyMqttError(err, host) {
  if (/not authorized|bad user name or password/i.test(err.message)) return 'not-authorized';
  if (/connack timeout|ETIMEDOUT|EHOSTUNREACH|ECONNREFUSED|ENOTFOUND/i.test(err.message)) return `Can't reach ${host}`;
  return err.message;
}

// ---- LAN: one MQTT connection per printer, straight to the printer ----
const lanSerials = new Set();

function connectLan(cfg) {
  if (lanSerials.has(cfg.serial)) return;
  lanSerials.add(cfg.serial);
  const p = upsertPrinter({ ...cfg, source: 'lan' });
  const reportTopic = `device/${cfg.serial}/report`;
  const requestTopic = `device/${cfg.serial}/request`;
  let seq = 0;

  const client = mqtt.connect(`mqtts://${cfg.ip}:8883`, {
    username: 'bblp',
    password: String(cfg.accessCode),
    // Printers use a self-signed certificate.
    rejectUnauthorized: false,
    reconnectPeriod: 10000,
    connectTimeout: 10000,
    clientId: `farmdash_${cfg.serial}_${Math.random().toString(16).slice(2, 8)}`,
  });

  const pushall = () => {
    if (client.connected) client.publish(requestTopic, pushallMessage(seq++));
  };

  client.on('connect', () => {
    console.log(`[${p.name}] connected over LAN (${cfg.ip})`);
    p.connection = 'online';
    p.lastError = null;
    client.subscribe(reportTopic, (err) => {
      if (err) console.error(`[${p.name}] subscribe failed: ${err.message}`);
      else pushall();
    });
    scheduleBroadcast();
  });

  client.on('message', (_topic, message) => {
    try {
      applyReport(p, JSON.parse(message.toString()));
    } catch {
      // Ignore malformed payloads.
    }
  });

  client.on('error', (err) => {
    let msg = friendlyMqttError(err, `printer at ${cfg.ip}`);
    if (msg === 'not-authorized') msg = 'Access code rejected';
    if (p.lastError !== msg) console.error(`[${p.name}] ${msg}`);
    setOffline(p, msg);
  });

  client.on('offline', () => setOffline(p, p.lastError || `Can't reach printer at ${cfg.ip}`));

  setInterval(pushall, PUSHALL_INTERVAL_MS);
}

// ---- Bambu Cloud: printer list from the API, status from the cloud MQTT broker ----
async function startCloud(session, overrides) {
  const broker = cloud.REGIONS[session.region].mqtt;
  const cloudSerials = new Set();
  let seq = 0;
  let mqttClient = null;

  const reauthMessage = 'Bambu Cloud sign-in expired - run "npm run login"';

  async function ensureFreshToken() {
    if (session.expiresAt - Date.now() > TOKEN_REFRESH_MARGIN_MS) return;
    try {
      session = await cloud.refresh(session);
      cloud.saveSession(session);
      if (mqttClient) mqttClient.options.password = session.accessToken;
      console.log('Bambu Cloud token refreshed.');
    } catch (err) {
      const days = Math.max(0, Math.round((session.expiresAt - Date.now()) / 86400000));
      console.warn(`Could not refresh Bambu Cloud token (${err.message}); it expires in ~${days} days.`);
    }
  }

  function subscribe(serial) {
    if (!mqttClient || !mqttClient.connected) return;
    mqttClient.subscribe(`device/${serial}/report`, (err) => {
      if (err) console.error(`[${printers.get(serial)?.name || serial}] subscribe failed: ${err.message}`);
      else mqttClient.publish(`device/${serial}/request`, pushallMessage(seq++));
    });
  }

  async function refreshDevices() {
    let devices;
    try {
      devices = await cloud.getDevices(session);
    } catch (err) {
      if (err.status === 401) console.error(reauthMessage);
      else console.error(`Could not fetch printer list from Bambu Cloud: ${err.message}`);
      return false;
    }

    const seen = new Set();
    for (const d of devices) {
      const serial = d.dev_id;
      seen.add(serial);
      const o = overrides.find((c) => c.serial === serial) || {};
      const info = { serial, name: o.name || d.name, model: o.model || d.dev_product_name };

      if (o.ip) {
        // Configured with an IP: read it locally, using the cloud's access code if none given.
        connectLan({ ...info, ip: o.ip, accessCode: o.accessCode || d.dev_access_code });
        upsertPrinter({ ...info, source: 'lan' });
        continue;
      }

      const p = upsertPrinter({ ...info, source: 'cloud' });
      if (!cloudSerials.has(serial)) {
        cloudSerials.add(serial);
        subscribe(serial);
      }
      if (!d.online) setOffline(p, 'Offline according to Bambu Cloud');
    }

    // Printers removed from the account.
    for (const serial of [...cloudSerials]) {
      if (seen.has(serial)) continue;
      cloudSerials.delete(serial);
      printers.delete(serial);
      if (mqttClient && mqttClient.connected) mqttClient.unsubscribe(`device/${serial}/report`);
    }

    scheduleBroadcast();
    return true;
  }

  await ensureFreshToken();
  const ok = await refreshDevices();
  if (ok) console.log(`Loaded ${printers.size} printer(s) from Bambu Cloud.`);

  mqttClient = mqtt.connect(`mqtts://${broker}:8883`, {
    username: session.username,
    password: session.accessToken,
    reconnectPeriod: 15000,
    connectTimeout: 15000,
    clientId: `farmdash_${Math.random().toString(16).slice(2, 10)}`,
  });

  mqttClient.on('connect', () => {
    console.log(`Connected to Bambu Cloud MQTT (${broker})`);
    for (const serial of cloudSerials) {
      const p = printers.get(serial);
      if (p && p.lastError && p.lastError !== 'Offline according to Bambu Cloud') {
        p.connection = 'connecting';
        p.lastError = null;
      }
      subscribe(serial);
    }
    scheduleBroadcast();
  });

  mqttClient.on('message', (topic, message) => {
    const serial = topic.split('/')[1];
    const p = cloudSerials.has(serial) && printers.get(serial);
    if (!p) return;
    try {
      applyReport(p, JSON.parse(message.toString()));
    } catch {
      // Ignore malformed payloads.
    }
  });

  let lastCloudError = null;
  mqttClient.on('error', (err) => {
    let msg = friendlyMqttError(err, 'Bambu Cloud');
    if (msg === 'not-authorized') msg = reauthMessage;
    if (msg !== lastCloudError) console.error(`[cloud] ${msg}`);
    lastCloudError = msg;
    for (const serial of cloudSerials) setOffline(printers.get(serial), msg);
  });

  mqttClient.on('offline', () => {
    for (const serial of cloudSerials) {
      const p = printers.get(serial);
      setOffline(p, p.lastError || "Can't reach Bambu Cloud");
    }
  });

  setInterval(refreshDevices, ok ? DEVICE_LIST_REFRESH_MS : 60 * 1000);
  setInterval(ensureFreshToken, 12 * 3600 * 1000);
  setInterval(() => {
    if (!mqttClient.connected) return;
    for (const serial of cloudSerials) mqttClient.publish(`device/${serial}/request`, pushallMessage(seq++));
  }, PUSHALL_INTERVAL_MS);
}

// ---- Demo mode: simulated printers so the UI can be tried without hardware ----
function startDemo() {
  const demo = [
    { name: 'Crab', serial: '01P00A000000001', state: 'RUNNING', total: 180, done: 40, layers: 320 },
    { name: 'Jellyfish', serial: '01P00A000000002', state: 'RUNNING', total: 95, done: 88, layers: 140 },
    { name: 'Lobster', serial: '01P00A000000003', state: 'PAUSE', total: 240, done: 120, layers: 410, stg: 6 },
    { name: 'Squid', serial: '01P00A000000004', state: 'RUNNING', total: 600, done: 5, layers: 900, stg: 10 },
    { name: 'Jaca', serial: '039000000000005', state: 'FINISH', total: 60, done: 60, layers: 90 },
    { name: 'Goiaba', serial: '039000000000006', offline: true },
    { name: 'Polvo', serial: '01P00A000000007', state: 'FAILED', total: 120, done: 33, layers: 200, err: 0x0300400c },
    { name: 'Manga', serial: '030000000000008', state: 'IDLE' },
  ];
  const jobs = ['Benchy_x4.3mf', 'gridfinity_bins.3mf', 'cable_clips_PETG.3mf', 'enclosure_lid.3mf', 'planter_vase.3mf'];

  demo.forEach((d, i) => {
    const p = upsertPrinter({ name: d.name, serial: d.serial, source: 'demo' });
    if (d.offline) {
      setOffline(p, "Can't reach printer at 192.168.1.58");
      return;
    }
    let elapsed = d.done || 0;
    const tick = () => {
      const running = d.state === 'RUNNING';
      if (running) elapsed = Math.min(d.total, elapsed + 1);
      if (running && elapsed >= d.total) d.state = 'FINISH';
      const active = d.total != null;
      applyReport(p, {
        print: {
          gcode_state: d.state,
          stg_cur: d.state === 'RUNNING' ? (elapsed < 8 && d.stg != null ? d.stg : 0) : d.state === 'PAUSE' ? d.stg : -1,
          subtask_name: active ? jobs[i % jobs.length] : '',
          mc_percent: active ? Math.round((elapsed / d.total) * 100) : 0,
          mc_remaining_time: active ? d.total - elapsed : 0,
          layer_num: active ? Math.round((elapsed / d.total) * d.layers) : 0,
          total_layer_num: d.layers || 0,
          nozzle_temper: d.state === 'RUNNING' ? 219 + Math.random() * 2 : 28 + Math.random(),
          nozzle_target_temper: d.state === 'RUNNING' ? 220 : 0,
          bed_temper: d.state === 'RUNNING' ? 54.5 + Math.random() : 26 + Math.random(),
          bed_target_temper: d.state === 'RUNNING' ? 55 : 0,
          chamber_temper: 31,
          print_error: d.err || 0,
          hms: d.err ? [{ attr: 0, code: d.err }] : [],
        },
      });
    };
    tick();
    // One simulated minute every 3 seconds so progress is visible.
    setInterval(tick, 3000);
  });
}

// ---- HTTP server ----
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' };

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');

  if (url.pathname === '/events') {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });
    res.write(`data: ${JSON.stringify({ printers: snapshot(), serverTime: Date.now() })}\n\n`);
    clients.add(res);
    const keepAlive = setInterval(() => res.write(': ping\n\n'), 25000);
    req.on('close', () => {
      clearInterval(keepAlive);
      clients.delete(res);
    });
    return;
  }

  if (url.pathname === '/api/printers') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(snapshot()));
    return;
  }

  const file = path.normalize(path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUBLIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404).end('Not found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
});

async function start() {
  if (DEMO) {
    console.log('Demo mode: using simulated printers.');
    startDemo();
    return;
  }

  let session = null;
  try {
    session = cloud.loadSession();
  } catch (err) {
    fail([`Could not read ${cloud.SESSION_PATH}: ${err.message}`, 'Run "npm run login" again.']);
  }
  const config = loadConfig({ required: !session });

  // Printers.json entries with full LAN details connect right away; in cloud mode
  // the rest are matched against the account's printer list.
  for (const c of config) {
    if (c.ip && c.accessCode) connectLan(c);
    else if (!session) fail([`Printer "${c.name || c.serial}" in printers.json needs "ip" and "accessCode".`]);
  }

  if (session) await startCloud(session, config);
}

// Re-broadcast periodically so "stale" connection status shows up even without traffic.
setInterval(scheduleBroadcast, 30000);

server.listen(PORT, () => {
  console.log(`Dashboard running at http://localhost:${PORT}`);
});

start().catch((err) => {
  console.error(err);
  process.exit(1);
});
