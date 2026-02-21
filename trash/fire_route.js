import { app } from "/scripts/app.js";

/*
 * 🔥 Fire Route
 * Multi-slot extension of built-in Reroute node logic.
 * Same behavior, just N parallel slots.
 */

const EXT_NAME = "comfyui.rectumfire.fire_route";

// ---------------- utils ----------------

function isOurNode(nodeData, nodeType) {
  const n = String(nodeData?.name || nodeType?.type || "").toLowerCase();
  return n.includes("rectumfireroute") || (n.includes("fire") && n.includes("route"));
}

function isRouteNode(node) {
  return node?.type === "Reroute" || node?.__rf_isFireRoute === true;
}

function pairCount(node) {
  return Math.min(node.inputs?.length || 0, node.outputs?.length || 0);
}

function pairEmpty(node, i) {
  const inp = node.inputs[i];
  const out = node.outputs[i];
  const inEmpty = !inp || inp.link == null;
  const outEmpty = !out || !out.links || out.links.length === 0;
  return inEmpty && outEmpty;
}

function addPair(node) {
  node.addInput("", "*");
  node.addOutput("", "*");
}

function removeLastPair(node) {
  const n = pairCount(node);
  if (n > 0) {
    node.removeInput(n - 1);
    node.removeOutput(n - 1);
  }
}

function ensurePairs(node) {
  if (pairCount(node) === 0) addPair(node);

  while (true) {
    const n = pairCount(node);
    if (n <= 0) break;

    const lastUsed = !pairEmpty(node, n - 1);
    if (lastUsed) {
      addPair(node);
      continue;
    }

    if (n >= 2 && pairEmpty(node, n - 1) && pairEmpty(node, n - 2)) {
      removeLastPair(node);
      continue;
    }

    break;
  }
}

function updateTypes(node) {
  const graph = node.graph;
  if (!graph || app.configuringGraph) return;

  ensurePairs(node);

  for (let i = 0; i < pairCount(node); i++) {
    const inp = node.inputs[i];
    const out = node.outputs[i];

    let inputType = null;

    if (inp.link != null) {
      const link = graph.links[inp.link];
      if (link) {
        const src = graph.getNodeById(link.origin_id);
        inputType = src?.outputs?.[link.origin_slot]?.type || null;
      }
    }

    out.type = inputType || "*";
    out.name = node.properties?.showOutputText ? (out.type || "*") : "";

    if (out.links) {
      for (const lid of out.links) {
        const l = graph.links[lid];
        if (l && inputType && window.LGraphCanvas?.link_type_colors?.[inputType]) {
          l.color = window.LGraphCanvas.link_type_colors[inputType];
        }
      }
    }
  }

  try {
    node.setSize(node.computeSize());
    app.canvas?.setDirty(true, true);
  } catch (_) {}
}

// ---------------- patch ----------------

function patchRouteNode(nodeType) {
  if (nodeType.__rf_route_patched) return;
  nodeType.__rf_route_patched = true;

  const origOnNodeCreated = nodeType.prototype.onNodeCreated;
  nodeType.prototype.onNodeCreated = function () {
    this.__rf_isFireRoute = true;

    if (!this.properties) this.properties = {};
    if (this.properties.showOutputText == null) this.properties.showOutputText = false;

    try {
      while (this.inputs?.length) this.removeInput(0);
      while (this.outputs?.length) this.removeOutput(0);
    } catch (_) {}

    addPair(this);
    ensurePairs(this);

    try {
      // как у штатного Reroute: без title-бара
      this.title = "";
      if (typeof LiteGraph !== "undefined" && LiteGraph.NO_TITLE != null) {
        this.title_mode = LiteGraph.NO_TITLE;
      } else {
        this.title_mode = 2; // fallback
      }
    } catch (_) {}

    requestAnimationFrame(() => updateTypes(this));

    return origOnNodeCreated?.apply(this, arguments);
  };

  const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
  nodeType.prototype.onConnectionsChange = function () {
    const r = origOnConnectionsChange?.apply(this, arguments);
    updateTypes(this);
    return r;
  };

  const origGetExtraMenuOptions = nodeType.prototype.getExtraMenuOptions;
  nodeType.prototype.getExtraMenuOptions = function (_, options) {
    options.unshift({
      content: (this.properties.showOutputText ? "Hide" : "Show") + " Type",
      callback: () => {
        this.properties.showOutputText = !this.properties.showOutputText;
        updateTypes(this);
      },
    });
    return origGetExtraMenuOptions ? origGetExtraMenuOptions.apply(this, arguments) : [];
  };
}

// ---------------- register ----------------

app.registerExtension({
  name: EXT_NAME,
  beforeRegisterNodeDef(nodeType, nodeData) {
    if (isOurNode(nodeData, nodeType)) {
      patchRouteNode(nodeType);
    }
  },
});
