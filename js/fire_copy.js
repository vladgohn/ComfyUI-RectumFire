import { app } from "../../scripts/app.js";

/**
 * Fire Copy (RectumFire) — Copy model/LoRA name(s) from selected node
 * Hotkey: Alt+Shift+C (copy -> pending)
 * Hotkey: Alt+Shift+V (paste pending/clipboard into Fire Note at mouse position)
 * Menu: 🔥 Fire Copy: Copy name (or DIAG)
 *
 * Kyiv log:
 * Made in Kyiv during ballistic missile attacks and blackout.
 * — VladGohn
 */

function overlay(msg, ms = 1400) {
  const id = "rf-overlay";
  let el = document.getElementById(id);

  if (!el) {
    el = document.createElement("div");
    el.id = id;
    el.style.position = "fixed";
    el.style.right = "24px";
    el.style.top = "24px";
    el.style.zIndex = "999999";
    el.style.padding = "10px 12px";
    el.style.borderRadius = "10px";
    el.style.background = "rgba(20,20,20,0.92)";
    el.style.color = "#fff";
    el.style.font = "20px system-ui, -apple-system, Segoe UI, Roboto, Arial";
    el.style.boxShadow = "0 8px 30px rgba(0,0,0,0.35)";
    el.style.pointerEvents = "none";
    el.style.whiteSpace = "pre-wrap";
    el.style.maxWidth = "44vw";
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
    el.style.transition = "opacity 120ms ease, transform 120ms ease";
    document.body.appendChild(el);
  }

  el.textContent = msg;
  el.style.opacity = "1";
  el.style.transform = "translateY(0)";

  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.style.opacity = "0";
    el.style.transform = "translateY(-6px)";
  }, ms);
}

function getSingleSelectedNode() {
  const sel = app?.canvas?.selected_nodes || {};
  const nodes = Object.values(sel);
  if (nodes.length !== 1) return null;
  return nodes[0];
}

function normalizeModelName(name) {
  if (!name) return "";
  let s = String(name).trim();
  s = s.split(/[/\\]/).pop() || "";
  s = s.replace(/\.(safetensors|pt|ckpt|pth)$/i, "");
  return s;
}

function findWidgetIndexByName(node, name) {
  const ws = node?.widgets || [];
  for (let i = 0; i < ws.length; i++) {
    if (ws[i]?.name === name) return i;
  }
  return -1;
}

function getValueByWidgetName(node, widgetName) {
  if (!node) return null;

  const idx = findWidgetIndexByName(node, widgetName);
  if (idx >= 0) {
    const wv = node?.widgets_values;
    if (Array.isArray(wv) && wv[idx] != null) return wv[idx];
    const w = node?.widgets?.[idx];
    if (w && w.value != null) return w.value;
  }

  const p = node?.properties;
  if (p && p[widgetName] != null) return p[widgetName];

  return null;
}

/** CASE 1: normal LoRA loaders */
function extractSingleLoraName(node) {
  const p = node?.properties;

  if (p && typeof p.lora_name === "string" && p.lora_name.trim()) {
    return p.lora_name;
  }

  const v = getValueByWidgetName(node, "lora_name");
  if (typeof v === "string" && v.trim()) return v;

  if (p) {
    for (const k of Object.keys(p)) {
      if (k.toLowerCase().includes("lora") && typeof p[k] === "string" && p[k].trim()) {
        return p[k];
      }
    }
  }

  return "";
}

/** CASE 2: rgthree Power Lora Loader */
function extractPowerLoraNames(node) {
  const out = [];
  const wv = node?.widgets_values;
  if (!Array.isArray(wv)) return out;

  for (const item of wv) {
    if (!item || typeof item !== "object") continue;

    const lora = item.lora;
    const on = item.on;

    if (typeof lora === "string" && lora.trim()) {
      if (on === false) continue;
      out.push(normalizeModelName(lora));
    }
  }

  const seen = new Set();
  const uniq = [];
  for (const x of out) {
    if (!x) continue;
    if (seen.has(x)) continue;
    seen.add(x);
    uniq.push(x);
  }
  return uniq;
}

