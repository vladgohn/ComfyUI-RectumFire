import { app } from "../../scripts/app.js";

const NODE_TYPE = "RectumFireDone";
const NODE_WIDTH = 200; // width only

const TITLE_DONE = "💯";

function rememberDefaultTitle(node) {
  if (node.__rf_default_title__ != null) return;
  node.__rf_default_title__ = typeof node.title === "string" ? node.title : "";
}

function setTitle(node, t) {
  node.title = t;
  node.setDirtyCanvas?.(true, true);
}

function restoreTitle(node) {
  rememberDefaultTitle(node);
  setTitle(node, node.__rf_default_title__);
}

function setDoneTitle(node) {
  rememberDefaultTitle(node);
  setTitle(node, TITLE_DONE);
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
    // Restore title when a new queue starts: remaining goes 0 -> >0
    app.api.addEventListener("status", (e) => {
      const remaining = e?.detail?.exec_info?.queue_remaining;
      if (typeof remaining !== "number") return;

      if (prevRemaining === null) {
        prevRemaining = remaining;
        return;
      }

      if (prevRemaining === 0 && remaining > 0) {
        forEachDoneNode((n) => restoreTitle(n));
      }

      prevRemaining = remaining;
    });
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const prevCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      prevCreated?.apply(this, arguments);

      rememberDefaultTitle(this);

      setTimeout(() => {
        setNodeWidthOnly(this, NODE_WIDTH);
      }, 0);
    };

    const prevExec = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = async function () {
      prevExec?.apply(this, arguments);

      const enabled = this.widgets?.find((w) => w?.name === "enable")?.value ?? true;
      if (!enabled) return;

      setDoneTitle(this);

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
