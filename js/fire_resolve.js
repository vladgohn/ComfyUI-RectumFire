// FireResolve — RectumFire DOM tosters + node coloring
// Hotkey: Shift+Alt+R (raw keydown; robust listener attach)

import { app } from "../../scripts/app.js";
import { firetosterShow } from "./fire_toster.js";

const RF = Object.freeze({
  EXT_NAME: "RectumFire.FireResolve",
  // IMPORTANT: do NOT use the old guard as an early-return gate.
  // Use a dedicated listener guard so updates can't "brick" the handler.
  LISTENER_GUARD: "__rf_fire_resolve_listener_attached__",
  HOTKEY: { key: "r", shiftKey: true, altKey: true },
});

const MARK = Object.freeze({
  green: { bg: "#0A2616", stroke: "#114A29", fg: "#22C55E" },
  violet: { bg: "#171524", stroke: "#624B89", fg: "#8F60F4" },
  magenta: { bg: "#2D0C20", stroke: "#901F4A", fg: "#DC6C98" },
});

function basename(p) {
  if (!p || typeof p !== "string") return "";
  const t = p.replaceAll("\\", "/");
  const parts = t.split("/");
  return parts[parts.length - 1] || "";
}

function isComboWidget(w) {
  return !!(w && w.options && Array.isArray(w.options.values) && w.options.values.length);
}

function toCandidateStrings(v) {
  if (typeof v === "string") return [v];
  if (v == null) return [];
  if (typeof v === "number" || typeof v === "boolean") return [String(v)];
  if (Array.isArray(v)) {
    const out = [];
    for (const x of v) out.push(...toCandidateStrings(x));
    return out;
  }
  if (typeof v === "object") {
    const out = [];
    // Common option object shapes from custom widgets.
    for (const k of ["value", "name", "title", "label", "content", "text", "path", "file"]) {
      if (k in v) out.push(...toCandidateStrings(v[k]));
    }
    return out;
  }
  return [];
}

function getSelectedNodeSafe() {
  const cnv = app?.canvas;

  // 1) Classic: selected_nodes map
  const selMap = cnv?.selected_nodes;
  if (selMap && typeof selMap === "object") {
    const keys = Object.keys(selMap);
    if (keys.length) return selMap[keys[0]] || null;
  }

  // 2) Fallback: current_node
  if (cnv?.current_node) return cnv.current_node;

  // 3) Legacy: selected_node
  if (cnv?.selected_node) return cnv.selected_node;

  return null;
}

function getWidgetByName(node, name) {
  if (!node || !Array.isArray(node.widgets) || !name) return null;
  for (const w of node.widgets) {
    if (w && w.name === name) return w;
  }
  return null;
}

function isLikelyModelText(value) {
  const v = String(value || "").toLowerCase();
  if (!v) return false;
  if (v.includes("/") || v.includes("\\")) return true;
  const exts = [".safetensors", ".gguf", ".ckpt", ".pt", ".pth", ".bin", ".onnx"];
  return exts.some((ext) => v.includes(ext));
}

function comboHasLikelyModelValues(widget) {
  if (!isComboWidget(widget)) return false;
  const vals = widget.options.values || [];
  let checked = 0;
  for (const v of vals) {
    const strings = toCandidateStrings(v);
    for (const s of strings) {
      checked += 1;
      if (isLikelyModelText(s)) return true;
      if (checked >= 120) break; // avoid scanning huge lists fully every keypress
    }
    if (checked >= 120) break;
  }
  return false;
}

function findPathWidgets(node) {
  if (!node || !Array.isArray(node.widgets)) return [];

  const out = [];
  const used = new Set();
  const preferred = ["lora_name", "lora", "lora_1", "lora_2", "loras", "lora_model", "unet_name", "clip_name", "vae_name", "model_name", "ckpt_name", "checkpoint", "path", "file", "control_net_name"];

  const add = (w) => {
    if (!w || used.has(w)) return;
    const isCombo = isComboWidget(w);
    const hasStringValue = typeof w.value === "string";
    const looksLikeModelString = hasStringValue && isLikelyModelText(String(w.value || ""));
    const looksLikeModelCombo = isCombo && comboHasLikelyModelValues(w);
    if (!looksLikeModelString && !looksLikeModelCombo) return;
    used.add(w);
    out.push(w);
  };

  for (const n of preferred) add(getWidgetByName(node, n));

  for (const w of node.widgets) {
    if (!w || used.has(w)) continue;
    const v = typeof w.value === "string" ? String(w.value || "") : "";
    if (isLikelyModelText(v) || comboHasLikelyModelValues(w)) add(w);
  }

  return out;
}

