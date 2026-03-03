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
    if (typeof v !== "string") continue;
    checked += 1;
    if (isLikelyModelText(v)) return true;
    if (checked >= 60) break; // avoid scanning huge lists fully every keypress
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
    if (typeof w.value !== "string") return;
    used.add(w);
    out.push(w);
  };

  for (const n of preferred) add(getWidgetByName(node, n));

  for (const w of node.widgets) {
    if (!w || used.has(w)) continue;
    if (typeof w.value !== "string") continue;
    const v = String(w.value || "");
    if (!v) continue;
    if (isLikelyModelText(v) || comboHasLikelyModelValues(w)) add(w);
  }

  return out;
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

function resolvePathFromCombos(widget, desiredBase) {
  if (!widget || !isComboWidget(widget)) return null;
  if (!desiredBase) return null;

  const vals = widget.options.values || [];
  const onlyStrings = vals.filter(v => typeof v === "string");
  if (!onlyStrings.length) return null;

  const norm = (s) => String(s || "").trim().replaceAll("\\", "/").toLowerCase();
  const stem = (s) => {
    const b = basename(s);
    const i = b.lastIndexOf(".");
    return (i > 0 ? b.slice(0, i) : b).toLowerCase();
  };

  const desiredRaw = norm(desiredBase);
  const desiredBn = norm(basename(desiredBase));
  const desiredStem = stem(desiredBase);

  const uniqueOrNull = (arr) => {
    if (!arr.length) return null;
    if (arr.length === 1) return arr[0];
    return null;
  };

  // 0) exact full value match (normalized)
  const fullEq = onlyStrings.filter((v) => norm(v) === desiredRaw);
  {
    const u = uniqueOrNull(fullEq);
    if (u) return u;
  }

  // 1) exact basename match
  const baseEq = onlyStrings.filter((v) => norm(basename(v)) === desiredBn);
  {
    const u = uniqueOrNull(baseEq);
    if (u) return u;
  }

  // 2) exact stem match (ignores extension differences)
  if (desiredStem) {
    const stemEq = onlyStrings.filter((v) => stem(v) === desiredStem);
    const u = uniqueOrNull(stemEq);
    if (u) return u;
  }

  return null;
}

function resolveWidget(node, w) {
  const current = w?.value;
  if (typeof current !== "string" || !current) {
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
    w.value = fixed;
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
  else if (totalFixed > 0) markNode(node, "green");
  else markNode(node, "violet");

  if (totalFail > 0) {
    showtoster("magenta", "Resolve finished", [`Fixed: ${totalFixed}`, `Already OK: ${totalOk}`, `Failed: ${totalFail}`, `Skipped: ${totalSkip}`], 6000);
    return;
  }

  if (totalFixed > 0) {
    showtoster("green", "Resolve finished", [`Fixed: ${totalFixed}`, `Already OK: ${totalOk}`], 5000);
    return;
  }

  showtoster("violet", "Path OK", [`Already OK: ${totalOk}`, `Skipped: ${totalSkip}`], 3200);
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
