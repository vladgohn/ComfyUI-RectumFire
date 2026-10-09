import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

// Fire Banner + Fire Load Image
// Draws directly on the subgraph host node (classic LiteGraph canvas), without widget promotion:
//  - input section: preview of every Fire Load Image inside the subgraph; drop an image file on it
//    or click it to upload a new image into that loader
//  - output section: live sampler frames while anything inside is sampling, then the Fire Banner image
//    (or the last Preview/Save image inside the subgraph)

const BANNER_DEFAULT_SIZE = [240, 360]; // 2:3
const LOADER_TYPE = "RectumFireLoadImage";
const HOST_PAD = 8;
const HOST_GAP = 6;
const HOST_RADIUS = 6;
const HOST_MIN_SECTION = 48;  // grow the host only when a section has less room than this
const HOST_EMPTY_SLOT_H = 120;
const HOST_MAX_AUTO_H = 420;  // cap per section for automatic growth
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

function drawFitted(ctx, img, x, y, w, h) {
  const s = Math.min(w / img.naturalWidth, h / img.naturalHeight);
  const dw = Math.max(1, Math.floor(img.naturalWidth * s));
  const dh = Math.max(1, Math.floor(img.naturalHeight * s));
  const dx = x + Math.floor((w - dw) / 2);
  const dy = y;
  ctx.save();
  roundRectPath(ctx, dx, dy, dw, dh, HOST_RADIUS);
  ctx.clip();
  ctx.drawImage(img, dx, dy, dw, dh);
  ctx.restore();
  ctx.save();
  ctx.lineWidth = 2;
  ctx.strokeStyle = "#000000";
  roundRectPath(ctx, dx, dy, dw, dh, HOST_RADIUS);
  ctx.stroke();
  ctx.restore();
  return [dx, dy, dw, dh];
}

// ---- Fire Load Image: input previews on the host ----

function loadersOf(host) {
  const nodes = host?.subgraph?._nodes || host?.subgraph?.nodes || [];
  return nodes.filter(n => n?.type === LOADER_TYPE || n?.comfyClass === LOADER_TYPE);
}

function imageWidget(loader) {
  return (loader.widgets || []).find(w => w?.name === "image");
}

function inputViewUrl(value) {
  const v = String(value || "");
  if (!v) return null;
  const i = v.lastIndexOf("/");
  const subfolder = i >= 0 ? v.slice(0, i) : "";
  const filename = i >= 0 ? v.slice(i + 1) : v;
  return `/view?filename=${encodeURIComponent(filename)}&type=input&subfolder=${encodeURIComponent(subfolder)}`;
}

// Cached preview image of a loader's current value; reloads when the value changes.
function loaderImage(loader, host) {
  const value = imageWidget(loader)?.value;
  const st = loader.__rf_in;
  if (st?.value === value) return st.img;
  const entry = { value, img: null };
  loader.__rf_in = entry;
  const src = inputViewUrl(value);
  if (src) {
    loadImage(src, (img) => {
      if (loader.__rf_in !== entry) return;
      entry.img = img;
      ensureHostRoom(host);
      redraw();
    });
  }
  return null;
}

async function uploadToLoader(file, loader, host) {
  if (!file || !loader) return;
  const body = new FormData();
  body.append("image", file);
  body.append("type", "input");
  const resp = await api.fetchApi("/upload/image", { method: "POST", body });
  if (resp.status !== 200) {
    console.warn("[RectumFire] upload failed", resp.status, resp.statusText);
    return;
  }
  const data = await resp.json();
  const value = data.subfolder ? `${data.subfolder}/${data.name}` : data.name;
  const w = imageWidget(loader);
  if (!w) return;
  const values = w.options?.values;
  if (Array.isArray(values) && !values.includes(value)) values.push(value);
  w.value = value;
  try { w.callback?.(value); } catch (_) {}
  loader.__rf_in = null;
  loaderImage(loader, host);
  app.graph?.setDirtyCanvas?.(true, true);
  redraw();
}

function pickFileFor(loader, host) {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = "image/*";
  input.style.display = "none";
  input.onchange = () => {
    const f = input.files?.[0];
    input.remove();
    if (f) uploadToLoader(f, loader, host);
  };
  document.body.appendChild(input);
  input.click();
}

// ---- host layout ----

// Bottom of the regular node content (slots + widgets), in node-local coordinates.
function contentBottom(node) {
  let bottom = 0;
  for (const w of node.widgets || []) {
    if (Number.isFinite(w?.y) && Number.isFinite(w?.computedHeight)) bottom = Math.max(bottom, w.y + w.computedHeight);
  }
  if (bottom > 0) return bottom;
  try {
    const s = node.computeSize?.();
    if (s && Number.isFinite(s[1])) return s[1];
  } catch (_) {}
  return 0;
}

