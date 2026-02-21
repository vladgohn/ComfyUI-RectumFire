import { app } from "../../scripts/app.js";

const NODE_TYPE = "RectumFireGif";
const W = 110; // 100 + padding
const H = 110;

function setSize(node) {
  node.size = [W, H];
  node.setSize?.([W, H]);
  node.setDirtyCanvas?.(true, true);
}

app.registerExtension({
  name: "RectumFire.Gif",

  async beforeRegisterNodeDef(nodeType, nodeData) {
    if (nodeData.name !== NODE_TYPE) return;

    const prevCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = function () {
      prevCreated?.apply(this, arguments);

      // Load asset exactly like done.mp3 does in FireDone :contentReference[oaicite:1]{index=1}
      this.__rf_gif_img__ = new Image();
      this.__rf_gif_img__.src = new URL("./assets/anim.gif", import.meta.url).toString();

      // Set fixed size after layout settles
      setTimeout(() => setSize(this), 0);
    };

    const prevDraw = nodeType.prototype.onDrawForeground;
    nodeType.prototype.onDrawForeground = function (ctx) {
      prevDraw?.apply(this, arguments);

      const img = this.__rf_gif_img__;
      if (!img || !img.complete) return;

      // Minimal: just draw the gif
      ctx.drawImage(img, 5, 5, 100, 100);

      // Keep canvas updating for animated GIF
      this.setDirtyCanvas?.(true, true);
    };
  },
});
