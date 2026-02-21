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

function findAnyPathWidget(node) {
  if (!node || !Array.isArray(node.widgets)) return null;

  // Priority list: known widget names
  const preferred = ["lora_name", "lora", "lora_1", "lora_2", "loras", "lora_model", "unet_name", "clip_name", "vae_name", "model_name", "ckpt_name", "checkpoint", "path", "file"];
  for (const n of preferred) {
    const w = getWidgetByName(node, n);
    if (w && typeof w.value === "string") return w;
  }

  // Otherwise: any string widget that looks like a path or model id
  for (const w of node.widgets) {
    if (!w) continue;
    if (typeof w.value !== "string") continue;
    const v = w.value;
    if (!v) continue;
    if (v.includes("\\") || v.includes("/") || v.includes(".safetensors") || v.includes(".gguf")) return w;
  }

  return null;
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

  const vals = widget.options.values;
  const b = desiredBase.toLowerCase();

  // exact basename match first
  for (const v of vals) {
    const bn = basename(v).toLowerCase();
    if (bn === b) return v;
  }

  // then partial match
  for (const v of vals) {
    const bn = basename(v).toLowerCase();
    if (bn.includes(b)) return v;
  }

  return null;
}

function resolveSelectedNode() {
  const node = getSelectedNodeSafe();
  if (!node) {
    showtoster("magenta", "No node selected", ["Select a node and press Shift+Alt+R."], 3500);
    return;
  }

  // Patch draw once so we can mark it.
  patchNodeDraw(node);

  // Find a relevant widget to fix.
  const w = findAnyPathWidget(node);
  if (!w) {
    markNode(node, "magenta");
    showtoster("magenta", "No path widget found", ["This node has no string/combo widget that looks like a model path."], 5000);
    return;
  }

  const current = w.value;

  // If this is not a combo widget, we can't auto-fix safely (no candidates list).
  if (!isComboWidget(w)) {
    markNode(node, "magenta");
    showtoster("magenta", "Widget is not a combo", [`Widget "${w.name}" is not a combo list, cannot resolve automatically.`], 5500);
    return;
  }

  // Determine "desired" basename from current value.
  const desiredBase = basename(current);
  if (!desiredBase) {
    markNode(node, "magenta");
    showtoster("magenta", "Empty value", [`Widget "${w.name}" value is empty.`], 4500);
    return;
  }

  // Try to resolve the proper candidate.
  const fixed = resolvePathFromCombos(w, desiredBase);

  if (!fixed) {
    markNode(node, "magenta");
    showtoster("magenta", "Model not found", [`No candidate in "${w.name}" matches "${desiredBase}".`], 6500);
    return;
  }

  // Determine state:
  // - violet: already correct (exact match)
  // - green: changed to a different (corrected) candidate
  const isSame = fixed === current;

  if (!isSame) {
    w.value = fixed;
    try {
      if (typeof w.callback === "function") w.callback(w.value, app.canvas, node, w);
    } catch (_) { }
    try {
      node.setDirtyCanvas(true, true);
    } catch (_) { }
    markNode(node, "green");
    showtoster("green", "Path fixed", [`${w.name}:`, `${current}`, "→", `${fixed}`], 6500);
  } else {
    markNode(node, "violet");
    showtoster("violet", "Path OK", [`${w.name}: ${current}`], 3500);
  }
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
