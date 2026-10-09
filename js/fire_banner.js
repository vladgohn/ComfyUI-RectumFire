import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

// Fire Banner
// Draws subgraph previews directly on the subgraph host node (classic LiteGraph canvas):
//  - live sampler frames (b_preview_with_metadata) while anything inside the subgraph is sampling
//  - the Fire Banner image once it executes (wins over other images of the same run)
//  - otherwise the last Preview/Save image produced inside the subgraph
// Does not depend on widget promotion, which the newer frontend no longer renders on the classic canvas.

const BANNER_DEFAULT_SIZE = [240, 360]; // 2:3
const HOST_PAD = 8;
const HOST_RADIUS = 6;
const HOST_MIN_AREA = 48;    // grow the host only when it has less room than this
const HOST_MAX_AUTO_H = 420; // cap for automatic growth
const HOST_MIN_W = 240;

function viewUrl(info) {
  if (!info || !info.filename) return null;
  const type = encodeURIComponent(info.type || "temp");
  const subfolder = encodeURIComponent(info.subfolder || "");
  const filename = encodeURIComponent(info.filename);
  return `/view?filename=${filename}&type=${type}&subfolder=${subfolder}&t=${Date.now()}`;
}

function redraw() {
  try { app.canvas?.setDirty?.(true, true); } catch (_) {}
}

// "5:12:3" -> [host 5 in root, host 12 inside 5]; the last part is the producing node itself.
function hostsForExecutionId(execId) {
  const parts = String(execId ?? "").split(":").filter(Boolean);
  const hosts = [];
  let graph = app.rootGraph ?? app.graph;
  for (let i = 0; i < parts.length - 1; i++) {
    const id = parts[i];
    const n = graph?.getNodeById?.(id) ?? graph?.getNodeById?.(Number(id)) ??
      (graph?._nodes || graph?.nodes || []).find(x => String(x.id) === id);
    if (!n?.subgraph) break;
    hosts.push(n);
    graph = n.subgraph;
  }
  return hosts;
}

function loadImage(src, onReady) {
  const img = new Image();
  img.decoding = "async";
  img.onload = () => onReady(img);
  img.onerror = () => {};
  img.src = src;
}

function setHostImage(host, img, kind, promptId, objectUrl) {
  const prev = host.__rf_host;
  if (prev?.objectUrl && prev.objectUrl !== objectUrl) {
    try { URL.revokeObjectURL(prev.objectUrl); } catch (_) {}
  }
  host.__rf_host = { img, kind, promptId, objectUrl };
  ensureHostRoom(host, img);
  redraw();
}

function baseHeight(node) {
  try {
    const s = node.computeSize?.();
    if (s && Number.isFinite(s[1])) return s[1];
  } catch (_) {}
  return 0;
}

function ensureHostRoom(node, img) {
  if (!img?.naturalWidth || node.flags?.collapsed) return;
  const base = baseHeight(node);
  const area = node.size[1] - base - HOST_PAD * 2;
  if (area >= HOST_MIN_AREA) return;
  const w = Math.max(node.size[0], HOST_MIN_W);
  const h = Math.round(((w - HOST_PAD * 2) * img.naturalHeight) / img.naturalWidth);
  const target = [w, base + HOST_PAD * 2 + Math.max(HOST_MIN_AREA, Math.min(HOST_MAX_AUTO_H, h))];
  if (node.setSize) node.setSize(target); else node.size = target;
}

function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function drawHostPreview(node, ctx) {
  const st = node.__rf_host;
  const img = st?.img;
  if (!img?.complete || !img.naturalWidth || node.flags?.collapsed) return;

  const top = baseHeight(node) + HOST_PAD;
  const availW = node.size[0] - HOST_PAD * 2;
  const availH = node.size[1] - top - HOST_PAD;
  if (availW < 16 || availH < 16) return;

  const s = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
  const dw = Math.max(1, Math.floor(img.naturalWidth * s));
  const dh = Math.max(1, Math.floor(img.naturalHeight * s));
  const dx = HOST_PAD + Math.floor((availW - dw) / 2);
  const dy = top;

  ctx.save();
  roundRectPath(ctx, dx, dy, dw, dh, HOST_RADIUS);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);

  if (st.kind === "live") {
    const label = "LIVE";
    ctx.font = "bold 7px system-ui, sans-serif";
    ctx.textBaseline = "top";
    const tw = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(0,0,0,0.55)";
    ctx.fillRect(dx + dw - tw - 9, dy + 4, tw + 5, 10);
    ctx.fillStyle = "#22c55e";
    ctx.fillText(label, dx + dw - tw - 6.5, dy + 5.5);
  }

  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000000";
  roundRectPath(ctx, dx, dy, dw, dh, HOST_RADIUS);
  ctx.stroke();
  ctx.restore();
}

