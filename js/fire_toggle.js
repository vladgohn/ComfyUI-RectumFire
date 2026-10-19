// FireToggle - a reroute with an on/off switch. Small headerless block: input left, output right,
// toggle in the middle. Off = the link is cut when the prompt is built (downstream input gets nothing).
// Frontend-only virtual node, like the core Reroute.

import { app } from "../../scripts/app.js";

const RF = Object.freeze({
  EXT_NAME: "RectumFireToggle",
  TYPE: "RectumFireToggle",
  TITLE: "🔥Fire Toggle",
  CATEGORY: "RectumFire/Utils",
  SIZE: [75, 26],
  PILL: { w: 26, h: 14 },
  ON: { bg: "#22C55E", knob: "#F0FDF4" },
  OFF: { bg: "#3F3F46", knob: "#A1A1AA" },
});

function rawInputLink(node) {
  const id = node.inputs?.[0]?.link;
  if (id == null || !node.graph) return null;
  const links = node.graph.links;
  return (links?.get ? links.get(id) : links?.[id]) ?? null;
}

function pillRect(node) {
  const { w, h } = RF.PILL;
  return [(node.size[0] - w) / 2, (node.size[1] - h) / 2, w, h];
}

class FireToggle extends LGraphNode {
  constructor(title) {
    super(title ?? RF.TITLE);
    this.properties.on = true;
    this.addInput("", "*");
    this.addOutput("", "*");
    this.size = [...RF.SIZE];
    this.isVirtualNode = true;
  }

  // Queue-time link resolution of virtual nodes goes through getInputLink: off = no link.
  getInputLink(slot) {
    if (!this.properties.on) return null;
    return super.getInputLink(slot);
  }

  computeSize() {
    return [...RF.SIZE];
  }

  onConnectionsChange() {
    // Take the upstream output type so the output link gets the right color and type checks.
    const link = rawInputLink(this);
    const origin = link ? this.graph?.getNodeById(link.origin_id) : null;
    const type = origin?.outputs?.[link.origin_slot]?.type ?? "*";
    if (this.outputs?.[0]) this.outputs[0].type = type;
    this.setDirtyCanvas?.(true, true);
  }

  onAfterGraphConfigured() {
    requestAnimationFrame(() => this.onConnectionsChange());
  }

  onDrawForeground(ctx) {
    if (this.flags?.collapsed) return;
    const [x, y, w, h] = pillRect(this);
    const on = !!this.properties.on;
    const c = on ? RF.ON : RF.OFF;
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, h / 2);
    ctx.fillStyle = c.bg;
    ctx.fill();
    const r = h / 2 - 2;
    ctx.beginPath();
    ctx.arc(on ? x + w - h / 2 : x + h / 2, y + h / 2, r, 0, Math.PI * 2);
    ctx.fillStyle = c.knob;
    ctx.fill();
    ctx.restore();
  }

  onMouseDown(e, pos) {
    const [x, y, w, h] = pillRect(this);
    const pad = 4;
    if (pos[0] < x - pad || pos[0] > x + w + pad || pos[1] < y - pad || pos[1] > y + h + pad) return false;
    this.setProperty("on", !this.properties.on);
    this.graph?.change?.();
    this.setDirtyCanvas(true, true);
    return true;
  }
}

app.registerExtension({
  name: RF.EXT_NAME,
  registerCustomNodes() {
    LiteGraph.registerNodeType(
      RF.TYPE,
      Object.assign(FireToggle, { title_mode: LiteGraph.NO_TITLE, title: RF.TITLE, collapsable: false }),
    );
    FireToggle.category = RF.CATEGORY;
  },
  // Frontend-only nodes get display_name = type id and the badge "frontend_only"; name them like the pack.
  beforeRegisterVueAppNodeDefs(defs) {
    const def = defs.find((d) => d.name === RF.TYPE);
    if (!def) return;
    Object.assign(def, {
      display_name: RF.TITLE,
      python_module: "custom_nodes.rectumfire",
      description: "Reroute with an on/off switch. Off cuts the link when the prompt is queued.",
    });
  },
});
