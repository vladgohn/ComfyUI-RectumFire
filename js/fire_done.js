import { app } from "../../scripts/app.js";

const NODE_TYPE = "RectumFireDone";
const NODE_WIDTH = 200; // width only

const TITLE_DONE = "💯";
const TITLE_IDLE = "🔥Fire🔊";
const DONE_AUDIO_FILE = "./assets/done.wav";

function setTitle(node, t) {
  node.title = t;
  node.setDirtyCanvas?.(true, true);
}

function setDoneTitle(node) {
  setTitle(node, TITLE_DONE);
}

function setIdleTitle(node) {
  setTitle(node, TITLE_IDLE);
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

async function playDoneSound(node) {
  const url = new URL(DONE_AUDIO_FILE, import.meta.url).toString();

  try {
    node.__rf_done_audio__?.pause?.();
  } catch {}

  try {
    const audio = new Audio(url);
    audio.volume = 0.3;
    audio.currentTime = 0;
    node.__rf_done_audio__ = audio;
    await audio.play();
    return true;
  } catch {}

  return false;
}

app.registerExtension({
  name: "RectumFireDone",

  setup() {
    app.api.addEventListener("execution_start", () => {
      forEachDoneNode((n) => setIdleTitle(n));
    });

    // Fallback restore when queue starts: remaining goes 0 -> >0
    app.api.addEventListener("status", (e) => {
      const remaining = e?.detail?.exec_info?.queue_remaining;
      if (typeof remaining !== "number") return;

      if (prevRemaining === null) {
        prevRemaining = remaining;
        return;
      }

      if (prevRemaining === 0 && remaining > 0) {
        forEachDoneNode((n) => setIdleTitle(n));
      }

      prevRemaining = remaining;
    });
  },

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const prevCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      prevCreated?.apply(this, arguments);

      setIdleTitle(this);

      setTimeout(() => {
        setNodeWidthOnly(this, NODE_WIDTH);
      }, 0);
    };

    const prevExec = nodeType.prototype.onExecuted;
    nodeType.prototype.onExecuted = async function () {
      await prevExec?.apply(this, arguments);

      const enabled = this.widgets?.find((w) => w?.name === "enable")?.value ?? true;
      if (!enabled) return;

      setDoneTitle(this);
      await playDoneSound(this);
    };
  },
});