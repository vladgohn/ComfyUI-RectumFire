import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

/**
 * Fire Timer (flat, 2-state, canvas-only).
 * - RUNNING / STOPPED themes
 * - Smooth theme transition (canvas color lerp)
 * - Blinking colons (mm:ss and ss:ms) in sync, smooth 1 Hz
 *
 * FIX:
 * - Timer no longer resets on stop/end.
 * - It freezes on final elapsed time and holds it.
 * - Reset happens only on the next execution_start (new run).
 */
// ---------------- eyes (png overlay drawn on node canvas) ----------------
const EYES_ASSET = {
  srcW: 86,
  srcH: 67,

  // FIXED draw size in canvas pixels (no scaling with node size)
  drawW: 86/1.7,      // 86/2
  drawH: 67/1.7,      // 67/2

  // pupil dx in SOURCE pixels, converted to draw pixels by (drawW/srcW)
  dxSrcMax: 13,

  halfCycleMs: 500,
  pow: 6,

  // Anchor constants (canvas px)
  padRight: 10,
  popOutPx: 45,   // tune this only

  baseImg: null,
  pupilImg: null,
  loaded: false,

  lastDx: 0,
};

function easeInOutPow(t, p = 6) {
  t = Math.max(0, Math.min(1, t));
  if (t < 0.5) return 0.5 * Math.pow(2 * t, p);
  return 1 - 0.5 * Math.pow(2 * (1 - t), p);
}

function loadEyesAssetsOnce() {
  if (EYES_ASSET._loading) return EYES_ASSET._loading;

  EYES_ASSET._loading = (async () => {
    // IMPORTANT: works regardless of where extension is mounted
    const baseUrl = new URL("./assets/Eyes.png", import.meta.url).toString();
    const pupilUrl = new URL("./assets/Pupil.png", import.meta.url).toString();

    const load = (url) =>
      new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = reject;
        img.src = url;
      });

    try {
      EYES_ASSET.baseImg = await load(baseUrl);
      EYES_ASSET.pupilImg = await load(pupilUrl);
      EYES_ASSET.loaded = true;
    } catch (_) {
      EYES_ASSET.loaded = false;
    }
  })();

  return EYES_ASSET._loading;
}

function getEyesDx(nowMs, running) {
  if (!running) return EYES_ASSET.lastDx;

  const phase = nowMs % (EYES_ASSET.halfCycleMs * 2);
  let t = (phase % EYES_ASSET.halfCycleMs) / EYES_ASSET.halfCycleMs;
  t = easeInOutPow(t, EYES_ASSET.pow);

  const goingRight = phase < EYES_ASSET.halfCycleMs;
  const dx = goingRight
    ? (EYES_ASSET.dxSrcMax * t)
    : (EYES_ASSET.dxSrcMax * (1 - t));

  EYES_ASSET.lastDx = dx;
  return dx;
}

function drawEyes(ctx, node, w, h, nowMs) {
  if (!EYES_ASSET.loaded || !EYES_ASSET.baseImg || !EYES_ASSET.pupilImg) return;

  // Prefer real node size (stable)
  const nw = (node && node.size && node.size[0]) ? node.size[0] : w;

  const dw = EYES_ASSET.drawW;
  const dh = EYES_ASSET.drawH;

  // Right-top anchor (fixed)
  const x = nw - EYES_ASSET.padRight - dw;
  const y = -EYES_ASSET.popOutPx;

  const running = !!node._rf_running;
  const dxSrc = getEyesDx(nowMs, running);

  // Convert dx from source px -> draw px
  const dx = dxSrc * (dw / EYES_ASSET.srcW);

  ctx.drawImage(EYES_ASSET.baseImg, x, y, dw, dh);
  ctx.drawImage(EYES_ASSET.pupilImg, x + dx, y, dw, dh);
};

