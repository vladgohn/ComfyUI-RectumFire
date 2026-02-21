// fire_banner_test.js
// Custom DOM banners test (3 colors) — no ComfyUI native toast.
// Hotkey: Shift+Alt+T
// IMPORTANT: no leftover overlays; never blocks UI clicks.

import { app } from "../../scripts/app.js";

const EXT = Object.freeze({
  NAME: "RectumFire.FireBannerDomTest",
  HOTKEY: { key: "t", shiftKey: true, altKey: true },
  GUARD: "__rf_fire_banner_dom_test_registered__",
});

// ---------------------------------------------------------------------
// 1) STYLE/TOKENS (tune here)
// ---------------------------------------------------------------------
const TOKENS = Object.freeze({
  pos: { top: 14, right: 18 },

  // matches Figma: W460 H125 radius10
  card: {
    width: 460,
    height: 125,
    radius: 10,
    padX: 18,
    padY: 14,
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
    subSize: 16,
    subWeight: 500,
  },

  // From screenshot #3 circles: bg / stroke / text+close
  themes: {
  green:   { bg: "rgba(10,38,22,0.5)", stroke: "#114A29", fg: "#22C55E" },
  violet:  { bg: "rgba(23,21,36,0.5)", stroke: "#624B89", fg: "#8F60F4" },
  magenta: { bg: "rgba(45,12,32,0.5)", stroke: "#901F4A", fg: "#DC6C98" },
  },
});

// ---------------------------------------------------------------------
// 2) DOM BANNER ENGINE (no leftovers, no UI blocking)
// ---------------------------------------------------------------------
const FireDomBanner = (() => {
  const ROOT_ID = "rf-fire-banner-root";
  const STYLE_ID = "rf-fire-banner-style";

  // Namespaced classes to avoid collisions with other CSS in ComfyUI
  const CLS = Object.freeze({
    card: "rfFire__card",
    show: "rfFire__show",
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

  /* CRITICAL: root never blocks UI */
  pointer-events: none !important;
}

.${CLS.card}{
  width: ${TOKENS.card.width}px;
  height: ${TOKENS.card.height}px;
  border-radius: ${TOKENS.card.radius}px;
  box-sizing: border-box;

  padding: ${TOKENS.card.padY}px ${TOKENS.card.padX}px;
  overflow: hidden;

  transform: translateY(-10px);
  opacity: 0;
  transition: opacity 1s ease, transform 1s ease;

  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);

  font-family: ${TOKENS.type.family};

  /* CRITICAL: card itself never blocks UI */
  pointer-events: none !important;

  position: relative;
}

.${CLS.card}.${CLS.show}{
  transform: translateY(0px);
  opacity: 1;
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

/* Only clickable thing */
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

  /* CRITICAL: close is clickable */
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

    // extra safety: enforce non-blocking even if CSS is overridden
    root.style.pointerEvents = "none";

    document.body.appendChild(root);
    return root;
  }

  function cleanupIfEmpty() {
    const root = document.getElementById(ROOT_ID);
    if (root && root.childElementCount === 0) {
      try { root.remove(); } catch (_) {}
      const style = document.getElementById(STYLE_ID);
      // remove style too (prevents any weird stale layout/pointer state)
      try { style?.remove(); } catch (_) {}
    }
  }

  function makeCard({ theme, title, sub, lifeMs }) {
    const root = ensureRoot();
    const pal = TOKENS.themes[theme] || TOKENS.themes.green;

    const el = document.createElement("div");
    el.className = CLS.card;
    el.style.background = pal.bg;
    el.style.border = `1px solid ${pal.stroke}`;

    el.innerHTML = `
      <div class="${CLS.titleRow}">
        <div class="${CLS.title}" style="color:${pal.fg}">${escapeHtml(title)}</div>
        <div class="${CLS.close}" aria-label="close" style="color:${pal.fg}">×</div>
      </div>
      <div class="${CLS.sub}">${escapeHtml(sub)}</div>
    `;

    // extra safety: never block UI even if something injects styles later
    el.style.pointerEvents = "none";

    root.appendChild(el);

    const close = el.querySelector(`.${CLS.close}`);
    const kill = () => destroyCard(el);

    close?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      kill();
    });

    requestAnimationFrame(() => el.classList.add(CLS.show));

    const ms = typeof lifeMs === "number" ? lifeMs : 6500;
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

    // never block, even during fade-out window
    try { el.style.pointerEvents = "none"; } catch (_) {}

    el.classList.remove(CLS.show);

    // wait for transition; then remove
    window.setTimeout(() => {
      try { el.remove(); } catch (_) {}
      cleanupIfEmpty();
    }, 220);
  }

  function escapeHtml(s) {
    return String(s ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  return { show: makeCard };
})();

// ---------------------------------------------------------------------
// 3) TEST ACTION: one keypress -> 3 banners (stack)
// ---------------------------------------------------------------------
function showThree() {
  FireDomBanner.show({
    theme: "green",
    title: "Fire Resolve",
    sub: "Path corrected\nUpdate: umt5_xxl_fp8_scaled.safetensors",
    lifeMs: 4500,
  });

  FireDomBanner.show({
    theme: "violet",
    title: "Fire Resolve",
    sub: "Already correct\nEnjoy!",
    lifeMs: 5500,
  });

  FireDomBanner.show({
    theme: "magenta",
    title: "Fire Resolve",
    sub: "Model not found\nTried candidate field: 1",
    lifeMs: 6500,
  });
}

// ---------------------------------------------------------------------
// 4) HOTKEY
// ---------------------------------------------------------------------
function hotkeyMatches(e) {
  if (!e || e.repeat) return false;
  if ((e.key || "").toLowerCase() !== EXT.HOTKEY.key) return false;
  if (!!e.shiftKey !== EXT.HOTKEY.shiftKey) return false;
  if (!!e.altKey !== EXT.HOTKEY.altKey) return false;
  return true;
}

function onKeyDown(e) {
  const tag = (e.target?.tagName || "").toLowerCase();
  if (tag === "input" || tag === "textarea" || e.target?.isContentEditable) return;
  if (!hotkeyMatches(e)) return;

  e.preventDefault();
  e.stopPropagation();
  showThree();
}

app.registerExtension({
  name: EXT.NAME,
  setup() {
    if (window[EXT.GUARD]) return;
    window[EXT.GUARD] = true;
    window.addEventListener("keydown", onKeyDown, { capture: true });
  },
});
