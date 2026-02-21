import { app } from "../../scripts/app.js";

function overlay(text, ms = 1200) {
  const id = "__rf_overlay__";
  let el = document.getElementById(id);
  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.style.position = "fixed";
    el.style.right = "14px";
    el.style.top = "14px";
    el.style.zIndex = "999999";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.background = "rgba(0,0,0,.85)";
    el.style.color = "#fff";
    el.style.font = "12px system-ui";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.display = "none", ms);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement("textarea");
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  }
}

function getNode() {
  const c = app.canvas;
  if (!c) return null;
  if (c.node_over) return c.node_over;
  const sel = Object.values(c.selected_nodes || {});
  if (sel.length) return sel[sel.length - 1];
  return null;
}

function extractPureNode(node) {
  return {
    id: node.id,
    type: node.type,
    pos: node.pos,
    size: node.size,
    flags: node.flags,
    order: node.order,
    mode: node.mode,
    inputs: node.inputs,
    outputs: node.outputs,
    properties: node.properties,
    widgets_values: node.widgets_values
  };
}

function setLast(text) {
  try { window.__rf_copy_last__ = String(text ?? ""); } catch {}
}

function getLast() {
  try { return String(window.__rf_copy_last__ ?? ""); } catch { return ""; }
}

function getMousePos() {
  const c = app.canvas;
  if (!c) return [100, 100];
  const m = c.mouse || [100, 100];
  if (typeof c.convertCanvasToOffset === "function") return c.convertCanvasToOffset(m);
  return [m[0], m[1]];
}

function createFireNoteAtMouse(text) {
  const g = app.graph || app.canvas?.graph;
  if (!g) {
    overlay("Fire Paste: no graph");
    return false;
  }

  let node = null;

  try { node = LiteGraph.createNode("RectumFireNote"); } catch {}
  if (!node) {
    try { node = LiteGraph.createNode("RectumFire Sticker Note"); } catch {}
  }
  if (!node) {
    overlay("Fire Paste: FireNote not found");
    return false;
  }

  const pos = getMousePos();
  node.pos = [pos[0], pos[1]];

  g.add(node);

  const w = (node.widgets || []).find(x => x && x.name === "text") || (node.widgets || [])[0];
  if (w) w.value = text;

  try { app.canvas.setDirty(true, true); } catch {}
  return true;
}

async function action(node) {
  if (!node) {
    overlay("Fire Copy: no node");
    return;
  }

  const pure = extractPureNode(node);
  const json = JSON.stringify(pure, null, 2);

  const matches = json.match(/([^\\/"]+\.safetensors)/gi);
  if (matches && matches.length) {
    const unique = [...new Set(matches)];
    const out = unique.join("\n");
    const ok = await copy(out);
    if (ok) setLast(out);
    overlay(ok ? `Fire Copy: ${unique.length} model(s)` : "Fire Copy: error");
  } else {
    const ok = await copy(json);
    if (ok) setLast(json);
    overlay(ok ? "Fire Copy: JSON copied" : "Fire Copy: error");
  }
}

function paste() {
  const text = getLast();
  if (!text) {
    overlay("Fire Paste: empty");
    return;
  }
  const ok = createFireNoteAtMouse(text);
  if (ok) overlay("Fire Paste: pasted");
}

function install() {
  if (window.__rf_copy__) return;
  window.__rf_copy__ = true;

  window.addEventListener("keydown", e => {
    const k = (e.key || "").toLowerCase();

    if (e.altKey && e.shiftKey && k === "c") {
      e.preventDefault();
      action(getNode());
      return;
    }

    if (e.altKey && e.shiftKey && k === "v") {
      e.preventDefault();
      paste();
      return;
    }
  }, true);
}

app.registerExtension({
  name: "rectumfire.copy",
  setup() {
    install();
  }
});
