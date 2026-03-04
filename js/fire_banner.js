import { app } from "/scripts/app.js";

const BANNER_DEFAULT_SIZE = [240, 360]; // 2:3

function buildViewUrl(info) {
  if (!info || !info.filename) return null;
  const type = encodeURIComponent(info.type || "temp");
  const subfolder = encodeURIComponent(info.subfolder || "");
  const filename = encodeURIComponent(info.filename);
  const t = Date.now(); // cache-buster so you always see the newest temp file
  return `/view?filename=${filename}&type=${type}&subfolder=${subfolder}&t=${t}`;
}

function isBannerPreviewInfo(info) {
  if (!info || !info.filename) return false;
  const name = String(info.filename || "");
  // Prefer rf_banner_*.png, but allow generic image names for compatibility with older/newer payloads.
  return name.toLowerCase().endsWith(".png") || name.toLowerCase().endsWith(".jpg") || name.toLowerCase().endsWith(".jpeg") || name.toLowerCase().endsWith(".webp");
}

function patchWidgetIntoImage(widget) {
  if (!widget) return;
  if (widget.__rf_banner_patched__) return;
  widget.__rf_banner_patched__ = true;

  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";

  // UI only
  const PAD_LR = 1;     // 1px left/right
  const TOP = 18;       // keep as is
  const FOOTER = 0;     // REMOVE footer bar completely
  const BOTTOM = 1;
  const INNER_PAD = 10; // preview outer margins
  const RADIUS = 6;     // rounded corners
  const BORDER_W = 2;   // outline width
  const BORDER_COLOR = "#000000";

  const MIN_H = 50;     // smaller minimum preview
  const MAX_AUTO_H = 120; // keep auto size modest

  widget.options = widget.options || {};
  widget.options.readonly = true;
  widget._rf_img = img;

  img.onload = () => app.graph?.setDirtyCanvas?.(true, true);
  img.onerror = () => app.graph?.setDirtyCanvas?.(true, true);

  widget._rf_set_src = function (src) {
    if (!src) return;
    if (this._rf_img?.src === src) return;
    this._rf_img.src = src;
    app.graph?.setDirtyCanvas?.(true, true);
  };

  widget.computeSize = function (width) {
    const availW = Math.max(40, width - PAD_LR * 2 - INNER_PAD * 2);
    let h = 80; // smaller default

    if (img.complete && img.naturalWidth > 0) {
      h = Math.round((availW * img.naturalHeight) / img.naturalWidth);
    }
    h = Math.max(MIN_H, Math.min(MAX_AUTO_H, h));

    return [width, TOP + h + FOOTER + BOTTOM];
  };

  widget.draw = function (ctx, node, width, y) {
    const nodeH = node?.size?.[1] ?? this.computeSize(width)[1];

    const availW = Math.max(40, width - PAD_LR * 2 - INNER_PAD * 2);
    const availH = Math.max(40, nodeH - y - TOP - FOOTER - BOTTOM - INNER_PAD * 2);

    const x0 = PAD_LR + INNER_PAD;
    const y0 = y + TOP + INNER_PAD;

    const roundRectPath = (x, y, w, h, r) => {
      const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
      ctx.beginPath();
      if (rr <= 0) {
        ctx.rect(x, y, w, h);
      } else {
        ctx.moveTo(x + rr, y);
        ctx.arcTo(x + w, y, x + w, y + h, rr);
        ctx.arcTo(x + w, y + h, x, y + h, rr);
        ctx.arcTo(x, y + h, x, y, rr);
        ctx.arcTo(x, y, x + w, y, rr);
      }
      ctx.closePath();
    };

    ctx.save();
    ctx.globalAlpha = 1;

    if (img.complete && img.naturalWidth > 0) {
      const sx = availW / img.naturalWidth;
      const sy = availH / img.naturalHeight;
      const s = Math.min(sx, sy);

      const dw = Math.max(1, Math.floor(img.naturalWidth * s));
      const dh = Math.max(1, Math.floor(img.naturalHeight * s));

      const dx = x0 + Math.floor((availW - dw) / 2);
      const dy = y0;

      // Clip exactly to the drawn image rect so frame/icon move with image.
      roundRectPath(dx, dy, dw, dh, RADIUS);
      ctx.clip();

      ctx.drawImage(img, dx, dy, dw, dh);

      // Brand mark in top-left corner over image.
      ctx.font = "bold 16px system-ui, sans-serif";
      ctx.textBaseline = "top";
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "#111cff";
      ctx.lineWidth = 3;
      ctx.strokeText("🔥", dx + 5, dy + 5);
      ctx.fillText("🔥", dx + 5, dy + 5);

      // 2px black outline around preview.
      ctx.lineWidth = BORDER_W;
      ctx.strokeStyle = BORDER_COLOR;
      roundRectPath(dx, dy, dw, dh, RADIUS);
      ctx.stroke();

      ctx.restore();
      return;
    }

    // ctx.fillStyle = "rgba(255,255,255,0.75)";
    // ctx.font = "14px system-ui";
    // ctx.fillText("NO IMAGE", x0 + 12, y0 + 28);

    ctx.restore();
  };

}


