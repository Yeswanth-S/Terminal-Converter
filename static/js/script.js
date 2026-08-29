// Raw string injection SVGs for terminal history items
const ICONS = {
  check: `<span class="theme-icon" style="vertical-align:-0.15em; margin-right:2px;"><svg class="ic-frost" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 3v5.5a.5.5 0 0 0 .5.5H19m-9.298 6.132l1.414 1.414l3.182-3.182M13.586 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.414a1 1 0 0 0-.293-.707l-4.414-4.414A1 1 0 0 0 13.586 3"/></svg><svg class="ic-tty" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M4 2h9.56L20 8.44V22H4zm13.44 6L14 4.56V8zM5.5 3.5v17h13v-11h-4.75c-.69 0-1.25-.56-1.25-1.25V3.5zm3.78 10.72l1.47 1.47l3.97-3.97l1.06 1.06l-4.145 4.145a1.25 1.25 0 0 1-.885.365c-.32 0-.64-.12-.885-.365L8.22 15.28z" clip-rule="evenodd"/></svg></span>`,
  down: `<span class="theme-icon" style="vertical-align:-0.15em; margin-right:2px;"><svg class="ic-frost" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 3v5.5a.5.5 0 0 0 .5.5H19 M12 11v6m-2.5-2.5L12 17l2.5-2.5 M13.586 3H6a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8.414a1 1 0 0 0-.293-.707l-4.414-4.414A1 1 0 0 0 13.586 3"/></svg><svg class="ic-tty" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path fill="currentColor" fill-rule="evenodd" d="M4 2h9.56L20 8.44V22H4zm13.44 6L14 4.56V8zM5.5 3.5v17h13v-11h-4.75c-.69 0-1.25-.56-1.25-1.25V3.5zm7.25 7.5v4.685l1.97-1.97l1.06 1.06l-2.895 2.895a1.25 1.25 0 0 1-.885.365c-.32 0-.64-.12-.885-.365L8.22 14.775l1.06-1.06l1.97 1.97V11z" clip-rule="evenodd"/></svg></span>`
};

const screen = document.getElementById('screen');
const statusModule = document.querySelector('.module[data-state]');

function setStatus(state) {
  statusModule.setAttribute('data-state', state);
}

// ---------- File input: picker + drag & drop ----------
// The terminal acts as the single drop target.
const fileInput = document.getElementById('fileInput');
fileInput.addEventListener('change', (e) => {
  handleFilesSelected(e.target.files);
  e.target.value = '';
});

const termEl = document.querySelector('.term');
['dragenter', 'dragover'].forEach(evt => termEl.addEventListener(evt, (e) => e.preventDefault()));
termEl.addEventListener('drop', (e) => {
  e.preventDefault();
  if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length) {
    if (settingsScreenElRef().style.display !== 'none' || historyScreenElRef().style.display !== 'none') switchWorkspace('convert');
    handleFilesSelected(e.dataTransfer.files);
  }
});

// Lazy lookups for workspace elements to bypass declaration order.
function settingsScreenElRef() { return document.getElementById('settingsScreen'); }
function historyScreenElRef() { return document.getElementById('historyScreen'); }

// Global modal close handlers.
const wallModalOverlayEl = document.getElementById('wallModalOverlay');
document.getElementById('wallModalCloseBtn').addEventListener('click', () => wallModalOverlayEl.setAttribute('hidden', ''));
wallModalOverlayEl.addEventListener('click', (e) => { if (e.target === wallModalOverlayEl) wallModalOverlayEl.setAttribute('hidden', ''); });

function el(html) { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstElementChild; }
function scrollDown() { screen.scrollTop = screen.scrollHeight; }
function look() { return document.body.getAttribute('data-look'); }

const FAVICON_MARK = {
  frost: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2.6 0 100 100"><g fill="none" stroke="${c}" stroke-width="8.5" stroke-linecap="round" stroke-linejoin="round"><path d="M 9 32 H 39 M 24 32 V 68"/><path d="M 82 63 A 18 18 0 1 1 82 37"/><polygon points="76,43 90,45 86,31" fill="${c}" stroke="none"/></g></svg>`,
  tty: (c) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2.6 0 100 100"><g fill="none" stroke="${c}" stroke-width="8.5" stroke-linecap="square" stroke-linejoin="miter"><path d="M 9 32 H 39 M 24 32 V 68"/><path d="M 82 63 A 18 18 0 1 1 82 37"/><polygon points="76,43 90,45 86,31" fill="${c}" stroke="none"/></g></svg>`,
};

function updateFavicon() {
  const accent = getComputedStyle(document.body).getPropertyValue('--accent').trim() || '#cba6f7';
  const build = FAVICON_MARK[look()] || FAVICON_MARK.frost;
  document.getElementById('favicon').href = 'data:image/svg+xml,' + encodeURIComponent(build(accent));
}

// ---------- Accent system ----------
// Catppuccin Mocha accents, ordered to prevent adjacent same-family colors.
const ACCENT_ORDER = ['mauve', 'rosewater', 'red', 'peach', 'green', 'sky', 'lavender', 'flamingo', 'maroon', 'yellow', 'teal', 'sapphire', 'pink', 'blue'];

// ---------- Wallpapers ----------
// Wallpaper preset definitions.
const WALLPAPERS = {
  voyager: { file: 'voyager.webp', accent: 'blue', alpha: 0.6, blur: 0, saturation: 130, borderWidth: 2.5, borderIntensity: 100 },
  hilltop: { file: 'hilltop.webp', accent: 'red', alpha: 0.5, blur: 0, saturation: 165, borderWidth: 2.5, borderIntensity: 100 },
  highseas: { file: 'highseas.webp', accent: 'peach', alpha: 0.5, blur: 0, saturation: 165, borderWidth: 2.5, borderIntensity: 100 },
  stargazer: { file: 'stargazer.webp', accent: 'lavender', alpha: 0.5, blur: 0, saturation: 165, borderWidth: 2.5, borderIntensity: 100 },
  squall: { file: 'squall.webp', accent: 'pink', alpha: 0.52, blur: 0, saturation: 170, borderWidth: 3, borderIntensity: 100 },
  clearing: { file: 'clearing.webp', accent: 'sapphire', alpha: 0.47, blur: 0, saturation: 140, borderWidth: 2.5, borderIntensity: 100 },
  ironwork: { file: 'ironwork.webp', accent: 'sky', alpha: 0.47, blur: 0, saturation: 130, borderWidth: 2.5, borderIntensity: 100 },
  nebula: { file: 'nebula.webp', accent: 'maroon', alpha: 0.5, blur: 0, saturation: 160, borderWidth: 2.5, borderIntensity: 100 },
  floatingmarket: { file: 'floating_market.webp', accent: 'green', alpha: 0.6, blur: 0, saturation: 165, borderWidth: 2.5, borderIntensity: 100 },
  canyon: { file: 'canyon.webp', accent: 'teal', alpha: 0.65, blur: 0, saturation: 143, borderWidth: 2.5, borderIntensity: 100 },
  hush: { file: 'hush.webp', accent: 'flamingo', alpha: 0.45, blur: 0, saturation: 151, borderWidth: 2.5, borderIntensity: 100 },
  meteor: { file: 'meteor.webp', accent: 'rosewater', alpha: 0.4, blur: 0, saturation: 102, borderWidth: 2.8, borderIntensity: 100 },
  wanderer: { file: 'wanderer.webp', accent: 'mauve', alpha: 0.5, blur: 0, saturation: 158, borderWidth: 3.0, borderIntensity: 100 },
  eventhorizon: { file: 'event_horizon.webp', accent: 'yellow', alpha: 0.5, blur: 0, saturation: 155, borderWidth: 2.7, borderIntensity: 100 },
};

const WALL_ORDER = Object.keys(WALLPAPERS);
const ACCENT_TO_WALL = {};
Object.entries(WALLPAPERS).forEach(([name, w]) => { ACCENT_TO_WALL[w.accent] = name; });

// Display labels for multi-word wallpapers.
const WALL_DISPLAY_LABEL = {
  highseas: 'high seas',
  floatingmarket: 'floating market',
  eventhorizon: 'event horizon',
};

function wallDisplayLabel(name) { return WALL_DISPLAY_LABEL[name] || name; }

// Shared SVG for info tooltips.
const INFO_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><circle cx="12" cy="12" r="9"/><path d="M12 11v5" stroke-linecap="round"/><circle cx="12" cy="8" r="0.6" fill="currentColor" stroke="none"/></svg>';

// Default glass preset for custom wallpaper uploads.
const CUSTOM_WALL_BASE = { file: null, accent: null, alpha: 0.5, blur: 0, saturation: 150, borderWidth: 2.5, borderIntensity: 100 };

function currentWallData() {
  if (SETTINGS.wall === 'custom') return CUSTOM_WALL_BASE;
  return WALLPAPERS[SETTINGS.wall] || WALLPAPERS[WALL_ORDER[0]];
}

// Custom mobile/tablet crop coordinates for wallpapers.
const MOBILE_WALL_CROP = {
  voyager: { mobile: '67% 37%', tablet: '65% 50%' },
  hilltop: { mobile: '40% 44%', tablet: '31% 52%' },
  highseas: { mobile: '53% 35%', tablet: '53% 54%' },
  stargazer: { mobile: '35% 48%', tablet: '33% 62%' },
  squall: { mobile: '65% 47%', tablet: '72% 62%' },
  clearing: { mobile: '57% 63%', tablet: '83% 71%' },
  ironwork: { mobile: '27% 56%', tablet: '30% 72%' },
  nebula: { mobile: '24% 63%', tablet: '19% 73%' },
  floatingmarket: { mobile: '54% 64%', tablet: '59% 73%' },
  canyon: { mobile: '52% 45%', tablet: '42% 57%' },
  hush: { mobile: '46% 68%', tablet: '44% 81%' },
  meteor: { mobile: '25% 70%', tablet: '24% 74%' },
  wanderer: { mobile: '19% 79%', tablet: '23% 87%' },
  eventhorizon: { mobile: '50% 74%', tablet: '51% 72%' },
};

// Match CSS media queries to apply the correct wallpaper crop.
function currentWallCropPosition() {
  const crop = MOBILE_WALL_CROP[SETTINGS.wall];
  if (!crop) return null;
  if (window.matchMedia('(max-width: 600px) and (orientation: portrait)').matches) return crop.mobile;
  if (window.matchMedia('(max-width: 900px)').matches) return crop.tablet;
  return null;
}

// Applies the wallpaper background image and crop position.
function applyWallBackground() {
  const url = (SETTINGS.wall === 'custom' && SETTINGS.customWallData) ? SETTINGS.customWallData : `/static/assets/walls/${currentWallData().file}`;
  document.documentElement.style.setProperty('--wall', `url('${url}')`);
  const pos = currentWallCropPosition();
  if (pos) document.documentElement.style.setProperty('--wall-pos', pos);
  else document.documentElement.style.removeProperty('--wall-pos');
}
window.addEventListener('resize', applyWallBackground);
window.addEventListener('orientationchange', applyWallBackground);

// Calculates and applies glass tokens based on active settings/overrides.
function paintGlassFromWall() {
  const w = currentWallData();
  const ov = (!SETTINGS.matchAccentWall && SETTINGS.wallOverrides[SETTINGS.wall]) || {};
  const alpha = ov.alpha ?? w.alpha;
  const blur = ov.blur ?? w.blur;
  const sat = ov.saturation ?? w.saturation;
  const bw = ov.borderWidth ?? w.borderWidth;
  const bi = ov.borderIntensity ?? w.borderIntensity;
  
  document.documentElement.style.setProperty('--panel-alpha', alpha);
  document.documentElement.style.setProperty('--panel-blur', blur + 'px');
  document.documentElement.style.setProperty('--panel-saturation', sat + '%');
  document.documentElement.style.setProperty('--panel-border-width', bw + 'px');
  paintBorderIntensity(bi);
}

// ---------- TTY appearance ----------

// Applies TTY border tokens.
function paintTtyBorder() {
  document.documentElement.style.setProperty('--panel-border-width', SETTINGS.ttyBorderWidth + 'px');
  document.documentElement.style.setProperty('--panel-border-style', SETTINGS.ttyBorderStyle === 'double' ? 'double' : 'solid');
  document.documentElement.style.setProperty('--panel-border', `color-mix(in srgb, var(--accent) ${SETTINGS.ttyBorderIntensity}%, transparent)`);
  document.documentElement.style.setProperty('--panel-border-soft', `color-mix(in srgb, var(--accent) ${SETTINGS.ttyBorderIntensity / 2}%, transparent)`);
  document.body.setAttribute('data-border-style', SETTINGS.ttyBorderStyle);
}

// Syncs background shade for TTY mode.
function shadeToken(n) { return n === 1 ? 'var(--base)' : n === 2 ? 'var(--mantle)' : 'var(--crust)'; }
function paintShade() {
  const token = shadeToken(SETTINGS.ttyShade);
  document.documentElement.style.setProperty('--panel-bg-term', token);
  document.documentElement.style.setProperty('--panel-body-bg', token);
}

// Reset inline border style to prevent TTY overrides leaking into Frost.
function resetShadeToFrostDefaults() {
  document.documentElement.style.setProperty('--panel-bg-term', 'var(--base)');
  document.documentElement.style.setProperty('--panel-body-bg', 'var(--crust)');
  document.documentElement.style.setProperty('--panel-border-style', 'solid');
}

function paintBezel() {
  document.documentElement.style.setProperty('--tty-bezel', SETTINGS.ttyBezel + 'px');
}

function paintFontWeight() {
  document.documentElement.style.setProperty('--term-font-weight', SETTINGS.fontWeight[look()] ?? 400);
}

// Dispatches appearance updates based on current look.
function paintLookAppearance() {
  paintFontWeight();
  paintBezel();
  if (look() === 'tty') { paintShade(); paintTtyBorder(); }
  else { resetShadeToFrostDefaults(); applyWallBackground(); paintGlassFromWall(); }
  renderGlyphLayer();
}

