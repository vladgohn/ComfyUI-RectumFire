console.log("[node_palette] loaded");

const PALETTE = {
  red:       { color:"#9D0500", bgcolor:"#960029", groupcolor:"#DF0700" },
  orange:    { color:"#834C00", bgcolor:"#521B00", groupcolor:"#BA6C00" },
  yellow:    { color:"#E26805", bgcolor:"#EBB801", groupcolor:"#EBB901" },
  green:     { color:"#008020", bgcolor:"#097300", groupcolor:"#00B62D" },
  cyan:      { color:"#025EB5", bgcolor:"#007292", groupcolor:"#008ED0" },
  blue:      { color:"#001E5E", bgcolor:"#00329F", groupcolor:"#00329F" },
  purple:    { color:"#56009C", bgcolor:"#7000CB", groupcolor:"#8B00FE" },
  brown:     { color:"#810063", bgcolor:"#71006C", groupcolor:"#B800AF" },
  black:     { color:"#000000", bgcolor:"#000000", groupcolor:"#000000" },
  pale_blue: { color:"#25005E", bgcolor:"#3E00A1", groupcolor:"#3E00A1" },
};

function isPaletteApplied(nodeColors) {
  // Проверим один маркерный цвет
  const v = nodeColors?.pale_blue;
  return v && typeof v === "object" && v.bgcolor && v.bgcolor.toLowerCase() === "#b1ff2bff";
}

function applyPaletteOnce() {
  const LGC = window.LGraphCanvas;
  const nc = LGC?.node_colors;

  if (!nc) return false;

  // Важно: МЕРДЖ, а не replace
  Object.assign(nc, PALETTE);

  // Подстрахуем: иногда рендер берёт из LiteGraph (зависит от сборки)
  if (window.LiteGraph?.node_colors) {
    Object.assign(window.LiteGraph.node_colors, PALETTE);
  }

  // Перерисовать
  try { window.app?.graph?.setDirtyCanvas(true, true); } catch (e) {}
  return true;
}

(function keepApplyingForAWhile() {
  const start = Date.now();
  const MAX_MS = 30000;     // 30 секунд держим “замок”
  const TICK = 250;

  const timer = setInterval(() => {
    const LGC = window.LGraphCanvas;
    const nc = LGC?.node_colors;

    // Ждём пока вообще появится
    if (!nc) return;

    // Если нет нужной палитры — накатываем
    if (!isPaletteApplied(nc)) {
      applyPaletteOnce();
      console.log("[node_palette] palette reapplied");
    }

    // Через 30 сек отпускаем
    if (Date.now() - start > MAX_MS) {
      clearInterval(timer);
      console.log("[node_palette] done (lock released)");
    }
  }, TICK);
})();