// ---------------- fire note utils (also used by fire copy/paste) ----------------
const STYLE = {
  running: { bg: "#EDEDED", text: "#1E1E20" },
  stopped: { bg: "#282829", text: "#EDEDED" },
  drawer: {
    bg: "#1F232B",
    line: "rgba(255,255,255,0.08)",
    gpu: "#FF6506",
    date: "#E3B6FF",
    value: "#F1F3F5",
  },

  fontFamily:
    `"Roboto Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, "Liberation Mono", monospace`,
  fontWeight: 400,

  padding: 6,
  radius: 8,

  defaultW: 140,
  defaultH: 50,
  expandedH: 138,
  displayH: 50,

  tickMs: 60,

  // Visual behavior
  transitionMs: 260, // theme fade time (ms)
  blinkHz: 1, // 1 blink per second
  blinkMinAlpha: 0.15, // colons never fully disappear

  // Block layout tuning (em-like, multiplied by fontSize)
  blockGapEm: -0.02, // gap between blocks (MM : SS : MS)
  colonGapEm: -0.02, // extra breathing space around colons
};

(function ensureRobotoMono() {
  const id = "rf-roboto-mono";
  if (document.getElementById(id)) return;

  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=Roboto+Mono:wght@400;500;600&display=swap";
  document.head.appendChild(link);

  try {
    document.fonts?.load?.(`${STYLE.fontWeight} 24px ${STYLE.fontFamily}`);
  } catch (_) { }
})();

