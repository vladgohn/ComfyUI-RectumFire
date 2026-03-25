import { app } from "../../scripts/app.js";
import { firetosterShow } from "./fire_toster.js";

function showtoster(theme, title, lines, ms = 2500) {
  try {
    const sub = Array.isArray(lines) ? lines.map(x => String(x ?? "")).join("\n") : String(lines ?? "");
    firetosterShow({
      theme: theme || "green",
      title: title || "Fire Copy",
      sub,
      lifeMs: ms,
    });
  } catch (_) { }
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

function basename(p) {
  if (typeof p !== "string" || !p) return "";
  const t = p.replaceAll("\\", "/");
  const parts = t.split("/");
  return parts[parts.length - 1] || "";
}

function pushString(list, v) {
  if (typeof v === "string" && v) list.push(v);
}

function collectStringsDeep(value, out, depth = 0) {
  if (depth > 6 || value == null) return;
  if (typeof value === "string") {
    pushString(out, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const v of value) collectStringsDeep(v, out, depth + 1);
    return;
  }
  if (typeof value === "object") {
    for (const v of Object.values(value)) collectStringsDeep(v, out, depth + 1);
  }
}

function collectStringCandidates(node) {
  const out = [];
  if (!node) return out;

  if (Array.isArray(node.widgets)) {
    for (const w of node.widgets) {
      collectStringsDeep(w?.value, out);
    }
  }

  if (Array.isArray(node.widgets_values)) {
    collectStringsDeep(node.widgets_values, out);
  }

  collectStringsDeep(node?.properties, out);

  return out;
}

function cleanModelName(s) {
  if (!s) return "";
  return String(s)
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")
    .replace(/[),;\]}]+$/g, "")
    .trim();
}

function isComboWidget(w) {
  return !!(w && w.options && Array.isArray(w.options.values) && w.options.values.length);
}

function getWidgetByName(node, name) {
  if (!node || !Array.isArray(node.widgets) || !name) return null;
  for (const w of node.widgets) {
    if (w && w.name === name) return w;
  }
  return null;
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
    for (const k of ["value", "name", "title", "label", "content", "text", "path", "file"]) {
      if (k in v) out.push(...toCandidateStrings(v[k]));
    }
    return out;
  }
  return [];
}

function getWidgetStringValue(w) {
  if (!w) return "";
  if (typeof w.value === "string") return w.value;
  if (isComboWidget(w)) {
    const vals = w.options?.values || [];
    const idx = Number(w.value);
    if (Number.isFinite(idx) && idx >= 0 && idx < vals.length) {
      const c = toCandidateStrings(vals[idx]).find((s) => typeof s === "string" && s.trim());
      if (c) return c;
    }
    const direct = toCandidateStrings(w.value).find((s) => typeof s === "string" && s.trim());
    if (direct) return direct;
  }
  return "";
}

function walkGraph(graph, cb) {
  const nodes = graph?._nodes || graph?.nodes || [];
  for (const n of nodes) {
    cb(n, graph);
    if (n?.subgraph) walkGraph(n.subgraph, cb);
  }
}

function collectAvailableModelKeys() {
  const out = new Set();
  const root = app?.graph;
  if (!root) return out;

  walkGraph(root, (node) => {
    const widgets = node?.widgets || [];
    for (const w of widgets) {
      if (!isComboWidget(w)) continue;
      for (const v of (w.options?.values || [])) {
        const raw = (typeof v === "string")
          ? v
          : toCandidateStrings(v).find((s) => typeof s === "string" && s.trim());
        if (!raw) continue;
        const b = cleanModelName(basename(raw));
        if (!b) continue;
        out.add(b.toLowerCase());
      }
    }
  });
  return out;
}

function buildNoteMarkedList(names) {
  const keys = collectAvailableModelKeys();
  const lines = [];
  for (const n of names) {
    const clean = cleanModelName(basename(n));
    if (!clean) continue;
    const ok = keys.has(clean.toLowerCase());
    lines.push(`${ok ? "✅" : "❌"} ${clean}`);
  }
  return lines.join("\n");
}

function extractModelNames(node) {
  const texts = collectStringCandidates(node);
  const preferred = ["ckpt_name", "checkpoint", "model_name", "lora_name", "lora", "lora_1", "lora_2", "clip_name", "vae_name", "unet_name", "control_net_name"];

  const ext = "(?:safetensors|gguf|ckpt|pt|pth|bin|onnx)";
  const re = new RegExp(`([^\\n\\r"'\\\`]+?\\.${ext})`, "gi");
  const names = [];
  const seen = new Set();

  const addName = (candidate) => {
    const name = cleanModelName(basename(candidate));
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    names.push(name);
  };

  // 0) Preferred loader widgets (works even when names have no extension).
  for (const wname of preferred) {
    const w = getWidgetByName(node, wname);
    if (!w) continue;
    const val = getWidgetStringValue(w);
    if (!val) continue;
    addName(val);
  }

  if (!texts.length) return names;

  for (const text of texts) {
    const raw = String(text || "");
    const direct = cleanModelName(raw);
    if (new RegExp(`\\.${ext}$`, "i").test(direct)) {
      addName(direct);
    }

    let m;
    while ((m = re.exec(raw)) !== null) {
      addName(m[1] || "");
    }
  }

  return names;
}

function setLast(text) {
  try { window.__rf_copy_last__ = String(text ?? ""); } catch {}
}

function getLast() {
  try { return String(window.__rf_copy_last__ ?? ""); } catch { return ""; }
}

function setLastNote(text) {
  try { window.__rf_copy_last_note__ = String(text ?? ""); } catch {}
}

function getLastNote() {
  try { return String(window.__rf_copy_last_note__ ?? ""); } catch { return ""; }
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
    showtoster("magenta", "Fire Paste", ["No graph found."]);
    return false;
  }

  let node = null;

  try { node = LiteGraph.createNode("RectumFireNote"); } catch {}
  if (!node) {
    try { node = LiteGraph.createNode("RectumFire Sticker Note"); } catch {}
  }
  if (!node) {
    showtoster("magenta", "Fire Paste", ["FireNote node type not found."]);
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
    showtoster("magenta", "Fire Copy", ["No node selected."]);
    return;
  }

  const names = extractModelNames(node);
  if (names.length) {
    const out = names.join("\n");
    const ok = await copy(out);
    if (ok) setLast(out);
    setLastNote(buildNoteMarkedList(names));
    showtoster(ok ? "green" : "magenta", "Fire Copy", ok ? [`Copied ${names.length} model(s).`] : ["Copy error."]);
  } else {
    const pure = extractPureNode(node);
    const json = JSON.stringify(pure, null, 2);
    const ok = await copy(json);
    if (ok) setLast(json);
    setLastNote(json);
    showtoster(ok ? "violet" : "magenta", "Fire Copy", ok ? ["JSON copied."] : ["Copy error."]);
  }
}

function paste() {
  const text = getLastNote() || getLast();
  if (!text) {
    showtoster("magenta", "Fire Paste", ["Clipboard buffer is empty."]);
    return;
  }
  const ok = createFireNoteAtMouse(text);
  if (ok) showtoster("green", "Fire Paste", ["Pasted into FireNote."]);
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
  name: "RectumFireCopy",
  setup() {
    install();
  }
});