function getWidgetStringValue(w) {
  if (!w) return "";
  if (typeof w.value === "string") return w.value;
  if (isComboWidget(w)) {
    const vals = w.options?.values || [];
    const idx = Number(w.value);
    if (Number.isFinite(idx) && idx >= 0 && idx < vals.length) {
      const candidates = toCandidateStrings(vals[idx]);
      const first = candidates.find((s) => typeof s === "string" && s.trim());
      if (first) return first;
    }
    // Fallback: if combo uses direct string as current value in some UIs.
    const direct = toCandidateStrings(w.value).find((s) => typeof s === "string" && s.trim());
    if (direct) return direct;
  }
  return "";
}

function markNode(node, theme) {
  try {
    node["__rf_fire_resolve_mark__"] = theme;
    node.setDirtyCanvas(true, true);
  } catch (_) { }
}

function patchNodeDraw(node) {
  if (!node) return;

  const RF_DRAW_GUARD = "__rf_fire_resolve_draw_patched__";
  const RF_MARK_KEY = "__rf_fire_resolve_mark__";

  if (node[RF_DRAW_GUARD]) return;
  node[RF_DRAW_GUARD] = true;

  const orig = node.onDrawForeground;

  node.onDrawForeground = function onDrawForegroundRF(ctx) {
    // Preserve existing node foreground drawing.
    try {
      if (typeof orig === "function") orig.call(this, ctx);
    } catch (_) { }

    // Draw marker over the native collapse circle.
    try {
      const theme = this?.[RF_MARK_KEY];
      if (!theme) return;

      const pal = MARK[theme] || MARK.violet;

      // Title height (node-local coords, title is drawn above body)
      const titleH =
        (typeof this?.title_height === "number" && this.title_height) ||
        (typeof LiteGraph?.NODE_TITLE_HEIGHT === "number" && LiteGraph.NODE_TITLE_HEIGHT) ||
        30;

      // Native collapse radius from LiteGraph
      const collapseR =
        (typeof LiteGraph?.NODE_COLLAPSE_RADIUS === "number" && LiteGraph.NODE_COLLAPSE_RADIUS) ||
        8;

      // Exact center of native collapse circle
      const cx = collapseR + 6;
      const cy = -titleH * 0.5;
      const r = collapseR - 2;

      ctx.save();
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = pal.fg;
      ctx.fill();
      ctx.lineWidth = 1;
      ctx.strokeStyle = pal.stroke;
      ctx.stroke();
      ctx.restore();
    } catch (_) { }
  };
}


function showtoster(theme, title, lines, ms = 5000) {
  try {
    const sub = Array.isArray(lines) ? lines.map(x => String(x ?? "")).join("\n") : String(lines ?? "");
    firetosterShow({
      theme: theme || "violet",
      title: title || "Fire Resolve",
      sub,
      lifeMs: ms,
    });
  } catch (_) { }
}

const MODEL_EXTS = ["safetensors", "gguf", "ckpt", "pt", "pth", "bin", "onnx"];

function extractModelLikeName(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";

  // 1) Try to capture explicit filename.ext anywhere in the string.
  const extGroup = MODEL_EXTS.join("|");
  const re = new RegExp(`([^\\\\/\\n\\r"'\\` + "`" + `|]+?\\.(?:${extGroup}))`, "ig");
  let m;
  let last = "";
  while ((m = re.exec(s)) !== null) {
    last = String(m[1] || "").trim();
  }
  if (last) return last;

  // 2) Common formatted values: "prefix|filename.ext"
  if (s.includes("|")) {
    const tail = s.split("|").pop()?.trim() || "";
    if (tail) return tail;
  }

  // 3) Fallback: use as-is.
  return s;
}

function resolvePathFromCombos(widget, desiredBase) {
  if (!widget || !isComboWidget(widget)) return null;
  if (!desiredBase) return null;

  const vals = widget.options.values || [];
  const onlyStrings = vals
    .map((v) => {
      if (typeof v === "string") return v;
      const c = toCandidateStrings(v).find((s) => typeof s === "string" && s.trim());
      return c || null;
    })
    .filter((v) => typeof v === "string");
  if (!onlyStrings.length) return null;

  const clean = (s) =>
    String(s || "")
      .trim()
      .replace(/^["'`]+|["'`]+$/g, "")
      .replace(/[),;\]}]+$/g, "")
      .trim();

  const normPath = (s) => clean(s).replaceAll("\\", "/");
  const norm = (s) => normPath(s).toLowerCase();
  const desiredParsed = extractModelLikeName(desiredBase);
  const desiredRaw = normPath(desiredParsed || desiredBase);
  const desiredRawNorm = desiredRaw.toLowerCase();
  const desiredBn = norm(basename(desiredRaw));

  const prepared = onlyStrings.map((raw) => {
    const parsed = extractModelLikeName(raw) || raw;
    const rawNormPath = normPath(raw);
    const parsedNormPath = normPath(parsed);
    return {
      raw,
      rawNormPath,
      rawNormLower: rawNormPath.toLowerCase(),
      rawBaseNorm: norm(basename(rawNormPath)),
      parsedBaseNorm: norm(basename(parsedNormPath)),
    };
  });

  // 0) exact full value (case-sensitive, then case-insensitive)
  const fullEqCase = prepared.find((c) => c.rawNormPath === desiredRaw);
  if (fullEqCase) return fullEqCase.raw;
  const fullEq = prepared.find((c) => c.rawNormLower === desiredRawNorm);
  if (fullEq) return fullEq.raw;

  // 1) basename exact (case-insensitive)
  const desiredBaseCase = basename(desiredRaw);
  const baseEqCase = prepared.find((c) => basename(c.rawNormPath) === desiredBaseCase);
  if (baseEqCase) return baseEqCase.raw;
  const baseEq = prepared.find((c) => c.rawBaseNorm === desiredBn || c.parsedBaseNorm === desiredBn);
  if (baseEq) return baseEq.raw;

  return null;
}

