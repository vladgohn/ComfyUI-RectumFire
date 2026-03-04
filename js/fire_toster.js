// fire_toster.js
// RectumFire DOM tosters (glass) — reusable module.
// UI only — no engine logic changed.

const TOKENS = Object.freeze({
  pos: { top: 64, right: 18 },

  card: {
    width: 280,
    radius: 14,
  },

  close: {
    box: 24,
    fontSize: 20,
  },

  type: {
    family: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
  },

  themes: {
    green:   { bg: "rgba(10,38,22,0.85)", stroke: "#114A29", fg: "#22C55E" },
    violet:  { bg: "rgba(23,21,36,0.85)", stroke: "#624B89", fg: "#8F60F4" },
    magenta: { bg: "rgba(45,12,32,0.85)", stroke: "#901F4A", fg: "#DC6C98" },
  },
});

const FireDomtoster = (() => {
  const ROOT_ID = "rf-fire-toster-root";
  const STYLE_ID = "rf-fire-toster-style";

  const CLS = Object.freeze({
    card: "rfFire__card",
    show: "rfFire__show",
    hide: "rfFire__hide",
    titleRow: "rfFire__titleRow",
    title: "rfFire__title",
    body: "rfFire__body",
    close: "rfFire__close",
  });

  function ensureStyle() {
    if (document.getElementById(STYLE_ID)) return;

    const s = document.createElement("style");
    s.id = STYLE_ID;
    s.textContent = `
#${ROOT_ID}{
  position: fixed;
  top: ${TOKENS.pos.top}px;
  right: ${TOKENS.pos.right}px;
  z-index: 999999;

  display: flex !important;
  flex-direction: column !important;
  gap: 12px !important;

  pointer-events: none !important;
}

.${CLS.card}{
  width: ${TOKENS.card.width}px;
  min-height: 64px;
  height: auto;

  border-radius: ${TOKENS.card.radius}px;
  box-sizing: border-box;

  padding: 14px 16px;

  transform: translateY(10px);
  opacity: 0;
  transition: opacity 0.3s ease, transform 0.3s ease;

  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);

  font-family: ${TOKENS.type.family};

  pointer-events: none !important;
  position: relative;

  overflow-wrap: anywhere;
  word-break: break-word;
}

.${CLS.card}.${CLS.show}{
  transform: translateY(0px);
  opacity: 1;
}

.${CLS.card}.${CLS.hide}{
  transform: translateY(-10px);
  opacity: 0;
}

.${CLS.titleRow}{
  position: relative;
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.${CLS.title}{
  font-size: 15px;
  font-weight: 500;
  line-height: 1.2;
}

.${CLS.body}{
  font-size: 12px;
  font-weight: 400;
  color: #ffffff;
  line-height: 1.35;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.${CLS.close}{
  width: ${TOKENS.close.box}px;
  height: ${TOKENS.close.box}px;
  display: grid;
  place-items: center;

  font-size: ${TOKENS.close.fontSize}px;
  line-height: 1;
  user-select: none;
  cursor: pointer;

  opacity: .85;
  pointer-events: auto !important;
}
.${CLS.close}:hover{ opacity: 1; }
`;
    document.head.appendChild(s);
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (root) return root;

    ensureStyle();
    root = document.createElement("div");
    root.id = ROOT_ID;
    root.style.pointerEvents = "none";
    document.body.appendChild(root);
    return root;
  }

  function cleanupIfEmpty() {
    const root = document.getElementById(ROOT_ID);
    if (root && root.childElementCount === 0) {
      try { root.remove(); } catch (_) {}
      const style = document.getElementById(STYLE_ID);
      try { style?.remove(); } catch (_) {}
    }
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function makeCard({ theme, title, sub, lifeMs }) {
    const root = ensureRoot();
    const pal = TOKENS.themes[theme] || TOKENS.themes.green;

    const el = document.createElement("div");
    el.className = CLS.card;
    el.style.background = pal.bg;
    el.style.border = `1px solid ${pal.stroke}`;
    el.style.pointerEvents = "none";

    const safeSub = escapeHtml(sub);

    const safeTitle = escapeHtml(title || "Fire Resolve");

    el.innerHTML = `
      <div class="${CLS.titleRow}">
        <div style="display:flex; align-items:center; gap:8px;">
          <div style="font-size:16px;">🔥</div>
          <div class="${CLS.title}" style="color:${pal.fg}">${safeTitle}</div>
        </div>
        <div class="${CLS.close}" aria-label="close" style="color:${pal.fg}">×</div>
      </div>
      ${safeSub ? `<div class="${CLS.body}">${safeSub}</div>` : ``}
    `;

    root.appendChild(el);

    const close = el.querySelector(`.${CLS.close}`);
    const kill = () => destroyCard(el);

    close?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      kill();
    });

    requestAnimationFrame(() => {
      el.classList.remove(CLS.hide);
      el.classList.add(CLS.show);
    });

    const ms = typeof lifeMs === "number" ? lifeMs : 2000;
    el.__rf_timer = window.setTimeout(kill, ms);

    return el;
  }

  function destroyCard(el) {
    if (!el) return;

    try {
      if (el.__rf_timer) {
        clearTimeout(el.__rf_timer);
        el.__rf_timer = null;
      }
    } catch (_) {}

    el.classList.remove(CLS.show);
    el.classList.add(CLS.hide);

    window.setTimeout(() => {
      try { el.remove(); } catch (_) {}
      cleanupIfEmpty();
    }, 320);
  }

  return { show: makeCard };
})();

export function firetosterShow({ theme = "green", title = "Fire Resolve", sub = "", lifeMs } = {}) {
  try {
    return FireDomtoster.show({ theme, title, sub, lifeMs });
  } catch (e) {
    console.log(`[Firetoster] failed:`, e);
    return null;
  }
}
