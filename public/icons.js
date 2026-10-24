// Printer avatars, picked from the printer's name (sea creatures and fruit).
// Custom illustrations for the farm's printers, emoji for other common names,
// and a lettered badge as the last resort.

(() => {
  const INK = '#1d2433';
  const eye = (x, y, r = 3.2) =>
    `<circle cx="${x}" cy="${y}" r="${r}" fill="#fff"/>` +
    `<circle cx="${x + 0.5}" cy="${y + 0.4}" r="${(r * 0.53).toFixed(2)}" fill="${INK}"/>`;
  const svg = (body) => `<svg viewBox="0 0 64 64" aria-hidden="true">${body}</svg>`;
  // Open pincer: a circle with an upward-facing wedge cut out.
  const pincer = (cx, cy, r, fill) => {
    const dx = (r * 0.5).toFixed(2);
    const dy = (r * 0.866).toFixed(2);
    return `<path d="M${cx} ${cy} L${cx + +dx} ${cy - dy} A${r} ${r} 0 1 1 ${cx - dx} ${cy - dy} Z" fill="${fill}"/>`;
  };

  function jackfruitTexture() {
    let dots = '';
    for (let row = 0; row < 9; row++) {
      const y = 17 + row * 4.6;
      for (let x = 18 + (row % 2) * 2.5; x < 47; x += 5) {
        if (((x - 32) / 15) ** 2 + ((y - 36) / 21) ** 2 < 0.92) dots += `<circle cx="${x}" cy="${y.toFixed(1)}" r="1.4"/>`;
      }
    }
    return `<g fill="#909e27">${dots}</g>`;
  }

  function guavaSeeds() {
    let seeds = '<ellipse cx="32" cy="36" rx="1.1" ry="1.6" fill="#fff4dc"/>';
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      const x = (32 + 5.6 * Math.cos(a)).toFixed(2);
      const y = (36 + 5.6 * Math.sin(a)).toFixed(2);
      seeds += `<ellipse cx="${x}" cy="${y}" rx="1.1" ry="1.7" fill="#fff4dc" transform="rotate(${i * 45 + 90} ${x} ${y})"/>`;
    }
    return seeds;
  }

  const ART = {
    crab: {
      accent: '#f26b3a',
      html: svg(`
        <g stroke="#c94a22" stroke-width="3.5" stroke-linecap="round" fill="none">
          <path d="M18 40 L8 36 M17 45 L7 45 M19 49 L10 54 M46 40 L56 36 M47 45 L57 45 M45 49 L54 54"/>
          <path d="M27 32 L26 25 M37 32 L38 25" stroke-width="3"/>
        </g>
        <path d="M22 34 L15 23 M42 34 L49 23" stroke="#f26b3a" stroke-width="4" stroke-linecap="round"/>
        ${pincer(13, 17, 7, '#f26b3a')}${pincer(51, 17, 7, '#f26b3a')}
        <ellipse cx="32" cy="42" rx="17" ry="12" fill="#f26b3a"/>
        <ellipse cx="26" cy="37" rx="7" ry="3" fill="#ff9a70" opacity=".7"/>
        ${eye(26, 23)}${eye(38, 23)}
        <path d="M28 46 Q32 49 36 46" stroke="${INK}" stroke-width="2" stroke-linecap="round" fill="none"/>`),
    },
    jellyfish: {
      accent: '#8f7ff0',
      html: svg(`
        <g stroke="#b6aaf8" stroke-width="3" stroke-linecap="round" fill="none">
          <path d="M22 38 q-4 6 0 11 t0 11"/><path d="M29 39 q-3 5 0 9 t0 10"/>
          <path d="M35 39 q3 5 0 9 t0 10"/><path d="M42 38 q4 6 0 11 t0 11"/>
        </g>
        <path d="M12 36 C12 20 21 10 32 10 C43 10 52 20 52 36 Q47 40 42 36 Q37 40 32 36 Q27 40 22 36 Q17 40 12 36 Z" fill="#8f7ff0"/>
        <path d="M19 26 C20 19 25 15 30 14" stroke="#fff" stroke-opacity=".55" stroke-width="3" stroke-linecap="round" fill="none"/>
        ${eye(26, 27)}${eye(38, 27)}
        <ellipse cx="21.5" cy="31.5" rx="2.6" ry="1.5" fill="#f7a8c4"/><ellipse cx="42.5" cy="31.5" rx="2.6" ry="1.5" fill="#f7a8c4"/>
        <path d="M30 31 Q32 33 34 31" stroke="${INK}" stroke-width="1.6" stroke-linecap="round" fill="none"/>`),
    },
    lobster: {
      accent: '#d93a3a',
      html: svg(`
        <g stroke="#a82525" stroke-linecap="round" fill="none">
          <path d="M29 15 C25 7 17 3 9 4 M35 15 C39 7 47 3 55 4" stroke-width="2"/>
          <path d="M26 30 L19 33 M26 34 L20 38 M38 30 L45 33 M38 34 L44 38" stroke-width="2.5"/>
        </g>
        <path d="M26 24 L16 21 M38 24 L48 21" stroke="#d93a3a" stroke-width="4" stroke-linecap="round"/>
        ${pincer(12, 15, 7, '#d93a3a')}${pincer(52, 15, 7, '#d93a3a')}
        <path d="M32 51 L23 61 Q32 57 41 61 Z" fill="#d93a3a"/>
        <g fill="#d93a3a" stroke="#a82525" stroke-width="1.5">
          <ellipse cx="32" cy="50.5" rx="5" ry="3.2"/><ellipse cx="32" cy="45" rx="6" ry="3.6"/><ellipse cx="32" cy="39" rx="7" ry="4"/>
        </g>
        <ellipse cx="32" cy="26" rx="8" ry="11" fill="#d93a3a"/>
        <ellipse cx="29" cy="28" rx="2.5" ry="5" fill="#f06a5f" opacity=".7"/>
        ${eye(28.5, 19, 2.6)}${eye(35.5, 19, 2.6)}`),
    },
    squid: {
      accent: '#ee7fa2',
      html: svg(`
        <g stroke="#ee7fa2" stroke-width="3.5" stroke-linecap="round" fill="none">
          <path d="M24 40 q-6 8 -4 18"/><path d="M28 41 q-2 8 -1 16"/><path d="M32 41 l0 17"/>
          <path d="M36 41 q2 8 1 16"/><path d="M40 40 q6 8 4 18"/>
        </g>
        <path d="M25 12 L13 22 L24 26 Z M39 12 L51 22 L40 26 Z" fill="#d05f83"/>
        <path d="M32 4 C41 11 43 24 43 40 L21 40 C21 24 23 11 32 4 Z" fill="#ee7fa2"/>
        <g fill="#d05f83" opacity=".55"><circle cx="29" cy="17" r="1.6"/><circle cx="35" cy="22" r="1.9"/><circle cx="30" cy="27" r="1.3"/></g>
        ${eye(27, 34, 3.6)}${eye(37, 34, 3.6)}`),
    },
    jackfruit: {
      accent: '#a4b331',
      html: svg(`
        <path d="M32 14 L33 6" stroke="#7a5a2b" stroke-width="3.5" stroke-linecap="round"/>
        <path d="M33 9 C38 3 46 4 48 7 C44 11 37 12 33 9 Z" fill="#4f9a3c"/>
        <ellipse cx="32" cy="36" rx="17" ry="23" fill="#b8c43c"/>
        ${jackfruitTexture()}
        <ellipse cx="24.5" cy="28" rx="3.5" ry="8" fill="#fff" opacity=".25"/>`),
    },
    guava: {
      accent: '#ef6f82',
      html: svg(`
        <path d="M32 15 L32 8" stroke="#7a5a2b" stroke-width="3" stroke-linecap="round"/>
        <path d="M32 11 C26 4 18 5 15 8 C20 13 28 13 32 11 Z" fill="#4f9a3c"/>
        <circle cx="32" cy="36" r="22" fill="#7cb342"/>
        <circle cx="32" cy="36" r="18.5" fill="#f37b8c"/>
        <circle cx="32" cy="36" r="9.5" fill="#f9a7b2"/>
        ${guavaSeeds()}`),
    },
  };

  // Names (English and Portuguese, accents stripped) -> illustration key.
  const ALIASES = {
    crab: 'crab', caranguejo: 'crab', siri: 'crab',
    jellyfish: 'jellyfish', 'agua-viva': 'jellyfish', aguaviva: 'jellyfish', medusa: 'jellyfish',
    lobster: 'lobster', lagosta: 'lobster',
    squid: 'squid', lula: 'squid',
    jaca: 'jackfruit', jackfruit: 'jackfruit',
    goiaba: 'guava', guava: 'guava',
  };

  const EMOJI = {
    octopus: '🐙', polvo: '🐙', shrimp: '🦐', camarao: '🦐', prawn: '🦐',
    shark: '🦈', tubarao: '🦈', whale: '🐋', baleia: '🐋', dolphin: '🐬', golfinho: '🐬',
    turtle: '🐢', tartaruga: '🐢', oyster: '🦪', ostra: '🦪', shell: '🐚', concha: '🐚',
    puffer: '🐡', pufferfish: '🐡', baiacu: '🐡', seal: '🦭', foca: '🦭', coral: '🪸',
    fish: '🐟', peixe: '🐟', tuna: '🐟', atum: '🐟', salmon: '🐟', salmao: '🐟', sardine: '🐟', sardinha: '🐟',
    clownfish: '🐠', 'peixe-palhaco': '🐠', tropical: '🐠',
    apple: '🍎', maca: '🍎', pear: '🍐', pera: '🍐', orange: '🍊', laranja: '🍊', tangerine: '🍊', tangerina: '🍊',
    lemon: '🍋', limao: '🍋', lime: '🍋', banana: '🍌', watermelon: '🍉', melancia: '🍉',
    grape: '🍇', grapes: '🍇', uva: '🍇', strawberry: '🍓', morango: '🍓', blueberry: '🫐', mirtilo: '🫐',
    melon: '🍈', melao: '🍈', cherry: '🍒', cereja: '🍒', peach: '🍑', pessego: '🍑',
    mango: '🥭', manga: '🥭', pineapple: '🍍', abacaxi: '🍍', ananas: '🍍', coconut: '🥥', coco: '🥥',
    kiwi: '🥝', avocado: '🥑', abacate: '🥑', tomato: '🍅', tomate: '🍅', olive: '🫒', azeitona: '🫒',
  };

  const FALLBACK_ACCENTS = ['#3b82f6', '#14b8a6', '#f59e0b', '#ec4899', '#8b5cf6', '#22c55e'];

  function normalize(s) {
    return String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  }

  const cache = new Map();

  window.printerIcon = function printerIcon(name) {
    if (cache.has(name)) return cache.get(name);
    const full = normalize(name);
    const candidates = [full, full.replace(/\s+/g, '-'), ...full.split(/[^a-z0-9-]+/), ...full.split(/[^a-z0-9]+/)].filter(Boolean);

    let icon = null;
    for (const c of candidates) {
      if (ALIASES[c]) {
        icon = { kind: 'art', ...ART[ALIASES[c]] };
        break;
      }
      if (EMOJI[c]) {
        icon = { kind: 'emoji', accent: '#38bdf8', html: `<span class="emoji">${EMOJI[c]}</span>` };
        break;
      }
    }
    if (!icon) {
      let hash = 0;
      for (const ch of full) hash = (hash * 31 + ch.charCodeAt(0)) | 0;
      const accent = FALLBACK_ACCENTS[Math.abs(hash) % FALLBACK_ACCENTS.length];
      icon = { kind: 'letter', accent, html: `<span class="letter">${esc((String(name).trim()[0] || '?').toUpperCase())}</span>` };
    }
    cache.set(name, icon);
    return icon;
  };
})();