/** CASE 3/4: model loaders */
function extractModelNameByKnownWidgets(node) {
  const unet = getValueByWidgetName(node, "unet_name");
  if (typeof unet === "string" && unet.trim()) return normalizeModelName(unet);

  const ckpt = getValueByWidgetName(node, "ckpt_name");
  if (typeof ckpt === "string" && ckpt.trim()) return normalizeModelName(ckpt);

  return "";
}

function diagForNode(node) {
  const idx = findWidgetIndexByName(node, "lora_name");
  return {
    id: node?.id,
    type: node?.type,
    title: node?.title,
    properties_keys: Object.keys(node?.properties || {}),
    widgets: Array.isArray(node?.widgets) ? node.widgets.map(w => w?.name) : [],
    lora_widget_index: idx,
    widgets_values: Array.isArray(node?.widgets_values) ? node.widgets_values : node?.widgets_values ?? null
  };
}

/* -------------------- FIRE NOTE (paste target) -------------------- */

const FIRE_NOTE_TYPES = ["RectumFireNote", "RectumFire Sticker Note"]; // new + legacy
const FIRE_NOTE_WIDGET = "text";

// pending text (copy -> paste)
function setPendingText(text) {
  window.__fire_pending_text = String(text ?? "");
}
function getPendingText() {
  return String(window.__fire_pending_text ?? "");
}
function clearPendingText() {
  window.__fire_pending_text = "";
}

function findExistingFireNoteNode() {
  const g = app?.graph;
  const nodes = g?._nodes || [];
  for (const n of nodes) {
    if (n && FIRE_NOTE_TYPES.includes(n.type)) return n;
  }
  return null;
}

function getFireNoteTextWidget(node) {
  const ws = node?.widgets || [];
  const byName = ws.find(w => w?.name === FIRE_NOTE_WIDGET);
  if (byName) return byName;
  if (ws.length) return ws[0];
  return null;
}

function getGraphPosUnderMouse() {
  const canvas = app?.canvas;
  if (!canvas) return [80, 80];

  // Most builds keep current mouse in canvas coords
  const mp = canvas.mouse;
  if (mp && mp.length >= 2) {
    // preferred conversion if exists
    if (typeof canvas.convertCanvasToOffset === "function") {
      const p = canvas.convertCanvasToOffset(mp);
      if (p && p.length >= 2) return p;
    }

    // fallback: approximate using ds offset/scale
    const z = canvas.ds?.scale || 1;
    const ox = canvas.ds?.offset?.[0] || 0;
    const oy = canvas.ds?.offset?.[1] || 0;
    return [(mp[0] - ox) / z, (mp[1] - oy) / z];
  }

  // last resort
  return [80, 80];
}

function createFireNoteAt(posXY) {
  const g = app?.graph;
  const LG = window.LiteGraph;
  if (!g || !LG || typeof LG.createNode !== "function") return null;

  // create by internal type (not display name!)
  let n = LG.createNode("RectumFireNote");
  if (!n) n = LG.createNode("RectumFire Sticker Note");
  if (!n) return null;

  n.pos = Array.isArray(posXY) ? posXY : [80, 80];
  n.size = [380, 260];

  g.add(n);
  app?.canvas?.setDirty(true, true);
  return n;
}

function appendToFireNoteText(noteNode, text) {
  if (!noteNode) return false;

  const w = getFireNoteTextWidget(noteNode);
  if (!w) return false;

  const old = (w.value == null) ? "" : String(w.value);
  const add = String(text ?? "").trimEnd();
  if (!add) return false;

  const next = old
    ? (old.endsWith("\n") ? old + add : old + "\n" + add)
    : add;

  w.value = next;
  app?.canvas?.setDirty(true, true);
  return true;
}

