import { app } from "../../scripts/app.js";

const NODE_TYPE = "RectumFireDone";
const NODE_WIDTH = 200; // width only

const PALETTE = Object.freeze({
  idle: { color: "#3A3A3A", bgcolor: "#1F1F1F" },
  done: { color: "#ffaaee", bgcolor: "#40007c" },
});

function setNodeColors(node, which) {
  const p = PALETTE[which];
  if (!p) return;
  node.color = p.color;
  node.bgcolor = p.bgcolor;
  node.setDirtyCanvas?.(true, true);
}

function setNodeWidthOnly(node, w) {
  const h =
    (Array.isArray(node.size) && typeof node.size[1] === "number" && node.size[1]) ||
    (typeof node.computeSize === "function" ? node.computeSize()?.[1] : null) ||
    60;

  node.size = [w, h];
  node.setSize?.([w, h]);
  node.setDirtyCanvas?.(true, true);
}

function forEachDoneNode(fn) {
  const g = app.graph;
  if (!g || !Array.isArray(g._nodes)) return;
  for (const n of g._nodes) {
    if (n?.type === NODE_TYPE) fn(n);
  }
}

let prevRemaining = null;

app.registerExtension({
  name: "RectumFire.Done",

  setup() {
    // Reset colors when a new queue starts: remaining goes 0 -> >0
    app.api.addEventListener("status", (e) => {
      const remaining = e?.detail?.exec_info?.queue_remaining;
      if (typeof remaining !== "number") return;

      if (prevRemaining === null) {
        prevRemaining = remaining;
        return;
      }

      if (prevRemaining === 0 && remaining > 0) {
        forEachDoneNode((n) => setNodeColors(n, "idle"));
      }

      prevRemaining = remaining;
    });
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const prevCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      prevCreated?.apply(this, arguments);

      // Initial color
      setNodeColors(this, "idle");

      // Width only (after layout settles)
      setTimeout(() => {
        setNodeWidthOnly(this, NODE_WIDTH);
      }, 0);
    };

    const prevExec = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = async function () {
      prevExec?.apply(this, arguments);

      const enabled = this.widgets?.find((w) => w?.name === "enable")?.value ?? true;
      if (!enabled) return;

      // Mark as executed
      setNodeColors(this, "done");

      const url = new URL("./assets/done.mp3", import.meta.url).toString();

      try {
        const audio = new Audio(url);
        audio.volume = 0.3;
        this.__rf_done_audio__ = audio;
        await audio.play();
      } catch {}
    };
  },
});
