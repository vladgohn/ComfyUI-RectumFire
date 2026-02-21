import { app } from "/scripts/app.js";

function buildViewUrl(info) {
  if (!info || !info.filename) return null;
  const type = encodeURIComponent(info.type || "temp");
  const subfolder = encodeURIComponent(info.subfolder || "");
  const filename = encodeURIComponent(info.filename);
  const t = Date.now(); // cache-buster so you always see the newest temp file
  return `/view?filename=${filename}&type=${type}&subfolder=${subfolder}&t=${t}`;
}

function patchWidgetIntoImage(widget) {
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";

  // UI only
  const PAD_LR = 1;     // 1px left/right
  const TOP = 18;       // keep as is
  const FOOTER = 0;     // REMOVE footer bar completely
  const BOTTOM = 1;

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
    const availW = Math.max(40, width - PAD_LR * 2);
    let h = 80; // smaller default

    if (img.complete && img.naturalWidth > 0) {
      h = Math.round((availW * img.naturalHeight) / img.naturalWidth);
    }
    h = Math.max(MIN_H, Math.min(MAX_AUTO_H, h));

    return [width, TOP + h + FOOTER + BOTTOM];
  };

  widget.draw = function (ctx, node, width, y) {
    const nodeH = node?.size?.[1] ?? this.computeSize(width)[1];

    const availW = Math.max(40, width - PAD_LR * 2);
    const availH = Math.max(40, nodeH - y - TOP - FOOTER - BOTTOM);

    const x0 = PAD_LR;
    const y0 = y + TOP;

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

      ctx.beginPath();
      ctx.rect(x0, y0, availW, availH);
      ctx.clip();

      ctx.drawImage(img, dx, dy, dw, dh);

      ctx.restore();
      return;
    }

    // ctx.fillStyle = "rgba(255,255,255,0.75)";
    // ctx.font = "14px system-ui";
    // ctx.fillText("NO IMAGE", x0 + 12, y0 + 28);

    ctx.restore();

    node?.setDirtyCanvas?.(true, true);
  };

  widget.serializeValue = function () {
    return "dummy";
  };
}


function walkGraph(graph, cb) {
  for (const n of graph?.nodes ?? []) {
    cb(n, graph);
    if (n?.subgraph) walkGraph(n.subgraph, cb);
  }
}

function findParentSubgraphNodesForGraph(targetGraph) {
  const parents = [];
  walkGraph(app.graph, (n) => {
    if (n?.subgraph === targetGraph) parents.push(n);
  });
  return parents;
}

function installPromotionListener(subgraphNode) {
  if (!subgraphNode?.subgraph?.events) return;
  if (subgraphNode.__rf_promo_installed__) return;
  subgraphNode.__rf_promo_installed__ = true;

  subgraphNode.subgraph.events.addEventListener("widget-promoted", (e) => {
    const w = e?.detail?.widget;
    if (!w) return;
    if (w.name !== "rf_banner") return;

    patchWidgetIntoImage(w);

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

const prevExec = nodeType.prototype.onExecuted;
nodeType.prototype.onExecuted = function (message) {
  prevExec?.apply(this, arguments);

  const w = (this.widgets || []).find(x => x && x.name === "rf_banner");
  w?._rf_set_no_preview?.();

  const info =
    message?.rf_banner_preview?.[0] ??
    message?.ui?.rf_banner_preview?.[0] ??
    message?.output?.ui?.rf_banner_preview?.[0] ??
    message?.data?.ui?.rf_banner_preview?.[0] ??
    null;

  if (!info) return;

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
};


  },

  nodeCreated(node) {
    if (node.comfyClass !== "RectumFireBanner") return;

    const w = (node.widgets || []).find(x => x && x.name === "rf_banner");
    if (!w) return;

    patchWidgetIntoImage(w);

    if (node.__rf_banner_src__) {
      w._rf_set_src?.(node.__rf_banner_src__);
    }
  },
});