// ---------- Glyph density (TTY only) ----------
// Canvas matrix rain. Disabled if reduced motion is active.
let glyphInterval = null;
function renderGlyphLayer() {
  const layer = document.getElementById('glyphLayer');
  if (glyphInterval) { clearInterval(glyphInterval); glyphInterval = null; }
  
  const active = look() === 'tty' && SETTINGS.glyphDensity > 0 && !SETTINGS.reducedMotion;
  if (!active) {
    layer.style.opacity = 0;
    layer.innerHTML = '';
    return;
  }
  
  layer.style.opacity = 0.22;
  layer.innerHTML = '<canvas id="glyphCanvas"></canvas>';
  const canvas = document.getElementById('glyphCanvas');
  const ctx = canvas.getContext('2d');
  
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight - 36;

  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()'.split('');
  const fontSize = 14;
  const columns = Math.floor(canvas.width / fontSize);
  const density = SETTINGS.glyphDensity / 10;
  
  const drops = Array(columns).fill(0).map(() => (Math.random() < density) ? Math.floor(Math.random() * -50) : Infinity);
  const speeds = Array(columns).fill(0).map(() => 0.5 + Math.random() * 1.2);
  const dims = Array(columns).fill(0).map(() => 0.55 + Math.random() * 0.45);

  // Reads glyph color live. Respects matchAccentWall or falls back to fixed color.
  function currentGlyphColor() {
    if (SETTINGS.matchAccentWall) {
      return getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#89b4fa';
    }
    return SETTINGS.glyphFixedColor || '#89b4fa';
  }

  function draw() {
    ctx.fillStyle = 'rgba(17,17,27,0.1)';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = fontSize + 'px monospace';
    const baseColor = currentGlyphColor();
    
    for (let i = 0; i < drops.length; i++) {
      if (drops[i] === Infinity) continue;
      const isHead = Math.random() < 0.08;
      ctx.globalAlpha = isHead ? 1 : dims[i];
      ctx.fillStyle = isHead ? '#ffffff' : baseColor;
      ctx.fillText(chars[Math.floor(Math.random() * chars.length)], i * fontSize, drops[i] * fontSize);
      ctx.globalAlpha = 1;
      
      if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i] += speeds[i];
    }
  }
  glyphInterval = setInterval(draw, 50);
}

window.addEventListener('resize', () => {
  if (look() === 'tty' && SETTINGS.glyphDensity > 0 && !SETTINGS.reducedMotion) renderGlyphLayer();
});

function accentHex(name) {
  return getComputedStyle(document.documentElement).getPropertyValue(`--${name}`).trim();
}

function windowFor(accentName) {
  const i = ACCENT_ORDER.indexOf(accentName);
  const start = i === -1 ? 0 : i;
  const picks = [];
  for (let k = 0; k < 6; k++) picks.push(ACCENT_ORDER[(start + k) % ACCENT_ORDER.length]);
  return picks;
}

function swatchesFor(accentName) {
  return windowFor(accentName).map(accentHex);
}

// Generates 3 visually distinct role colors from the accent wheel.
function rolesFor(accentName) {
  const others = windowFor(accentName).slice(1);
  return { ok: others[0], warn: others[1], fail: others[2] };
}

function renderFetchSwatches(node) {
  const wrap = node.querySelector('.fetch-swatches');
  if (!wrap) return;
  wrap.innerHTML = swatchesFor(SETTINGS.accent).map(hex => `<i style="background:${hex}"></i>`).join('');
}

// Applies accent colors to CSS variables immediately.
function paintAccent(hex, accentName) {
  document.documentElement.style.setProperty('--accent', hex);
  const roles = rolesFor(accentName);
  document.documentElement.style.setProperty('--role-ok', accentHex(roles.ok));
  document.documentElement.style.setProperty('--role-warn', accentHex(roles.warn));
  document.documentElement.style.setProperty('--role-fail', accentHex(roles.fail));
  updateFavicon();
  if (fetchNode) renderFetchSwatches(fetchNode);
}

function setAccent(name) {
  SETTINGS.accent = name;
  saveSettings();
  paintAccent(accentHex(name), name);
}

let liveCmd = null;

function newPrompt() {
  if (liveCmd) { const c = liveCmd.querySelector('.cursor'); if (c) c.remove(); }
  const row = el(`<div class="cmdline"><span class="prefix">-></span><span class="typed"><span class="cursor"></span></span></div>`);
  screen.appendChild(row); 
  liveCmd = row; 
  scrollDown(); 
  return row;
}

function typeInto(row, text) { row.querySelector('.typed').innerHTML = text + '<span class="cursor"></span>'; }
function addOutput(html) { const out = el(`<div class="output">${html}</div>`); screen.appendChild(out); scrollDown(); return out; }

// Extension-to-kind mapping. Ambiguous formats default to 'image' client-side.
const EXT_KIND_MAP = {
  jpg: 'image', jpeg: 'image', png: 'image', webp: 'image', bmp: 'image',
  tiff: 'image', tif: 'image', avif: 'image', heic: 'image', heif: 'image',
  svg: 'svg',
  gif: 'animated', apng: 'animated',
  mp4: 'video', mkv: 'video', mov: 'video', avi: 'video', webm: 'video', flv: 'video', wwm: 'video',
  mp3: 'audio', wav: 'audio', flac: 'audio', aac: 'audio', ogg: 'audio', opus: 'audio', wma: 'audio',
};

// Mirrors backend limits.
const MAX_UPLOAD_MB = 500;
const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
const MAX_FILES_PER_JOB = 20;

// Returns user's batch limit clamped to the server maximum.
function effectiveBatchLimit() {
  return Math.min(SETTINGS.batchSizeLimit ?? MAX_FILES_PER_JOB, MAX_FILES_PER_JOB);
}

const FORMAT_GROUPS = {
  image: { default: ['jpg', 'webp', 'png', 'bmp', 'tiff', 'avif', 'heic'] },
  svg: { default: ['png', 'jpg', 'webp'] },
  audio: { default: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'opus', 'wma'] },
  animated: {
    animated: ['gif', 'webp', 'apng', 'avif'],
    thumbnail: ['png', 'jpg', 'webp'],
    frames: ['frames'],
    video: ['mp4', 'webm'],
  },
  video: {
    video: ['mp4', 'mkv', 'mov', 'avi', 'webm', 'flv', 'wmv', 'h264', 'h265'],
    audio: ['mp3', 'wav', 'flac', 'aac', 'ogg', 'opus', 'wma'],
    animated: ['gif', 'webp'],
  },
};

// Maps UI group labels to backend registry names.
const GROUP_TO_BACKEND = {
  animated: { animated: 'convert' },
};

function backendGroup(kind, uiGroup) {
  return GROUP_TO_BACKEND[kind]?.[uiGroup] || uiGroup;
}

function uiGroupLabel(kind, wireGroup) {
  const map = GROUP_TO_BACKEND[kind];
  if (!map) return wireGroup;
  const hit = Object.entries(map).find(([, v]) => v === wireGroup);
  return hit ? hit[0] : wireGroup;
}

const FETCH_DATA = {
  title: 'user@terminal-converter',
  engine: 'ffmpeg 7.1 · resvg · pillow',
  formats: '25+ formats',
  theme: 'catppuccin mocha',
  session: '5000 · local',
};

// ---------- Settings: persisted via localStorage ----------
const SETTINGS_KEY = 'tc:settings';
const SETTINGS_DEFAULTS = {
  accent: 'blue',
  theme: 'frost',
  density: 'comfortable',
  reducedMotion: false,
  wallOverrides: {},
  wall: 'voyager',
  customWallData: null,
  matchAccentWall: false,

  // ---- TTY-only appearance ----
  ttyBorderStyle: 'double',
  ttyBorderWidth: 3,
  ttyBorderIntensity: 82,
  ttyBezel: 24,
  ttyShade: 2,
  glyphDensity: 0,
  glyphFixedColor: null,

  fontWeight: { frost: 400, tty: 400 },

  // ---- Conversion Defaults ----
  filenameTemplate: '{name}.{ext}',
  defaultResolution: 'original',
  defaultFps: 'original',
  batchSizeLimit: 20,
};

// Deep clones defaults to prevent mutating the original object.
function cloneDefaults() { return JSON.parse(JSON.stringify(SETTINGS_DEFAULTS)); }
let SETTINGS = cloneDefaults();

function loadSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    SETTINGS = { ...cloneDefaults(), ...parsed };
    
    // Deep merge for nested config objects.
    SETTINGS.fontWeight = { ...SETTINGS_DEFAULTS.fontWeight, ...(parsed.fontWeight || {}) };
    SETTINGS.wallOverrides = parsed.wallOverrides ? JSON.parse(JSON.stringify(parsed.wallOverrides)) : {};
    
    // Fallback if custom wall data is missing.
    if (SETTINGS.wall === 'custom' && !SETTINGS.customWallData) SETTINGS.wall = SETTINGS_DEFAULTS.wall;
  } catch (e) { /* Fall back to defaults */ }
}

function saveSettings() {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(SETTINGS)); }
  catch (e) { /* Storage unavailable */ }
}

function paintBorderIntensity(pct) {
  document.documentElement.style.setProperty('--panel-border', `color-mix(in srgb, var(--accent) ${pct}%, transparent)`);
  document.documentElement.style.setProperty('--panel-border-soft', `color-mix(in srgb, var(--accent) ${pct / 2}%, transparent)`);
}

// Applies settings to the live DOM.
function applySettings() {
  document.body.setAttribute('data-density', SETTINGS.density);
  document.body.setAttribute('data-motion', SETTINGS.reducedMotion ? 'reduced' : 'full');
  paintAccent(accentHex(SETTINGS.accent), SETTINGS.accent);
  if (SETTINGS.wall !== null) applyWallBackground();
  paintLookAppearance();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

let fetchNode = null;
let fetchGen = 0;

async function typeText(lineEl, text, myGen, speed = 18) {
  lineEl.classList.add('typing');
  lineEl.textContent = '';
  for (let i = 1; i <= text.length; i++) {
    if (myGen !== fetchGen) return false;
    lineEl.textContent = text.slice(0, i);
    await sleep(speed);
  }
  lineEl.classList.remove('typing');
  return true;
}

async function playFetchIntro(node, skipAnimation = false) {
  const myGen = ++fetchGen;
  const logo = node.querySelector('.fetch-logo');
  const swatches = node.querySelector('.fetch-swatches');
  const title = node.querySelector('.fetch-title');
  const kNodes = node.querySelectorAll('.fetch-row .k');
  const vNodes = node.querySelectorAll('.fetch-row .v');

  const currentLook = look();
  const hasPlayed = sessionStorage.getItem('played_intro_' + currentLook);
  
  node.classList.remove('ready');
  const siblings = Array.from(node.parentElement.children).filter(c => c !== node);

  if (skipAnimation || hasPlayed || SETTINGS.reducedMotion) {
    logo.style.transition = 'none'; logo.style.opacity = 1;
    swatches.style.transition = 'none'; swatches.style.opacity = 1;
    
    title.textContent = FETCH_DATA.title;
    title.classList.remove('typing');
    
    const keys = ['engine', 'formats', 'theme', 'session'];
    const vals = [FETCH_DATA.engine, FETCH_DATA.formats, FETCH_DATA.theme, FETCH_DATA.session];
    
    for (let i = 0; i < 4; i++) {
      kNodes[i].textContent = keys[i];
      kNodes[i].classList.remove('typing');
      vNodes[i].textContent = vals[i];
      vNodes[i].classList.remove('typing');
    }
    
    node.classList.add('ready');
    siblings.forEach(s => s.style.opacity = 1);
    sessionStorage.setItem('played_intro_' + currentLook, 'true');
    return;
  }

  siblings.forEach(s => { s.style.transition = 'none'; s.style.opacity = 0; });

  logo.style.transition = 'none'; logo.style.opacity = 0;
  swatches.style.transition = 'none'; swatches.style.opacity = 0;
  title.innerHTML = '&nbsp;'; 
  kNodes.forEach(e => e.innerHTML = '&nbsp;');
  vNodes.forEach(e => e.innerHTML = '&nbsp;');

  requestAnimationFrame(() => {
    logo.style.transition = 'opacity .2s ease';
    logo.style.opacity = 1;
  });

  const sequence = [
    { el: title, text: FETCH_DATA.title },
    { el: kNodes[0], text: 'Engine' },  { el: vNodes[0], text: FETCH_DATA.engine },
    { el: kNodes[1], text: 'Formats' }, { el: vNodes[1], text: FETCH_DATA.formats },
    { el: kNodes[2], text: 'Theme' },   { el: vNodes[2], text: FETCH_DATA.theme },
    { el: kNodes[3], text: 'Session' }, { el: vNodes[3], text: FETCH_DATA.session },
  ];

  for (const step of sequence) {
    const ok = await typeText(step.el, step.text, myGen);
    if (!ok) return;
    if (step.el === title || step.el.classList.contains('v')) {
      await sleep(60);
    }
  }
  
  if (myGen !== fetchGen) return;
  
  swatches.style.transition = 'opacity .2s ease';
  swatches.style.opacity = 1;
  node.classList.add('ready');
  
  siblings.forEach(s => {
    s.style.transition = 'opacity 0.3s ease';
    s.style.opacity = 1;
  });
  
  sessionStorage.setItem('played_intro_' + currentLook, 'true');
}

async function renderFetch(fromReset) {
  const node = el(`
    <div class="fetch">
      <div class="fetch-logo">
        <svg class="ic-frost" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
          <rect width="400" height="400" rx="32" fill="#1e1e2e" />
          <path d="M 0 32 A 32 32 0 0 1 32 0 H 368 A 32 32 0 0 1 400 32 V 100 H 0 Z" fill="#313244" />
          <rect x="2" y="2" width="396" height="396" rx="30" fill="none" stroke="currentColor" stroke-width="6" opacity="0.75" />
          <g fill="none" stroke="#cdd6f4" stroke-width="12" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 40 35 L 65 50 L 40 65" />
            <line x1="75" y1="65" x2="110" y2="65" />
          </g>
          <g transform="translate(49, 90) scale(2)" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="round" stroke-linejoin="round">
            <path d="M 15 50 H 65 M 40 50 V 110" />
            <path d="M 136 101 A 30 30 0 1 1 136 59" />
            <polygon points="127,68 150,72 144,49" fill="currentColor" stroke="none" />
          </g>
        </svg>
        <svg class="ic-tty" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="100%" height="100%">
          <rect width="400" height="400" fill="#1e1e2e" />
          <rect width="400" height="100" fill="#313244" />
          <rect x="3" y="3" width="394" height="394" fill="none" stroke="currentColor" stroke-width="6" />
          <g fill="none" stroke="#cdd6f4" stroke-width="12" stroke-linecap="square" stroke-linejoin="miter">
            <path d="M 40 35 L 65 50 L 40 65" />
            <line x1="75" y1="65" x2="110" y2="65" />
          </g>
          <g transform="translate(49, 90) scale(2)" fill="none" stroke="currentColor" stroke-width="14" stroke-linecap="square" stroke-linejoin="miter">
            <path d="M 15 50 H 65 M 40 50 V 110" />
            <path d="M 136 101 A 30 30 0 1 1 136 59" />
            <polygon points="127,68 150,72 144,49" fill="currentColor" stroke="none" />
          </g>
        </svg>
      </div>
      <div class="fetch-info">
        <div class="fetch-title"></div>
        <div class="fetch-row"><span class="k"></span><span class="v"></span></div>
        <div class="fetch-row"><span class="k"></span><span class="v"></span></div>
        <div class="fetch-row"><span class="k"></span><span class="v"></span></div>
        <div class="fetch-row"><span class="k"></span><span class="v"></span></div>
        <div class="fetch-swatches"></div>
      </div>
    </div>`);
  screen.appendChild(node);
  fetchNode = node;
  renderFetchSwatches(node);
  await playFetchIntro(node, fromReset);
}

let stagedFiles = [];
let inspectGen = 0;
let stagedBlock = null;
let builderCleanup = null;
let jobRunning = false;
let HISTORY = [];

async function boot(fromReset) {
  screen.innerHTML = '';
  setStatus('idle');
  updateFavicon();
  stagedFiles = [];
  stagedBlock = null;
  builderCleanup = null;
  jobRunning = false;
  
  if (convertTimer) { clearInterval(convertTimer); convertTimer = null; }
  if (pollTimer) { clearTimeout(pollTimer); pollTimer = null; }

  screen.classList.remove('flash');
  void screen.offsetWidth;
  screen.classList.add('flash');

  await renderFetch(fromReset);

  screen.appendChild(el(`
    <div class="motd">
      <div class="hl">terminal-converter · session ready</div>
      <div class="hint">Images, Audio, Videos — converted locally.</div>
    </div>`));
  renderWaitline();
  scrollDown();
}

function renderWaitline() {
  const existing = screen.querySelector('.waitline');
  if (existing) existing.remove();

  const wait = el(`
    <div class="waitline">
      <span class="dim">Waiting for input —</span> drag &amp; drop anywhere in this window, or
      <span class="linklike" id="browseLink">click here</span> to browse
      <span class="hint2">png · jpg · webp · svg · mp4 · mov · mp3 · wav · and more · up to ${effectiveBatchLimit()} files</span>
    </div>`);

  screen.appendChild(wait);
  wait.querySelector('#browseLink').addEventListener('click', () => fileInput.click());
  scrollDown();
}

document.addEventListener('click', () => {
  document.querySelectorAll('.dropdown.visible').forEach(d => d.classList.remove('visible'));
  document.querySelectorAll('.builder-btn.picker.open').forEach(p => p.classList.remove('open'));
  document.querySelectorAll('.info-icon.tip-open').forEach(i => i.classList.remove('tip-open'));
});

document.addEventListener('click', (e) => {
  const icon = e.target.closest('.info-icon');
  if (!icon) return;
  e.stopPropagation();
  document.querySelectorAll('.info-icon.tip-open').forEach(i => { if (i !== icon) i.classList.remove('tip-open'); });
  icon.classList.toggle('tip-open');
});

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  if (bytes >= 1024) return Math.round(bytes / 1024) + ' KB';
  return bytes + ' B';
}

