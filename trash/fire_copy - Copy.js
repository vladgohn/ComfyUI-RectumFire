import { app } from "../../scripts/app.js";

/**
 * Fire Copy (RectumFire) — Copy model/LoRA name(s) from selected node
 * Default hotkeys:
 *   Alt+Shift+C -> copy from selected node (or DIAG)
 *   Alt+Shift+V -> paste into Fire Note at mouse position
 */

function overlay(text, ms = 1200) {
  try {
    const id = "__rf_overlay__";
    let el = document.getElementById(id);
    if (!el) {
      el = document.createElement("div");
      el.id = id;
      el.style.position = "fixed";
      el.style.left = "14px";
      el.style.bottom = "14px";
      el.style.zIndex = "999999";
      el.style.padding = "10px 12px";
      el.style.borderRadius = "10px";
      el.style.background = "rgba(0,0,0,.78)";
      el.style.color = "#fff";
      el.style.font = "12px/1.35 system-ui, -apple-system, Segoe UI, Roboto, Arial";
      el.style.whiteSpace = "pre-wrap";
      el.style.maxWidth = "52vw";
      el.style.boxShadow = "0 8px 30px rgba(0,0,0,.35)";
      document.body.appendChild(el);
    }
    el.textContent = String(text ?? "");
    el.style.display = "block";
    clearTimeout(el.__rf_to);
    el.__rf_to = setTimeout(() => (el.style.display = "none"), ms);
  } catch (_) {}
}

/* -------------------- helpers -------------------- */

const FIRE_NOTE_TYPES = ["RectumFireNote", "RectumFire Sticker Note"];
const FIRE_NOTE_WIDGET = "text";
const PENDING_KEY = "__rf_firecopy_pending__";

function setPendingText(t) {
  try { window[PENDING_KEY] = String(t ?? ""); } catch (_) {}
}
function getPendingText() {
  try { return String(window[PENDING_KEY] ?? ""); } catch (_) { return ""; }
}
function clearPendingText() {
  try { window[PENDING_KEY] = ""; } catch (_) {}
}

function getSingleSelectedNode() {
  const g = app?.graph;
  const sel = g?._nodes?.filter(n => n?.is_selected) || [];
  return sel.length === 1 ? sel[0] : null;
}

function normalizeModelName(name) {
  return String(name ?? "").trim();
}

function diagForNode(node) {
  const w = (node?.widgets || []).map(x => ({
    name: x?.name,
    value: x?.value,
    type: x?.type
  }));
  return {
    id: node?.id,
    type: node?.type,
    title: node?.title,
    widgets: w
  };
}

function extractSingleLoraName(node) {
  const ws = node?.widgets || [];
  for (const w of ws) {
    const n = (w?.name || "").toLowerCase();
    if (n.includes("lora") && typeof w?.value === "string" && w.value.trim()) {
      return w.value.trim();
    }
  }
  return "";
}

function extractPowerLoraNames(node) {
  const ws = node?.widgets || [];
  const out = [];
  for (const w of ws) {
    const n = (w?.name || "").toLowerCase();
    if (n.includes("lora") && typeof w?.value === "string") {
      const v = w.value.trim();
      if (v) out.push(normalizeModelName(v));
    }
  }
  return [...new Set(out)];
}

function extractModelNameByKnownWidgets(node) {
  const ws = node?.widgets || [];
  const keys = ["model", "ckpt_name", "checkpoint", "checkpoint_name", "unet_name", "vae_name", "clip_name"];
  for (const w of ws) {
    const n = (w?.name || "").toLowerCase();
    if (keys.some(k => n.includes(k)) && typeof w?.value === "string" && w.value.trim()) {
      return normalizeModelName(w.value);
    }
  }
  return "";
}

function getFireNoteTextWidget(node) {
  const ws = node?.widgets || [];
  const byName = ws.find(w => w?.name === FIRE_NOTE_WIDGET);
  if (byName) return byName;
  if (ws.length) return ws[0];
  return null;
}

function findExistingFireNoteNode() {
  const g = app?.graph;
  const nodes = g?._nodes || [];
  for (const n of nodes) {
    if (n && FIRE_NOTE_TYPES.includes(n.type)) return n;
  }
  return null;
}

function getGraphPosUnderMouse() {
  const canvas = app?.canvas;
  if (!canvas) return [80, 80];

  const mp = canvas.mouse;
  if (mp && mp.length >= 2) {
    if (typeof canvas.convertCanvasToOffset === "function") {
      const p = canvas.convertCanvasToOffset(mp);
      if (p && p.length >= 2) return p;
    }

    const z = canvas.ds?.scale || 1;
    const ox = canvas.ds?.offset?.[0] || 0;
    const oy = canvas.ds?.offset?.[1] || 0;
    return [(mp[0] - ox) / z, (mp[1] - oy) / z];
  }

  return [80, 80];
}

function createFireNoteAt(posXY) {
  const g = app?.graph;
  const LG = window.LiteGraph;
  if (!g || !LG || typeof LG.createNode !== "function") return null;

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

/* -------------------- actions -------------------- */

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    setPendingText(text);
    overlay(`🔥 Fire Copy!\n${text}`, 1400);
    return true;
  } catch (err) {
    console.warn("[Fire Copy] clipboard API failed, fallback prompt()", err);
    window.prompt("Fire Copy: copy this manually (Ctrl+C, Enter)", text);
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

async function actionPasteToFireNoteAtMouse() {
  let text = getPendingText().trimEnd();
  if (!text) {
    try {
      text = String(await navigator.clipboard.readText() || "").trimEnd();
    } catch (_) {}
  }

  if (!text) {
    overlay("Nothing to paste", 1100);
    return;
  }

  let note = findExistingFireNoteNode();
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

/* -------------------- ComfyUI official hooks -------------------- */

app.registerExtension({
  name: "comfyui.rectumfire.firecopy",

  // Official commands + keybindings API
  commands: [
    {
      id: "rf.firecopy.copy",
      label: "🔥 Fire Copy: Copy name (or DIAG)",
      function: () => actionCopyFromNode(getSingleSelectedNode())
    },
    {
      id: "rf.firecopy.paste",
      label: "✏️ Fire Paste: To Fire Note at mouse",
      function: () => actionPasteToFireNoteAtMouse()
    }
  ],

  keybindings: [
    { combo: { key: "c", alt: true, shift: true }, commandId: "rf.firecopy.copy" },
    { combo: { key: "v", alt: true, shift: true }, commandId: "rf.firecopy.paste" }
  ],

  // Official node context menu hook (no prototype monkey-patching)
  getNodeMenuItems(node) {
    return [
      {
        content: "🔥 Fire Copy: Copy name (or DIAG)  (Alt+Shift+C)",
        callback: () => actionCopyFromNode(node).catch(err => {
          console.error(err);
          overlay("Fire Copy error (see console)", 1400);
        })
      },
      {
        content: "✏️ Fire Paste: To Fire Note at mouse (Alt+Shift+V)",
        callback: () => actionPasteToFireNoteAtMouse().catch(err => {
          console.error(err);
          overlay("Fire Paste error (see console)", 1400);
        })
      }
    ];
  },

  setup() {
    console.log("[Fire Copy] loaded (API mode)");
  }
});