// ---------------- utils ----------------
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function roundRectPath(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  if (r <= 0) {
    ctx.rect(x, y, w, h);
    ctx.closePath();
    return;
  }
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fitFontSize(ctx, text, maxW, maxH) {
  let size = Math.floor(maxH * 0.78);
  size = clamp(size, 10, 512);

  ctx.font = `${STYLE.fontWeight} ${size}px ${STYLE.fontFamily}`;
  const w = ctx.measureText(text).width || 1;

  const scale = maxW / w;
  const corrected = Math.floor(size * scale);

  return Math.floor(clamp(Math.min(corrected, Math.floor(maxH * 0.95)), 10, 512));
}

function hexToRgb(hex) {
  const h = String(hex || "").replace("#", "").trim();
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h.slice(0, 6);
  const n = parseInt(full.padEnd(6, "0"), 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function mixRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

function rgbToCss({ r, g, b }) {
  return `rgb(${r},${g},${b})`;
}

function easeInOut(t) {
  return t * t * (3 - 2 * t);
}

function blinkAlpha(nowMs) {
  const t = (nowMs / 1000) * STYLE.blinkHz;
  const s = (Math.sin(t * Math.PI * 2) + 1) * 0.5; // 0..1
  return STYLE.blinkMinAlpha + (1 - STYLE.blinkMinAlpha) * s;
}

function setNodeSizeForMode(node) {
  if (!node) return;
  const w = STYLE.defaultW;
  const h = node._rf_expanded ? STYLE.expandedH : STYLE.defaultH;
  node.size = [w, h];
  node.setSize?.(node.size);
}

function formatStampDate(date = new Date()) {
  const day = String(date.getDate()).padStart(2, "0");
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  const month = months[date.getMonth()] || "JAN";
  const year = String(date.getFullYear()).slice(-2);
  return `${day}/${month}/${year}`;
}

function cleanGpuName(raw) {
  let s = String(raw || "").trim();
  if (!s) return "GPU UNKNOWN";

  s = s.replace(/^cuda:\d+\s*/i, "");
  s = s.replace(/^gpu:\d+\s*/i, "");
  s = s.replace(/\bNVIDIA\s+/i, "");
  s = s.replace(/\bGeForce\s+/i, "");
  s = s.replace(/\s+GPU\b/i, "");
  s = s.replace(/\s+/g, " ").trim();

  const rtx = s.match(/\bRTX\s+\d{3,4}(?:\s+Ti)?(?:\s+SUPER)?(?:\s+Laptop)?\b/i);
  if (rtx) return rtx[0].replace(/\bRTX\s+(\d{3,4})\b/i, "RTX$1").replace(/\s+/g, " ").trim();

  const gtx = s.match(/\bGTX\s+\d{3,4}(?:\s+Ti)?(?:\s+SUPER)?(?:\s+Laptop)?\b/i);
  if (gtx) return gtx[0].replace(/\bGTX\s+(\d{3,4})\b/i, "GTX$1").replace(/\s+/g, " ").trim();

  return s;
}

function normalizeVram(raw) {
  if (typeof raw !== "number" || !isFinite(raw) || raw <= 0) return "";

  let gb = 0;
  if (raw > 1024 * 1024 * 1024) gb = raw / (1024 * 1024 * 1024);
  else if (raw > 1024 * 1024) gb = raw / (1024 * 1024);
  else if (raw > 1024) gb = raw / 1024;
  else gb = raw;

  const rounded = Math.max(1, Math.round(gb));
  return `${rounded}G`;
}

async function getHardwareStamp() {
  if (window.__rf_timer_hw__) return window.__rf_timer_hw__;

  const fallback = { gpu: "GPU UNKNOWN", vram: "" };

  try {
    const resp = api.fetchApi
      ? await api.fetchApi("/system_stats")
      : await fetch("/system_stats");
    if (!resp?.ok) {
      window.__rf_timer_hw__ = fallback;
      return fallback;
    }

    const data = await resp.json();
    const devices = Array.isArray(data?.devices) ? data.devices : Array.isArray(data?.system?.devices) ? data.system.devices : [];
    const preferred = devices.find((d) => String(d?.type || d?.name || "").toLowerCase().includes("cuda")) || devices[0];

    if (!preferred) {
      window.__rf_timer_hw__ = fallback;
      return fallback;
    }

    const gpuRaw =
      preferred.device_name ??
      preferred.gpu_name ??
      preferred.name ??
      preferred.type ??
      "GPU UNKNOWN";

    const gpu = cleanGpuName(gpuRaw);
    const rawVram =
      preferred.vram_total ??
      preferred.vram_total_bytes ??
      preferred.total_vram ??
      preferred.total_memory ??
      preferred.vram_total_mb ??
      preferred.memory_total ??
      null;
    const vram = normalizeVram(rawVram);

    window.__rf_timer_hw__ = { gpu, vram };
    return window.__rf_timer_hw__;
  } catch (_) {
    window.__rf_timer_hw__ = fallback;
    return fallback;
  }
}

function getGpuLine(node) {
  const gpu = String(node?._rf_hw_gpu || "GPU UNKNOWN").trim();
  const vram = String(node?._rf_hw_vram || "").trim();
  return vram ? `${gpu} ${vram}` : gpu;
}

function fitSingleLine(ctx, text, maxW, fontPx, weight = 600) {
  let size = fontPx;
  while (size > 8) {
    ctx.font = `${weight} ${size}px ${STYLE.fontFamily}`;
    if ((ctx.measureText(text).width || 0) <= maxW) return size;
    size -= 1;
  }
  return 8;
}

function pushRunHistory(node, elapsedStr) {
  if (!node) return;
  const nextEntry = {
    date: formatStampDate(new Date()),
    value: elapsedStr,
  };

  const prev = Array.isArray(node._rf_run_history) ? node._rf_run_history : [];
  const sameTop = prev[0] && prev[0].date === nextEntry.date && prev[0].value === nextEntry.value;
  if (sameTop) return;

  node._rf_run_history = [nextEntry, ...prev].slice(0, 3);
  node.properties = node.properties || {};
  node.properties.rf_run_history = node._rf_run_history;
}

function setNodeRunning(node, running) {
  const prev = !!node._rf_running;
  const next = !!running;
  if (prev === next) {
    node._rf_running = next;
    return;
  }

  const fromTheme = prev ? STYLE.running : STYLE.stopped;
  const toTheme = next ? STYLE.running : STYLE.stopped;

  node._rf_running = next;
  node._rf_themeFade = {
    t0: Date.now(),
    from: { bg: hexToRgb(fromTheme.bg), text: hexToRgb(fromTheme.text) },
    to: { bg: hexToRgb(toTheme.bg), text: hexToRgb(toTheme.text) },
  };
}

function getNodeTheme(node, nowMs) {
  const runningTheme = node._rf_running ? STYLE.running : STYLE.stopped;
  const fade = node._rf_themeFade;

  if (!fade) {
    return { bgCss: runningTheme.bg, textCss: runningTheme.text };
  }

  const tRaw = (nowMs - fade.t0) / STYLE.transitionMs;
  const t = clamp(tRaw, 0, 1);
  const te = easeInOut(t);

  const bg = mixRgb(fade.from.bg, fade.to.bg, te);
  const text = mixRgb(fade.from.text, fade.to.text, te);

  if (t >= 1) node._rf_themeFade = null;

  return { bgCss: rgbToCss(bg), textCss: rgbToCss(text) };
}

// ---------------- timer core ----------------
// Title animation (Braille "equalizer" style)
// Single-cell braille frames (looks like a tiny level meter / activity noise)
const TITLE_FRAMES = [
  "⣀","⣄","⣆","⣇","⣧","⣷","⣿","⣾","⣽","⣻","⢿","⡿","⠿","⠾","⠽","⠻","⠟","⠏","⠋","⠉",
];

function titleFrameAt(nowMs) {
  // 90ms cadence feels snappy but not epileptic
  return TITLE_FRAMES[Math.floor(nowMs / 90) % TITLE_FRAMES.length];
}

function setTitleAnimated(node, nowMs) {
  // Keep it tiny (3-4 glyph budget). Flame + 1 braille cell.
  const t = `🔥${titleFrameAt(nowMs)}`;
  if (node.title !== t) node.title = t;
}

function setTitleIdle(node) {
  // No word/title when idle. Keep a single glyph so the header area stays consistent.
  const t = "🔥";
  if (node.title !== t) node.title = t;
}

const Timer = {
  startTime: 0,
  elapsedMs: 0,
  intervalId: null,
  running: false,
  nodes: new Set(),

  // MM:SS:CC (centiseconds, 00..99)
  format(ms) {
    if (ms < 0) ms = 0;

    const m = String(Math.floor(ms / 60000)).padStart(2, "0");
    const s = String(Math.floor((ms % 60000) / 1000)).padStart(2, "0");

    // 0..99 (ms / 10)
    const cs = String(Math.floor((ms % 1000) / 10)).padStart(2, "0");

    return `${m}:${s}:${cs}`;
  },

  tick() {
    // Update elapsed based on current run start
    const now = Date.now();
    this.elapsedMs = now - this.startTime;

    const str = this.format(this.elapsedMs);
    for (const n of this.nodes) {
      n._rf_timerStr = str;
      setNodeRunning(n, true);
      setTitleAnimated(n, now);
    }

    try {
      app.graph?.setDirtyCanvas(true, true);
    } catch (_) { }
  },

  start() {
    if (this.running) return;
    this.running = true;

    // Reset ONLY on new run
    this.elapsedMs = 0;
    this.startTime = Date.now();

    // Optional: immediately show zeros
    for (const n of this.nodes) {
      n._rf_timerStr = this.format(0);
      setNodeRunning(n, true);
      setTitleAnimated(n, Date.now());
    }

    this.intervalId = setInterval(() => this.tick(), 200);
    this.tick();
  },

  stop() {
    if (!this.running) return;
    this.running = false;

    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Freeze on last value, mark nodes stopped
    const str = this.format(this.elapsedMs);
    for (const n of this.nodes) {
      n._rf_timerStr = str;
      setNodeRunning(n, false);
      setTitleIdle(n);
      pushRunHistory(n, str);
    }

    try {
      app.graph?.setDirtyCanvas(true, true);
    } catch (_) { }
  },
};

// ---------------- timer manager (handles multiple nodes, theme, etc) ----------------
// const TimerManager = {
//   start() {
//     if (this.running) return;

//     // Reset ONLY here (new run)
//     this.running = true;
//     this.elapsedMs = 0;
//     this.startTime = Date.now();

//     // Immediately show 00:00:000 at start
//     for (const n of this.nodes) {
//       n._rf_timerStr = "00:00:000";
//       setNodeRunning(n, true);
//     }

//     this.intervalId = setInterval(() => this.tick(), STYLE.tickMs);

//     try {
//       app.graph?.setDirtyCanvas(true, true);
//     } catch (_) { }
//   },

//   stop() {
//     if (!this.running) return;

//     this.running = false;

//     try {
//       if (this.intervalId != null) clearInterval(this.intervalId);
//     } catch (_) { }
//     this.intervalId = null;

//     // Freeze final elapsed time (do NOT reset here)
//     this.elapsedMs = Math.max(0, Date.now() - this.startTime);
//     const str = this.format(this.elapsedMs);

//     for (const n of this.nodes) {
//       n._rf_timerStr = str;
//       setNodeRunning(n, false);
//     }

//     try {
//       app.graph?.setDirtyCanvas(true, true);
//     } catch (_) { }
//   },

//   register(n) {
//     this.nodes.add(n);

//     // Ensure node has something to show, but don't force reset
//     if (!n._rf_timerStr) n._rf_timerStr = this.format(this.elapsedMs || 0);
//     if (n._rf_running == null) n._rf_running = false;
//   },

//   unregister(n) {
//     this.nodes.delete(n);
//   },
// };

// ---------------- detection ----------------
function isOurTimerNode(nodeOrType) {
  const t = String(nodeOrType?.type || nodeOrType || "").toLowerCase();
  return t.includes("fire") && t.includes("timer");
}

// ---------------- patch node type ----------------
function patchNodeType(nodeType) {
  if (!nodeType || nodeType.__rf_timer_type_patched) return;
  nodeType.__rf_timer_type_patched = true;

  const origOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    try {
      // Set compact default for newly added nodes.
      // Saved workflow sizes are applied later by Comfy/LiteGraph configure path.
      this.properties = this.properties || {};
      this._rf_expanded = !!(this.properties.rf_expanded ?? false);
      this._rf_run_history = Array.isArray(this.properties.rf_run_history) ? this.properties.rf_run_history.slice(0, 3) : [];
      this._rf_hw_gpu = String(this.properties.rf_hw_gpu || "");
      this._rf_hw_vram = String(this.properties.rf_hw_vram || "");
      setNodeSizeForMode(this);

      // Default string: show last known elapsed (or zeros)
      this._rf_timerStr = this._rf_timerStr || Timer.format(Timer.elapsedMs || 0);
      this._rf_running = !!this._rf_running;
      this._rf_themeFade = null;

      Timer.nodes.add(this);

      try {
        this.title = "🔥";
        if (typeof LiteGraph !== "undefined" && LiteGraph.NO_TITLE != null) {
          this.title_mode = LiteGraph.NO_TITLE;
        } else {
          this.title_mode = 2;
        }
        this.title_color = "transparent";
        this.titleTextColor = "transparent";
      } catch (_) { }

      getHardwareStamp().then((info) => {
        this._rf_hw_gpu = info?.gpu || "GPU UNKNOWN";
        this._rf_hw_vram = info?.vram || "";
        this.properties.rf_hw_gpu = this._rf_hw_gpu;
        this.properties.rf_hw_vram = this._rf_hw_vram;
        this.setDirtyCanvas?.(true, true);
      }).catch(() => {});
    } catch (_) { }

    return origOnNodeCreated?.apply(this, arguments);
  };

  const origOnConfigure = nodeType.prototype.onConfigure;
  nodeType.prototype.onConfigure = function () {
    const r = origOnConfigure?.apply(this, arguments);
    try {
      this.properties = this.properties || {};
      this._rf_expanded = !!(this.properties.rf_expanded ?? this._rf_expanded ?? false);
      this._rf_run_history = Array.isArray(this.properties.rf_run_history) ? this.properties.rf_run_history.slice(0, 3) : (this._rf_run_history || []);
      this._rf_hw_gpu = String(this.properties.rf_hw_gpu || this._rf_hw_gpu || "");
      this._rf_hw_vram = String(this.properties.rf_hw_vram || this._rf_hw_vram || "");
      setNodeSizeForMode(this);
    } catch (_) {}
    return r;
  };

  const origOnSerialize = nodeType.prototype.onSerialize;
  nodeType.prototype.onSerialize = function (o) {
    const r = origOnSerialize?.apply(this, arguments);
    try {
      o.properties = o.properties || {};
      o.properties.rf_expanded = !!this._rf_expanded;
      o.properties.rf_run_history = Array.isArray(this._rf_run_history) ? this._rf_run_history.slice(0, 3) : [];
      o.properties.rf_hw_gpu = String(this._rf_hw_gpu || "");
      o.properties.rf_hw_vram = String(this._rf_hw_vram || "");
    } catch (_) {}
    return r;
  };

  const origOnRemoved = nodeType.prototype.onRemoved;
  nodeType.prototype.onRemoved = function () {
    try {
      Timer.unregister(this);
    } catch (_) { }
    return origOnRemoved?.apply(this, arguments);
  };

  const origOnMouseDown = nodeType.prototype.onMouseDown;
  nodeType.prototype.onMouseDown = function (e, pos, graphCanvas) {
    try {
      const localY = Array.isArray(pos) ? pos[1] : null;
      if (typeof localY === "number" && localY >= 0 && localY <= STYLE.displayH) {
        this._rf_expanded = !this._rf_expanded;
        this.properties = this.properties || {};
        this.properties.rf_expanded = this._rf_expanded;
        setNodeSizeForMode(this);
        this.setDirtyCanvas?.(true, true);
        graphCanvas?.setDirty?.(true, true);
        return true;
      }
    } catch (_) {}
    return origOnMouseDown?.apply(this, arguments);
  };

  const origOnDrawForeground = nodeType.prototype.onDrawForeground;
  nodeType.prototype.onDrawForeground = function (ctx) {
    const w = this.size?.[0] || 0;
    const h = this.size?.[1] || 0;
    if (!w || !h) return;

    const now = Date.now();
    const theme = getNodeTheme(this, now);

    ctx.save();
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    const displayH = STYLE.displayH;

    // Background
    if (this._rf_expanded) {
      ctx.fillStyle = STYLE.drawer.bg;
      roundRectPath(ctx, 0, 0, w, h, STYLE.radius);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, w, displayH);
      ctx.clip();
      ctx.fillStyle = theme.bgCss;
      roundRectPath(ctx, 0, 0, w, displayH + STYLE.radius, STYLE.radius);
      ctx.fill();
      ctx.restore();
    } else {
      ctx.fillStyle = theme.bgCss;
      roundRectPath(ctx, 0, 0, w, h, STYLE.radius);
      ctx.fill();
    }

    // Text blocks: MM | : | SS | : | MS
    const pad = STYLE.padding;
    const raw = this._rf_timerStr || "00:00:000";

    const mm = raw.slice(0, 2);
    const c1 = raw.slice(2, 3); // :
    const ss = raw.slice(3, 5);
    const c2 = raw.slice(5, 6); // :
    const tail = raw.slice(6); // :MMM
    const ms = tail.startsWith(":") ? tail.slice(1) : tail;

    const maxW = Math.max(1, w - pad * 2);
    const maxH = Math.max(1, displayH - pad * 2);
    const fontSize = fitFontSize(ctx, raw, maxW, maxH);

    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.font = `${STYLE.fontWeight} ${fontSize}px ${STYLE.fontFamily}`;
    ctx.fillStyle = theme.textCss;

    const blinkA = this._rf_running ? blinkAlpha(now) : 1;

    const blockGap = Math.round(fontSize * (STYLE.blockGapEm ?? 0));
    const colonGap = Math.round(fontSize * (STYLE.colonGapEm ?? 0));

    const blocks = [
      { text: mm, alpha: 1, gapAfter: blockGap },
      { text: c1, alpha: blinkA, gapBefore: colonGap, gapAfter: colonGap + blockGap },
      { text: ss, alpha: 1, gapAfter: blockGap },
      { text: c2, alpha: blinkA, gapBefore: colonGap, gapAfter: colonGap + blockGap },
      { text: ms, alpha: 1, gapAfter: 0 },
    ];

    let total = 0;
    for (const b of blocks) {
      const gb = b.gapBefore || 0;
      const ga = b.gapAfter || 0;
      total += gb + (ctx.measureText(b.text).width || 0) + ga;
    }

    let x = w * 0.5 - total * 0.5;
    const y = displayH * 0.5;

    for (const b of blocks) {
      x += b.gapBefore || 0;
      ctx.globalAlpha = b.alpha ?? 1;
      ctx.fillText(b.text, x, y);
      x += (ctx.measureText(b.text).width || 0) + (b.gapAfter || 0);
    }
    ctx.globalAlpha = 1;
    // Eyes overlay (can draw outside node via negative Y)
    drawEyes(ctx, this, w, h, performance.now());

    if (this._rf_expanded) {
      const panelY = displayH;

      ctx.strokeStyle = STYLE.drawer.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(8, panelY + 0.5);
      ctx.lineTo(w - 8, panelY + 0.5);
      ctx.stroke();

      const gpuText = getGpuLine(this);
      const gpuFont = fitSingleLine(ctx, gpuText, w - 20, 9, 700);
      ctx.font = `700 ${gpuFont}px ${STYLE.fontFamily}`;
      ctx.textAlign = "right";
      ctx.textBaseline = "top";
      ctx.fillStyle = STYLE.drawer.gpu;
      ctx.fillText(gpuText, w - 10, panelY + 10);

      const history = Array.isArray(this._rf_run_history) ? this._rf_run_history : [];
      const rowStart = panelY + 36;
      const rowStep = 17;

      for (let i = 0; i < 3; i++) {
        const item = history[i];
        const rowY = rowStart + i * rowStep;
        const dateText = item?.date || "-- --- --";
        const valueText = item?.value || "--:--:--";

        ctx.font = `500 8px ${STYLE.fontFamily}`;
        ctx.textAlign = "left";
        ctx.fillStyle = STYLE.drawer.date;
        ctx.fillText(dateText, 10, rowY);

        ctx.font = `500 8px ${STYLE.fontFamily}`;
        ctx.textAlign = "right";
        ctx.fillStyle = STYLE.drawer.value;
        ctx.fillText(valueText, w - 10, rowY);
      }

    }
    ctx.restore();

    return origOnDrawForeground?.apply(this, arguments);
  };
}

// ---------------- extension ----------------
app.registerExtension({
  name: "RectumFireTimer",

  beforeRegisterNodeDef(nodeType, nodeData) {
    try {
      const name = String(nodeData?.name || nodeType?.type || "").toLowerCase();
      if (name.includes("fire") && name.includes("timer")) patchNodeType(nodeType);
    } catch (_) { }
  },

  init() {
    try {
      loadEyesAssetsOnce();
      const nodes = app.graph?._nodes || [];
      for (const n of nodes) {
        if (isOurTimerNode(n)) Timer.register(n);
      }

      // Ensure any existing nodes reflect current running state
      for (const n of Timer.nodes) {
        setNodeRunning(n, Timer.running);
      }

      app.graph?.setDirtyCanvas(true, true);
    } catch (_) { }
  },
});

// ---------------- execution events ----------------
api.addEventListener("execution_start", () => Timer.start());
api.addEventListener("executing", ({ detail }) => {
  // ComfyUI convention: detail === null means execution ended
  if (detail === null) Timer.stop();
});
api.addEventListener("execution_error", () => Timer.stop());
api.addEventListener("execution_interrupted", () => Timer.stop());