function formatRelativeTime(unixSeconds) {
  const diff = Math.max(0, Date.now() / 1000 - unixSeconds);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  if (diff < 172800) return 'yesterday';
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`;
  if (diff < 2592000) { const w = Math.floor(diff / 604800); return `${w} week${w > 1 ? 's' : ''} ago`; }
  const m = Math.floor(diff / 2592000);
  return `${m} month${m > 1 ? 's' : ''} ago`;
}

function historyRowsFromJob(job, timeLabel) {
  return job.files.map(f => ({
    id: f.id,
    jobId: job.id,
    name: f.name,
    kind: f.kind,
    group: uiGroupLabel(f.kind, f.group),
    target: f.target,
    status: f.status === 'done' ? 'ok' : (f.status === 'cancelled' ? 'cancelled' : 'fail'),
    size: f.output_size != null ? formatBytes(f.output_size) : undefined,
    error: f.error || undefined,
    inputAvailable: f.input_available === true,
    skipped: f.skipped === true,
    time: timeLabel,
  }));
}

function pollJobUntilDone(jobId, onDone, onError) {
  const poll = () => {
    fetch(`/api/jobs/${jobId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(job => { if (job.status === 'done') onDone(job); else setTimeout(poll, 600); })
      .catch(onError);
  };
  poll();
}

function classifyFile(file) {
  const parts = file.name.split('.');
  const ext = parts.length > 1 ? parts.pop().toLowerCase() : '';
  return { ext, kind: EXT_KIND_MAP[ext] || null };
}

function webpIsAnimated(bytes) {
  if (bytes.length < 21) return false;
  const fourCC = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);
  if (fourCC !== 'VP8X') return false;
  const flags = bytes[20];
  return ((flags >> 1) & 1) === 1;
}

function pngIsAnimated(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset, false);
    const type = String.fromCharCode(bytes[offset + 4], bytes[offset + 5], bytes[offset + 6], bytes[offset + 7]);
    if (type === 'acTL') return true;
    if (type === 'IDAT') return false;
    offset += 8 + length + 4;
  }
  return false;
}

const AMBIGUOUS_SLICE_BYTES = 128 * 1024;

async function resolveFileKind(file) {
  const { ext, kind: extKind } = classifyFile(file);
  if (!extKind) return { kind: null };

  if (ext === 'webp' || ext === 'png') {
    const buf = await file.slice(0, AMBIGUOUS_SLICE_BYTES).arrayBuffer();
    const bytes = new Uint8Array(buf);
    const animated = ext === 'webp' ? webpIsAnimated(bytes) : pngIsAnimated(bytes);
    return { kind: animated ? 'animated' : 'image' };
  }
  if (ext === 'avif') {
    return { kind: null, needsServerCheck: true };
  }
  return { kind: extKind };
}

function handleFilesSelected(fileList) {
  if (jobRunning) return;
  const incoming = Array.from(fileList || []);
  if (!incoming.length) return;

  incoming.forEach(file => {
    const { ext, kind } = classifyFile(file);
    let error = null;
    if (!kind) error = `.${ext || '?'} isn't a supported type`;
    else if (file.size > MAX_UPLOAD_BYTES) error = `over the ${MAX_UPLOAD_MB}MB limit`;
    stagedFiles.push({ file, ext, kind, error, id: `f${Date.now()}${Math.random().toString(36).slice(2, 7)}` });
  });

  renderConvertSetup();
}

function removeStagedFile(id) {
  stagedFiles = stagedFiles.filter(f => f.id !== id);
  renderConvertSetup();
}

function clearStagedFiles() {
  stagedFiles = [];
  renderConvertSetup();
}

function renderConvertSetup() {
  const existingWait = screen.querySelector('.waitline');
  if (existingWait) existingWait.remove();
  if (stagedBlock) { stagedBlock.remove(); stagedBlock = null; }
  if (builderCleanup) { builderCleanup(); builderCleanup = null; }

  const gen = ++inspectGen;

  if (!stagedFiles.length) {
    renderWaitline();
    return;
  }

  const limit = effectiveBatchLimit();
  const overCap = stagedFiles.length > limit;
  const anyFileErrors = stagedFiles.some(f => f.error);
  const multi = stagedFiles.length > 1;

  const canAddMore = stagedFiles.length < limit;
  const headerHtml = `
    <div class="file-received">${ICONS.check}<span>${stagedFiles.length} file${multi ? 's' : ''} received</span><span class="fr-actions">${canAddMore ? `<span class="linklike" id="addMoreLink">+ add more</span><span class="dim">·</span>` : ''}<span class="fr-clear" id="clearAllLink">clear</span></span></div>`;

  // Initial extension-based preview.
  let bodyHtml;
  if (multi) {
    bodyHtml = `<div class="file-grid">${stagedFiles.map(f => `
      <span class="fg-item ${f.error ? 'invalid' : ''}" title="${f.error ? f.error : ''}">
        <span class="fg-name">${f.file.name}</span>
        <span class="fg-x" data-remove="${f.id}" title="remove">✕</span>
      </span>`).join('')}</div>`;
  } else {
    const f = stagedFiles[0];
    const label = f.kind ? f.kind.charAt(0).toUpperCase() + f.kind.slice(1) : 'Unknown';
    bodyHtml = `<div class="meta-row" style="margin-bottom:0;">
        <span class="k">Type</span><span class="v ${f.error ? 'warn' : ''}" id="typeVal">${f.error ? f.error : label}</span><span class="dim">·</span><span class="k">Size</span><span class="v">${formatBytes(f.file.size)}</span>
      </div>`;
  }

  const block = el(`
    <div class="output staged-block">
      ${headerHtml}
      ${bodyHtml}
      ${overCap ? `<div class="staged-error">Max ${limit} files per batch (your Settings limit) — remove ${stagedFiles.length - limit} to continue.</div>` : ''}
      ${(anyFileErrors && !overCap) ? `<div class="staged-error">Remove the flagged file(s) above to continue.</div>` : ''}
      <div class="staged-checking dim" id="stagedChecking" style="display:none;">Checking file(s)…</div>
    </div>`);

  screen.appendChild(block);
  stagedBlock = block;

  const addMore = block.querySelector('#addMoreLink');
  const clearAll = block.querySelector('#clearAllLink');
  if (addMore) addMore.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
  if (clearAll) clearAll.addEventListener('click', (e) => { e.stopPropagation(); clearStagedFiles(); });
  block.querySelectorAll('[data-remove]').forEach(btn => {
    btn.addEventListener('click', (e) => { e.stopPropagation(); removeStagedFile(btn.dataset.remove); });
  });

  scrollDown();

  // Short-circuit on client-detectable errors.
  if (overCap || anyFileErrors) return;

  const checkingLine = block.querySelector('#stagedChecking');
  checkingLine.style.display = '';

  const validFiles = stagedFiles.map(f => f.file);

  const finish = (ok, kind, groupsByKind, errorMsg) => {
    if (gen !== inspectGen) return;
    checkingLine.style.display = 'none';

    if (!ok) {
      const err = el(`<div class="staged-error">${errorMsg}</div>`);
      block.appendChild(err);
      scrollDown();
      return;
    }

    const typeVal = block.querySelector('#typeVal');
    if (typeVal) typeVal.textContent = kind.charAt(0).toUpperCase() + kind.slice(1);

    // Map server group names to UI labels.
    const uiGroups = {};
    Object.entries(groupsByKind).forEach(([wireKey, targets]) => {
      uiGroups[uiGroupLabel(kind, wireKey)] = targets;
    });

    builderCleanup = renderCommandBuilder(kind, validFiles, uiGroups);
  };

  Promise.all(validFiles.map(f => resolveFileKind(f).then(r => ({ file: f, ...r }))))
    .then(resolved => {
      if (gen !== inspectGen) return;

      const needsServer = resolved.filter(r => r.needsServerCheck);
      const settleAndFinish = (avifKindByFile) => {
        // Validate uniformity across batch.
        const finalKinds = resolved.map(r =>
          r.needsServerCheck ? avifKindByFile.get(r.file) : r.kind);

        if (finalKinds.some(k => !k)) {
          finish(false, null, null, 'Could not read one or more of these files.');
          return;
        }
        const uniqueKinds = [...new Set(finalKinds)];
        if (uniqueKinds.length > 1) {
          finish(false, null, null,
            `Batch files must all be the same type (got: ${uniqueKinds.sort().join(', ')}). Convert them separately.`);
          return;
        }

        const kind = uniqueKinds[0];
        if (CACHED_GROUPS && CACHED_GROUPS[kind]) {
          finish(true, kind, CACHED_GROUPS[kind]);
        } else {
          // Fallback to fetch groups if initial boot fetch failed.
          fetch('/api/formats').then(r => r.json()).then(data => {
            if (gen !== inspectGen) return;
            CACHED_GROUPS = data.groups || CACHED_GROUPS;
            if (CACHED_GROUPS && CACHED_GROUPS[kind]) finish(true, kind, CACHED_GROUPS[kind]);
            else finish(false, null, null, "Couldn't reach the server to check these files.");
          }).catch(() => finish(false, null, null, "Couldn't reach the server to check these files."));
        }
      };

      if (!needsServer.length) {
        settleAndFinish(new Map());
        return;
      }

      // Send only ambiguous files to the server for inspection.
      const formData = new FormData();
      needsServer.forEach(r => formData.append('files', r.file));
      
      fetch('/api/inspect', { method: 'POST', body: formData })
        .then(r => r.json().then(data => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (gen !== inspectGen) return;
          if (!ok) {
            finish(false, null, null, data.error || 'Could not read one or more of these files.');
            return;
          }
          const avifKindByFile = new Map(needsServer.map(r => [r.file, data.kind]));
          settleAndFinish(avifKindByFile);
        })
        .catch(() => finish(false, null, null, "Couldn't reach the server to check these files."));
    })
    .catch(() => finish(false, null, null, "Couldn't reach the server to check these files."));
}

