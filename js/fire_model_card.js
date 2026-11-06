// FireModelCard - shows the upstream model's Lora Manager card (cover, title, version,
// base model, precision) inside the node. Follows the MODEL link up to the loader and
// reads its file widget live, so the card changes as soon as the loader selection does.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

const NODE_TYPE = "RectumFireModelCard";
const ROUTE = "/rectumfire/model_card";
const POLL_MS = 600;
const MODEL_WIDGETS = { unet_name: "diffusion_models", ckpt_name: "checkpoints" };

const CSS = `
.rf-mc { display:flex; flex-direction:column; height:100%; box-sizing:border-box; gap:6px;
  font-family:inherit; color:#e8e8e8; overflow:hidden; }
.rf-mc-cover { position:relative; flex:1 1 auto; min-height:60px; border-radius:8px; overflow:hidden;
  background:#1a1a1a; }
.rf-mc-cover img, .rf-mc-cover video { width:100%; height:100%; object-fit:cover; display:block; }
.rf-mc-chips { position:absolute; top:6px; left:6px; display:flex; gap:4px; }
.rf-mc-chip { font-size:11px; font-weight:600; padding:2px 6px; border-radius:4px;
  background:rgba(0,0,0,.65); color:#fff; }
.rf-mc-chip.prec { background:rgba(110,80,200,.8); }
.rf-mc-title { font-size:14px; font-weight:600; line-height:1.25; }
.rf-mc-version { font-size:12px; color:#aaa; }
.rf-mc-file { font-size:11px; color:#777; word-break:break-all; }
.rf-mc-empty { margin:auto; font-size:12px; color:#777; text-align:center; }
`;

function injectCss() {
  if (document.getElementById("rf-model-card-css")) return;
  const s = document.createElement("style");
  s.id = "rf-model-card-css";
  s.textContent = CSS;
  document.head.appendChild(s);
}

function getLink(graph, id) {
  const links = graph?.links;
  return links?.get ? links.get(id) : links?.[id];
}

// Walk MODEL inputs upstream until a node with a model-file widget.
function findModelFile(node, seen = new Set()) {
  if (!node || seen.has(node.id)) return null;
  seen.add(node.id);
  for (const w of node.widgets || []) {
    if (MODEL_WIDGETS[w.name] && typeof w.value === "string") {
      return { folder: MODEL_WIDGETS[w.name], name: w.value };
    }
  }
  for (const input of node.inputs || []) {
    if (input.type !== "MODEL" || input.link == null) continue;
    const link = getLink(node.graph, input.link);
    const origin = link && node.graph.getNodeById(link.origin_id);
    const hit = findModelFile(origin, seen);
    if (hit) return hit;
  }
  return null;
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

function render(root, src, info) {
  root.replaceChildren();
  if (!src) {
    root.appendChild(el("div", "rf-mc-empty", "Connect MODEL from a loader"));
    return;
  }
  if (!info?.found) {
    root.appendChild(el("div", "rf-mc-empty", "Model file not found"));
    root.appendChild(el("div", "rf-mc-file", src.name));
    return;
  }

  const cover = el("div", "rf-mc-cover");
  if (info.cover) {
    const url = api.apiURL(`${ROUTE}/cover?folder=${encodeURIComponent(src.folder)}&name=${encodeURIComponent(src.name)}`);
    // The cover may be a video; try an image first and fall back to <video>.
    const img = el("img");
    img.src = url;
    img.onerror = () => {
      const v = el("video");
      Object.assign(v, { src: url, muted: true, loop: true, autoplay: true, playsInline: true });
      img.replaceWith(v);
    };
    cover.appendChild(img);
  }
  const chips = el("div", "rf-mc-chips");
  if (info.base_short) chips.appendChild(el("span", "rf-mc-chip", info.base_short));
  if (info.precision) chips.appendChild(el("span", "rf-mc-chip prec", info.precision));
  cover.appendChild(chips);
  root.appendChild(cover);

  root.appendChild(el("div", "rf-mc-title", info.title || info.file));
  if (info.version) root.appendChild(el("div", "rf-mc-version", info.version));
  if (!info.has_meta) root.appendChild(el("div", "rf-mc-file", "No Lora Manager metadata"));
  root.title = info.file;
}

async function refresh(node) {
  const src = findModelFile(node);
  const key = src ? `${src.folder}/${src.name}` : "";
  if (key === node._rfMcKey) return;
  node._rfMcKey = key;
  let info = null;
  if (src) {
    try {
      const r = await api.fetchApi(`${ROUTE}?folder=${encodeURIComponent(src.folder)}&name=${encodeURIComponent(src.name)}`);
      info = await r.json();
    } catch (_) { }
  }
  if (node._rfMcKey === key) render(node._rfMcRoot, src, info);
}

app.registerExtension({
  name: "RectumFireModelCard",

  setup() {
    injectCss();
  },

  beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const prevCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      prevCreated?.apply(this, arguments);
      const root = el("div", "rf-mc");
      this._rfMcRoot = root;
      this.addDOMWidget("card", "rf_model_card", root, { serialize: false, getMinHeight: () => 220 });
      if (this.size[0] < 260) this.setSize([260, 360]);
      this._rfMcTimer = setInterval(() => refresh(this), POLL_MS);
      refresh(this);
    };

    const prevRemoved = nodeType.prototype.onRemoved;
    nodeType.prototype.onRemoved = function () {
      clearInterval(this._rfMcTimer);
      prevRemoved?.apply(this, arguments);
    };
  },
});