function setComboValue(widget, candidateRaw) {
  if (!widget) return false;
  if (!isComboWidget(widget)) return false;
  const vals = widget.options?.values || [];

  // Prefer exact option entry.
  let idx = vals.findIndex((v) => typeof v === "string" && v === candidateRaw);
  if (idx < 0) {
    const candNorm = String(candidateRaw || "").trim().toLowerCase();
    idx = vals.findIndex((v) => typeof v === "string" && String(v).trim().toLowerCase() === candNorm);
  }

  if (idx >= 0) {
    widget.value = idx;
    return true;
  }

  // Fallback for widgets expecting direct string.
  widget.value = candidateRaw;
  return true;
}

function resolveWidget(node, w) {
  const current = getWidgetStringValue(w);
  if (!current) {
    return { state: "fail", reason: `Widget "${w?.name || "?"}" has empty value.` };
  }

  if (!isComboWidget(w)) {
    return { state: "skip", reason: `Widget "${w.name}" is not a combo list.` };
  }

  const desiredBase = String(current || "");
  if (!desiredBase) {
    return { state: "fail", reason: `Widget "${w.name}" value is empty.` };
  }

  const fixed = resolvePathFromCombos(w, desiredBase);
  if (!fixed) {
    return { state: "fail", reason: `No candidate in "${w.name}" matches "${desiredBase}".` };
  }

  const isSame = fixed === current;
  if (!isSame) {
    setComboValue(w, fixed);
    try {
      if (typeof w.callback === "function") w.callback(w.value, app.canvas, node, w);
    } catch (_) { }
    try {
      node.setDirtyCanvas(true, true);
    } catch (_) { }
    return { state: "fixed", from: current, to: fixed, name: w.name };
  }

  return { state: "ok", name: w.name, value: current };
}

function resolveSelectedNode() {
  const node = getSelectedNodeSafe();
  if (!node) {
    showtoster("magenta", "No node selected", ["Select a node and press Shift+Alt+R."], 3500);
    return;
  }

  patchNodeDraw(node);

  const widgets = findPathWidgets(node);
  if (!widgets.length) {
    markNode(node, "magenta");
    showtoster("magenta", "No model widgets found", ["This node has no model-like path/combo widgets."], 5000);
    return;
  }

  let totalFixed = 0;
  let totalOk = 0;
  let totalFail = 0;
  let totalSkip = 0;

  for (const w of widgets) {
    const r = resolveWidget(node, w);
    if (r.state === "fixed") totalFixed += 1;
    else if (r.state === "ok") totalOk += 1;
    else if (r.state === "skip") totalSkip += 1;
    else totalFail += 1;
  }

  if (totalFail > 0) markNode(node, "magenta");
  else markNode(node, "green");

  if (totalFail > 0) {
    showtoster("magenta", "Resolve finished", [`Fixed: ${totalFixed}`, `Already OK: ${totalOk}`, `Failed: ${totalFail}`, `Skipped: ${totalSkip}`], 6000);
    return;
  }

  showtoster("green", "Resolve finished", [`Fixed: ${totalFixed}`, `Already OK: ${totalOk}`, `Skipped: ${totalSkip}`], 5000);
}

function onKeyDown(e) {
  try {
    if (!e) return;
    const k = String(e.key || "").toLowerCase();
    if (k !== RF.HOTKEY.key) return;
    if (!!e.shiftKey !== !!RF.HOTKEY.shiftKey) return;
    if (!!e.altKey !== !!RF.HOTKEY.altKey) return;

    // Avoid messing with inputs.
    const tag = (e.target && e.target.tagName) ? String(e.target.tagName).toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    e.preventDefault();
    e.stopPropagation();
    resolveSelectedNode();
  } catch (_) { }
}

function attachListenerOnce() {
  try {
    const g = globalThis;
    if (g[RF.LISTENER_GUARD]) return;
    g[RF.LISTENER_GUARD] = true;

    window.addEventListener("keydown", onKeyDown, { capture: true });
  } catch (_) { }
}

app.registerExtension({
  name: RF.EXT_NAME,
  async setup() {
    attachListenerOnce();
  },
});