// Renders the interactive command line builder.
function renderCommandBuilder(kind, files, groups) {
  const groupNames = Object.keys(groups);
  const isMultiGroup = groupNames.length > 1;

  let currentGroup = isMultiGroup ? groupNames[0] : 'default';
  let currentTarget = groups[currentGroup][0];

  const cmdRow = el(`<div class="cmdline cmd-builder" style="margin-bottom: 22px;"></div>`);
  let html = `<span class="prefix">-></span><span>convert</span>`;

  if (isMultiGroup) {
    html += `
      <span class="dim">--group</span>
      <div class="builder-btn picker accent" id="groupPicker">
        <span class="val" id="groupVal">${currentGroup}</span> <span class="arr">▾</span>
        <div class="dropdown" id="groupDrop"></div>
      </div>`;
  }

  html += `
    <span class="dim">--to</span>
    <div class="builder-btn picker warn" id="targetPicker">
      <span class="val" id="targetVal">${currentTarget === 'frames' ? 'zip' : currentTarget}</span> <span class="arr">▾</span>
      <div class="dropdown" id="targetDrop"></div>
    </div>
    <div class="builder-btn run" id="runCmd" role="button" tabindex="0">Run</div>
  `;

  cmdRow.innerHTML = html;
  screen.appendChild(cmdRow);

  const hintTextFull = files.length > 1
    ? `(Click the parameters to change them, then Run. Applies to all ${files.length} files.)`
    : `(Click the parameters to change them, then Run)`;
  const hint = el(`<div class="hint-line"><span class="prefix-spacer">-></span><span class="hint-full">${hintTextFull}</span><span class="hint-short">(Click to change, then Run)</span></div>`);
  screen.appendChild(hint);

  scrollDown();

  const groupPicker = isMultiGroup ? cmdRow.querySelector('#groupPicker') : null;
  const groupDrop = isMultiGroup ? cmdRow.querySelector('#groupDrop') : null;
  const groupVal = isMultiGroup ? cmdRow.querySelector('#groupVal') : null;

  const targetPicker = cmdRow.querySelector('#targetPicker');
  const targetDrop = cmdRow.querySelector('#targetDrop');
  const targetVal = cmdRow.querySelector('#targetVal');
  const runBtn = cmdRow.querySelector('#runCmd');

  function renderDrops() {
    if (isMultiGroup) {
      groupDrop.innerHTML = groupNames.map(g =>
        `<div class="drop-item ${g === currentGroup ? 'active' : ''}" data-g="${g}">${g}</div>`
      ).join('');

      Array.from(groupDrop.children).forEach(child => {
        child.addEventListener('click', (e) => {
          e.stopPropagation();
          currentGroup = child.dataset.g;
          currentTarget = groups[currentGroup][0];
          groupVal.innerText = currentGroup;
          targetVal.innerText = currentTarget === 'frames' ? 'zip' : currentTarget;
          closeAll();
          renderDrops();
        });
      });
    }

    targetDrop.innerHTML = groups[currentGroup].map(t => {
      const displayLabel = t === 'frames' ? 'zip' : t;
      return `<div class="drop-item ${t === currentTarget ? 'active' : ''}" data-t="${t}">${displayLabel}</div>`;
    }).join('');

    Array.from(targetDrop.children).forEach(child => {
      child.addEventListener('click', (e) => {
        e.stopPropagation();
        currentTarget = child.dataset.t;
        targetVal.innerText = child.dataset.t === 'frames' ? 'zip' : child.dataset.t;
        closeAll();
        renderDrops();
      });
    });
  }

  function closeAll() {
    if (isMultiGroup) { groupDrop.classList.remove('visible'); groupPicker.classList.remove('open'); }
    targetDrop.classList.remove('visible'); targetPicker.classList.remove('open');
  }

  if (isMultiGroup) {
    groupPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      const vis = groupDrop.classList.contains('visible');
      closeAll();
      if (!vis) { groupDrop.classList.add('visible'); groupPicker.classList.add('open'); }
    });
  }

  targetPicker.addEventListener('click', (e) => {
    e.stopPropagation();
    const vis = targetDrop.classList.contains('visible');
    closeAll();
    if (!vis) { targetDrop.classList.add('visible'); targetPicker.classList.add('open'); }
  });

  // Replaces the UI with plain text to mimic terminal execution.
  runBtn.addEventListener('click', () => {
    closeAll();
    hint.remove();

    let finalCmd = `convert`;
    if (isMultiGroup) {
      finalCmd += ` <span class="dim">--group</span> <span class="accent">${currentGroup}</span>`;
    }
    const displayFormat = currentTarget === 'frames' ? 'zip' : currentTarget;
    finalCmd += ` <span class="dim">--to</span> <span class="warn">${displayFormat}</span>`;
    if (files.length > 1) finalCmd += ` <span class="dim">(${files.length} files)</span>`;

    cmdRow.className = 'cmdline';
    cmdRow.innerHTML = `<span class="prefix">-></span><span class="typed">${finalCmd}<span class="cursor"></span></span>`;
    liveCmd = cmdRow;

    // Lock the staged list mid-run.
    if (stagedBlock) {
      stagedBlock.querySelectorAll('.fg-x, .fr-actions').forEach(x => x.style.display = 'none');
    }

    setTimeout(() => {
      const c = cmdRow.querySelector('.cursor');
      if (c) c.remove();
      runRealJob(kind, currentGroup, currentTarget, files);
    }, 400);
  });

  renderDrops();

  return function cleanup() {
    cmdRow.remove();
    hint.remove();
  };
}

// Submits the staged batch to the backend.
function runRealJob(kind, uiGroup, format, files) {
  jobRunning = true;
  setStatus('uploading');
  const out = addOutput(`<div class="progress-block" id="pblock"><div class="pbar-wrap"></div><div class="pres-wrap"></div></div>`);
  const barWrap = out.querySelector('.pbar-wrap');
  const resWrap = out.querySelector('.pres-wrap');
  scrollDown();

  renderUploadPhase(barWrap, 0);

  const formData = new FormData();
  files.forEach(f => formData.append('files', f));
  formData.append('target', format);
  formData.append('group', backendGroup(kind, uiGroup));
  if (SETTINGS.filenameTemplate) {
    formData.append('filename_template', SETTINGS.filenameTemplate);
  }

  // Apply user resolution/fps defaults for video -> animated conversions.
  if (kind === 'video' && uiGroup === 'animated') {
    if (SETTINGS.defaultResolution && SETTINGS.defaultResolution !== 'original') {
      formData.append('resolution', SETTINGS.defaultResolution);
    }
    if (SETTINGS.defaultFps && SETTINGS.defaultFps !== 'original') {
      formData.append('fps', SETTINGS.defaultFps);
    }
  }

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/convert');

  // Real byte upload progress.
  xhr.upload.addEventListener('progress', (e) => {
    if (!e.lengthComputable) return;
    renderUploadPhase(barWrap, (e.loaded / e.total) * 100);
    scrollDown();
  });

  xhr.addEventListener('load', () => {
    if (xhr.status < 200 || xhr.status >= 300) {
      let msg = `Upload failed (HTTP ${xhr.status})`;
      try { msg = JSON.parse(xhr.responseText).error || msg; } catch (e) { }
      renderJobFailure(resWrap, msg);
      return;
    }
    let data;
    try { data = JSON.parse(xhr.responseText); }
    catch (e) { renderJobFailure(resWrap, 'Server returned an unreadable response.'); return; }

    renderUploadPhase(barWrap, 100);
    setTimeout(() => startConvertPhase(barWrap, resWrap, data.job_id, kind, uiGroup, files), 300);
  });

  xhr.addEventListener('error', () => {
    renderJobFailure(resWrap, "Couldn't reach the server — is it still running?");
  });

  xhr.send(formData);
}

function renderJobFailure(resWrap, message) {
  setStatus('idle');
  jobRunning = false;
  resWrap.innerHTML = `<div class="result-line fail"><span class="hist-x">✕</span><span>${message}</span></div>`;
  scrollDown();
}

function renderPercentPhase(block, pct, label) {
  const p = Math.round(pct);
  if (look() === 'tty') {
    const width = 24;
    const filled = Math.round((p / 100) * width);
    block.innerHTML = `
      <div class="phase-label">${label}</div>
      <div class="rbar"><span class="bracket">[</span><span class="fill">${'▓'.repeat(filled)}</span><span class="empty">${'░'.repeat(width - filled)}</span><span class="bracket">]</span><span class="pct">${p}%</span></div>`;
  } else {
    block.innerHTML = `
      <div class="phase-label">${label}</div>
      <div class="gbar-track"><div class="gbar-fill" style="width:${p}%"></div></div>
      <div class="gbar-pct">${p}%</div>`;
  }
}

function renderUploadPhase(block, pct) {
  renderPercentPhase(block, pct, 'Uploading file');
}

function renderIndeterminatePhase(block, label) {
  if (look() === 'tty') {
    block.innerHTML = `
      <div class="phase-label">${label}</div>
      <div class="rbar indeterminate"><span class="spinner">${SPIN[spinnerFrame % SPIN.length]}</span><span class="dim">Server is working</span></div>`;
  } else {
    if (!block.querySelector('.gbar-track.indeterminate')) {
      block.innerHTML = `
        <div class="phase-label">${label}</div>
        <div class="gbar-track indeterminate"><div class="sweep s1"></div><div class="sweep s2"></div></div>`;
    }
  }
}

// Fake progress estimation for instant-blocking operations (Pillow/resvg).
function estimateFakeDuration(sizeBytes) {
  return Math.min(1800, Math.max(250, sizeBytes / 4000));
}

let fakeProgressStarts = {};
let convertJobFiles = null;

function fakeProgressFor(task) {
  if (!fakeProgressStarts[task.id]) {
    const originalFile = convertJobFiles?.find(f => f.name === task.name);
    fakeProgressStarts[task.id] = {
      start: performance.now(),
      duration: estimateFakeDuration(originalFile ? originalFile.size : 500000),
    };
  }
  const { start, duration } = fakeProgressStarts[task.id];
  const elapsed = performance.now() - start;
  return Math.min(92, (elapsed / duration) * 92);
}

let spinnerFrame = 0;
const SPIN = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let convertTimer = null;
let pollTimer = null;

// Polls the backend and handles intermediate conversion phases.
function startConvertPhase(barWrap, resWrap, jobId, kind, uiGroup, files) {
  setStatus('converting');
  spinnerFrame = 0;
  convertJobFiles = files;
  fakeProgressStarts = {};
  let lastKnownJob = null;

  const cancelWrap = el(`<div class="cancel-link-wrap"><span class="linklike dim" id="cancelJobLink">cancel</span></div>`);
  resWrap.appendChild(cancelWrap);
  cancelWrap.querySelector('#cancelJobLink').addEventListener('click', () => {
    cancelWrap.innerHTML = `<span class="dim">cancelling…</span>`;
    fetch(`/api/jobs/${jobId}/cancel`, { method: 'POST' }).catch(() => { });
  }, { once: true });

  // Poll and animate indeterminate spinner.
  convertTimer = setInterval(() => {
    spinnerFrame++;
    if (lastKnownJob) renderConvertPhase(barWrap, lastKnownJob);
  }, 90);

  const poll = () => {
    fetch(`/api/jobs/${jobId}`)
      .then(r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); })
      .then(job => {
        lastKnownJob = job;
        if (job.status === 'done') {
          clearInterval(convertTimer);
          barWrap.innerHTML = '';
          finishReal(resWrap, jobId, job);
        } else {
          renderConvertPhase(barWrap, job);
          pollTimer = setTimeout(poll, 600);
        }
      })
      .catch(err => {
        clearInterval(convertTimer);
        barWrap.innerHTML = '';
        renderJobFailure(resWrap, `Lost contact with the server (${err.message}).`);
      });
  };
  poll();
}

// Renders phase state: percentage for ffmpeg, fake fill for Pillow, spinner for queued.
function renderConvertPhase(block, job) {
  const files = job.files;
  const total = files.length;
  const activeIdx = files.findIndex(f => f.status === 'converting');
  const active = activeIdx >= 0 ? files[activeIdx] : null;
  const finishedCount = files.filter(f => f.status !== 'queued' && f.status !== 'converting').length;
  const posLabel = total > 1 ? ` — file ${Math.min(finishedCount + 1, total)} of ${total}` : '';

  if (!active) {
    renderIndeterminatePhase(block, `Converting${posLabel}`);
    return;
  }
  if (active.engine === 'ffmpeg') {
    if (active.progress != null) {
      renderPercentPhase(block, active.progress, `Converting via ffmpeg${posLabel}`);
    } else {
      renderIndeterminatePhase(block, `Converting via ffmpeg${posLabel} — starting…`);
    }
    return;
  }
  renderPercentPhase(block, fakeProgressFor(active), `Converting via ${active.engine}${posLabel}`);
}

