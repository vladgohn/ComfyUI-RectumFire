import { app } from "../../scripts/app.js";

/**
 * RectumFire: Subgraph live preview (v2)
 * - Reads nodePreviewImages and caches the last blob per node id.
 * - Finds outer subgraph nodes that contain that inner node id using robust graph traversal.
 * - Paints the cached blob into the outer node.
 */

const RF = {
  pad: 8,
  cache: new Map(),     // blobUrl -> HTMLImageElement
  lastSeen: new Map(),  // nodeId(string) -> blobUrl
  lastAny: null,        // { id, blobUrl }
  timer: null,
};

function getPreviewStore() {
  const a = app;
  return (
    a?.state?.nodePreviewImages ??
    a?.nodePreviewImages ??
    a?.store?.state?.nodePreviewImages ??
    null
  );
}

function normalizeBlob(v) {
  if (typeof v === "string") return v.startsWith("blob:") ? v : null;
  if (Array.isArray(v)) {
    for (let i = v.length - 1; i >= 0; i--) {
      const s = v[i];
      if (typeof s === "string" && s.startsWith("blob:")) return s;
    }
  }
  return null;
}

function loadImage(blobUrl) {
  if (!blobUrl) return null;
  if (RF.cache.has(blobUrl)) return RF.cache.get(blobUrl);
  const img = new Image();
  img.decoding = "async";
  img.loading = "eager";
  img.src = blobUrl;
  RF.cache.set(blobUrl, img);
  return img;
}

function getTitleHeight() {
  return (globalThis.LiteGraph && (LiteGraph.NODE_TITLE_HEIGHT || 24)) || 24;
}

function setSubgraphPreview(outerNode, blobUrl) {
  if (!outerNode || !blobUrl) return;
  const img = loadImage(blobUrl);
  if (!img) return;

  outerNode.__rf_preview = outerNode.__rf_preview || {};
  outerNode.__rf_preview.url = blobUrl;
  outerNode.__rf_preview.img = img;

  if (!img.__rf_hooked) {
    img.__rf_hooked = true;
    img.addEventListener("load", () => {
      try { app?.graph?.setDirtyCanvas(true, true); } catch {}
    });
  }

  try { app?.graph?.setDirtyCanvas(true, true); } catch {}
}

function drawPreviewOnNode(node, ctx) {
  const img = node.__rf_preview?.img;
  if (!img || !(img.complete && img.naturalWidth > 0 && img.naturalHeight > 0)) return;

  const pad = RF.pad;
  const titleH = getTitleHeight();
  const w = node.size?.[0] ?? 240;
  const h = node.size?.[1] ?? 120;

  const x = pad;
  const y = titleH + Math.floor(pad * 0.5);
  const boxW = Math.max(16, w - pad * 2);
  const boxH = Math.max(16, h - titleH - pad);

  ctx.save();
  ctx.globalAlpha = 0.92;
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.fillRect(x, y, boxW, boxH);
  ctx.restore();

  const scale = boxW / img.naturalWidth;
  const drawH = Math.round(img.naturalHeight * scale);

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, boxW, boxH);
  ctx.clip();
  ctx.drawImage(img, x, y, boxW, drawH);
  ctx.restore();

  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.12)";
  ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);
  ctx.restore();
}

function patchOuterNodeOnce(outerNode) {
  if (!outerNode || outerNode.__rf_draw_patched) return;
  outerNode.__rf_draw_patched = true;

  const prevFG = outerNode.onDrawForeground;
  const prevBG = outerNode.onDrawBackground;

  outerNode.onDrawForeground = function (ctx) {
    if (typeof prevFG === "function") { try { prevFG.call(this, ctx); } catch {} }
    try { drawPreviewOnNode(this, ctx); } catch {}
  };

  outerNode.onDrawBackground = function (ctx) {
    if (typeof prevBG === "function") { try { prevBG.call(this, ctx); } catch {} }
    try { drawPreviewOnNode(this, ctx); } catch {}
  };
}

/* --- Robust traversal helpers (the actual fix) --- */

