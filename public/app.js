const grid = document.getElementById('grid');
const summaryEl = document.getElementById('summary');
const connEl = document.getElementById('conn');
const countEl = document.getElementById('count');

let printers = [];
let clockSkew = 0; // serverTime - local time, so ETAs survive a mis-set PC clock

const STATUS = {
  printing: 'Printing',
  paused: 'Paused',
  failed: 'Failed',
  finished: 'Finished',
  idle: 'Idle',
  offline: 'Offline',
};

const SOURCE = { cloud: 'via cloud', lan: 'via LAN' };

const RING_R = 35.5;
const RING_C = 2 * Math.PI * RING_R;

function category(p) {
  if (p.connection === 'offline' || p.connection === 'connecting') return 'offline';
  switch (p.state) {
    case 'RUNNING':
    case 'PREPARE':
    case 'SLICING':
      return 'printing';
    case 'PAUSE': return 'paused';
    case 'FINISH': return 'finished';
    case 'FAILED': return 'failed';
    default: return 'idle';
  }
}

function fmtDuration(ms) {
  const totalMin = Math.max(0, Math.round(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  if (h >= 24) return `${Math.floor(h / 24)}d ${h % 24}h`;
  return h ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

// -> { day: '' | 'tomorrow' | 'Sat', time: '14:35' }
function fmtClock(ts) {
  const d = new Date(ts);
  const now = new Date();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const days = Math.round((new Date(d).setHours(0, 0, 0, 0) - new Date(now).setHours(0, 0, 0, 0)) / 86400000);
  if (days === 0) return { day: '', time };
  if (days === 1) return { day: 'tomorrow', time };
  return { day: d.toLocaleDateString([], { weekday: 'short' }), time };
}

function fmtTemp(t) {
  if (t.cur == null) return '–';
  return t.target ? `${Math.round(t.cur)}°<span class="tgt">/${Math.round(t.target)}°</span>` : `${Math.round(t.cur)}°`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function remainingMs(p) {
  if (p.etaAt == null) return null;
  return p.etaAt - (Date.now() + clockSkew);
}

function ringFraction(p, cat) {
  if (cat === 'finished') return 1;
  if (cat === 'printing' || cat === 'paused' || cat === 'failed') return Math.min(100, Math.max(0, p.progress ?? 0)) / 100;
  return 0;
}

function renderCard(p) {
  const cat = category(p);
  const active = cat === 'printing' || cat === 'paused';
  const label = cat === 'offline' && p.connection === 'connecting' ? 'Connecting' : STATUS[cat];
  const icon = printerIcon(p.name);
  const offset = RING_C * (1 - ringFraction(p, cat));

  let body = '';
  if (cat === 'offline') {
    body = `<div class="note">${p.lastError ? esc(p.lastError) : 'Waiting for printer…'}</div>`;
  } else {
    if (p.job && cat !== 'idle') {
      body += `<div class="job"><div class="job-name" title="${esc(p.job)}">${esc(p.job)}</div>`;
      if (p.stage && p.stage !== 'Printing' && active) body += `<div class="stage">${esc(p.stage)}</div>`;
      body += `</div>`;
    }

    if (active) {
      const ms = remainingMs(p);
      const eta = ms != null ? fmtClock(Date.now() + ms) : null;
      const layers = p.totalLayers ? ` · Layer ${p.layer ?? 0} / ${p.totalLayers}` : '';
      body += `
        <div>
          <div class="time">
            <div>
              <div class="lbl-sm">${cat === 'paused' ? 'Remaining (paused)' : 'Remaining'}</div>
              <div class="big">${ms != null ? fmtDuration(ms) : '–'}</div>
            </div>
            ${eta ? `<div class="eta"><div class="lbl-sm">Done ${eta.day || 'at'}</div><div class="eta-time">${eta.time}</div></div>` : ''}
          </div>
          <div class="meta"><b>${p.progress ?? 0}%</b>${layers}</div>
        </div>`;
    } else if (cat === 'finished') {
      body += `<div class="message">Print complete<span class="sub">Ready for plate removal</span></div>`;
    } else if (cat === 'failed') {
      body += `<div class="message">Print failed<span class="sub">Stopped at ${p.progress ?? 0}%</span></div>`;
    } else {
      body += `<div class="message">Ready<span class="sub">Waiting for the next job</span></div>`;
    }

    if (p.printError || p.hmsCount) {
      const parts = [];
      if (p.printError) parts.push(`Error 0x${p.printError.toString(16).toUpperCase().padStart(8, '0')}`);
      if (p.hmsCount) parts.push(`${p.hmsCount} HMS alert${p.hmsCount > 1 ? 's' : ''}`);
      body += `<div class="alert">${parts.join(' · ')}</div>`;
    }

    if (p.connection === 'stale') body += `<div class="note">No update for a while…</div>`;

    body += `
      <div class="temps">
        <span class="temp">Nozzle <b>${fmtTemp(p.nozzle)}</b></span>
        <span class="temp">Bed <b>${fmtTemp(p.bed)}</b></span>
        ${p.chamber != null && p.chamber > 0 ? `<span class="temp">Chamber <b>${Math.round(p.chamber)}°</b></span>` : ''}
      </div>`;
  }

  return {
    className: `card s-${cat}${cat === 'offline' ? ' offline' : ''}`,
    html: `
      <div class="card-head">
        <div class="avatar" style="--accent:${icon.accent}">
          <svg class="ring" viewBox="0 0 76 76" aria-hidden="true">
            <circle class="track" cx="38" cy="38" r="${RING_R}"/>
            <circle class="prog" cx="38" cy="38" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"/>
          </svg>
          <div class="face">${icon.html}</div>
        </div>
        <div class="ident">
          <div class="name">${esc(p.name)}</div>
          <div class="model">${esc(p.model)}${SOURCE[p.source] ? ` · ${SOURCE[p.source]}` : ''}</div>
        </div>
        <span class="badge"><span class="dot"></span>${label}</span>
      </div>
      ${body}`,
  };
}

// Cards are kept and patched in place so animations and transitions run smoothly.
const cards = new Map(); // id -> { el, html }

function renderGrid() {
  if (!printers.length) {
    grid.innerHTML = '<div class="empty">No printers yet.</div>';
    cards.clear();
    return;
  }
  grid.querySelector('.empty')?.remove();

  const seen = new Set();
  printers.forEach((p, i) => {
    seen.add(p.id);
    const { className, html } = renderCard(p);
    let entry = cards.get(p.id);
    if (!entry) {
      const el = document.createElement('article');
      entry = { el, html: null };
      cards.set(p.id, entry);
    }
    if (entry.el.className !== className) entry.el.className = className;
    if (entry.html !== html) {
      const ring = entry.el.querySelector('.ring .prog');
      if (ring) {
        // Patch the ring separately so its transition animates instead of resetting.
        const tmp = document.createElement('div');
        tmp.innerHTML = html;
        const head = entry.el.querySelector('.card-head');
        const newHead = tmp.querySelector('.card-head');
        const oldAvatar = head.querySelector('.avatar');
        const newAvatar = newHead.querySelector('.avatar');
        ring.setAttribute('stroke-dashoffset', newAvatar.querySelector('.ring .prog').getAttribute('stroke-dashoffset'));
        oldAvatar.setAttribute('style', newAvatar.getAttribute('style'));
        const oldFace = oldAvatar.querySelector('.face');
        const newFace = newAvatar.querySelector('.face');
        if (oldFace.innerHTML !== newFace.innerHTML) oldFace.innerHTML = newFace.innerHTML;
        newAvatar.replaceWith(oldAvatar);
        entry.el.replaceChildren(newHead, ...[...tmp.children].slice(1));
      } else {
        entry.el.innerHTML = html;
      }
      entry.html = html;
    }
    if (grid.children[i] !== entry.el) grid.insertBefore(entry.el, grid.children[i] || null);
  });

  for (const [id, entry] of cards) {
    if (!seen.has(id)) {
      entry.el.remove();
      cards.delete(id);
    }
  }
}

function renderSummary() {
  const counts = {};
  for (const p of printers) {
    const c = category(p);
    counts[c] = (counts[c] || 0) + 1;
  }
  const tiles = Object.keys(STATUS)
    .filter((k) => counts[k])
    .map((k) => `
      <div class="stat s-${k}">
        <span class="swatch"></span>
        <div><div class="num">${counts[k]}</div><div class="lbl">${STATUS[k]}</div></div>
      </div>`);

  const next = printers
    .filter((p) => category(p) === 'printing' && remainingMs(p) != null)
    .sort((a, b) => remainingMs(a) - remainingMs(b))[0];
  if (next) {
    const icon = printerIcon(next.name);
    tiles.push(`
      <div class="stat next">
        <span class="mini" style="--accent:${icon.accent}">${icon.html}</span>
        <div><div class="num">${esc(next.name)} · ${fmtDuration(remainingMs(next))}</div><div class="lbl">Next to finish</div></div>
      </div>`);
  }
  const html = tiles.join('');
  if (summaryEl.innerHTML !== html) summaryEl.innerHTML = html;
  countEl.textContent = `${printers.length} printer${printers.length === 1 ? '' : 's'}`;
}

function render() {
  renderGrid();
  renderSummary();
}

function connect() {
  // Relative so the dashboard also works under a sub-path behind a reverse proxy.
  const es = new EventSource('events');
  es.onopen = () => {
    connEl.innerHTML = '<span class="live-dot"></span>Live';
    connEl.className = 'conn live';
  };
  es.onmessage = (e) => {
    const data = JSON.parse(e.data);
    printers = data.printers;
    clockSkew = data.serverTime - Date.now();
    render();
  };
  es.onerror = () => {
    connEl.innerHTML = '<span class="live-dot"></span>Server disconnected, retrying…';
    connEl.className = 'conn down';
  };
}

connect();
// Keep countdowns ticking between printer reports.
setInterval(render, 15000);