// Handles successful completion, failures, and cancellations.
function finishReal(resWrap, jobId, job) {
  setStatus('done');
  jobRunning = false;

  const succeeded = job.files.filter(f => f.status === 'done');
  const failed = job.files.filter(f => f.status === 'failed');
  const cancelled = job.files.filter(f => f.status === 'cancelled');
  const multiDownload = succeeded.length > 1;

  let html = '';
  if (succeeded.length) {
    const label = multiDownload ? `terminal-converter_${jobId}.zip` : succeeded[0].output_name;
    const size = multiDownload
      ? succeeded.reduce((sum, f) => sum + (f.output_size || 0), 0)
      : (succeeded[0].output_size || 0);
    html += `
      <div class="result-line ok">${ICONS.down} ${succeeded.length} file${succeeded.length > 1 ? 's' : ''} converted</div>
      ${(!multiDownload && succeeded[0].skipped) ? `<div class="dim" style="margin:2px 0 0 22px;">already ${succeeded[0].target} — copied unchanged</div>` : ''}
      <a class="download${multiDownload ? ' download-all' : ''}" href="/api/jobs/${jobId}/download" download="${label}"><span>${label}</span><span class="size">${formatBytes(size)}</span></a>`;
  }
  if (failed.length) {
    html += failed.map(f => `
      <div class="result-line fail"><span class="hist-x">✕</span><span>${f.name}</span><span class="dim">${f.error || 'conversion failed'}</span></div>`).join('');
  }
  if (cancelled.length) {
    // Neutral styling for cancellations.
    html += cancelled.map(f => `
      <div class="result-line"><span class="dim">${f.name} — cancelled</span></div>`).join('');
  }
  html += `<div><span class="replay" id="replayBtn">↺ Convert another file</span></div>`;

  resWrap.innerHTML = html;

  const dl = resWrap.querySelector('.download');
  if (dl) {
    dl.addEventListener('click', () => {
      setTimeout(() => {
        dl.innerHTML = `${ICONS.check} saved to downloads`;
        dl.style.borderColor = "var(--role-ok)";
      }, 300);
    }, { once: true });
  }
  resWrap.querySelector('#replayBtn').addEventListener('click', () => boot(true));

  // Add task outcomes to history and retain jobId for downloading.
  HISTORY.unshift(...historyRowsFromJob(job, 'just now'));

  scrollDown();
}

document.getElementById('btnFrost').addEventListener('click', () => setLook('frost'));
document.getElementById('btnTty').addEventListener('click', () => setLook('tty'));
document.getElementById('btnLookSwap').addEventListener('click', () => setLook(SETTINGS.theme === 'frost' ? 'tty' : 'frost'));
document.getElementById('btnReset').addEventListener('click', () => boot(true));

function setLook(l) {
  SETTINGS.theme = l;
  saveSettings();
  document.body.setAttribute('data-look', l);
  document.getElementById('btnFrost').classList.toggle('active', l === 'frost');
  document.getElementById('btnTty').classList.toggle('active', l === 'tty');
  document.getElementById('btnLookSwap').textContent = l;
  updateFavicon();
  paintLookAppearance();
  
  // Live-refresh the settings page if open.
  if (settingsScreenEl && settingsScreenEl.style.display !== 'none') renderSettingsPage();

  if (fetchNode) playFetchIntro(fetchNode, false);
  
  const block = document.getElementById('pblock');
  if (block) {
    const barWrap = block.querySelector('.pbar-wrap');
    const state = statusModule.getAttribute('data-state');
    
    if (state === 'uploading') {
      renderUploadPhase(barWrap, currentPct);
    } else if (state === 'converting' || state === 'done') {
      barWrap.innerHTML = '';
      renderConvertPhase(barWrap);
    }
  }
}

// ---------- Workspace tabs ----------
const settingsScreenEl = document.getElementById('settingsScreen');
const historyScreenEl = document.getElementById('historyScreen');
const wsButtons = document.querySelectorAll('.ws');

function switchWorkspace(name) {
  wsButtons.forEach(w => w.classList.toggle('active', w.dataset.ws === name));
  screen.style.display = name === 'convert' ? '' : 'none';
  settingsScreenEl.style.display = name === 'settings' ? '' : 'none';
  historyScreenEl.style.display = name === 'history' ? '' : 'none';
  if (name === 'settings') renderSettingsScreen();
  if (name === 'history') renderHistoryScreen(); 
}
wsButtons.forEach(w => w.addEventListener('click', () => switchWorkspace(w.dataset.ws)));

// ---------- History ----------
// Local history log powered by the backend retention window.
function renderHistoryScreen() {
  if (!HISTORY.length) {
    historyScreenEl.innerHTML = `
      <div class="waitline">
        <span class="dim">No conversions yet.</span> Run something from <span class="linklike" id="goToConvertLink">convert</span> and it'll show up here.
      </div>`;
    historyScreenEl.querySelector('#goToConvertLink').addEventListener('click', () => switchWorkspace('convert'));
    return;
  }

  const rowsHtml = HISTORY.map(h => {
    if (h.status === 'ok') {
      // Successful entries allow redownload.
      return `
        <div class="history-row">
          <div class="result-line ok">${ICONS.check}<span class="hist-name">${h.name}</span><span class="dim">to ${h.target}</span></div>
          ${h.skipped ? `<div class="hist-error">already ${h.target} — copied unchanged</div>` : ''}
          <div class="hist-meta"><span class="dim">${h.size} · ${h.time}</span>
            <span class="hist-actions">
              <span class="linklike" data-redownload="${h.id}" data-job="${h.jobId}">redownload</span>
            </span>
          </div>
        </div>`;
    }
    
    // Failed/cancelled entries allow retry if the input file is still retained.
    const retryAction = h.inputAvailable
      ? `<span class="linklike" data-retry="${h.id}" data-job="${h.jobId}">rerun</span>`
      : `<span class="dim">input expired — upload fresh to retry</span>`;

    if (h.status === 'cancelled') {
      return `
        <div class="history-row">
          <div class="result-line"><span class="hist-name">${h.name}</span><span class="dim">to ${h.target}, cancelled</span></div>
          <div class="hist-meta"><span class="dim">${h.time}</span>
            <span class="hist-actions">${retryAction}</span>
          </div>
        </div>`;
    }
    return `
      <div class="history-row">
        <div class="result-line fail"><span class="hist-x">✕</span><span class="hist-name">${h.name}</span><span class="dim">to ${h.target}, failed</span></div>
        <div class="hist-error">${h.error || 'Conversion failed for an unknown reason.'}</div>
        <div class="hist-meta"><span class="dim">${h.time}</span>
          <span class="hist-actions">${retryAction}</span>
        </div>
      </div>`;
  }).join('');

  historyScreenEl.innerHTML = `<div class="history-list">${rowsHtml}</div>`;

  historyScreenEl.querySelectorAll('[data-redownload]').forEach(btn => {
    btn.addEventListener('click', () => {
      // Triggers a real browser download without navigating away.
      const a = document.createElement('a');
      a.href = `/api/jobs/${btn.dataset.job}/download`;
      a.download = '';
      document.body.appendChild(a);
      a.click();
      a.remove();
      btn.textContent = 'saved to downloads';
      btn.style.pointerEvents = 'none';
      btn.style.color = 'var(--role-ok)';
    });
  });

  historyScreenEl.querySelectorAll('[data-retry]').forEach(btn => {
    btn.addEventListener('click', () => {
      const entry = HISTORY.find(h => h.id === btn.dataset.retry);
      if (!entry) return;
      const actionsSpan = btn.parentElement;
      actionsSpan.innerHTML = `<span class="dim">retrying…</span>`;

      fetch(`/api/jobs/${entry.jobId}/tasks/${entry.id}/retry`, { method: 'POST' })
        .then(r => r.json().then(data => ({ ok: r.ok, data })))
        .then(({ ok, data }) => {
          if (!ok) {
            actionsSpan.innerHTML = `<span class="dim">${data.error || 'Retry failed.'}</span>`;
            return;
          }
          pollJobUntilDone(
            data.job_id,
            (job) => { HISTORY.unshift(...historyRowsFromJob(job, 'just now')); renderHistoryScreen(); },
            () => { actionsSpan.innerHTML = `<span class="dim">Lost contact with the server.</span>`; },
          );
        })
        .catch(() => { actionsSpan.innerHTML = `<span class="dim">Couldn't reach the server.</span>`; });
    });
  });
}

// ---------- Settings pager ----------
// Paginates settings to avoid scrolling overflow on mobile.
let settingsPage = 0;
const SETTINGS_PAGE_COUNT = 2;
let settingsWheelCooldown = false;

function settingsAtBottom() { return settingsScreenEl.scrollTop + settingsScreenEl.clientHeight >= settingsScreenEl.scrollHeight - 2; }
function settingsAtTop() { return settingsScreenEl.scrollTop <= 2; }

settingsScreenEl.addEventListener('wheel', (e) => {
  if (settingsScreenEl.style.display === 'none' || settingsWheelCooldown) return;
  if (e.deltaY > 8 && settingsAtBottom() && settingsPage < SETTINGS_PAGE_COUNT - 1) {
    settingsPage++;
  } else if (e.deltaY < -8 && settingsAtTop() && settingsPage > 0) {
    settingsPage--;
  } else {
    return;
  }
  renderSettingsPage();
  settingsScreenEl.scrollTop = e.deltaY > 0 ? 0 : settingsScreenEl.scrollHeight;
  settingsWheelCooldown = true;
  setTimeout(() => { settingsWheelCooldown = false; }, 450);
}, { passive: true });

// Touch swipe equivalent for paging.
let settingsTouchStartY = null;
let settingsTouchStartTarget = null;
settingsScreenEl.addEventListener('touchstart', (e) => {
  if (settingsScreenEl.style.display === 'none') return;
  settingsTouchStartY = e.touches[0].clientY;
  settingsTouchStartTarget = e.target;
}, { passive: true });

settingsScreenEl.addEventListener('touchend', (e) => {
  if (settingsScreenEl.style.display === 'none' || settingsTouchStartY === null || settingsWheelCooldown) return;
  const startedOnInput = settingsTouchStartTarget && settingsTouchStartTarget.tagName === 'INPUT';
  const deltaY = settingsTouchStartY - e.changedTouches[0].clientY;
  settingsTouchStartY = null;
  if (startedOnInput) return;
  const SWIPE_THRESHOLD = 50;
  
  if (deltaY > SWIPE_THRESHOLD && settingsAtBottom() && settingsPage < SETTINGS_PAGE_COUNT - 1) {
    settingsPage++;
  } else if (deltaY < -SWIPE_THRESHOLD && settingsAtTop() && settingsPage > 0) {
    settingsPage--;
  } else {
    return;
  }
  renderSettingsPage();
  settingsScreenEl.scrollTop = deltaY > 0 ? 0 : settingsScreenEl.scrollHeight;
  settingsWheelCooldown = true;
  setTimeout(() => { settingsWheelCooldown = false; }, 450);
}, { passive: true });

// Keyboard arrow equivalent for paging.
document.addEventListener('keydown', (e) => {
  if (settingsScreenEl.style.display === 'none') return;
  if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
  if (e.key === 'ArrowDown' && settingsAtBottom() && settingsPage < SETTINGS_PAGE_COUNT - 1) {
    e.preventDefault();
    settingsPage++;
    renderSettingsPage();
    settingsScreenEl.scrollTop = 0;
  } else if (e.key === 'ArrowUp' && settingsAtTop() && settingsPage > 0) {
    e.preventDefault();
    settingsPage--;
    renderSettingsPage();
    settingsScreenEl.scrollTop = settingsScreenEl.scrollHeight;
  }
});

// Rebuilds Settings tab when opened.
function renderSettingsScreen() {
  settingsPage = 0;
  renderSettingsPage();
}

function settingsPageOneMarkup() {
  return `
      <div class="settings-section">
        <div class="settings-title">Appearance</div>
        <div class="settings-row">
          <div class="settings-label">accent</div>
          <div class="swatch-grid" id="accentGrid"></div>
        </div>
        <div class="settings-row">
          <div class="settings-label">default theme</div>
          <div class="ctrl settings-opts" id="themeOpts">
            <button data-v="frost">frost</button>
            <button data-v="tty">tty</button>
          </div>
        </div>
        <div class="settings-row">
          <div class="settings-label">terminal density</div>
          <div class="ctrl settings-opts" id="densityOpts">
            <button data-v="compact">compact</button>
            <button data-v="comfortable">comfortable</button>
            <button data-v="spacious">spacious</button>
          </div>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-title">Behavior</div>
        <div class="settings-row">
          <div class="settings-label">reduced motion</div>
          <button class="switch" id="motionToggle" role="switch"></button>
        </div>
        <div class="settings-row">
          <div class="settings-label">${look() === 'tty' ? 'match accent &amp; glyph' : 'match accent &amp; wallpaper'}</div>
          <button class="switch" id="matchToggle" role="switch"></button>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-title">${look() === 'tty' ? 'TTY Appearance' : 'Wallpaper &amp; Glass'}</div>
        ${look() === 'tty' ? `
        <div class="settings-row">
          <div class="settings-label">border style</div>
          <div class="builder-btn picker accent" id="borderStylePicker">
            <span class="val" id="borderStyleVal">solid</span> <span class="arr" style="margin-left: auto;">▾</span>
            <div class="dropdown dense" id="borderStyleDrop"></div>
          </div>
          <button type="button" class="slider-reset" data-reset-tty="ttyBorderStyle">reset</button>
        </div>
        <div class="settings-row"><div class="settings-label">terminal bezel</div><input type="range" class="slider" id="sldBezel" min="16" max="48" step="4"><span class="slider-val" id="sldBezelVal"></span><button type="button" class="slider-reset" data-reset-tty="ttyBezel">reset</button></div>
        <div class="settings-row"><div class="settings-label">background shade</div><input type="range" class="slider" id="sldShade" min="1" max="3" step="1"><span class="slider-val" id="sldShadeVal"></span><button type="button" class="slider-reset" data-reset-tty="ttyShade">reset</button></div>
        <div class="settings-row"><div class="settings-label">glyph density</div><input type="range" class="slider" id="sldGlyph" min="0" max="10" step="1"><span class="slider-val" id="sldGlyphVal"></span><button type="button" class="slider-reset" data-reset-tty="glyphDensity">reset</button></div>
        <div class="settings-row"><div class="settings-label">border width</div><input type="range" class="slider" id="sldTtyBW" min="1" max="5" step="0.5"><span class="slider-val" id="sldTtyBWVal"></span><button type="button" class="slider-reset" data-reset-tty="ttyBorderWidth">reset</button></div>
        <div class="settings-row"><div class="settings-label">border intensity</div><input type="range" class="slider" id="sldTtyBI" min="0" max="100" step="1"><span class="slider-val" id="sldTtyBIVal"></span><button type="button" class="slider-reset" data-reset-tty="ttyBorderIntensity">reset</button></div>
        ` : `
        <div class="settings-row">
          <div class="settings-label">wallpaper</div>
          <div class="builder-btn picker accent" id="wallPicker">
            <span class="val" id="wallVal">blue</span> <span class="arr" style="margin-left: auto;">▾</span>
            <div class="dropdown dense" id="wallDrop"></div>
          </div>
          <span class="linklike" id="editCustomWallLink">edit custom</span>
        </div>
        <div class="settings-row"><div class="settings-label">alpha</div><input type="range" class="slider" id="sldAlpha" min="0" max="1" step="0.01"><span class="slider-val" id="sldAlphaVal"></span><button type="button" class="slider-reset" data-reset="alpha">reset</button></div>
        <div class="settings-row"><div class="settings-label">blur</div><input type="range" class="slider" id="sldBlur" min="0" max="24" step="1"><span class="slider-val" id="sldBlurVal"></span><button type="button" class="slider-reset" data-reset="blur">reset</button></div>
        <div class="settings-row"><div class="settings-label">saturation</div><input type="range" class="slider" id="sldSat" min="0" max="220" step="1"><span class="slider-val" id="sldSatVal"></span><button type="button" class="slider-reset" data-reset="saturation">reset</button></div>
        <div class="settings-row"><div class="settings-label">border width</div><input type="range" class="slider" id="sldBW" min="0" max="3.5" step="0.1"><span class="slider-val" id="sldBWVal"></span><button type="button" class="slider-reset" data-reset="borderWidth">reset</button></div>
        <div class="settings-row"><div class="settings-label">border intensity</div><input type="range" class="slider" id="sldBI" min="0" max="100" step="1"><span class="slider-val" id="sldBIVal"></span><button type="button" class="slider-reset" data-reset="borderIntensity">reset</button></div>
        `}
        <div class="settings-row"><div class="settings-label">font weight</div><input type="range" class="slider" id="sldFontWeight" min="100" max="800" step="100"><span class="slider-val" id="sldFontWeightVal"></span><button type="button" class="slider-reset" data-reset-tty="fontWeight">reset</button></div>
      </div>
  `;
}