function installHostDrawHook() {
  const proto = window.LiteGraph?.LGraphNode?.prototype;
  if (!proto || proto.__rf_host_draw_installed__) return;
  proto.__rf_host_draw_installed__ = true;
  const prevFg = proto.onDrawForeground;
  proto.onDrawForeground = function (ctx) {
    const r = prevFg?.apply(this, arguments);
    if (this.__rf_host) {
      try { drawHostPreview(this, ctx); } catch (_) {}
    }
    return r;
  };
}

function onLivePreview(e) {
  const d = e?.detail;
  if (!d?.blob) return;
  const hosts = hostsForExecutionId(d.displayNodeId ?? d.nodeId);
  if (!hosts.length) return;
  const url = URL.createObjectURL(d.blob);
  loadImage(url, (img) => {
    for (const h of hosts) setHostImage(h, img, "live", d.jobId, hosts[hosts.length - 1] === h ? url : null);
  });
}

function onExecuted(e) {
  const d = e?.detail;
  const out = d?.output;
  if (!out) return;
  const execId = d.display_node ?? d.node;
  const hosts = hostsForExecutionId(execId);
  if (!hosts.length) return;

  const banner = out.rf_banner_preview?.[0];
  const generic = out.images?.find?.(i => i?.filename && !/\.(mp4|webm|gif)$/i.test(i.filename));
  const info = banner ?? generic;
  if (!info) return;
  const kind = banner ? "banner" : "final";

  loadImage(viewUrl(info), (img) => {
    for (const h of hosts) {
      const cur = h.__rf_host;
      // Within one run the banner image wins over generic Preview/Save images.
      if (kind === "final" && cur?.kind === "banner" && cur.promptId === d.prompt_id) continue;
      setHostImage(h, img, kind, d.prompt_id, null);
    }
  });
}

// ---- banner node itself (visible when you are inside the subgraph) ----

function patchBannerWidget(widget) {
  if (!widget || widget.__rf_banner_patched__) return;
  widget.__rf_banner_patched__ = true;
  widget.options = widget.options || {};
  widget.options.readonly = true;
  widget.serialize = true;
  widget._rf_img = null;

  widget._rf_set_src = function (src) {
    loadImage(src, (img) => { this._rf_img = img; redraw(); });
  };

  widget.computeSize = function (width) {
    return [width, 80];
  };

  widget.draw = function (ctx, node, width, y) {
    const img = this._rf_img;
    if (!img?.naturalWidth) return;
    const pad = 10;
    const availW = Math.max(16, width - pad * 2);
    const availH = Math.max(16, (node?.size?.[1] ?? 0) - y - pad * 2);
    const s = Math.min(availW / img.naturalWidth, availH / img.naturalHeight);
    const dw = Math.max(1, Math.floor(img.naturalWidth * s));
    const dh = Math.max(1, Math.floor(img.naturalHeight * s));
    const dx = pad + Math.floor((availW - dw) / 2);
    const dy = y + pad;
    ctx.save();
    roundRectPath(ctx, dx, dy, dw, dh, HOST_RADIUS);
    ctx.clip();
    ctx.drawImage(img, dx, dy, dw, dh);
    ctx.restore();
  };
}

app.registerExtension({
  name: "RectumFireBannerPreview",

  setup() {
    installHostDrawHook();
    api.addEventListener("b_preview_with_metadata", onLivePreview);
    api.addEventListener("executed", onExecuted);
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData?.name !== "RectumFireBanner") return;

    const prevCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      const r = prevCreated?.apply(this, arguments);
      try {
        if (!this.__rf_banner_size_init__) {
          this.__rf_banner_size_init__ = true;
          this.setSize?.([...BANNER_DEFAULT_SIZE]);
        }
        patchBannerWidget((this.widgets || []).find(x => x?.name === "rf_banner"));
      } catch (_) {}
      return r;
    };

    const prevExec = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = function (message) {
      try { prevExec?.apply(this, arguments); } catch (_) {}
      try {
        const w = (this.widgets || []).find(x => x?.name === "rf_banner");
        patchBannerWidget(w);
        const info = message?.rf_banner_preview?.[0] ?? message?.ui?.rf_banner_preview?.[0];
        const src = viewUrl(info);
        if (src) w?._rf_set_src?.(src);
      } catch (e) {
        try { console.warn("[RectumFireBanner] onExecuted error:", e); } catch (_) {}
      }
    };
  },
});
