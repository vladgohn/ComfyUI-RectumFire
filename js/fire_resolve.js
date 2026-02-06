// FireResolve — RectumFire DOM tosters + node coloring
// Hotkey: Shift+Alt+R (layout-independent via e.code)

import { app } from "../../scripts/app.js";
import { firetosterShow } from "./fire_toster.js";

const RF = Object.freeze({
  EXT_NAME: "RectumFire.FireResolve",
  HOTKEY: { code: "KeyR", shiftKey: true, altKey: true },
  GLOBAL_GUARD_KEY: "__rf_fire_resolve_registered__",
});

// Node colors (match toster palette; bg is darker tint, stroke is outline, fg is accent)
const MARK = Object.freeze({
  green:   { bg: "#0A2616", stroke: "#114A29", fg: "#22C55E" },
  violet:  { bg: "#171524", stroke: "#624B89", fg: "#8F60F4" },
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
  const sel = cnv?.selected_nodes;
  if (!sel) return null;

  const keys = Object.keys(sel);
  if (!keys.length) return null;

  return sel[keys[0]] || null;
}

// toster output: EXACT 2 lines, no extra prefixes
function showtoster(theme, line1, line2, lifeMs) {
  firetosterShow({
    theme,
    title: "🔥 Fire Resolve",
    sub: `${line1}\n${line2}`,
    lifeMs,
  });
}

// Node coloring: ONLY via node properties (no drawing hooks)
function markNode(node, theme) {
  if (!node) return;

  const pal = MARK[theme] || MARK.violet;

  // Mark state (optional; doesn't affect rendering)
  node.__rf_fire_checked = true;
  node.__rf_fire_theme = theme;

  // These three are the standard LiteGraph node styling knobs.
  // They affect header / body / outline (and the left dot in many themes).
  try {
    node.bgcolor = pal.bg;     // node body background
    node.color = pal.bg;       // header background (often uses node.color)
    node.boxcolor = pal.fg;    // outline/accent (often affects dots/lines)
  } catch (_) {}

  // Force redraw of this node
  try {
    node.setDirtyCanvas?.(true, true);
  } catch (_) {}
}

function resolveComboWidget(widget) {
  const current = widget.value;
  const values = widget.options.values;

  if (typeof current !== "string") return { kind: "skip" };

  // exact match already
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

  // Force full redraw (graph + canvas)
  try {
    app.graph?.setDirtyCanvas?.(true, true);
  } catch (_) {}

  // STATES (exact wording style like your tosters)
  if (corrected.length) {
    if (missing.length) {
      // Partial counts as error theme (magenta)
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

  // All combo fields already ok
  markNode(node, "violet");
  showtoster("violet", "Already correct", "Enjoy!", 5500);
}

function hotkeyMatches(e) {
  if (!e || e.repeat) return false;
  if (e.code !== RF.HOTKEY.code) return false;
  if (!!e.shiftKey !== RF.HOTKEY.shiftKey) return false;
  if (!!e.altKey !== RF.HOTKEY.altKey) return false;
  return true;
}

function onKeyDown(e) {
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;

  if (!hotkeyMatches(e)) return;

  e.preventDefault();
  e.stopPropagation();
  resolveSelectedNode();
}

app.registerExtension({
  name: RF.EXT_NAME,
  setup() {
    if (window[RF.GLOBAL_GUARD_KEY]) return;
    window[RF.GLOBAL_GUARD_KEY] = true;

    window.addEventListener("keydown", onKeyDown, { capture: true });
  },
});