function settingsPageTwoMarkup() {
  return `
      <div class="settings-section">
        <div class="settings-title">Conversion Defaults</div>
        <div class="settings-row">
          <div class="settings-label">filename template<span class="info-icon">${INFO_ICON_SVG}<span class="info-tip">Type anything you want. <b>{name}</b> and <b>{ext}</b> get replaced automatically, everything else stays literal. Example: <b>converted_{name}.{ext}</b>. Also supports <b>{index}</b> (position in a batch) and <b>{date}</b>.</span></span></div>
          <span class="text-field-wrap"><input type="text" class="text-field" id="filenameTemplateInput" spellcheck="false" autocomplete="off"></span>
          <button type="button" class="slider-reset" data-reset-tty="filenameTemplate">reset</button>
        </div>
        <div class="settings-row">
          <div class="settings-label">resolution<span class="info-icon">${INFO_ICON_SVG}<span class="info-tip">Only applies when converting video to gif or webp, the one case where a resolution is actually being chosen. Leave on "original" to keep the source size.</span></span></div>
          <div class="builder-btn picker accent" id="resPicker">
            <span class="val" id="resVal">original</span> <span class="arr" style="margin-left: auto;">▾</span>
            <div class="dropdown dense" id="resDrop"></div>
          </div>
          <button type="button" class="slider-reset" data-reset-tty="defaultResolution">reset</button>
        </div>
        <div class="settings-row">
          <div class="settings-label">fps<span class="info-icon">${INFO_ICON_SVG}<span class="info-tip">Same scope as resolution: video to gif/webp only. "original" keeps the source frame rate.</span></span></div>
          <div class="builder-btn picker accent" id="fpsPicker">
            <span class="val" id="fpsVal">original</span> <span class="arr" style="margin-left: auto;">▾</span>
            <div class="dropdown dense" id="fpsDrop"></div>
          </div>
          <button type="button" class="slider-reset" data-reset-tty="defaultFps">reset</button>
        </div>
        <div class="settings-row"><div class="settings-label">batch size limit</div><input type="range" class="slider" id="sldBatchLimit" min="1" max="20" step="1"><span class="slider-val" id="sldBatchLimitVal"></span><button type="button" class="slider-reset" data-reset-tty="batchSizeLimit">reset</button></div>
      </div>
      <div class="settings-section">
        <div class="settings-title">Backup</div>
        <div class="settings-row">
          <div class="settings-label">export settings<span class="info-icon">${INFO_ICON_SVG}<span class="info-tip">Downloads every setting as JSON: accent, theme, wallpaper choice and glass tuning, TTY appearance, conversion defaults. Not included: the custom wallpaper image itself, since a multi-MB embedded image doesn't belong in a portable text file.</span></span></div>
          <span class="builder-btn accent" id="exportSettingsBtn">download settings.json</span>
        </div>
        <div class="settings-row">
          <div class="settings-label">import settings<span class="info-icon">${INFO_ICON_SVG}<span class="info-tip">Reads a previously exported settings.json and applies it. Your current custom wallpaper (if any) is left alone either way, since import never touches it. Files that aren't a real terminal-converter export get rejected.</span></span></div>
          <span class="builder-btn accent" id="importSettingsBtn">choose file</span>
          <input type="file" id="importSettingsInput" hidden accept="application/json,.json">
        </div>
        <div class="settings-row" id="importStatusRow" style="display:none;">
          <div class="settings-label"></div>
          <span id="importStatusText" style="font-size:11.5px;"></span>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-title">Reset</div>
        <div class="settings-row">
          <div class="settings-label">reset everything</div>
          <span class="builder-btn" id="resetAllBtn" style="--p-color:var(--role-fail);">reset all settings to defaults</span>
          <span id="resetConfirmInline" style="display:none; font-size:11.5px;">
            <span class="dim">This clears everything, including the custom wallpaper.</span>
            <span class="builder-btn" id="resetConfirmYes" style="--p-color:var(--role-fail); margin-left:8px;">yes, reset</span>
            <span class="fr-clear" id="resetConfirmNo" style="margin-left:10px;">cancel</span>
          </span>
        </div>
      </div>
  `;
}

// Defines pagination mapping for Settings.
const SETTINGS_PAGES = [
  { markup: () => settingsPageOneMarkup(), wire: () => wireSettingsPageOne() },
  { markup: () => settingsPageTwoMarkup(), wire: () => wireSettingsPageTwo() },
];

function renderSettingsPage() {
  const page = SETTINGS_PAGES[settingsPage];
  settingsScreenEl.innerHTML = `
    <div class="settings-wrap">
      ${page.markup()}
    </div>
    ${settingsPage < SETTINGS_PAGE_COUNT - 1 ? `<div class="pager-hint">-- More --</div>` : ''}`;

  page.wire();
}

