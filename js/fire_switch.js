import { app } from "../../scripts/app.js";

const MAX_INPUTS = 32;
const INPUT_PREFIX = "input";

function isInputSlot(input) {
  return input && typeof input.name === "string" && input.name.startsWith(INPUT_PREFIX);
}

function hasValidLink(node, inputIndex) {
  const inp = node.inputs?.[inputIndex];
  if (!inp) return false;

  const linkId = inp.link;
  if (linkId == null) return false;

  const g = node.graph;
  if (!g || !g.links) return false;

  return !!g.links[linkId];
}

function countConnectedSlots(node) {
  let count = 0;
  for (let i = 0; i < (node.inputs?.length || 0); i++) {
    const inp = node.inputs[i];
    if (!isInputSlot(inp)) continue;
    if (hasValidLink(node, i)) count++;
  }
  return count;
}

function listSlotIndices(node) {
  const out = [];
  for (let i = 0; i < (node.inputs?.length || 0); i++) {
    const inp = node.inputs[i];
    if (!isInputSlot(inp)) continue;
    out.push(i);
  }
  return out;
}

function normalizeSlots(node, targetSlotCount) {
  // Ensure there are exactly input1..inputN slots (contiguous), N = targetSlotCount.
  // Remove only from the end, always disconnect before remove.
  let slotIdx = listSlotIndices(node);

  // Add missing slots up to target
  while (slotIdx.length < targetSlotCount && slotIdx.length < MAX_INPUTS) {
    const nextNum = slotIdx.length + 1;
    node.addInput(`input${nextNum}`, "*");
    slotIdx = listSlotIndices(node);
  }

  // Remove trailing empty slots down to target
  slotIdx = listSlotIndices(node);
  while (slotIdx.length > targetSlotCount) {
    const lastIndex = slotIdx[slotIdx.length - 1];

    try {
      node.disconnectInput?.(lastIndex);
    } catch (_) {}

    if (hasValidLink(node, lastIndex)) break;

    node.removeInput(lastIndex);
    slotIdx.pop();
  }

  // Rename contiguous input1..inputN
  slotIdx = listSlotIndices(node);
  for (let k = 0; k < slotIdx.length; k++) {
    const idx = slotIdx[k];
    const desired = `input${k + 1}`;
    if (node.inputs[idx].name !== desired) {
      node.inputs[idx].name = desired;
      if (typeof node.inputs[idx].label === "string") node.inputs[idx].label = desired;
    }
  }
}

function clampSelectWidget(node) {
  const w = node.widgets?.find((x) => x.name === "select");
  if (!w) return;

  const connected = countConnectedSlots(node);
  const max = Math.max(1, Math.min(MAX_INPUTS, connected + 1)); // allow selecting the "next empty" if desired
  const cur = Number(w.value || 1);
  const next = Math.max(1, Math.min(max, isFinite(cur) ? cur : 1));
  if (next !== cur) w.value = next;

  if (w.options) {
    w.options.min = 1;
    w.options.max = max;
  }
}

function recalc(node) {
  if (!node || !Array.isArray(node.inputs)) return;
  if (!node.graph) return;

  // Invariant: slots = connected + 1, min 2, max MAX_INPUTS
  const connected = countConnectedSlots(node);
  const target = Math.max(2, Math.min(MAX_INPUTS, connected + 1));
  normalizeSlots(node, target);
  clampSelectWidget(node);

  try {
    node.setSize?.(node.computeSize?.() || node.size);
  } catch (_) {}
}

function scheduleRecalc(node) {
  if (node.__rectumfire_switch_scheduled__) return;
  node.__rectumfire_switch_scheduled__ = true;

  setTimeout(() => {
    node.__rectumfire_switch_scheduled__ = false;
    if (!node || !node.graph) return;
    try {
      recalc(node);
    } catch (_) {}
  }, 0);
}

app.registerExtension({
  name: "RectumFire.RectumFireSwitch",
  async beforeRegisterNodeDef(nodeType, nodeData) {
    // IMPORTANT: must match NODE_CLASS_MAPPINGS key
    if (nodeData?.name !== "RectumFireSwitch") return;

    const origOnAdded = nodeType.prototype.onAdded;
    nodeType.prototype.onAdded = function () {
      const r = origOnAdded?.apply(this, arguments);
      scheduleRecalc(this);
      return r;
    };

    const origOnConfigure = nodeType.prototype.onConfigure;
    nodeType.prototype.onConfigure = function () {
      const r = origOnConfigure?.apply(this, arguments);
      scheduleRecalc(this);
      return r;
    };

    const origOnConnectionsChange = nodeType.prototype.onConnectionsChange;
    nodeType.prototype.onConnectionsChange = function () {
      const r = origOnConnectionsChange?.apply(this, arguments);
      scheduleRecalc(this);
      return r;
    };
  },
});
