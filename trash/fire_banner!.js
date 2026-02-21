// fire_banner.js
// RectumFire DOM banners (glass) — reusable module.
// IMPORTANT:
// - never blocks UI clicks (root/card pointer-events none; only close clickable)
// - no leftovers (removes root + style when empty)
// - stacks vertically

const TOKENS = Object.freeze({
  pos: { top: 14, right: 18 },

  card: {
    width: 300,
    height: 90,
    radius: 10,
    padX: 12,
    padY: 8,
    gap: 8,
  },

  close: {
    box: 24,
    fontSize: 22,
  },

  type: {
    family: "Inter, ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial",
    titleSize: 18,
    titleWeight: 600,
    subSize: 12,
    subWeight: 500,
  },

  // bg uses rgba alpha + blur (your version)
  themes: {
    green:   { bg: "rgba(10,38,22,0.5)", stroke: "#114A29", fg: "#22C55E" },
    violet:  { bg: "rgba(23,21,36,0.5)", stroke: "#624B89", fg: "#8F60F4" },
    magenta: { bg: "rgba(45,12,32,0.5)", stroke: "#901F4A", fg: "#DC6C98" },
  },
});

const FireDomBanner = (() => {
  const ROOT_ID = "rf-fire-banner-root";
  const STYLE_ID = "rf-fire-banner-style";

  const CLS = Object.freeze({
    card: "rfFire__card",
    show: "rfFire__show",
    hide: "rfFire__hide",
    titleRow: "rfFire__titleRow",
    title: "rfFire__title",
    sub: "rfFire__sub",
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
  gap: 10px !important;

  pointer-events: none !important;
}

.${CLS.card}{
  width: ${TOKENS.card.width}px;
  height: ${TOKENS.card.height}px;
  border-radius: ${TOKENS.card.radius}px;
  box-sizing: border-box;

  padding: ${TOKENS.card.padY}px ${TOKENS.card.padX}px;
  overflow: hidden;

  transform: translateY(10px);
  opacity: 0;
  transition: opacity 0.3s ease, transform 0.3s ease;

  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);

  font-family: ${TOKENS.type.family};

  pointer-events: none !important;
  position: relative;
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
  align-items: baseline;
  gap: 10px;
  margin-bottom: ${TOKENS.card.gap}px;
}

.${CLS.title}{
  font-size: ${TOKENS.type.titleSize}px;
  font-weight: ${TOKENS.type.titleWeight};
  line-height: 1.1;
}

.${CLS.sub}{
  font-size: ${TOKENS.type.subSize}px;
  font-weight: ${TOKENS.type.subWeight};
  line-height: 1.15;
  color: #fff;
  opacity: .95;
}

.${CLS.close}{
  position: absolute;
  top: -2px;
  right: -2px;

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

    // NOTE: preserve \n as line breaks in sub
    const safeSub = escapeHtml(sub).replaceAll("\n", "<br/>");

    el.innerHTML = `
      <div class="${CLS.titleRow}">
        <div class="${CLS.title}" style="color:${pal.fg}">${escapeHtml(title)}</div>
        <div class="${CLS.close}" aria-label="close" style="color:${pal.fg}">×</div>
      </div>
      <div class="${CLS.sub}">${safeSub}</div>
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

    try { el.style.pointerEvents = "none"; } catch (_) {}

    el.classList.remove(CLS.show);
    el.classList.add(CLS.hide);

    window.setTimeout(() => {
      try { el.remove(); } catch (_) {}
      cleanupIfEmpty();
    }, 320);
  }

  return { show: makeCard };
})();

/**
 * Public API for other scripts.
 * theme: "green" | "violet" | "magenta"
 */
export function fireBannerShow({ theme = "green", title = "Fire Resolve", sub = "", lifeMs } = {}) {
  try {
    return FireDomBanner.show({ theme, title, sub, lifeMs });
  } catch (e) {
    // last resort: never break caller logic
    console.log(`[FireBanner] failed:`, e);
    return null;
  }
}
