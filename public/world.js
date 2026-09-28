// Agent World: a live, animated scene of a BANDIT agent at work. It is drawn on a canvas so it can go fullscreen
// for streaming and be recorded as a video clip. Every move comes from a real run trace (scan, rules, quote,
// SERV decision, trade, Telegram). Between runs the agent sleeps in its hammock and counts down to its next check.
const W = 1280, H = 720, SCALE = 1.5, GROUND = 598;
const FONT = { ui: '"Geist", "DM Sans", system-ui, sans-serif', mono: '"Geist Mono", "JetBrains Mono", ui-monospace, monospace', brand: '"Space Grotesk", "Geist", sans-serif' };
const C = { text: '#F1F2E8', text2: '#A7AB9A', text3: '#6E7263', lime: '#C8F25A', ink: '#12160A', lo: '#5B9DFF', hi: '#FF8A4C', amber: '#FFC857', tg: '#54A9EB', err: '#FF6B6B', cream: '#F4F1DE', live: '#FF5A5A' };
const STATIONS = {
  home: { x: 92, label: '' },
  board: { x: 262, label: 'Pendle markets' },
  rules: { x: 470, label: 'Your rules' },
  quote: { x: 652, label: 'Live quote' },
  serv: { x: 832, label: 'SERV Reasoning' },
  chain: { x: 1010, label: 'Robinhood Chain' },
  tg: { x: 1172, label: 'Telegram' },
};
const STAGE_AT = { scan: 'board', rule: 'rules', quote: 'quote', serv: 'serv', decision: 'serv', exec: 'chain', telegram: 'tg' };
const CHIP = { scan: ['SCAN', C.lime], rule: ['RULES', C.lo], quote: ['QUOTE', C.amber], serv: ['SERV', C.lime], decision: ['SERV', C.lime], exec: ['TRADE', C.lime], telegram: ['TELEGRAM', C.tg], done: ['DONE', C.text2], idle: ['ASLEEP', C.text3], wake: ['AWAKE', C.lime] };
const MIMES = ['video/mp4;codecs=avc1.42E01E', 'video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'];

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ease = t => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const hexA = (hex, a) => { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; };
const undash = s => String(s ?? '').replace(/\s*[—–]\s*/g, ', ');
const pad = n => String(n).padStart(2, '0');
function seeded(seed) { return () => { seed |= 0; seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function rr(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
function wrap(x, text, maxW, maxLines) {
  const words = String(text || '').split(/\s+/).filter(Boolean), lines = [];
  let line = '', i = 0;
  for (; i < words.length; i++) {
    const t = line ? `${line} ${words[i]}` : words[i];
    if (line && x.measureText(t).width > maxW) { lines.push(line); line = words[i]; if (lines.length === maxLines) break; } else line = t;
  }
  if (lines.length < maxLines) { if (line) lines.push(line); }
  else if (i < words.length) { let l = lines[maxLines - 1]; while (l.length > 1 && x.measureText(`${l}…`).width > maxW) l = l.slice(0, -1); lines[maxLines - 1] = `${l.replace(/[\s,.;:]+$/, '')}…`; }
  return lines;
}
export const recordingSupported = () => Boolean(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream && MIMES.some(t => MediaRecorder.isTypeSupported(t)));

export function createWorld(canvas, { markets = () => [], mascot = '/art/mascot.svg', logo = '/art/logo-mask.svg' } = {}) {
  canvas.width = W * SCALE; canvas.height = H * SCALE;
  const ctx = canvas.getContext('2d');
  const imgs = {};
  for (const [k, src] of [['mascot', mascot], ['logo', logo]]) { const i = new Image(); i.onload = () => { imgs[k] = i; }; i.src = src; }
  // Expressions: swap the eyes in the mascot SVG. Blob URLs keep the canvas clean for recording.
  const EYES = {
    closed: '<path d="M96 63.5Q105 72 114 63.5M46 63.5Q55 72 64 63.5" stroke="#F4F1DE" stroke-width="3.4" stroke-linecap="round"/>',
    happy: '<path d="M96.5 69Q105 58 113.5 69M46.5 69Q55 58 63.5 69" stroke="#F4F1DE" stroke-width="3.6" stroke-linecap="round"/>',
  };
  fetch(mascot).then(r => r.text()).then(svg => {
    for (const [k, eyes] of Object.entries(EYES)) {
      const i = new Image(); i.onload = () => { imgs[k] = i; };
      i.src = URL.createObjectURL(new Blob([svg.replace(/<!-- eyes -->[\s\S]*?<!-- nose -->/, `<!-- eyes -->${eyes}<!-- nose -->`)], { type: 'image/svg+xml' }));
    }
  }).catch(() => {});

  const rnd = seeded(11);
  const stars = Array.from({ length: 170 }, () => ({ x: rnd() * W, y: rnd() * 430, r: rnd() * 1.3 + 0.3, p: rnd() * 6.3, s: 0.5 + rnd() * 1.8 }));
  const bg = document.createElement('canvas');
  bg.width = canvas.width; bg.height = canvas.height;
  paintBackground(bg.getContext('2d'), rnd);

  const S = {
    t: 0, last: performance.now(), x: STATIONS.home.x, face: 1, mode: 'sleep', walk: null, jump: null,
    bubble: null, caption: null, active: null, flashI: 0, flashAt: 0, flashList: null, ruleHit: false,
    orb: 'idle', blocks: 3, drop: null, plane: null, ticket: null, coins: [], sparks: [], shoot: null,
    hud: { label: 'BANDIT agent', sub: '', nextAt: null, last: null, rules: [] }, title: null, rec: null,
    token: 0, playing: false, dead: false, tickerX: 0, expr: 'normal', exprUntil: 0, blinkAt: 2, blinkUntil: 0,
  };
  let raf = requestAnimationFrame(frame);

  function frame(now) {
    if (S.dead) return;
    const dt = Math.min(0.05, (now - S.last) / 1000);
    S.last = now; S.t += dt;
    update(dt);
    draw();
    if (S.rec && S.rec.format === 'tall') drawTall();
    raf = requestAnimationFrame(frame);
  }

  /* ---------- state updates ---------- */
  function update(dt) {
    if (S.walk) {
      const p = clamp((S.t - S.walk.t0) / S.walk.dur, 0, 1);
      S.x = S.walk.from + (S.walk.to - S.walk.from) * ease(p);
      if (p >= 1) { const done = S.walk.done; S.walk = null; S.mode = 'act'; done(); }
    }
    if (S.active === 'board' && S.t - S.flashAt > 0.2) { S.flashI++; S.flashAt = S.t; }
    for (const c of S.coins) { c.vy += 900 * dt; c.x += c.vx * dt; c.y += c.vy * dt; if (c.y > GROUND + 6) { c.y = GROUND + 6; c.vy *= -0.35; c.vx *= 0.7; } c.life -= dt; }
    S.coins = S.coins.filter(c => c.life > 0);
    for (const s of S.sparks) { s.x += s.vx * dt; s.y += s.vy * dt; s.vy += 120 * dt; s.life -= dt; }
    S.sparks = S.sparks.filter(s => s.life > 0);
    if (S.drop) { const p = (S.t - S.drop.t0) / 0.65; if (p >= 1) { S.blocks++; S.drop = null; coinBurst(STATIONS.chain.x, stackTop() - 10, 16); } }
    if (!S.shoot && Math.random() < dt / 9) S.shoot = { t0: S.t, x: 200 + Math.random() * 800, y: 40 + Math.random() * 120 };
    if (S.shoot && S.t - S.shoot.t0 > 1.1) S.shoot = null;
    S.tickerX += dt * 46;
    if (S.t > S.blinkAt) { S.blinkUntil = S.t + 0.14; S.blinkAt = S.t + 2.2 + Math.random() * 3.2; }
    if (S.exprUntil && S.t > S.exprUntil) { S.expr = 'normal'; S.exprUntil = 0; }
  }

  /* ---------- drawing ---------- */
  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(bg, 0, 0);
    ctx.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    drawStars();
    drawHome();
    drawBoard();
    drawRules();
    drawQuote();
    drawServ();
    drawChain();
    drawTelegram();
    drawRaccoon();
    drawParticles();
    drawBubble();
    drawHud();
    if (!(S.rec && S.rec.format === 'tall')) { drawCaption(); drawTicker(); }
    drawTitle(ctx, W, H, 1);
  }
  const txt = (s, x, y, size, font = FONT.ui, color = C.text, align = 'left', weight = 500, base = 'middle') => {
    ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = base; ctx.fillText(s, x, y);
  };
  const glow = (x, y, r, color, a) => { const g = ctx.createRadialGradient(x, y, 0, x, y, r); g.addColorStop(0, hexA(color, a)); g.addColorStop(1, hexA(color, 0)); ctx.fillStyle = g; ctx.fillRect(x - r, y - r, r * 2, r * 2); };
  const label = (key, color) => {
    const st = STATIONS[key], on = S.active === key;
    ctx.save(); ctx.scale(1, 0.28); ctx.beginPath(); ctx.arc(st.x, (GROUND + 6) / 0.28, 62, 0, Math.PI * 2); ctx.fillStyle = on ? hexA(color, 0.16) : 'rgba(234,238,218,0.04)'; ctx.fill(); ctx.restore();
    txt(st.label, st.x, GROUND + 30, 12.5, FONT.ui, on ? color : C.text3, 'center', on ? 700 : 600);
  };

  function paintBackground(b, r) {
    b.setTransform(SCALE, 0, 0, SCALE, 0, 0);
    const sky = b.createLinearGradient(0, 0, 0, GROUND);
    sky.addColorStop(0, '#05070A'); sky.addColorStop(0.55, '#0A1210'); sky.addColorStop(1, '#10190F');
    b.fillStyle = sky; b.fillRect(0, 0, W, H);
    const mg = b.createRadialGradient(1120, 118, 0, 1120, 118, 170); mg.addColorStop(0, 'rgba(244,241,222,0.16)'); mg.addColorStop(1, 'rgba(244,241,222,0)');
    b.fillStyle = mg; b.fillRect(900, 0, 380, 320);
    b.beginPath(); b.arc(1120, 118, 34, 0, Math.PI * 2); b.fillStyle = '#F4F1DE'; b.fill();
    b.beginPath(); b.arc(1134, 108, 30, 0, Math.PI * 2); b.fillStyle = '#0A1112'; b.fill();
    const aur = b.createLinearGradient(0, 150, 0, 440); aur.addColorStop(0, 'rgba(200,242,90,0)'); aur.addColorStop(0.55, 'rgba(200,242,90,0.05)'); aur.addColorStop(1, 'rgba(200,242,90,0)');
    b.fillStyle = aur; b.fillRect(0, 150, W, 290);
    for (let x = -10; x < W + 20;) {
      const w = 30 + r() * 64, h = 46 + r() * 150, top = GROUND - 40 - h;
      b.fillStyle = r() > 0.5 ? '#0C130E' : '#0E1611'; b.fillRect(x, top, w, h + 40);
      for (let wy = top + 10; wy < GROUND - 50; wy += 14) for (let wx = x + 6; wx < x + w - 8; wx += 12) {
        const q = r(); if (q > 0.86) { b.fillStyle = q > 0.95 ? 'rgba(255,200,87,0.35)' : 'rgba(200,242,90,0.22)'; b.fillRect(wx, wy, 5, 6); }
      }
      x += w + 3 + r() * 10;
    }
    const gr = b.createLinearGradient(0, GROUND - 40, 0, H); gr.addColorStop(0, '#0D140E'); gr.addColorStop(1, '#070907');
    b.fillStyle = gr; b.fillRect(0, GROUND - 40, W, H - GROUND + 40);
    b.strokeStyle = 'rgba(200,242,90,0.16)'; b.lineWidth = 2; b.setLineDash([2, 10]); b.beginPath(); b.moveTo(40, GROUND + 8); b.lineTo(W - 40, GROUND + 8); b.stroke(); b.setLineDash([]);
  }
  function drawStars() {
    for (const s of stars) { const a = 0.25 + 0.55 * (0.5 + 0.5 * Math.sin(S.t * s.s + s.p)); ctx.fillStyle = `rgba(244,241,222,${a})`; ctx.fillRect(s.x, s.y, s.r, s.r); }
    if (S.shoot) { const p = (S.t - S.shoot.t0) / 1.1, x = S.shoot.x + p * 260, y = S.shoot.y + p * 90; const g = ctx.createLinearGradient(x - 90, y - 30, x, y); g.addColorStop(0, 'rgba(244,241,222,0)'); g.addColorStop(1, `rgba(244,241,222,${0.8 * (1 - p)})`); ctx.strokeStyle = g; ctx.lineWidth = 1.6; ctx.beginPath(); ctx.moveTo(x - 90, y - 30); ctx.lineTo(x, y); ctx.stroke(); }
  }
  function drawHome() {
    const x = STATIONS.home.x;
    ctx.strokeStyle = '#2B3223'; ctx.lineWidth = 5; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x - 58, GROUND); ctx.lineTo(x - 58, GROUND - 92); ctx.moveTo(x + 58, GROUND); ctx.lineTo(x + 58, GROUND - 92); ctx.stroke();
    ctx.strokeStyle = 'rgba(244,241,222,0.28)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x - 58, GROUND - 86); ctx.quadraticCurveTo(x, GROUND - 20, x + 58, GROUND - 86); ctx.stroke();
    ctx.fillStyle = 'rgba(200,242,90,0.10)'; ctx.beginPath(); ctx.moveTo(x - 50, GROUND - 78); ctx.quadraticCurveTo(x, GROUND - 16, x + 50, GROUND - 78); ctx.quadraticCurveTo(x, GROUND - 34, x - 50, GROUND - 78); ctx.fill();
  }
  function drawBoard() {
    const st = STATIONS.board, on = S.active === 'board', w = 184, h = 124, top = GROUND - 182, left = st.x - w / 2;
    ctx.strokeStyle = '#2B3223'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(st.x - 60, top + h); ctx.lineTo(st.x - 60, GROUND); ctx.moveTo(st.x + 60, top + h); ctx.lineTo(st.x + 60, GROUND); ctx.stroke();
    if (on) glow(st.x, top + h / 2, 150, C.lime, 0.13);
    rr(ctx, left, top, w, h, 12); ctx.fillStyle = '#090C08'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = on ? hexA(C.lime, 0.75) : 'rgba(234,238,218,0.14)'; ctx.stroke();
    txt('PENDLE · LIVE', left + 12, top + 17, 9.5, FONT.mono, C.lime, 'left', 700);
    ctx.fillStyle = hexA(C.live, 0.5 + 0.5 * Math.sin(S.t * 5)); ctx.beginPath(); ctx.arc(left + w - 14, top + 17, 3.5, 0, 6.3); ctx.fill();
    const list = (S.flashList && S.flashList.length ? S.flashList : markets()).slice(0, 12);
    const rows = list.length ? list : [{ name: 'Loading…' }];
    const off = S.flashList && rows.length > 5 ? Math.floor(S.flashI / 5) % Math.ceil(rows.length / 5) * 5 : 0;
    rows.slice(off, off + 5).forEach((m, i) => {
      const y = top + 38 + i * 17.5, hot = on && S.flashI % 5 === i;
      if (hot) { rr(ctx, left + 6, y - 8, w - 12, 16, 5); ctx.fillStyle = hexA(C.lime, 0.14); ctx.fill(); }
      ctx.font = `600 10.5px ${FONT.mono}`;
      let n = m.name || ''; while (n.length > 3 && ctx.measureText(n).width > 78) n = n.slice(0, -1);
      txt(n === m.name ? n : `${n}…`, left + 12, y, 10.5, FONT.mono, hot ? C.text : C.text2, 'left', 600);
      const gx = left + 96, gw = 50;
      rr(ctx, gx, y - 2, gw, 4, 2); ctx.fillStyle = 'rgba(234,238,218,0.10)'; ctx.fill();
      if (m.p != null) { ctx.fillStyle = m.p <= 20 ? C.lo : m.p >= 80 ? C.hi : C.lime; ctx.beginPath(); ctx.arc(gx + gw * clamp(m.p / 100, 0.04, 0.96), y, 3.4, 0, 6.3); ctx.fill(); }
      if (m.g) txt(m.g, left + w - 13, y, 11, FONT.ui, m.g === 'A' ? C.lime : m.g === 'B' ? '#7CE3A1' : m.g === 'C' ? C.amber : m.g === 'D' ? C.hi : C.text3, 'right', 800);
    });
    label('board', C.lime);
  }
  function drawRules() {
    const st = STATIONS.rules, on = S.active === 'rules', w = 140, h = 96, top = GROUND - 146, left = st.x - w / 2;
    ctx.strokeStyle = '#2B3223'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(st.x, top + h); ctx.lineTo(st.x, GROUND); ctx.stroke();
    if (on) glow(st.x, top + h / 2, 130, S.ruleHit ? C.lime : C.lo, 0.13);
    rr(ctx, left, top, w, h, 10); ctx.fillStyle = '#15180F'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = on ? hexA(S.ruleHit ? C.lime : C.lo, 0.7) : 'rgba(234,238,218,0.14)'; ctx.stroke();
    txt('YOUR RULES', left + 10, top + 15, 9.5, FONT.mono, C.lo, 'left', 700);
    const rules = S.hud.rules.length ? S.hud.rules : ['No rules yet'];
    rules.slice(0, 3).forEach((r, i) => {
      const y = top + 31 + i * 21;
      rr(ctx, left + 8, y - 8, w - 16, 17, 4); ctx.fillStyle = i % 2 ? 'rgba(244,241,222,0.07)' : 'rgba(200,242,90,0.08)'; ctx.fill();
      ctx.font = `500 9.5px ${FONT.ui}`; let s = r; while (s.length > 4 && ctx.measureText(s).width > w - 30) s = s.slice(0, -1);
      txt(s === r ? s : `${s}…`, left + 14, y, 9.5, FONT.ui, C.text2, 'left', 500);
    });
    if (on) { const ok = S.ruleHit; ctx.fillStyle = ok ? C.lime : 'rgba(234,238,218,0.12)'; ctx.beginPath(); ctx.arc(left + w - 4, top + 4, 13, 0, 6.3); ctx.fill(); txt(ok ? '✓' : '…', left + w - 4, top + 5, 13, FONT.ui, ok ? C.ink : C.text, 'center', 800); }
    label('rules', S.ruleHit ? C.lime : C.lo);
  }
  function drawQuote() {
    const st = STATIONS.quote, on = S.active === 'quote', x = st.x, top = GROUND - 128;
    if (on) glow(x, top + 60, 120, C.amber, 0.12);
    rr(ctx, x - 50, top + 36, 100, GROUND - top - 36, 8); ctx.fillStyle = '#12150E'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = on ? hexA(C.amber, 0.6) : 'rgba(234,238,218,0.12)'; ctx.stroke();
    for (let i = 0; i < 6; i++) { ctx.fillStyle = i % 2 ? '#1B2014' : hexA(C.lime, 0.5); ctx.beginPath(); ctx.moveTo(x - 58 + i * 19.3, top + 36); ctx.lineTo(x - 58 + (i + 1) * 19.3, top + 36); ctx.lineTo(x - 50 + (i + 1) * 16.6, top + 16); ctx.lineTo(x - 50 + i * 16.6, top + 16); ctx.fill(); }
    rr(ctx, x - 30, top + 50, 60, 36, 6); ctx.fillStyle = '#0A0C08'; ctx.fill();
    txt('$', x, top + 69, 22, FONT.ui, on ? C.amber : hexA(C.amber, 0.55), 'center', 800);
    if (S.ticket && on) {
      const p = clamp((S.t - S.ticket.t0) / 0.5, 0, 1), y = top - 16 - 16 * ease(p);
      ctx.globalAlpha = p; rr(ctx, x - 78, y - 16, 156, 30, 8); ctx.fillStyle = '#1E2215'; ctx.fill(); ctx.strokeStyle = hexA(C.amber, 0.6); ctx.stroke();
      ctx.font = `600 11px ${FONT.mono}`; let s = S.ticket.text; while (s.length > 4 && ctx.measureText(s).width > 142) s = s.slice(0, -1);
      txt(s, x, y, 11, FONT.mono, C.amber, 'center', 600); ctx.globalAlpha = 1;
    }
    label('quote', C.amber);
  }
  function drawServ() {
    const st = STATIONS.serv, on = S.active === 'serv', x = st.x, top = GROUND - 150, oy = top - 28;
    ctx.beginPath(); ctx.moveTo(x - 36, GROUND); ctx.lineTo(x - 18, top); ctx.lineTo(x + 18, top); ctx.lineTo(x + 36, GROUND); ctx.closePath();
    const tg = ctx.createLinearGradient(0, top, 0, GROUND); tg.addColorStop(0, '#1A2013'); tg.addColorStop(1, '#0E120B'); ctx.fillStyle = tg; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = on ? hexA(C.lime, 0.5) : 'rgba(234,238,218,0.12)'; ctx.stroke();
    for (const f of [0.3, 0.6]) { const y = top + (GROUND - top) * f, half = 18 + 18 * f; ctx.fillStyle = hexA(C.lime, on ? 0.35 : 0.12); ctx.fillRect(x - half, y, half * 2, 3); }
    const col = S.orb === 'no' ? C.hi : C.lime, pulse = S.orb === 'thinking' ? 0.5 + 0.5 * Math.sin(S.t * 7) : 0.6;
    glow(x, oy, S.orb === 'idle' ? 46 : 80 + 16 * pulse, col, S.orb === 'idle' ? 0.12 : 0.28);
    const og = ctx.createRadialGradient(x - 7, oy - 8, 2, x, oy, 24); og.addColorStop(0, '#FFFFFF'); og.addColorStop(0.35, col); og.addColorStop(1, hexA(col, 0.25));
    ctx.fillStyle = og; ctx.beginPath(); ctx.arc(x, oy, 22, 0, 6.3); ctx.fill();
    if (S.orb === 'thinking') { ctx.strokeStyle = hexA(C.lime, 0.8); ctx.lineWidth = 2; for (let i = 0; i < 3; i++) { const a = S.t * (2 + i) + i * 2.1; ctx.beginPath(); ctx.arc(x, oy, 32 + i * 7, a, a + 1.1); ctx.stroke(); } }
    if (S.orb === 'ok') txt('✓', x, oy + 1, 20, FONT.ui, C.ink, 'center', 900);
    if (S.orb === 'no') txt('II', x, oy + 1, 15, FONT.ui, '#2A1408', 'center', 900);
    txt('S', x, GROUND - 40, 16, FONT.brand, on ? C.lime : hexA(C.lime, 0.45), 'center', 700);
    label('serv', S.orb === 'no' ? C.hi : C.lime);
  }
  const stackTop = () => GROUND - 40 - S.blocks * 30;
  function cube(cx, cy, s, a = 1) {
    const hs = s / 2, q = s * 0.28;
    ctx.globalAlpha = a;
    ctx.fillStyle = '#3A5424'; ctx.beginPath(); ctx.moveTo(cx - hs, cy - q); ctx.lineTo(cx, cy - 2 * q); ctx.lineTo(cx + hs, cy - q); ctx.lineTo(cx, cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#24361A'; ctx.beginPath(); ctx.moveTo(cx - hs, cy - q); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + s * 0.6); ctx.lineTo(cx - hs, cy + s * 0.6 - q); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#182612'; ctx.beginPath(); ctx.moveTo(cx + hs, cy - q); ctx.lineTo(cx, cy); ctx.lineTo(cx, cy + s * 0.6); ctx.lineTo(cx + hs, cy + s * 0.6 - q); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = hexA(C.lime, 0.55); ctx.lineWidth = 1.2; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(cx - hs, cy - q); ctx.lineTo(cx, cy - 2 * q); ctx.lineTo(cx + hs, cy - q); ctx.lineTo(cx, cy); ctx.closePath(); ctx.moveTo(cx - hs, cy - q); ctx.lineTo(cx - hs, cy + s * 0.6 - q); ctx.lineTo(cx, cy + s * 0.6); ctx.lineTo(cx + hs, cy + s * 0.6 - q); ctx.lineTo(cx + hs, cy - q); ctx.moveTo(cx, cy); ctx.lineTo(cx, cy + s * 0.6); ctx.stroke();
    ctx.globalAlpha = 1;
  }
  function drawChain() {
    const st = STATIONS.chain, on = S.active === 'chain', x = st.x;
    if (on) glow(x, GROUND - 80, 130, C.lime, 0.14);
    const shown = Math.min(S.blocks, 6);
    for (let i = 0; i < shown; i++) cube(x, GROUND - 31 - i * 30, 50);
    if (S.drop) { const p = clamp((S.t - S.drop.t0) / 0.65, 0, 1), target = GROUND - 31 - Math.min(S.blocks, 6) * 30; const y = -60 + (target + 60) * (p < 0.8 ? ease(p / 0.8) : 1 - Math.sin((p - 0.8) / 0.2 * Math.PI) * 0.02); cube(x, y, 50, 1); }
    txt('RH', x, GROUND - 31 - (shown - 1) * 30 - 14, 10, FONT.mono, hexA(C.lime, on ? 1 : 0.5), 'center', 700);
    label('chain', C.lime);
  }
  function drawTelegram() {
    const st = STATIONS.tg, on = S.active === 'tg', x = st.x;
    if (on) glow(x, GROUND - 90, 110, C.tg, 0.16);
    ctx.strokeStyle = '#2B3223'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x, GROUND); ctx.lineTo(x, GROUND - 70); ctx.stroke();
    rr(ctx, x - 30, GROUND - 118, 60, 48, 12); ctx.fillStyle = on ? '#1C4466' : '#152D43'; ctx.fill(); ctx.strokeStyle = hexA(C.tg, on ? 0.9 : 0.4); ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#0A1623'; ctx.fillRect(x - 16, GROUND - 100, 32, 5);
    ctx.fillStyle = C.hi; ctx.fillRect(x + 30, GROUND - 116, 3, 22); ctx.fillRect(x + 30, GROUND - 116, 12, 8);
    if (S.plane) {
      const p = clamp((S.t - S.plane.t0) / 1.7, 0, 1), sx = x, sy = GROUND - 124, cx = x + 40, cy = GROUND - 330, ex = W + 60, ey = 90;
      const px = (1 - p) ** 2 * sx + 2 * (1 - p) * p * cx + p * p * ex, py = (1 - p) ** 2 * sy + 2 * (1 - p) * p * cy + p * p * ey;
      const dx = 2 * (1 - p) * (cx - sx) + 2 * p * (ex - cx), dy = 2 * (1 - p) * (cy - sy) + 2 * p * (ey - cy);
      ctx.save(); ctx.translate(px, py); ctx.rotate(Math.atan2(dy, dx)); ctx.fillStyle = '#E9F4FF';
      ctx.beginPath(); ctx.moveTo(16, 0); ctx.lineTo(-12, -9); ctx.lineTo(-6, 0); ctx.lineTo(-12, 9); ctx.closePath(); ctx.fill(); ctx.restore();
      if (p >= 1) S.plane = null;
    }
    label('tg', C.tg);
  }
  function drawRaccoon() {
    const img = imgs.mascot;
    if (!img) return;
    if (S.mode === 'sleep') {
      const x = STATIONS.home.x, breath = Math.sin(S.t * 1.8) * 1.2;
      ctx.save(); ctx.translate(x - 2, GROUND - 66 + breath); ctx.rotate(-1.42); ctx.drawImage(imgs.closed || img, -36, -40, 72, 72); ctx.restore();
      for (let i = 0; i < 3; i++) { const ph = (S.t * 0.42 + i / 3) % 1; txt('z', x + 26 + ph * 30 + i * 3, GROUND - 104 - ph * 54, 11 + i * 5, FONT.brand, hexA(C.cream, (1 - ph) * 0.85), 'left', 700); }
      return;
    }
    const walking = S.mode === 'walk';
    const bob = walking ? -Math.abs(Math.sin(S.t * 11)) * 7 : Math.sin(S.t * 3) * 1.2;
    const jy = S.jump ? -Math.sin(clamp((S.t - S.jump.t0) / S.jump.dur, 0, 1) * Math.PI) * 46 : 0;
    ctx.save(); ctx.translate(S.x, GROUND + 6); ctx.scale(1, 0.22); ctx.beginPath(); ctx.arc(0, 0, 30 - Math.min(12, -jy / 4), 0, 6.3); ctx.fillStyle = 'rgba(0,0,0,0.45)'; ctx.fill(); ctx.restore();
    const blinking = S.t < S.blinkUntil && S.expr !== 'happy';
    const sprite = (blinking && imgs.closed) || (S.expr === 'happy' && imgs.happy) || img;
    const sq = walking ? Math.sin(S.t * 22) * 0.035 : S.expr === 'happy' ? Math.abs(Math.sin(S.t * 9)) * 0.05 : 0;
    ctx.save(); ctx.translate(S.x, GROUND + 6 + bob + jy); ctx.scale(S.face * (1 + sq), 1 - sq); if (walking) ctx.rotate(Math.sin(S.t * 11) * 0.05);
    ctx.drawImage(sprite, -48, -96, 96, 96); ctx.restore();
    const hx = S.x + S.face * 34, hy = GROUND - 84 + bob + jy;
    if (S.orb === 'thinking' && S.active === 'serv') for (let i = 0; i < 3; i++) { const a = 0.35 + 0.65 * Math.max(0, Math.sin(S.t * 6 - i * 0.9)); ctx.fillStyle = hexA(C.cream, a); ctx.beginPath(); ctx.arc(hx + S.face * (i * 9), hy - 12 - i * 8, 2.6 + i * 1.3, 0, 6.3); ctx.fill(); }
    if (S.expr === 'worried') { const dy = (S.t * 18) % 14; ctx.fillStyle = hexA('#8FD3FF', 0.9 - dy / 20); ctx.beginPath(); ctx.moveTo(hx, hy - 6 + dy); ctx.quadraticCurveTo(hx + 5, hy + 3 + dy, hx, hy + 6 + dy); ctx.quadraticCurveTo(hx - 5, hy + 3 + dy, hx, hy - 6 + dy); ctx.fill(); }
  }
  function coinBurst(x, y, n) { for (let i = 0; i < n; i++) S.coins.push({ x, y, vx: (Math.random() - 0.5) * 320, vy: -220 - Math.random() * 260, life: 1.6 + Math.random() * 0.6, r: 4 + Math.random() * 3 }); }
  function sparkBurst(x, y, color) { for (let i = 0; i < 26; i++) { const a = Math.random() * 6.3, v = 60 + Math.random() * 160; S.sparks.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.9 + Math.random() * 0.5, color }); } }
  function drawParticles() {
    for (const c of S.coins) { ctx.globalAlpha = clamp(c.life, 0, 1); ctx.fillStyle = C.amber; ctx.beginPath(); ctx.arc(c.x, c.y, c.r, 0, 6.3); ctx.fill(); ctx.fillStyle = '#FFF1C2'; ctx.beginPath(); ctx.arc(c.x - c.r * 0.3, c.y - c.r * 0.3, c.r * 0.35, 0, 6.3); ctx.fill(); }
    for (const s of S.sparks) { ctx.globalAlpha = clamp(s.life, 0, 1); ctx.fillStyle = s.color; ctx.fillRect(s.x, s.y, 2.5, 2.5); }
    ctx.globalAlpha = 1;
  }
  function drawBubble() {
    const b = S.bubble; if (!b || S.mode === 'sleep') return;
    const a = clamp((S.t - b.t0) / 0.22, 0, 1);
    ctx.font = `600 16px ${FONT.ui}`;
    const lines = wrap(ctx, b.text, 360, 3);
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + 30, h = lines.length * 22 + 22;
    const bx = clamp(S.x - w / 2, 16, W - 16 - w), by = GROUND - 212 - h + (1 - a) * 8;
    const tone = b.tone === 'ok' ? C.lime : b.tone === 'no' ? C.hi : 'rgba(234,238,218,0.4)';
    ctx.globalAlpha = a;
    ctx.strokeStyle = b.tone ? hexA(b.tone === 'ok' ? C.lime : C.hi, 0.5) : 'rgba(234,238,218,0.25)'; ctx.lineWidth = 1.5; ctx.setLineDash([3, 4]);
    ctx.beginPath(); ctx.moveTo(clamp(S.x, bx + 16, bx + w - 16), by + h); ctx.lineTo(S.x, GROUND - 100); ctx.stroke(); ctx.setLineDash([]);
    ctx.fillStyle = b.tone === 'ok' ? '#141B0C' : b.tone === 'no' ? '#1D140C' : '#12150F'; rr(ctx, bx, by, w, h, 14); ctx.fill();
    ctx.strokeStyle = b.tone ? hexA(b.tone === 'ok' ? C.lime : C.hi, 0.7) : 'rgba(234,238,218,0.18)'; ctx.lineWidth = 1.5; ctx.stroke();
    lines.forEach((l, i) => txt(l, bx + 15, by + 22 + i * 22, 16, FONT.ui, C.text, 'left', 600));
    ctx.fillStyle = tone; ctx.beginPath(); ctx.arc(S.x, GROUND - 100, 3, 0, 6.3); ctx.fill();
    ctx.globalAlpha = 1;
  }
  function nextIn() {
    if (!S.hud.nextAt) return '';
    const s = Math.max(0, Math.round((S.hud.nextAt - Date.now()) / 1000));
    return s <= 0 ? 'checking now' : `${Math.floor(s / 60)}:${pad(s % 60)}`;
  }
  function drawHud() {
    const g = ctx.createLinearGradient(0, 0, 0, 84); g.addColorStop(0, 'rgba(5,7,6,0.9)'); g.addColorStop(1, 'rgba(5,7,6,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, 84);
    if (imgs.logo) { ctx.save(); rr(ctx, 24, 18, 32, 32, 9); ctx.clip(); ctx.drawImage(imgs.logo, 24, 18, 32, 32); ctx.restore(); }
    ctx.font = `700 20px ${FONT.brand}`; if ('letterSpacing' in ctx) ctx.letterSpacing = '4px';
    txt('BANDIT', 66, 35, 20, FONT.brand, C.text, 'left', 700);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';
    rr(ctx, 172, 22, 64, 26, 13); ctx.fillStyle = hexA(C.live, 0.16); ctx.fill();
    ctx.fillStyle = hexA(C.live, 0.6 + 0.4 * Math.sin(S.t * 4)); ctx.beginPath(); ctx.arc(186, 35, 4, 0, 6.3); ctx.fill();
    txt('LIVE', 196, 35.5, 11.5, FONT.ui, C.live, 'left', 800);
    txt(S.hud.label, 250, 30, 15, FONT.ui, C.text, 'left', 600);
    if (S.hud.sub) txt(S.hud.sub, 250, 48, 12, FONT.ui, C.text3, 'left', 500);
    const d = new Date();
    txt(`${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} UTC`, W - 24, 30, 15, FONT.mono, C.text, 'right', 600);
    txt(S.playing ? 'Working now' : S.hud.nextAt ? `Next check in ${nextIn()}` : 'Checks on a schedule', W - 24, 49, 12, FONT.ui, S.playing ? C.lime : C.text3, 'right', 600);
  }
  function captionData() {
    if (S.caption) return S.caption;
    const last = S.hud.last;
    return { stage: 'idle', text: `Asleep.${S.hud.nextAt ? ` Next check in ${nextIn()}.` : ''}${last ? ` Last check ${last}` : ''}`, tone: '' };
  }
  function drawCaption() {
    const c = captionData(), [chip, color] = CHIP[c.stage] || CHIP.idle;
    ctx.font = `800 11px ${FONT.ui}`; const cw = ctx.measureText(chip).width + 22;
    ctx.font = `600 17px ${FONT.ui}`; const line = wrap(ctx, undash(c.text), 1060 - cw, 1)[0] || '';
    const w = Math.min(W - 48, cw + ctx.measureText(line).width + 40);
    rr(ctx, 24, 636, w, 38, 12); ctx.fillStyle = 'rgba(8,10,7,0.82)'; ctx.fill(); ctx.strokeStyle = 'rgba(234,238,218,0.10)'; ctx.lineWidth = 1; ctx.stroke();
    rr(ctx, 32, 644, cw, 22, 7); ctx.fillStyle = hexA(c.tone === 'no' ? C.hi : color, 0.16); ctx.fill();
    txt(chip, 32 + cw / 2, 655.5, 11, FONT.ui, c.tone === 'no' ? C.hi : color, 'center', 800);
    txt(line, 42 + cw, 655.5, 17, FONT.ui, C.text, 'left', 600);
  }
  function drawTicker() {
    const y = 684, h = 36;
    ctx.fillStyle = '#060806'; ctx.fillRect(0, y, W, h); ctx.fillStyle = 'rgba(234,238,218,0.08)'; ctx.fillRect(0, y, W, 1);
    const items = markets().slice(0, 18);
    if (items.length) {
      ctx.font = `600 13px ${FONT.mono}`;
      const parts = items.map(m => ({ m, w: ctx.measureText(`${m.name}  ${m.g || ''}  ${m.room || ''}`).width + 46 }));
      const total = parts.reduce((s, p) => s + p.w, 0);
      let x = -(S.tickerX % total);
      while (x < W) for (const { m, w } of parts) {
        if (x > W) break;
        if (x + w > 0) {
          txt(m.name, x, y + h / 2, 13, FONT.mono, C.text2, 'left', 600);
          const nw = ctx.measureText(`${m.name}  `).width;
          if (m.g) txt(m.g, x + nw, y + h / 2, 13, FONT.ui, m.g === 'A' ? C.lime : m.g === 'B' ? '#7CE3A1' : m.g === 'C' ? C.amber : m.g === 'D' ? C.hi : C.text3, 'left', 800);
          ctx.font = `600 13px ${FONT.mono}`;
          const gw = ctx.measureText(`${m.g || ''}  `).width;
          if (m.room) txt(m.room, x + nw + gw, y + h / 2, 13, FONT.mono, m.room.startsWith('+') ? C.lime : C.text3, 'left', 600);
          txt('·', x + w - 23, y + h / 2, 13, FONT.mono, C.text3, 'center', 600);
          ctx.font = `600 13px ${FONT.mono}`;
        }
        x += w;
      }
    }
    ctx.font = `700 13px ${FONT.mono}`; const ww = ctx.measureText('bandit.web3wikis.com').width + 36;
    const fade = ctx.createLinearGradient(W - ww - 40, 0, W - ww, 0); fade.addColorStop(0, 'rgba(6,8,6,0)'); fade.addColorStop(1, '#060806');
    ctx.fillStyle = fade; ctx.fillRect(W - ww - 40, y + 1, 40, h - 1); ctx.fillStyle = '#060806'; ctx.fillRect(W - ww, y + 1, ww, h - 1);
    txt('bandit.web3wikis.com', W - 18, y + h / 2, 13, FONT.mono, C.lime, 'right', 700);
  }
  // Title and end cards for recorded clips.
  function drawTitle(x, w, h, k) {
    const t = S.title; if (!t) return;
    const age = S.t - t.t0, a = clamp(Math.min(age / 0.35, (t.dur - age) / 0.35), 0, 1);
    if (a <= 0) return;
    x.save(); x.globalAlpha = a;
    x.fillStyle = 'rgba(5,7,6,0.88)'; x.fillRect(0, 0, w, h);
    const cy = h / 2;
    if (imgs.mascot) x.drawImage(imgs.mascot, w / 2 - 60 * k, cy - 190 * k, 120 * k, 120 * k);
    x.textAlign = 'center'; x.textBaseline = 'middle';
    x.font = `700 ${46 * k}px ${FONT.brand}`; x.fillStyle = C.lime; if ('letterSpacing' in x) x.letterSpacing = `${8 * k}px`; x.fillText('BANDIT', w / 2, cy - 40 * k); if ('letterSpacing' in x) x.letterSpacing = '0px';
    x.font = `600 ${34 * k}px ${FONT.ui}`; x.fillStyle = C.text; x.fillText(t.text, w / 2, cy + 16 * k);
    if (t.sub) { x.font = `500 ${19 * k}px ${FONT.ui}`; x.fillStyle = C.text2; x.fillText(t.sub, w / 2, cy + 60 * k); }
    x.restore();
  }
  // Vertical 9:16 layout for TikTok, Reels and Shorts: the world in the middle, big captions around it.
  function drawTall() {
    const c = S.rec.canvas, x = c.getContext('2d'), TW = c.width, TH = c.height;
    x.setTransform(1, 0, 0, 1, 0, 0);
    x.fillStyle = '#07090A'; x.fillRect(0, 0, TW, TH);
    const g1 = x.createRadialGradient(TW * 0.8, 120, 0, TW * 0.8, 120, 900); g1.addColorStop(0, 'rgba(200,242,90,0.12)'); g1.addColorStop(1, 'rgba(200,242,90,0)'); x.fillStyle = g1; x.fillRect(0, 0, TW, TH);
    if (imgs.logo) { x.save(); rr(x, 84, 150, 84, 84, 22); x.clip(); x.drawImage(imgs.logo, 84, 150, 84, 84); x.restore(); }
    x.textBaseline = 'middle'; x.textAlign = 'left';
    x.font = `700 58px ${FONT.brand}`; x.fillStyle = C.text; if ('letterSpacing' in x) x.letterSpacing = '8px'; x.fillText('BANDIT', 196, 194); if ('letterSpacing' in x) x.letterSpacing = '0px';
    rr(x, TW - 214, 166, 130, 56, 28); x.fillStyle = hexA(C.live, 0.16); x.fill();
    x.fillStyle = hexA(C.live, 0.6 + 0.4 * Math.sin(S.t * 4)); x.beginPath(); x.arc(TW - 184, 194, 9, 0, 6.3); x.fill();
    x.font = `800 26px ${FONT.ui}`; x.fillStyle = C.live; x.fillText('LIVE', TW - 164, 195);
    x.font = `600 50px ${FONT.ui}`; x.fillStyle = C.text; x.fillText('My YT agent, at work', 84, 330);
    x.font = `500 30px ${FONT.ui}`; x.fillStyle = C.text2; x.fillText(S.hud.label, 84, 390);
    x.drawImage(canvas, 0, 0, canvas.width, canvas.height, 0, 470, TW, TW * 9 / 16);
    const cap = captionData(), [chip, color] = CHIP[cap.stage] || CHIP.idle, top = 470 + TW * 9 / 16 + 90;
    x.font = `800 28px ${FONT.ui}`; const cw = x.measureText(chip).width + 44;
    rr(x, 84, top, cw, 56, 16); x.fillStyle = hexA(cap.tone === 'no' ? C.hi : color, 0.18); x.fill();
    x.fillStyle = cap.tone === 'no' ? C.hi : color; x.textAlign = 'center'; x.fillText(chip, 84 + cw / 2, top + 29); x.textAlign = 'left';
    x.font = `600 50px ${FONT.ui}`; x.fillStyle = C.text;
    wrap(x, undash(cap.text), TW - 168, 5).forEach((l, i) => x.fillText(l, 84, top + 130 + i * 66));
    x.font = `700 34px ${FONT.mono}`; x.fillStyle = C.lime; x.fillText('bandit.web3wikis.com', 84, TH - 170);
    x.font = `500 26px ${FONT.ui}`; x.fillStyle = C.text3; x.fillText('Built on SERV Reasoning · Data and reasoning only. Not financial advice.', 84, TH - 118);
    drawTitle(x, TW, TH, 1.9);
  }

  /* ---------- choreography ---------- */
  const say = (text, tone = '') => { S.bubble = { text: undash(text), tone, t0: S.t }; };
  const cap = (stage, text, tone = '') => { S.caption = { stage, text: undash(text), tone }; };
  const feel = (expr, secs = 2.6) => { S.expr = expr; S.exprUntil = S.t + secs; };
  function walkTo(key) {
    const tx = key === 'home' ? STATIONS.home.x : STATIONS[key].x - 66;
    if (Math.abs(tx - S.x) < 3) { S.mode = 'act'; return Promise.resolve(); }
    S.face = tx > S.x ? 1 : -1; S.mode = 'walk';
    return new Promise(done => { S.walk = { from: S.x, to: tx, t0: S.t, dur: Math.max(0.4, Math.abs(tx - S.x) / 430), done }; });
  }
  async function wakeUp() {
    if (S.mode !== 'sleep') return;
    S.mode = 'act'; S.x = STATIONS.home.x + 14; S.face = 1; S.jump = { t0: S.t, dur: 0.5 };
    cap('wake', 'Waking up.'); say('Waking up!');
    await sleep(560); S.jump = null;
  }
  async function goHome(token) {
    S.active = null; S.orb = 'idle';
    await walkTo('home');
    if (token !== S.token) return;
    S.mode = 'sleep'; S.bubble = null; S.caption = null; S.flashList = null; S.ticket = null; S.ruleHit = false; S.expr = 'normal';
  }
  const dwellFor = s => clamp(1000 + String(s || '').length * 30, 1900, 4800);
  async function act(step) {
    const text = undash(step.text || '');
    switch (step.stage) {
      case 'scan':
        S.active = 'board'; { const own = (step.markets || []).map(m => ({ name: m.name, p: m.percentile, g: '' })); const seen = new Set(own.map(m => m.name)); S.flashList = [...own, ...markets().filter(m => !seen.has(m.name))].slice(0, 15); }
        say('Scanning the Pendle markets…'); cap('scan', text);
        await sleep(clamp(900 + (S.flashList.length || 5) * 200, 2200, 3600)); break;
      case 'rule':
        S.active = 'rules'; S.ruleHit = Boolean(step.hit); if (step.hit) feel('happy', 1.6);
        say(text, step.hit ? 'ok' : ''); cap('rule', text, step.hit ? 'ok' : ''); await sleep(dwellFor(text)); break;
      case 'quote':
        S.active = 'quote'; S.ticket = { text: (text.match(/[\d.,]+\s*ETH[^.]*/) || [text])[0], t0: S.t };
        say(text); cap('quote', text); await sleep(dwellFor(text)); break;
      case 'serv':
        S.active = 'serv'; S.orb = 'thinking'; say('Let me ask SERV Reasoning…'); cap('serv', text); await sleep(2000); break;
      case 'decision': {
        const ok = step.ok !== false;
        S.active = 'serv'; S.orb = ok ? 'ok' : 'no';
        sparkBurst(STATIONS.serv.x, GROUND - 178, ok ? C.lime : C.hi); feel(ok ? 'happy' : 'worried', 3.2);
        say(`${ok ? 'SERV says go.' : 'SERV says hold off.'} ${undash(step.reason || '')}`, ok ? 'ok' : 'no');
        cap('decision', text, ok ? 'ok' : 'no');
        await sleep(clamp(dwellFor(step.reason) + 500, 2600, 5400)); break;
      }
      case 'exec': {
        const ok = step.ok !== false;
        S.active = 'chain'; if (ok) { S.drop = { t0: S.t }; feel('happy', 2.6); } else feel('worried', 2.6);
        say(text, ok ? 'ok' : 'no'); cap('exec', text, ok ? 'ok' : 'no'); await sleep(dwellFor(text)); break;
      }
      case 'telegram':
        S.active = 'tg'; S.plane = { t0: S.t }; say(text, 'ok'); cap('telegram', text); await sleep(2000); break;
      case 'done':
        S.active = null; say(`${text} zZz`); cap('done', text); await sleep(1600); break;
      default:
        say(text); await sleep(1400);
    }
  }
  async function play(run, { onStep } = {}) {
    const token = ++S.token;
    S.playing = true;
    try {
      await wakeUp();
      for (const step of (run && run.steps) || []) {
        if (token !== S.token) return;
        const key = STAGE_AT[step.stage];
        if (key) await walkTo(key);
        if (token !== S.token) return;
        if (onStep) onStep(step);
        await act(step);
      }
      if (token === S.token) await goHome(token);
    } finally {
      if (token === S.token) S.playing = false;
    }
  }
  // While a run is on its way from the server: wake up, walk to the board and start scanning.
  async function wake() {
    const token = ++S.token;
    S.playing = true;
    await wakeUp();
    if (token !== S.token) return;
    await walkTo('board');
    if (token !== S.token) return;
    S.active = 'board'; S.flashList = null;
    say('Waking up. Scanning the Pendle markets…'); cap('scan', 'Waking up and scanning the Pendle markets');
  }
  function stop() { S.token++; S.playing = false; S.walk = null; S.mode = 'sleep'; S.x = STATIONS.home.x; S.active = null; S.orb = 'idle'; S.bubble = null; S.caption = null; }

  async function record({ run, format = 'wide', title = 'My YT agent at work', onPhase } = {}) {
    const mime = MIMES.find(t => MediaRecorder.isTypeSupported(t));
    let target = canvas;
    if (format === 'tall') { target = document.createElement('canvas'); target.width = 1080; target.height = 1920; }
    S.rec = { format, canvas: target };
    if (format === 'tall') drawTall();
    const stream = target.captureStream(30);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: format === 'tall' ? 9_000_000 : 8_000_000 });
    const chunks = [];
    rec.ondataavailable = e => { if (e.data && e.data.size) chunks.push(e.data); };
    const stopped = new Promise(r => { rec.onstop = r; });
    stop();
    rec.start(400);
    try {
      if (onPhase) onPhase('intro');
      S.title = { text: title, sub: 'Live on Robinhood Chain · built on SERV Reasoning', t0: S.t, dur: 2.2 };
      await sleep(2300);
      S.title = null;
      if (onPhase) onPhase('run');
      await play(run);
      await sleep(900);
      if (onPhase) onPhase('outro');
      S.title = { text: 'Your YT agent, while you sleep', sub: 'bandit.web3wikis.com', t0: S.t, dur: 2.2 };
      await sleep(2300);
    } finally {
      S.title = null;
      rec.stop();
      await stopped;
      stream.getTracks().forEach(t => t.stop());
      S.rec = null;
    }
    const type = (mime || 'video/webm').split(';')[0];
    return new Blob(chunks, { type });
  }

  return {
    play, wake, stop, record,
    setHud(h) { Object.assign(S.hud, h); },
    isPlaying: () => S.playing,
    isRecording: () => Boolean(S.rec),
    destroy() { S.dead = true; S.token++; if (S.walk) { const done = S.walk.done; S.walk = null; done(); } cancelAnimationFrame(raf); },
  };
}