function nodesOf(graphLike) {
  if (!graphLike) return null;

  // Common LiteGraph layouts
  if (Array.isArray(graphLike._nodes)) return graphLike._nodes;
  if (Array.isArray(graphLike.nodes)) return graphLike.nodes;

  // Some wrappers store the graph under .graph
  if (graphLike.graph) {
    if (Array.isArray(graphLike.graph._nodes)) return graphLike.graph._nodes;
    if (Array.isArray(graphLike.graph.nodes)) return graphLike.graph.nodes;
  }

  // Some wrappers store it under .subgraph.graph
  if (graphLike.subgraph) {
    if (Array.isArray(graphLike.subgraph._nodes)) return graphLike.subgraph._nodes;
    if (Array.isArray(graphLike.subgraph.nodes)) return graphLike.subgraph.nodes;
    if (graphLike.subgraph.graph) {
      if (Array.isArray(graphLike.subgraph.graph._nodes)) return graphLike.subgraph.graph._nodes;
      if (Array.isArray(graphLike.subgraph.graph.nodes)) return graphLike.subgraph.graph.nodes;
    }
  }

  return null;
}

function innerGraphsOf(node) {
  // Collect possible nested graph holders from a node
  const out = [];
  if (!node || typeof node !== "object") return out;

  if (node.subgraph) out.push(node.subgraph);
  if (node.graph && node.graph !== app?.graph) out.push(node.graph);

  // Heuristic: any property that looks like it holds a graph
  for (const k of Object.keys(node)) {
    const low = k.toLowerCase();
    if (!low.includes("graph") && !low.includes("subgraph")) continue;
    const v = node[k];
    if (v && typeof v === "object") out.push(v);
  }

  // Deduplicate
  return [...new Set(out)];
}

function containsInnerId(graphLike, targetId) {
  const t = String(targetId);
  const stack = [graphLike];
  const seen = new Set();

  while (stack.length) {
    const g = stack.pop();
    if (!g || typeof g !== "object") continue;
    if (seen.has(g)) continue;
    seen.add(g);

    const ns = nodesOf(g);
    if (!ns) continue;

    for (const n of ns) {
      if (!n) continue;
      if (String(n.id) === t) return true;

      // Traverse nested graphs inside inner nodes
      const inners = innerGraphsOf(n);
      for (const ig of inners) stack.push(ig);
    }
  }

  return false;
}

function findOuterSubgraphsContainingInnerId(innerId) {
  const g = app?.graph;
  if (!g?._nodes) return [];

  const found = [];
  for (const outer of g._nodes) {
    // Outer subgraph node MUST have some graph-like holder
    const candidates = innerGraphsOf(outer);
    if (!candidates.length) continue;

    for (const cg of candidates) {
      if (containsInnerId(cg, innerId)) {
        found.push(outer);
        break;
      }
    }
  }
  return found;
}

function tick() {
  const P = getPreviewStore();
  if (!P) return;

  const keys = Object.keys(P);
  if (!keys.length) return;

  for (const k of keys) {
    const blob = normalizeBlob(P[k]);
    if (!blob) continue;

    const prev = RF.lastSeen.get(k);
    if (prev === blob) continue;

    RF.lastSeen.set(k, blob);
    RF.lastAny = { id: String(k), blobUrl: blob };

    // If k is the outer node id itself, this will work too
    const direct = app?.graph?._nodes?.find((n) => String(n.id) === String(k));
    if (direct) {
      patchOuterNodeOnce(direct);
      setSubgraphPreview(direct, blob);
    }

    // Main path: inner id -> find outer(s) containing it
    const outers = findOuterSubgraphsContainingInnerId(k);
    for (const outer of outers) {
      patchOuterNodeOnce(outer);
      setSubgraphPreview(outer, blob);
    }
  }
}

app.registerExtension({
  name: "RectumFire.SubgraphPreview",
  setup() {
    window.__rf_subpreview = {
      lastSeen: RF.lastSeen,
      lastAny: () => RF.lastAny,
      tick,
      findOuters: (id) => findOuterSubgraphsContainingInnerId(id).map(n => ({ id: n.id, type: n.type })),
    };

    RF.timer = setInterval(tick, 80);
  },
});