function outputImage(node) {
  const img = node.__rf_host?.img;
  return img?.naturalWidth ? img : null;
}

// Desired heights of the preview sections for the node's current width.
function previewSections(node) {
  const loaders = loadersOf(node);
  const out = outputImage(node);
  const inner = Math.max(node.size[0], HOST_MIN_W) - HOST_PAD * 2;
  const sections = [];
  if (loaders.length) {
    const sw = (inner - HOST_GAP * (loaders.length - 1)) / loaders.length;
    let h = HOST_EMPTY_SLOT_H;
    for (const l of loaders) {
      const img = l.__rf_in?.img;
      if (img?.naturalWidth) h = Math.max(h, (sw * img.naturalHeight) / img.naturalWidth);
    }
    sections.push({ kind: "in", loaders, h: Math.min(HOST_MAX_AUTO_H, Math.round(h)) });
  }
  if (out) {
    const h = (inner * out.naturalHeight) / out.naturalWidth;
    sections.push({ kind: "out", h: Math.min(HOST_MAX_AUTO_H, Math.max(HOST_MIN_SECTION, Math.round(h))) });
  }
  return sections;
}

// Height reserved at the bottom of the host for previews (0 = nothing to show).
function previewReserve(node) {
  const sections = previewSections(node);
  if (!sections.length) return 0;
  return HOST_PAD * 2 + HOST_GAP * (sections.length - 1) + sections.reduce((a, s) => a + s.h, 0);
}

// Section rects in node-local coordinates (0 = top of the node body).
function hostLayout(node) {
  const sections = previewSections(node);
  if (!sections.length) return null;

  const reserve = previewReserve(node);
  const spacerY = node.__rf_spacer?.y;
  const top = (Number.isFinite(spacerY) ? spacerY : Math.max(contentBottom(node), node.size[1] - reserve)) + HOST_PAD;
  const w = node.size[0] - HOST_PAD * 2;
  const total = node.size[1] - top - HOST_PAD - HOST_GAP * (sections.length - 1);
  if (w < 16 || total < 16) return null;

  const want = sections.reduce((a, s) => a + s.h, 0);
  const layout = { inputs: [], output: null };
  let y = top;
  for (const s of sections) {
    const h = Math.floor((total * s.h) / want);
    if (s.kind === "in") {
      const sw = Math.floor((w - HOST_GAP * (s.loaders.length - 1)) / s.loaders.length);
      s.loaders.forEach((loader, i) => {
        layout.inputs.push({ loader, rect: [HOST_PAD + i * (sw + HOST_GAP), y, sw, h] });
      });
    } else {
      layout.output = [HOST_PAD, y, w, h];
    }
    y += h + HOST_GAP;
  }
  return layout;
}

// Hosts without widgets: grow so the previews fit below the slots.
// Hosts with widgets are handled in _arrangeWidgets (see installHostHooks).
function ensureHostRoom(node) {
  if (!node || node.flags?.collapsed) return;
  const reserve = previewReserve(node);
  if (!reserve) return;
  if (node.size[0] < HOST_MIN_W) node.setSize?.([HOST_MIN_W, node.size[1]]);
  const need = contentBottom(node) + reserve;
  if (node.size[1] < need) {
    if (node.setSize) node.setSize([node.size[0], need]); else node.size[1] = need;
  }
}

function drawHost(node, ctx) {
  if (node.flags?.collapsed) return;
  const layout = hostLayout(node);
  if (!layout) return;

  for (const { loader, rect } of layout.inputs) {
    const img = loaderImage(loader, node);
    const [x, y, w, h] = rect;
    if (img?.naturalWidth) {
      drawFitted(ctx, img, x, y, w, h);
    } else {
      ctx.save();
      ctx.setLineDash([4, 4]);
      ctx.lineWidth = 1;
      ctx.strokeStyle = "rgba(255,255,255,0.35)";
      roundRectPath(ctx, x + 0.5, y + 0.5, w - 1, h - 1, HOST_RADIUS);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(255,255,255,0.5)";
      ctx.font = "11px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("drop image / click", x + w / 2, y + h / 2);
      ctx.restore();
    }
  }

  if (layout.output) {
    const [x, y, w, h] = layout.output;
    const [dx, dy, dw] = drawFitted(ctx, outputImage(node), x, y, w, h);
    if (node.__rf_host?.kind === "live") {
      const label = "LIVE";
      ctx.save();
      ctx.font = "bold 7px system-ui, sans-serif";
      ctx.textBaseline = "top";
      const tw = ctx.measureText(label).width;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillRect(dx + dw - tw - 9, dy + 4, tw + 5, 10);
      ctx.fillStyle = "#22c55e";
      ctx.fillText(label, dx + dw - tw - 6.5, dy + 5.5);
      ctx.restore();
    }
  }
}

