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

  // 2) Some builds: selectedNodes array
  const selArr = cnv?.selectedNodes;
  if (Array.isArray(selArr) && selArr.length) return selArr[0] || null;

  // 3) Fallback: scan graph nodes
  const nodes = app?.graph?._nodes;
  if (Array.isArray(nodes)) {
    const hit = nodes.find((n) => n && n.is_selected);
    if (hit) return hit;
  }

  return null;
}

function showtoster(theme, line1, line2, lifeMs) {
  firetosterShow({
    theme,
    title: "🔥 Fire Resolve",
    sub: `${line1}\n${line2}`,
    lifeMs,
  });
}

function markNode(node, theme) {
  if (!node) return;
  const pal = MARK[theme] || MARK.violet;

  try {
    node.bgcolor = pal.bg;
    node.color = pal.bg;
    node.boxcolor = pal.fg;
  } catch (_) {}

  try {
    node.setDirtyCanvas?.(true, true);
  } catch (_) {}

  try {
    app.graph?.setDirtyCanvas?.(true, true);
  } catch (_) {}
}

function resolveComboWidget(widget) {
  const current = widget?.value;
  const values = widget?.options?.values;

  if (typeof current !== "string") return { kind: "skip" };
  if (!Array.isArray(values) || !values.length) return { kind: "skip" };

  if (values.includes(current)) return { kind: "alreadyOk", value: current };

  const bn = basename(current);
  if (!bn) return { kind: "skip" };

  const match = values.find((v) => basename(v) === bn);
  if (!match) return { kind: "missing", name: bn, from: current };

  widget.value = match;
  return { kind: "corrected", name: bn, from: current, to: match };
}

function resolveSelectedNode() {
  const node = getSelectedNodeSafe();

  if (!node) {
    showtoster("violet", "No node selected", "Enjoy!", 5500);
    return;
  }

  const widgets = Array.isArray(node.widgets) ? node.widgets : [];
  const comboWidgets = widgets.filter(isComboWidget);

  if (!comboWidgets.length) {
    markNode(node, "violet");
    showtoster("violet", "No resolvable fields", "Enjoy!", 5500);
    return;
  }

  const corrected = [];
  const missing = [];

  for (const w of comboWidgets) {
    const r = resolveComboWidget(w);
    if (r.kind === "corrected") corrected.push(r.name);
    else if (r.kind === "missing") missing.push(r.name);
  }

  if (corrected.length) {
    if (missing.length) {
      markNode(node, "magenta");
      showtoster("magenta", "Model not found", `Tried candidate field: ${missing.length}`, 6500);
      return;
    }

    markNode(node, "green");
    if (corrected.length === 1) {
      showtoster("green", "Path corrected", `Update: ${corrected[0]}`, 4500);
      return;
    }
    showtoster("green", "Path corrected", `Update: ${corrected.length} items`, 4500);
    return;
  }

  if (missing.length) {
    markNode(node, "magenta");
    showtoster("magenta", "Model not found", `Tried candidate field: ${missing.length}`, 6500);
    return;
  }

  markNode(node, "violet");
  showtoster("violet", "Already correct", "Enjoy!", 5500);
}

// -------------------- Hotkey (same style as FireTest) --------------------

function hotkeyMatches(e) {
  if (!e || e.repeat) return false;
  if ((e.key || "").toLowerCase() !== RF.HOTKEY.key) return false;
  if (!!e.shiftKey !== RF.HOTKEY.shiftKey) return false;
  if (!!e.altKey !== RF.HOTKEY.altKey) return false;
  return true;
}

function onKeyDown(e) {
  // DEBUG: proves the handler is alive. Comment out later.
  // Fires only on matching combo.
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
  if (!hotkeyMatches(e)) return;

  console.log("[Fire Resolve] hotkey OK:", { key: e.key, alt: e.altKey, shift: e.shiftKey });

  e.preventDefault();
  e.stopPropagation();
  resolveSelectedNode();
}

function ensureListener() {
  if (window[RF.LISTENER_GUARD]) return;
  window[RF.LISTENER_GUARD] = true;
  window.addEventListener("keydown", onKeyDown, { capture: true });
  console.log("[Fire Resolve] listener attached");
}

app.registerExtension({
  name: RF.EXT_NAME,
  setup() {
    ensureListener();
  },
});