function walkGraph(graph, cb) {
  const nodes = graph?._nodes || graph?.nodes || [];
  for (const n of nodes) {
    cb(n, graph);
    if (n?.subgraph) walkGraph(n.subgraph, cb);
  }
}

function findParentSubgraphNodesForGraph(targetGraph) {
  if (!targetGraph) return [];
  const parents = [];
  walkGraph(app.graph, (n) => {
    if (n?.subgraph === targetGraph) parents.push(n);
  });
  return parents;
}

function extractPreviewInfo(message) {
  return (
    message?.rf_banner_preview?.[0] ??
    message?.ui?.rf_banner_preview?.[0] ??
    message?.output?.ui?.rf_banner_preview?.[0] ??
    message?.data?.ui?.rf_banner_preview?.[0] ??
    // Compatibility fallbacks for alternate event payloads:
    message?.output?.rf_banner_preview?.[0] ??
    message?.ui?.images?.[0] ??
    null
  );
}

function installPromotionListener(subgraphNode) {
  if (!subgraphNode?.subgraph?.events) return;
  if (subgraphNode.__rf_promo_installed__) return;
  subgraphNode.__rf_promo_installed__ = true;

  subgraphNode.subgraph.events.addEventListener("widget-promoted", (e) => {
    const w = e?.detail?.widget;
    if (!w) return;
    if (w.name !== "rf_banner") return;
    // Promoted widgets can have different lifecycles; keep patching defensive.
    try { patchWidgetIntoImage(w); } catch (_) { return; }

    const src = subgraphNode.__rf_banner_src__;
    if (src) w._rf_set_src?.(src);

    subgraphNode.setDirtyCanvas?.(true, true);
  });
}

app.registerExtension({
  name: "rf.banner.widget_preview_from_python",

  async afterConfigureGraph() {
    walkGraph(app.graph, (n) => {
      if (n?.subgraph) installPromotionListener(n);
    });
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "RectumFireBanner") return;

const prevCreated = nodeType.prototype.onNodeCreated;
nodeType.prototype.onNodeCreated = function () {
  const r = prevCreated?.apply(this, arguments);
  try {
    // Default shape for newly added banner nodes; saved workflow sizes can override later.
    if (!this.__rf_banner_size_init__) {
      this.__rf_banner_size_init__ = true;
      this.size = [...BANNER_DEFAULT_SIZE];
      this.setSize?.(this.size);
    }
  } catch (_) {}
  return r;
};

const prevExec = nodeType.prototype.onExecuted;
nodeType.prototype.onExecuted = function (message) {
  try { prevExec?.apply(this, arguments); } catch (_) {}

  try {
    const w = (this.widgets || []).find(x => x && x.name === "rf_banner");
    if (w && !w.__rf_banner_patched__) {
      try { patchWidgetIntoImage(w); } catch (_) {}
    }
    w?._rf_set_no_preview?.();

    const info = extractPreviewInfo(message);

    if (!isBannerPreviewInfo(info)) {
      try { console.warn("[RectumFireBanner] preview info missing/invalid", message); } catch (_) {}
      return;
    }

    const src = buildViewUrl(info);
    if (!src) {
      if (w) { w._rf_state = 4; w._rf_label = "BAD SRC"; }
      try { app.graph?.setDirtyCanvas?.(true, true); } catch {}
      return;
    }

    this.__rf_banner_src__ = src;

    if (w?._rf_set_src) w._rf_set_src(src);

    const parents = findParentSubgraphNodesForGraph(this.graph);
    for (const p of parents) {
      p.__rf_banner_src__ = src;
      p.setDirtyCanvas?.(true, true);
    }

    this.setDirtyCanvas?.(true, true);
  } catch (e) {
    // Never let banner UI logic break workflow execution.
    try { console.warn("[RectumFireBanner] onExecuted error:", e); } catch (_) {}
  }
};


  },

  nodeCreated(node) {
    if (node?.subgraph) {
      installPromotionListener(node);
    }

    if (node.comfyClass !== "RectumFireBanner") return;

    const w = (node.widgets || []).find(x => x && x.name === "rf_banner");
    if (!w) return;

    patchWidgetIntoImage(w);

    if (node.__rf_banner_src__) {
      w._rf_set_src?.(node.__rf_banner_src__);
    }
  },
});