/* -------------------- COPY -------------------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setPendingText(text);
    overlay(`🔥 Fire Copy!\n${text}`, 1400);
    return true;
  } catch (err) {
    console.warn("[Fire Copy] clipboard API failed, fallback prompt()", err);
    window.prompt("Fire Copy: copy this manually (Ctrl+C, Enter)", text);
    // even if clipboard fails, keep pending so Alt+Shift+V can still work
    setPendingText(text);
    return false;
  }
}

async function actionCopyFromNode(node) {
  if (!node) {
    overlay("Select exactly 1 node", 1100);
    return;
  }

  const single = extractSingleLoraName(node);
  if (single && single.trim()) {
    await copyText(normalizeModelName(single));
    return;
  }

  const many = extractPowerLoraNames(node);
  if (many.length) {
    await copyText(many.join("\n"));
    return;
  }

  const modelName = extractModelNameByKnownWidgets(node);
  if (modelName && modelName.trim()) {
    await copyText(modelName);
    return;
  }

  await copyText(JSON.stringify(diagForNode(node), null, 2));
}

/* -------------------- PASTE (Alt+Shift+V) -------------------- */

async function actionPasteToFireNoteAtMouse() {
  // Prefer pending; fallback to clipboard
  let text = getPendingText().trimEnd();
  if (!text) {
    try {
      text = String(await navigator.clipboard.readText() || "").trimEnd();
    } catch (e) {
      // ignore
    }
  }

  if (!text) {
    overlay("Nothing to paste", 1100);
    return;
  }

  let note = findExistingFireNoteNode();

  // If note doesn't exist, create at mouse position
  if (!note) {
    const pos = getGraphPosUnderMouse();
    note = createFireNoteAt(pos);
  }

  if (!note) {
    overlay("Can't create Fire Note (see console)", 1400);
    console.error("[Fire Copy] createFireNoteAt failed: LiteGraph or graph not ready");
    return;
  }

  const ok = appendToFireNoteText(note, text);
  if (!ok) {
    overlay("Paste failed (no text widget?)", 1400);
    return;
  }

  overlay("✏️ Added to Fire Note", 850);
  clearPendingText();
}

/* -------------------- UI hooks -------------------- */

function installHotkeyOnce() {
  if (window.__rf_hotkey_installed) return;

  window.addEventListener(
    "keydown",
    (e) => {
      // Copy
      if (e.altKey && e.shiftKey && e.code === "KeyC") {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea") return;

        e.preventDefault();
        actionCopyFromNode(getSingleSelectedNode()).catch(err => {
          console.error(err);
          overlay("Fire Copy error (see console)", 1400);
        });
        return;
      }

      // Paste into Fire Note at mouse position
      if (e.altKey && e.shiftKey && e.code === "KeyV") {
        const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
        if (tag === "input" || tag === "textarea") return;

        e.preventDefault();
        actionPasteToFireNoteAtMouse().catch(err => {
          console.error(err);
          overlay("Fire Paste error (see console)", 1400);
        });
        return;
      }
    },
    true
  );

  window.__rf_hotkey_installed = true;
}

function installContextMenuOnce() {
  if (window.__rf_menu_installed) return;
  if (!window.LGraphCanvas?.prototype) return;

  const proto = window.LGraphCanvas.prototype;

  if (!proto.__rf_orig_getNodeMenuOptions) {
    proto.__rf_orig_getNodeMenuOptions = proto.getNodeMenuOptions;
  }

  proto.getNodeMenuOptions = function (node) {
    const orig = proto.__rf_orig_getNodeMenuOptions;
    const options = orig ? orig.call(this, node) : [];

    if (options.length) options.unshift(null);

    options.unshift({
      content: "🔥 Fire Copy: Copy name (or DIAG)  (Alt+Shift+C)",
      callback: () => {
        actionCopyFromNode(node).catch(err => {
          console.error(err);
          overlay("Fire Copy error (see console)", 1400);
        });
      }
    });

    options.unshift({
      content: "✏️ Fire Paste: To Fire Note at mouse (Alt+Shift+V)",
      callback: () => {
        actionPasteToFireNoteAtMouse().catch(err => {
          console.error(err);
          overlay("Fire Paste error (see console)", 1400);
        });
      }
    });

    return options;
  };

  window.__rf_menu_installed = true;
}

app.registerExtension({
  name: "comfyui.rectumfire.firecopy",
  setup() {
    console.log("[Fire Copy] loaded");
    installHotkeyOnce();
    installContextMenuOnce();
    setTimeout(installContextMenuOnce, 250);
    setTimeout(installContextMenuOnce, 1000);
  }
});
