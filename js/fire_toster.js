// fire_toster.js
// RectumFire DOM tosters — reusable module.
// Look, motion and placement copy the ComfyUI frontend toast (GlobalToast + PrimeVue Aura dark tokens):
// content-sized up to 25rem, right edge 0.5rem inside the graph canvas panel, slides up from below,
// tinted glass (color 500 at 16% alpha) with blur(10px). Placed below the floating action bar.
// UI only — no engine logic changed.

const TOKENS = Object.freeze({
  pos: {
    gap: 8,         // px below the action bar / canvas panel top
    right: 8,       // px inside the canvas panel's right edge (0.5rem)
    fallbackTop: 64,
  },

  card: {
    minWidth: 280,  // width follows the content between these two
    maxWidth: 400,  // 25rem, the core toast width
    minHeight: 73,
    radius: 6,
    blur: 10,
  },

  // [500, 700] pairs from the PrimeVue Aura palette, used the way Aura dark toast tokens use them.
  themes: {
    green:   ["#22c55e", "#15803d"],
    violet:  ["#8b5cf6", "#6d28d9"],
    magenta: ["#ec4899", "#be185d"],
  },
});

const FireDomtoster = (() => {
  const ROOT_ID = "rf-fire-toster-root";
  const STYLE_ID = "rf-fire-toster-style";

  const CLS = Object.freeze({
    card: "rfFire__card",
    show: "rfFire__show",
    hide: "rfFire__hide",
    content: "rfFire__content",
    icon: "rfFire__icon",
    text: "rfFire__text",
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
  top: ${TOKENS.pos.fallbackTop}px;
  right: ${TOKENS.pos.right}px;
  z-index: 10000;

  display: flex;
  flex-direction: column;
  align-items: flex-end;

  pointer-events: none;
}

.${CLS.card}{
  --rf-c: ${TOKENS.themes.green[0]};
  --rf-s: ${TOKENS.themes.green[1]};

  width: fit-content;
  min-width: ${TOKENS.card.minWidth}px;
  max-width: min(${TOKENS.card.maxWidth}px, calc(100vw - 16px));
  min-height: ${TOKENS.card.minHeight}px;
  max-height: 1000px;
  margin-bottom: 16px;
  box-sizing: border-box;

  border-radius: ${TOKENS.card.radius}px;
  border: 1px solid color-mix(in srgb, var(--rf-s), transparent 64%);
  background: color-mix(in srgb, var(--rf-c), transparent 84%);
  box-shadow: 0px 4px 8px 0px color-mix(in srgb, var(--rf-c), transparent 96%);
  backdrop-filter: blur(${TOKENS.card.blur}px);
  -webkit-backdrop-filter: blur(${TOKENS.card.blur}px);

  font-family: inherit;
  pointer-events: auto;

  opacity: 0;
  transform: translateY(50%);
  transition: transform 0.3s, opacity 0.3s;
}

.${CLS.card}.${CLS.show}{
  opacity: 1;
  transform: translateY(0);
}

.${CLS.card}.${CLS.hide}{
  max-height: 0;
  min-height: 0;
  opacity: 0;
  margin-bottom: 0;
  overflow: hidden;
  transform: translateY(0);
  transition: max-height 0.45s cubic-bezier(0, 1, 0, 1), opacity 0.3s, margin-bottom 0.3s;
}

.${CLS.content}{
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 12px;
}

.${CLS.icon}{
  flex-shrink: 0;
  font-size: 18px;
  line-height: 24px;
}

.${CLS.text}{
  flex: 1 1 auto;
  display: flex;
  flex-direction: column;
  gap: 8px;
  min-width: 0;
}

.${CLS.title}{
  color: var(--rf-c);
  font-size: 16px;
  font-weight: 500;
  line-height: 24px;
}

.${CLS.body}{
  color: #ffffff;
  font-size: 14px;
  font-weight: 500;
  line-height: 20px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  word-break: break-word;
}

.${CLS.close}{
  flex-shrink: 0;
  width: 28px;
  height: 28px;
  display: grid;
  place-items: center;
  border-radius: 50%;

  color: var(--rf-c);
  font-size: 20px;
  line-height: 1;
  user-select: none;
  cursor: pointer;
  transition: background 0.2s;
}
.${CLS.close}:hover{ background: rgba(255, 255, 255, 0.05); }
`;
    document.head.appendChild(s);
  }

  function rectOf(selector) {
    try {
      const el = document.querySelector(selector);
      const r = el?.getBoundingClientRect();
      return r && r.width > 0 && r.height > 0 ? r : null;
    } catch (_) {
      return null;
    }
  }

  // Same anchor as the core toast (right edge of the graph canvas panel),
  // but the top goes below the floating action bar instead of over it.
  function place(root) {
    const panel = rectOf('[class*="anchor-name:--graph-canvas-panel"]');
    const bar = document.querySelector(".actionbar-container")?.parentElement?.getBoundingClientRect();

    let top = panel ? panel.top + TOKENS.pos.gap : TOKENS.pos.fallbackTop;
    if (bar && bar.height > 0 && bar.bottom > top - TOKENS.pos.gap && bar.top < innerHeight / 2) {
      top = Math.max(top, bar.bottom + TOKENS.pos.gap);
    }
    const right = panel ? Math.max(0, innerWidth - panel.right) + TOKENS.pos.right : TOKENS.pos.right;

    root.style.top = `${Math.round(top)}px`;
    root.style.right = `${Math.round(right)}px`;
  }

  function ensureRoot() {
    let root = document.getElementById(ROOT_ID);
    if (!root) {
      ensureStyle();
      root = document.createElement("div");
      root.id = ROOT_ID;
      document.body.appendChild(root);
    }
    place(root);
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
    const [c500, c700] = TOKENS.themes[theme] || TOKENS.themes.green;

    const el = document.createElement("div");
    el.className = CLS.card;
    el.style.setProperty("--rf-c", c500);
    el.style.setProperty("--rf-s", c700);

    const safeSub = escapeHtml(sub);
    const safeTitle = escapeHtml(title || "Fire Resolve");

    el.innerHTML = `
      <div class="${CLS.content}">
        <div class="${CLS.icon}">🔥</div>
        <div class="${CLS.text}">
          <div class="${CLS.title}">${safeTitle}</div>
          ${safeSub ? `<div class="${CLS.body}">${safeSub}</div>` : ``}
        </div>
        <div class="${CLS.close}" aria-label="close">×</div>
      </div>
    `;

    root.appendChild(el);

    const close = el.querySelector(`.${CLS.close}`);
    const kill = () => destroyCard(el);

    close?.addEventListener("click", (e) => {
      e.preventDefault();
      e.stopPropagation();
      kill();
    });

    // Two frames so the start state (translateY(50%), opacity 0) is painted before the transition.
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add(CLS.show)));

    const ms = typeof lifeMs === "number" ? lifeMs : 2000;
    el.__rf_timer = window.setTimeout(kill, ms);

    return el;
  }

  function destroyCard(el) {
    if (!el || el.__rf_dying) return;
    el.__rf_dying = true;

    try {
      if (el.__rf_timer) {
        clearTimeout(el.__rf_timer);
        el.__rf_timer = null;
      }
    } catch (_) {}

    el.style.maxHeight = `${el.offsetHeight}px`;
    void el.offsetHeight;
    el.style.maxHeight = "";
    el.classList.add(CLS.hide);

    window.setTimeout(() => {
      try { el.remove(); } catch (_) {}
      cleanupIfEmpty();
    }, 460);
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