function wireSettingsPageOne() {
  const grid = settingsScreenEl.querySelector('#accentGrid');
  ACCENT_ORDER.forEach(name => {
    const sw = el(`<button class="swatch-btn${name === SETTINGS.accent ? ' active' : ''}" style="--sw-color:${accentHex(name)}" title="${name}"></button>`);
    sw.addEventListener('click', () => {
      setAccent(name);
      grid.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
      sw.classList.add('active');
      if (SETTINGS.matchAccentWall && ACCENT_TO_WALL[name]) selectWall(ACCENT_TO_WALL[name], false);
    });
    grid.appendChild(sw);
  });

  const themeOpts = settingsScreenEl.querySelector('#themeOpts');
  themeOpts.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.v === SETTINGS.theme);
    btn.addEventListener('click', () => {
      setLook(btn.dataset.v);
      themeOpts.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  const densityOpts = settingsScreenEl.querySelector('#densityOpts');
  densityOpts.querySelectorAll('button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.v === SETTINGS.density);
    btn.addEventListener('click', () => {
      SETTINGS.density = btn.dataset.v;
      saveSettings();
      document.body.setAttribute('data-density', SETTINGS.density);
      densityOpts.querySelectorAll('button').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Updates wallpaper and syncs accent if enabled.
  function selectWall(name, syncAccent) {
    SETTINGS.wall = name;
    saveSettings();
    if (look() === 'frost') {
      applyWallBackground();
      paintGlassFromWall();
      const wallDrop = settingsScreenEl.querySelector('#wallDrop');
      const wallVal = settingsScreenEl.querySelector('#wallVal');
      if (wallVal) wallVal.textContent = wallDisplayLabel(SETTINGS.wall);
      if (wallDrop) Array.from(wallDrop.children).forEach(c => c.classList.toggle('active', c.dataset.w === SETTINGS.wall));
      if (typeof refreshSliderDisplays === 'function') refreshSliderDisplays();
    }
    
    if (syncAccent && SETTINGS.matchAccentWall && name !== 'custom') {
      const wallAccent = currentWallData().accent;
      setAccent(wallAccent);
      grid.querySelectorAll('.swatch-btn').forEach(b => b.classList.toggle('active', b.title === wallAccent));
    }
  }

  // Syncs frost glass sliders to current preset or override.
  function refreshSliderDisplays() {
    const sldAlpha = settingsScreenEl.querySelector('#sldAlpha');
    if (!sldAlpha) return; 
    
    const w = currentWallData();
    const locked = SETTINGS.matchAccentWall;
    const ov = (!locked && SETTINGS.wallOverrides[SETTINGS.wall]) || {};
    
    const SLIDERS = {
      alpha: { input: sldAlpha, valEl: settingsScreenEl.querySelector('#sldAlphaVal'), suffix: '' },
      blur: { input: settingsScreenEl.querySelector('#sldBlur'), valEl: settingsScreenEl.querySelector('#sldBlurVal'), suffix: 'px' },
      saturation: { input: settingsScreenEl.querySelector('#sldSat'), valEl: settingsScreenEl.querySelector('#sldSatVal'), suffix: '%' },
      borderWidth: { input: settingsScreenEl.querySelector('#sldBW'), valEl: settingsScreenEl.querySelector('#sldBWVal'), suffix: 'px' },
      borderIntensity: { input: settingsScreenEl.querySelector('#sldBI'), valEl: settingsScreenEl.querySelector('#sldBIVal'), suffix: '%' },
    };
    
    Object.entries(SLIDERS).forEach(([field, s]) => {
      const val = ov[field] ?? w[field];
      s.input.value = val;
      s.valEl.textContent = val + s.suffix;
      s.input.disabled = locked;
      const resetBtn = settingsScreenEl.querySelector(`.slider-reset[data-reset="${field}"]`);
      resetBtn.disabled = locked;
      resetBtn.classList.toggle('eligible', !locked && ov[field] != null); 
    });
  }

  const motionBtn = settingsScreenEl.querySelector('#motionToggle');
  const paintMotion = () => {
    motionBtn.classList.toggle('on', SETTINGS.reducedMotion);
    motionBtn.setAttribute('aria-checked', String(SETTINGS.reducedMotion));
  };
  paintMotion();
  
  motionBtn.addEventListener('click', () => {
    SETTINGS.reducedMotion = !SETTINGS.reducedMotion;
    saveSettings();
    document.body.setAttribute('data-motion', SETTINGS.reducedMotion ? 'reduced' : 'full');
    paintMotion();
    renderGlyphLayer(); 
    const sldGlyph = settingsScreenEl.querySelector('#sldGlyph');
    if (sldGlyph) sldGlyph.disabled = SETTINGS.reducedMotion;
  });

  const matchBtn = settingsScreenEl.querySelector('#matchToggle');
  const paintMatch = () => {
    matchBtn.classList.toggle('on', SETTINGS.matchAccentWall);
    matchBtn.setAttribute('aria-checked', String(SETTINGS.matchAccentWall));
  };
  paintMatch();
  
  matchBtn.addEventListener('click', () => {
    SETTINGS.matchAccentWall = !SETTINGS.matchAccentWall;
    saveSettings();
    paintMatch();
    
    // Sync wall to accent and lock sliders.
    if (look() === 'frost') {
      if (SETTINGS.matchAccentWall && ACCENT_TO_WALL[SETTINGS.accent]) selectWall(ACCENT_TO_WALL[SETTINGS.accent], false);
      else { paintGlassFromWall(); refreshSliderDisplays(); }
    }
    
    // Detach glyph color in TTY mode when matching turns off.
    if (look() === 'tty' && !SETTINGS.matchAccentWall) {
      SETTINGS.glyphFixedColor = accentHex(SETTINGS.accent);
      saveSettings();
    }
  });

  // Custom Wallpaper / TTY Border Dropdowns.
  if (look() === 'frost') {
    const wallPicker = settingsScreenEl.querySelector('#wallPicker');
    const wallDrop = settingsScreenEl.querySelector('#wallDrop');
    const wallVal = settingsScreenEl.querySelector('#wallVal');
    const editCustomWallLink = settingsScreenEl.querySelector('#editCustomWallLink');

    const refreshWallUI = () => {
      wallVal.textContent = wallDisplayLabel(SETTINGS.wall);
      Array.from(wallDrop.children).forEach(c => c.classList.toggle('active', c.dataset.w === SETTINGS.wall));
      const customItem = wallDrop.querySelector('[data-w="custom"]');
      if (customItem) customItem.textContent = SETTINGS.customWallData ? 'custom' : '+ custom';
      editCustomWallLink.classList.toggle('eligible', !!SETTINGS.customWallData);
    };

    wallDrop.innerHTML = WALL_ORDER.map(name =>
      `<div class="drop-item ${name === SETTINGS.wall ? 'active' : ''}" data-w="${name}">${wallDisplayLabel(name)}</div>`
    ).join('') + `<div class="drop-item accent ${SETTINGS.wall === 'custom' ? 'active' : ''}" data-w="custom">${SETTINGS.customWallData ? 'custom' : '+ custom'}</div>`;
    refreshWallUI();

    wallPicker.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = wallDrop.classList.contains('visible');

      document.querySelectorAll('.dropdown.visible').forEach(d => d.classList.remove('visible'));
      document.querySelectorAll('.builder-btn.picker.open').forEach(p => p.classList.remove('open'));

      if (!isVisible) {
        wallDrop.classList.add('visible');
        wallPicker.classList.add('open');
      }
    });

    Array.from(wallDrop.children).forEach(child => {
      child.addEventListener('click', (e) => {
        e.stopPropagation();
        wallDrop.classList.remove('visible');
        wallPicker.classList.remove('open');
        
        // Custom option opens the upload modal if empty.
        if (child.dataset.w === 'custom' && !SETTINGS.customWallData) {
          openWallModal();
          return;
        }
        selectWall(child.dataset.w, true);
      });
    });

    editCustomWallLink.addEventListener('click', (e) => { e.stopPropagation(); openWallModal(); });

    // ---------- Custom wallpaper upload modal ----------
    const wallModalOverlay = document.getElementById('wallModalOverlay');
    const wallModalBody = document.getElementById('wallModalBody');
    const wallFileInput = document.getElementById('wallFileInput');
    const MAX_WALL_MB = 1;
    const MAX_WALL_BYTES = MAX_WALL_MB * 1024 * 1024;
    let pendingWallDataUrl = null;

    function renderWallModalEmpty(errorMsg) {
      wallModalBody.innerHTML = `
        <div class="modal-line"><span class="dim">Images up to ${MAX_WALL_MB}MB —</span> <span class="linklike" id="wallBrowseLink">click to browse</span></div>
        ${errorMsg ? `<div class="modal-error">${errorMsg}</div>` : ''}
      `;
      wallModalBody.querySelector('#wallBrowseLink').addEventListener('click', () => wallFileInput.click());
    }

    // Renders preview for both newly picked and existing custom wallpapers.
    function renderWallModalPreview(dataUrl, mode, errorMsg) {
      const primaryLabel = mode === 'picked' ? 'Save' : 'Replace';
      const secondaryLabel = mode === 'picked' ? 'Cancel' : 'Remove';
      
      wallModalBody.innerHTML = `
        <div class="modal-preview">
          <img src="${dataUrl}" alt="">
          ${errorMsg ? `<div class="modal-error">${errorMsg}</div>` : ''}
          <div class="modal-actions">
            <span class="linklike" id="wallPrimaryBtn">${primaryLabel}</span>
            <span class="fr-clear" id="wallSecondaryBtn">${secondaryLabel}</span>
          </div>
        </div>
      `;
      
      wallModalBody.querySelector('#wallPrimaryBtn').addEventListener('click', () => {
        if (mode === 'picked') {
          SETTINGS.customWallData = pendingWallDataUrl;
          saveSettings();
          selectWall('custom', false);
          refreshWallUI();
          closeWallModal();
        } else {
          wallFileInput.click();
        }
      });
      
      wallModalBody.querySelector('#wallSecondaryBtn').addEventListener('click', () => {
        if (mode === 'picked') {
          pendingWallDataUrl = null;
          renderWallModalEmpty();
        } else {
          SETTINGS.customWallData = null;
          if (SETTINGS.wall === 'custom') selectWall(ACCENT_TO_WALL[SETTINGS.accent] || WALL_ORDER[0], false);
          saveSettings();
          refreshWallUI();
          closeWallModal();
        }
      });
    }

    function openWallModal() {
      pendingWallDataUrl = null;
      if (SETTINGS.customWallData) renderWallModalPreview(SETTINGS.customWallData, 'existing');
      else renderWallModalEmpty();
      wallModalOverlay.removeAttribute('hidden');
    }
    
    function closeWallModal() {
      wallModalOverlay.setAttribute('hidden', '');
    }
    window.openWallModal = openWallModal; 

    wallFileInput.onchange = (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = '';
      if (!file) return;

      const type = file.type;
      if (!['image/jpeg', 'image/png', 'image/webp'].includes(type)) {
        const fallback = SETTINGS.customWallData ? () => renderWallModalPreview(SETTINGS.customWallData, 'existing', `.${file.name.split('.').pop()} isn't a supported image type`) : () => renderWallModalEmpty(`.${file.name.split('.').pop()} isn't a supported image type`);
        fallback();
        return;
      }
      if (file.size > MAX_WALL_BYTES) {
        const fallback = SETTINGS.customWallData ? () => renderWallModalPreview(SETTINGS.customWallData, 'existing', `over the ${MAX_WALL_MB}MB limit`) : () => renderWallModalEmpty(`over the ${MAX_WALL_MB}MB limit`);
        fallback();
        return;
      }

      const reader = new FileReader();
      reader.onload = () => {
        pendingWallDataUrl = reader.result;
        renderWallModalPreview(pendingWallDataUrl, 'picked');
      };
      reader.readAsDataURL(file);
    };

    // ---- Glass sliders
    const sldAlpha = settingsScreenEl.querySelector('#sldAlpha');
    const sldBlur = settingsScreenEl.querySelector('#sldBlur');
    const sldSat = settingsScreenEl.querySelector('#sldSat');
    const sldBW = settingsScreenEl.querySelector('#sldBW');
    const sldBI = settingsScreenEl.querySelector('#sldBI');
    refreshSliderDisplays();

    function touchSlider(field, value) {
      if (SETTINGS.matchAccentWall) return;
      if (!SETTINGS.wallOverrides[SETTINGS.wall]) SETTINGS.wallOverrides[SETTINGS.wall] = {};
      SETTINGS.wallOverrides[SETTINGS.wall][field] = value;
      saveSettings();
      paintGlassFromWall();
      refreshSliderDisplays();
    }

    sldAlpha.addEventListener('input', () => touchSlider('alpha', parseFloat(sldAlpha.value)));
    sldBlur.addEventListener('input', () => touchSlider('blur', parseFloat(sldBlur.value)));
    sldSat.addEventListener('input', () => touchSlider('saturation', parseFloat(sldSat.value)));
    sldBW.addEventListener('input', () => touchSlider('borderWidth', parseFloat(sldBW.value)));
    sldBI.addEventListener('input', () => touchSlider('borderIntensity', parseFloat(sldBI.value)));

    settingsScreenEl.querySelectorAll('.slider-reset').forEach(btn => {
      btn.addEventListener('click', () => {
        const field = btn.dataset.reset;
        const ov = SETTINGS.wallOverrides[SETTINGS.wall];
        if (ov) delete ov[field];
        saveSettings();
        paintGlassFromWall();
        refreshSliderDisplays();
      });
    });

  } else {
    // ---- TTY Appearance wiring ----
    const BORDER_STYLES = ['solid', 'double', 'offset', 'glow'];

    // Hide reset buttons if field is already at default.
    function markEligible(field) {
      const btn = settingsScreenEl.querySelector(`[data-reset-tty="${field}"]`);
      if (btn) btn.classList.toggle('eligible', SETTINGS[field] !== SETTINGS_DEFAULTS[field]);
    }

    const stylePicker = settingsScreenEl.querySelector('#borderStylePicker');
    const styleDrop = settingsScreenEl.querySelector('#borderStyleDrop');
    const styleVal = settingsScreenEl.querySelector('#borderStyleVal');

    styleVal.textContent = SETTINGS.ttyBorderStyle;
    styleDrop.innerHTML = BORDER_STYLES.map(name =>
      `<div class="drop-item ${name === SETTINGS.ttyBorderStyle ? 'active' : ''}" data-s="${name}">${name}</div>`
    ).join('');
    markEligible('ttyBorderStyle');

    stylePicker.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = styleDrop.classList.contains('visible');
      document.querySelectorAll('.dropdown.visible').forEach(d => d.classList.remove('visible'));
      document.querySelectorAll('.builder-btn.picker.open').forEach(p => p.classList.remove('open'));
      if (!isVisible) { styleDrop.classList.add('visible'); stylePicker.classList.add('open'); }
    });

    Array.from(styleDrop.children).forEach(child => {
      child.addEventListener('click', (e) => {
        e.stopPropagation();
        SETTINGS.ttyBorderStyle = child.dataset.s;
        saveSettings();
        paintTtyBorder();
        styleVal.textContent = SETTINGS.ttyBorderStyle;
        Array.from(styleDrop.children).forEach(c => c.classList.toggle('active', c.dataset.s === SETTINGS.ttyBorderStyle));
        markEligible('ttyBorderStyle');
        styleDrop.classList.remove('visible');
        stylePicker.classList.remove('open');
      });
    });

    const sldBezel = settingsScreenEl.querySelector('#sldBezel');
    sldBezel.value = SETTINGS.ttyBezel;
    settingsScreenEl.querySelector('#sldBezelVal').textContent = SETTINGS.ttyBezel + 'px';
    markEligible('ttyBezel');
    sldBezel.addEventListener('input', () => {
      SETTINGS.ttyBezel = parseFloat(sldBezel.value);
      saveSettings();
      settingsScreenEl.querySelector('#sldBezelVal').textContent = SETTINGS.ttyBezel + 'px';
      paintBezel();
      markEligible('ttyBezel');
    });

    const SHADE_NAMES = ['Base', 'Mantle', 'Crust'];
    const sldShade = settingsScreenEl.querySelector('#sldShade');
    sldShade.value = SETTINGS.ttyShade;
    settingsScreenEl.querySelector('#sldShadeVal').textContent = SHADE_NAMES[SETTINGS.ttyShade - 1];
    markEligible('ttyShade');
    sldShade.addEventListener('input', () => {
      SETTINGS.ttyShade = parseInt(sldShade.value, 10);
      saveSettings();
      settingsScreenEl.querySelector('#sldShadeVal').textContent = SHADE_NAMES[SETTINGS.ttyShade - 1];
      paintShade();
      markEligible('ttyShade');
    });

    const sldGlyph = settingsScreenEl.querySelector('#sldGlyph');
    sldGlyph.value = SETTINGS.glyphDensity;
    sldGlyph.disabled = SETTINGS.reducedMotion;
    settingsScreenEl.querySelector('#sldGlyphVal').textContent = SETTINGS.glyphDensity === 0 ? 'Off' : SETTINGS.glyphDensity;
    markEligible('glyphDensity');
    sldGlyph.addEventListener('input', () => {
      SETTINGS.glyphDensity = parseInt(sldGlyph.value, 10);
      saveSettings();
      settingsScreenEl.querySelector('#sldGlyphVal').textContent = SETTINGS.glyphDensity === 0 ? 'Off' : SETTINGS.glyphDensity;
      renderGlyphLayer();
      markEligible('glyphDensity');
    });

    const sldTtyBW = settingsScreenEl.querySelector('#sldTtyBW');
    sldTtyBW.value = SETTINGS.ttyBorderWidth;
    settingsScreenEl.querySelector('#sldTtyBWVal').textContent = SETTINGS.ttyBorderWidth + 'px';
    markEligible('ttyBorderWidth');
    sldTtyBW.addEventListener('input', () => {
      SETTINGS.ttyBorderWidth = parseFloat(sldTtyBW.value);
      saveSettings();
      settingsScreenEl.querySelector('#sldTtyBWVal').textContent = SETTINGS.ttyBorderWidth + 'px';
      paintTtyBorder();
      markEligible('ttyBorderWidth');
    });

    const sldTtyBI = settingsScreenEl.querySelector('#sldTtyBI');
    sldTtyBI.value = SETTINGS.ttyBorderIntensity;
    settingsScreenEl.querySelector('#sldTtyBIVal').textContent = SETTINGS.ttyBorderIntensity + '%';
    markEligible('ttyBorderIntensity');
    sldTtyBI.addEventListener('input', () => {
      SETTINGS.ttyBorderIntensity = parseFloat(sldTtyBI.value);
      saveSettings();
      settingsScreenEl.querySelector('#sldTtyBIVal').textContent = SETTINGS.ttyBorderIntensity + '%';
      paintTtyBorder();
      markEligible('ttyBorderIntensity');
    });
  }

  // ---- Font Weight
  const sldFontWeight = settingsScreenEl.querySelector('#sldFontWeight');
  sldFontWeight.value = SETTINGS.fontWeight[look()];
  settingsScreenEl.querySelector('#sldFontWeightVal').textContent = SETTINGS.fontWeight[look()];
  
  const markFontWeightEligible = () => {
    const btn = settingsScreenEl.querySelector('[data-reset-tty="fontWeight"]');
    if (btn) btn.classList.toggle('eligible', SETTINGS.fontWeight[look()] !== SETTINGS_DEFAULTS.fontWeight[look()]);
  };
  markFontWeightEligible();
  
  sldFontWeight.addEventListener('input', () => {
    SETTINGS.fontWeight[look()] = parseInt(sldFontWeight.value, 10);
    saveSettings();
    settingsScreenEl.querySelector('#sldFontWeightVal').textContent = SETTINGS.fontWeight[look()];
    paintFontWeight();
    markFontWeightEligible();
  });

  wireGenericResets();
}

