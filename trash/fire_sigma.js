import { app } from "/scripts/app.js";

// Auto-size the Sigma Preview node so it doesn't waste vertical space.
// This is intentionally conservative: it won't fight manual resizing.

const TARGET_COMFY_CLASS = "🔥Fire Sigma";

function clamp(v, a, b) {
  return Math.max(a, Math.min(b, v));
}

app.registerExtension({
  name: "rectumfire.fire_sigma_autosize",
  nodeCreated(node) {
    if (node.comfyClass !== TARGET_COMFY_CLASS) return;

    // Prefer a compact default height.
    // (User can always resize manually.)
    const minH = 220;
    const maxH = 520;

    // If a workflow loads with a saved size, don't override aggressively.
    // Only shrink if it's clearly huge.
    if (node.size && node.size[1] > 650) {
      node.setSize([node.size[0], 320]);
    }

    const prevOnExecuted = node.onExecuted;
    node.onExecuted = function (...args) {
      const r = prevOnExecuted?.apply(this, args);

      try {
        // ComfyUI stores preview images on node.imgs (array of HTMLImageElement)
        const img = this.imgs?.[0];
        if (img && img.naturalHeight) {
          // Header + widgets area padding.
          const headerPad = 135;
          const desiredH = clamp(headerPad + img.naturalHeight, minH, maxH);

          // Only auto-shrink; never auto-grow beyond user's manual height.
          if (this.size && this.size[1] > desiredH + 40) {
            this.setSize([this.size[0], desiredH]);
          }
        }
      } catch (e) {
        // ignore
      }

      return r;
    };
  },
});
