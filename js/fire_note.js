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
    el.style.background = "rgba(0,0,0,.78)";
    el.style.color = "#fff";
    el.style.font = "12px/1.35 system-ui";
    document.body.appendChild(el);
  }
  el.textContent = text;
  el.style.display = "block";
  clearTimeout(el._t);
  el._t = setTimeout(() => el.style.display = "none", ms);
}

function readClipboardSync() {
  const ta = document.createElement("textarea");
  ta.style.position = "fixed";
  ta.style.left = "-9999px";
  ta.style.top = "0";
  document.body.appendChild(ta);
  ta.focus();
  document.execCommand("paste");
  const text = ta.value;
  document.body.removeChild(ta);
  return text;
}

function createNoteAtMouse(text) {
  const g = app?.graph;
  const canvas = app?.canvas;
  if (!g || !canvas) {
    overlay("Graph not ready");
    return;
  }

  const node = LiteGraph.createNode("RectumFireNote");
  if (!node) {
    overlay("FireNote type missing");
    return;
  }

  const pos = canvas.convertCanvasToOffset(canvas.mouse || [100, 100]);
  node.pos = pos;

  g.add(node);

  if (node.widgets && node.widgets.length > 0) {
    node.widgets[0].value = text;
  }

  app.canvas.setDirty(true, true);
}

function pasteNow() {
  const text = readClipboardSync();

  if (!text) {
    overlay("Clipboard empty");
    return;
  }

  createNoteAtMouse(text);
  overlay("Pasted");
}

function install() {
  if (window.__rf_note_installed__) return;
  window.__rf_note_installed__ = true;

  window.addEventListener(
    "keydown",
    (e) => {
      if (e.altKey && e.shiftKey && e.key.toLowerCase() === "v") {
        e.preventDefault();
        pasteNow();
      }
    },
    true
  );
}

app.registerExtension({
  name: "RectumFireNote",
  setup() {
    install();
  },
});