function wireSettingsPageTwo() {
  // ---- Conversion Defaults
  function markEligibleFlat(field) {
    const btn = settingsScreenEl.querySelector(`[data-reset-tty="${field}"]`);
    if (btn) btn.classList.toggle('eligible', SETTINGS[field] !== SETTINGS_DEFAULTS[field]);
  }

  const filenameTemplateInput = settingsScreenEl.querySelector('#filenameTemplateInput');
  filenameTemplateInput.value = SETTINGS.filenameTemplate;
  filenameTemplateInput.placeholder = SETTINGS_DEFAULTS.filenameTemplate;
  markEligibleFlat('filenameTemplate');
  
  filenameTemplateInput.addEventListener('input', () => {
    SETTINGS.filenameTemplate = filenameTemplateInput.value;
    saveSettings();
    markEligibleFlat('filenameTemplate');
  });

  // Generic dropdown builder for flat options.
  function wireOptionPicker({ pickerId, dropId, valId, field, options, onSelect }) {
    const picker = settingsScreenEl.querySelector(`#${pickerId}`);
    const drop = settingsScreenEl.querySelector(`#${dropId}`);
    const val = settingsScreenEl.querySelector(`#${valId}`);

    const paint = () => {
      val.textContent = SETTINGS[field];
      Array.from(drop.children).forEach(c => c.classList.toggle('active', c.dataset.v === SETTINGS[field]));
    };
    
    drop.innerHTML = options.map(o => `<div class="drop-item ${o === SETTINGS[field] ? 'active' : ''}" data-v="${o}">${o}</div>`).join('');
    paint();
    markEligibleFlat(field);

    picker.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = drop.classList.contains('visible');
      document.querySelectorAll('.dropdown.visible').forEach(d => d.classList.remove('visible'));
      document.querySelectorAll('.builder-btn.picker.open').forEach(p => p.classList.remove('open'));
      if (!isVisible) { drop.classList.add('visible'); picker.classList.add('open'); }
    });

    Array.from(drop.children).forEach(child => {
      child.addEventListener('click', (e) => {
        e.stopPropagation();
        SETTINGS[field] = child.dataset.v;
        saveSettings();
        paint();
        markEligibleFlat(field);
        if (onSelect) onSelect();
        drop.classList.remove('visible');
        picker.classList.remove('open');
      });
    });

    return paint;
  }

  wireOptionPicker({ pickerId: 'resPicker', dropId: 'resDrop', valId: 'resVal', field: 'defaultResolution', options: ['original', '480p', '720p', '1080p'] });
  wireOptionPicker({ pickerId: 'fpsPicker', dropId: 'fpsDrop', valId: 'fpsVal', field: 'defaultFps', options: ['original', '10', '15', '24', '30'] });

  const sldBatchLimit = settingsScreenEl.querySelector('#sldBatchLimit');
  sldBatchLimit.value = SETTINGS.batchSizeLimit;
  settingsScreenEl.querySelector('#sldBatchLimitVal').textContent = SETTINGS.batchSizeLimit + (SETTINGS.batchSizeLimit === 1 ? ' file' : ' files');
  markEligibleFlat('batchSizeLimit');
  
  sldBatchLimit.addEventListener('input', () => {
    SETTINGS.batchSizeLimit = parseInt(sldBatchLimit.value, 10);
    saveSettings();
    settingsScreenEl.querySelector('#sldBatchLimitVal').textContent = SETTINGS.batchSizeLimit + (SETTINGS.batchSizeLimit === 1 ? ' file' : ' files');
    markEligibleFlat('batchSizeLimit');
  });

  wireBackupAndReset();
  wireGenericResets();
}

// Builds the backup payload, splitting Frost and TTY fields.
const SETTINGS_EXPORT_APP_ID = 'terminal-converter';
const SETTINGS_EXPORT_VERSION = 1;

function buildExportPayload() {
  const {
    customWallData,
    wallOverrides, wall,
    ttyBorderStyle, ttyBorderWidth, ttyBorderIntensity, ttyBezel, ttyShade, glyphDensity, glyphFixedColor,
    fontWeight,
    ...shared
  } = SETTINGS;
  
  return {
    app: SETTINGS_EXPORT_APP_ID,
    exportVersion: SETTINGS_EXPORT_VERSION,
    ...shared,
    frost: { wallOverrides, wall, fontWeight: fontWeight.frost },
    tty: { ttyBorderStyle, ttyBorderWidth, ttyBorderIntensity, ttyBezel, ttyShade, glyphDensity, glyphFixedColor, fontWeight: fontWeight.tty },
  };
}

// Validates import payload shape.
const REQUIRED_EXPORT_KEYS = ['accent', 'theme', 'density'];

function validateImportShape(parsed) {
  if (typeof parsed !== 'object' || parsed === null) return "That file isn't valid JSON.";
  if (parsed.app !== SETTINGS_EXPORT_APP_ID) return "That's not a terminal-converter settings file.";
  const missing = REQUIRED_EXPORT_KEYS.filter(k => !(k in parsed));
  if (missing.length) return 'That file is missing expected settings fields.';
  return null;
}

// Flattens imported JSON into the flat SETTINGS shape.
function flattenImportPayload(parsed) {
  const { app, exportVersion, frost: rawFrost, tty: rawTty, ...shared } = parsed || {};
  const frost = (typeof rawFrost === 'object' && rawFrost) || {};
  const tty = (typeof rawTty === 'object' && rawTty) || {};
  
  return {
    ...cloneDefaults(),
    ...shared,
    wallOverrides: (typeof frost.wallOverrides === 'object' && frost.wallOverrides) || {},
    wall: frost.wall || SETTINGS_DEFAULTS.wall,
    ttyBorderStyle: tty.ttyBorderStyle || SETTINGS_DEFAULTS.ttyBorderStyle,
    ttyBorderWidth: tty.ttyBorderWidth ?? SETTINGS_DEFAULTS.ttyBorderWidth,
    ttyBorderIntensity: tty.ttyBorderIntensity ?? SETTINGS_DEFAULTS.ttyBorderIntensity,
    ttyBezel: tty.ttyBezel ?? SETTINGS_DEFAULTS.ttyBezel,
    ttyShade: tty.ttyShade ?? SETTINGS_DEFAULTS.ttyShade,
    glyphDensity: tty.glyphDensity ?? SETTINGS_DEFAULTS.glyphDensity,
    glyphFixedColor: tty.glyphFixedColor ?? null,
    fontWeight: { frost: frost.fontWeight ?? 400, tty: tty.fontWeight ?? 400 },
  };
}

// Applies imported settings live without a reload.
function reapplyAllSettingsLive() {
  document.body.setAttribute('data-look', SETTINGS.theme);
  document.getElementById('btnFrost').classList.toggle('active', SETTINGS.theme === 'frost');
  document.getElementById('btnTty').classList.toggle('active', SETTINGS.theme === 'tty');
  document.getElementById('btnLookSwap').textContent = SETTINGS.theme;
  applySettings();
  updateFavicon();
  renderSettingsPage();
}

// Backup + Reset wiring
function wireBackupAndReset() {
  settingsScreenEl.querySelector('#exportSettingsBtn').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(buildExportPayload(), null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'terminal-converter-settings.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  });

  const importInput = settingsScreenEl.querySelector('#importSettingsInput');

  function showImportStatus(text, isError) {
    const row = settingsScreenEl.querySelector('#importStatusRow');
    const el = settingsScreenEl.querySelector('#importStatusText');
    if (!row || !el) return;
    el.textContent = text;
    el.style.color = isError ? 'var(--role-fail)' : 'var(--role-ok)';
    row.style.display = '';
  }

  settingsScreenEl.querySelector('#importSettingsBtn').addEventListener('click', () => importInput.click());

  importInput.addEventListener('change', (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      let parsed;
      try { parsed = JSON.parse(reader.result); }
      catch (err) { showImportStatus("That file isn't valid JSON.", true); return; }

      const shapeError = validateImportShape(parsed);
      if (shapeError) { showImportStatus(shapeError, true); return; }

      const flattened = flattenImportPayload(parsed);
      const keepCustomWall = SETTINGS.customWallData;
      SETTINGS = { ...flattened, customWallData: keepCustomWall };
      
      saveSettings();
      reapplyAllSettingsLive();
      showImportStatus('Imported — settings updated.', false);
    };
    reader.readAsText(file);
  });

  const resetAllBtn = settingsScreenEl.querySelector('#resetAllBtn');
  const resetConfirmInline = settingsScreenEl.querySelector('#resetConfirmInline');
  
  resetAllBtn.addEventListener('click', () => {
    resetAllBtn.style.display = 'none';
    resetConfirmInline.style.display = '';
  });
  
  settingsScreenEl.querySelector('#resetConfirmNo').addEventListener('click', () => {
    resetConfirmInline.style.display = 'none';
    resetAllBtn.style.display = '';
  });
  
  settingsScreenEl.querySelector('#resetConfirmYes').addEventListener('click', () => {
    SETTINGS = cloneDefaults(); 
    saveSettings();
    reapplyAllSettingsLive();
  });
}

// Wiring for all [data-reset-tty] generic reset buttons.
function wireGenericResets() {
  settingsScreenEl.querySelectorAll('[data-reset-tty]').forEach(btn => {
    btn.addEventListener('click', () => {
      const field = btn.dataset.resetTty;
      
      if (field === 'fontWeight') {
        SETTINGS.fontWeight[look()] = SETTINGS_DEFAULTS.fontWeight[look()];
        saveSettings();
        paintFontWeight();
        sldFontWeight.value = SETTINGS.fontWeight[look()];
        settingsScreenEl.querySelector('#sldFontWeightVal').textContent = SETTINGS.fontWeight[look()];
        markFontWeightEligible();
        return;
      }
      
      SETTINGS[field] = SETTINGS_DEFAULTS[field];
      saveSettings();
      btn.classList.remove('eligible');
      
      if (field === 'ttyBorderStyle') {
        paintTtyBorder();
        settingsScreenEl.querySelector('#borderStyleVal').textContent = SETTINGS.ttyBorderStyle;
        settingsScreenEl.querySelectorAll('#borderStyleDrop .drop-item').forEach(c => c.classList.toggle('active', c.dataset.s === SETTINGS.ttyBorderStyle));
      } else if (field === 'ttyBezel') {
        paintBezel();
        settingsScreenEl.querySelector('#sldBezel').value = SETTINGS.ttyBezel;
        settingsScreenEl.querySelector('#sldBezelVal').textContent = SETTINGS.ttyBezel + 'px';
      } else if (field === 'ttyShade') {
        paintShade();
        settingsScreenEl.querySelector('#sldShade').value = SETTINGS.ttyShade;
        settingsScreenEl.querySelector('#sldShadeVal').textContent = ['Base', 'Mantle', 'Crust'][SETTINGS.ttyShade - 1];
      } else if (field === 'glyphDensity') {
        renderGlyphLayer();
        settingsScreenEl.querySelector('#sldGlyph').value = SETTINGS.glyphDensity;
        settingsScreenEl.querySelector('#sldGlyphVal').textContent = SETTINGS.glyphDensity === 0 ? 'Off' : SETTINGS.glyphDensity;
      } else if (field === 'ttyBorderWidth') {
        paintTtyBorder();
        settingsScreenEl.querySelector('#sldTtyBW').value = SETTINGS.ttyBorderWidth;
        settingsScreenEl.querySelector('#sldTtyBWVal').textContent = SETTINGS.ttyBorderWidth + 'px';
      } else if (field === 'ttyBorderIntensity') {
        paintTtyBorder();
        settingsScreenEl.querySelector('#sldTtyBI').value = SETTINGS.ttyBorderIntensity;
        settingsScreenEl.querySelector('#sldTtyBIVal').textContent = SETTINGS.ttyBorderIntensity + '%';
      } else if (field === 'filenameTemplate') {
        settingsScreenEl.querySelector('#filenameTemplateInput').value = SETTINGS.filenameTemplate;
      } else if (field === 'defaultResolution') {
        settingsScreenEl.querySelector('#resVal').textContent = SETTINGS.defaultResolution;
        settingsScreenEl.querySelectorAll('#resDrop .drop-item').forEach(c => c.classList.toggle('active', c.dataset.v === SETTINGS.defaultResolution));
      } else if (field === 'defaultFps') {
        settingsScreenEl.querySelector('#fpsVal').textContent = SETTINGS.defaultFps;
        settingsScreenEl.querySelectorAll('#fpsDrop .drop-item').forEach(c => c.classList.toggle('active', c.dataset.v === SETTINGS.defaultFps));
      } else if (field === 'batchSizeLimit') {
        settingsScreenEl.querySelector('#sldBatchLimit').value = SETTINGS.batchSizeLimit;
        settingsScreenEl.querySelector('#sldBatchLimitVal').textContent = SETTINGS.batchSizeLimit + (SETTINGS.batchSizeLimit === 1 ? ' file' : ' files');
      }
    });
  });
}

function tickClock() {
  const d = new Date();
  let h = d.getHours();
  const m = String(d.getMinutes()).padStart(2, '0');
  const ampm = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  h = h ? h : 12; 
  
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const mos = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  
  const dayStr = days[d.getDay()];
  const dateStr = String(d.getDate()).padStart(2, '0');
  const moStr = mos[d.getMonth()];

  document.getElementById('clock').textContent = `${String(h).padStart(2, '0')}:${m} ${ampm} | ${dayStr} ${dateStr} ${moStr}`;
}
tickClock(); 
setInterval(tickClock, 15000);

// Rotate-to-landscape hint — one-time nudge.
(function() {
  const hint = document.getElementById('rotateHint');
  if (localStorage.getItem('rotateHintDismissed') === 'true') hint.classList.add('dismissed');
  document.getElementById('rotateHintClose').addEventListener('click', () => {
    hint.classList.add('dismissed');
    localStorage.setItem('rotateHintDismissed', 'true');
  });
})();

// Bootstrap: load settings and paint before rendering.
loadSettings();
document.body.setAttribute('data-look', SETTINGS.theme);
document.getElementById('btnFrost').classList.toggle('active', SETTINGS.theme === 'frost');
document.getElementById('btnTty').classList.toggle('active', SETTINGS.theme === 'tty');
document.getElementById('btnLookSwap').textContent = SETTINGS.theme;
applySettings();

// Fetch backend config and format registry.
let APP_MODE = 'local';
let CACHED_GROUPS = null;

fetch('/api/formats')
  .then(r => r.json())
  .then(data => {
    if (data.mode) APP_MODE = data.mode;
    if (data.groups) CACHED_GROUPS = data.groups;
  })
  .catch(() => { })
  .finally(() => {
    FETCH_DATA.session = `${window.location.port || (window.location.protocol === 'https:' ? 443 : 80)} · ${APP_MODE}`;
    boot(false);
  });

// Hydrate history from the server.
fetch('/api/jobs')
  .then(r => r.json())
  .then(data => {
    (data.jobs || []).forEach(job => {
      HISTORY.push(...historyRowsFromJob(job, formatRelativeTime(job.created_at)));
    });
  })
  .catch(() => { });