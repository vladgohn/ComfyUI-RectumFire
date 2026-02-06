import { app } from "/scripts/app.js";

// Support both new and legacy internal node types
const FIRE_NOTE_TYPES = ["RectumFireNote", "RectumFire Sticker Note"];

// kawaii post-it palette
const BG = "#ffe0ee";        // soft pink
const BORDER = "#ff77b7";    // border pink
const TITLE = "#ff2f8e";     // title color

function isFireNote(node) {
  if (!node) return false;

  // Primary: by internal type
  if (node?.type && FIRE_NOTE_TYPES.includes(node.type)) return true;

  // Fallback: by title (if type changed in some builds)
  const t = String(node?.title || "").toLowerCase();
  if (t.includes("fire note")) return true;

  return false;
}

function applyKawaiiStyle(node) {
  if (!node) return;

  node.bgcolor = BG;
  node.color = BORDER;
  node.title = "🔥Fire Note";

  const minW = Math.max(node.size?.[0] || 0, 380);
  const minH = Math.max(node.size?.[1] || 0, 260);
  node.size = [minW, minH];

  node.title_color = TITLE;
  node.rounded = true;

  try {
    const widget =
      (node.widgets || []).find(x => x?.name === "text") ||
      (node.widgets || [])[0];

    const el = widget?.inputEl || widget?.element || widget?.textarea || null;

    if (el) {
      // styles
      if (el.style) {
        el.style.background = "#ff9acb";
        el.style.color = "#1b1b1b";
        el.style.fontSize = "14px";
        el.style.padding = "6px";
        el.style.border = "1px solid #ff5aa8";
      }

      // Single-click selects the whole line
      if (!el.__fireLineSelectInstalled) {
        el.addEventListener("mousedown", (ev) => {
          if (ev.button !== 0) return;
          if (ev.shiftKey || ev.altKey || ev.ctrlKey || ev.metaKey) return;

          const ta = ev.currentTarget;
          const text = ta.value || "";
          const pos = ta.selectionStart ?? 0;

          setTimeout(() => {
            const p = ta.selectionStart ?? pos;

            let start = text.lastIndexOf("\n", p - 1);
            start = (start === -1) ? 0 : start + 1;

            let end = text.indexOf("\n", p);
            end = (end === -1) ? text.length : end;

            if (start === end) return;
            ta.setSelectionRange(start, end);
          }, 0);
        });

        el.__fireLineSelectInstalled = true;
      }
    }
  } catch (e) {}
}

function styleAll() {
  const g = app?.graph;
  const nodes = g?._nodes || [];
  for (const n of nodes) {
    if (isFireNote(n)) applyKawaiiStyle(n);
  }
  app?.canvas?.setDirty(true, true);
}

/**
 * В новых сборках textarea у widget может создаваться не сразу.
 * Поэтому делаем короткую “догонялку” на несколько секунд после старта.
 * Это и вернёт line-select, и вернёт стили даже если DOM появился позже.
 */
function startCatchUpStyler() {
  const started = Date.now();
  const id = setInterval(() => {
    styleAll();

    // живём недолго, чтобы не жрать CPU
    if (Date.now() - started > 12000) clearInterval(id);
  }, 500);
}

app.registerExtension({
  name: "comfyui.rectumfire.firenote_kawaii",
  setup() {
    console.log("[Fire Note] kawaii style loaded");

    styleAll();
    setTimeout(styleAll, 250);
    setTimeout(styleAll, 1000);

    startCatchUpStyler();
  },

  nodeCreated(node) {
    if (isFireNote(node)) {
      applyKawaiiStyle(node);
      app?.canvas?.setDirty(true, true);
    }
  }
});