function loaderAt(node, localPos) {
  const layout = hostLayout(node);
  if (!layout || !localPos) return null;
  const [px, py] = localPos;
  for (const { loader, rect } of layout.inputs) {
    const [x, y, w, h] = rect;
    if (px >= x && px <= x + w && py >= y && py <= y + h) return loader;
  }
  return null;
}

function localMousePos(node) {
  const m = app.canvas?.graph_mouse;
  if (!m) return null;
  return [m[0] - node.pos[0], m[1] - node.pos[1]];
}

function isHost(node) {
  return !!node?.subgraph && (typeof node.isSubgraphNode !== "function" || node.isSubgraphNode());
}

function installHostHooks() {
  const proto = window.LiteGraph?.LGraphNode?.prototype;
  if (!proto || proto.__rf_host_hooks_installed__) return;
  proto.__rf_host_hooks_installed__ = true;

  const prevFg = proto.onDrawForeground;
  proto.onDrawForeground = function (ctx) {
    const r = prevFg?.apply(this, arguments);
    if (isHost(this)) {
      try { drawHost(this, ctx); } catch (_) {}
    }
    return r;
  };

  // Growable widgets (multiline text) take all free height. On hosts with previews, add a fixed-height
  // layout-only spacer after the widgets: the layout then leaves room for the previews (and grows the
  // node when needed), and the spacer's y tells where the previews start. It is never drawn.
  const prevLayoutWidgets = proto.getLayoutWidgets;
  if (typeof prevLayoutWidgets === "function") {
    proto.getLayoutWidgets = function () {
      const list = prevLayoutWidgets.apply(this, arguments);
      if (!isHost(this)) return list;
      let reserve = 0;
      try { reserve = previewReserve(this); } catch (_) {}
      if (!reserve) {
        this.__rf_spacer = null;
        return list;
      }
      const spacer = this.__rf_spacer ?? (this.__rf_spacer = { name: "$$rf_preview_spacer", type: "rf_spacer" });
      spacer.computeSize = () => [this.size[0], reserve - 4]; // the layout adds 4px per widget
      return [...list, spacer];
    };
  }

  const prevDragOver = proto.onDragOver;
  proto.onDragOver = function (e) {
    if (isHost(this) && loadersOf(this).length && e?.dataTransfer?.types?.includes?.("Files")) return true;
    return prevDragOver?.apply(this, arguments) ?? false;
  };

  const prevDragDrop = proto.onDragDrop;
  proto.onDragDrop = function (e) {
    if (isHost(this)) {
      const loaders = loadersOf(this);
      const file = [...(e?.dataTransfer?.files || [])].find(f => f.type?.startsWith?.("image/"));
      if (loaders.length && file) {
        const target = loaderAt(this, localMousePos(this)) ?? loaders[0];
        uploadToLoader(file, target, this);
        return true;
      }
    }
    return prevDragDrop?.apply(this, arguments) ?? false;
  };

  // Double-click on a subgraph node always opens the subgraph, so upload is a single click on the slot.
  const prevDown = proto.onMouseDown;
  proto.onMouseDown = function (e, pos) {
    if (isHost(this) && (e?.button ?? 0) === 0) {
      const target = loaderAt(this, pos);
      if (target) {
        pickFileFor(target, this);
        return true;
      }
    }
    return prevDown?.apply(this, arguments);
  };
}

// ---- output previews (live frames / banner / Preview-Save) ----

function setHostImage(host, img, kind, promptId, objectUrl) {
  const prev = host.__rf_host;
  if (prev?.objectUrl && prev.objectUrl !== objectUrl) {
    try { URL.revokeObjectURL(prev.objectUrl); } catch (_) {}
  }
  host.__rf_host = { img, kind, promptId, objectUrl };
  ensureHostRoom(host);
  redraw();
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
  const hosts = hostsForExecutionId(d.display_node ?? d.node);
  if (!hosts.length) return;

  const banner = out.rf_banner_preview?.[0];
  // Fire Load Image / Load Image report their own input as "images"; those are not results.
  const generic = out.images?.find?.(i => i?.filename && i.type !== "input" && !/\.(mp4|webm|gif)$/i.test(i.filename));
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
    drawFitted(ctx, img, pad, y + pad, availW, availH);
  };
}

app.registerExtension({
  name: "RectumFireBannerPreview",

  setup() {
    installHostHooks();
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
