import { app } from "../../scripts/app.js";

// Меняй только это имя файла, чтобы переключить шрифт ноды.
const LABEL_AXIS_FONT_FILE = "Axis-Regular.ttf";
const LABEL_AXIS_FONT_DIR = "./assets/fonts/";
const LABEL_AXIS_FONT_FAMILY = "RectumFireAxis";

let axisFontReady = false;
let axisFontPromise = null;

async function ensureAxisFontLoaded() {
  if (axisFontReady) return true;
  if (axisFontPromise) return axisFontPromise;

  axisFontPromise = (async () => {
    try {
      const fontPath = `${LABEL_AXIS_FONT_DIR}${LABEL_AXIS_FONT_FILE}`;
      const fontUrl = new URL(fontPath, import.meta.url);
      const face = new FontFace(LABEL_AXIS_FONT_FAMILY, `url(${fontUrl})`, {
        style: "normal",
        weight: "400",
      });
      await face.load();
      document.fonts.add(face);
      axisFontReady = true;
      app?.graph?.setDirtyCanvas?.(true, true);
    } catch (e) {
      console.warn("[RectumFireLabelAxis] Failed to load Axis font:", e);
      axisFontReady = false;
    }
    return axisFontReady;
  })();

  return axisFontPromise;
}

class FireLabelAxis extends LiteGraph.LGraphNode {
  static type = "🔥Fire Label Axis";
  static title = "🔥Fire Label Axis";
  static title_mode = LiteGraph.NO_TITLE;
  static collapsable = false;

  static "@fontSize" = { type: "number" };
  static "@fontColor" = { type: "string" };
  static "@textAlign" = { type: "combo", values: ["left", "center", "right"] };
  static "@backgroundColor" = { type: "string" };
  static "@borderRadius" = { type: "number" };
  static "@padding" = { type: "number" };

  constructor(title = "Fire Label Axis") {
    super(title);

    this.properties = this.properties || {};
    this.properties["fontSize"] = 70;
    this.properties["fontColor"] = "#cd7eff";
    this.properties["textAlign"] = "center";
    this.properties["backgroundColor"] = "transparent";
    this.properties["padding"] = 6;
    this.properties["borderRadius"] = 6;

    this.color = "#0000";
    this.bgcolor = "#0000";
    this.size = this.size || [260, 80];

    this.isVirtualNode = true;
    this.serialize_widgets = true;

    void ensureAxisFontLoaded();
  }

  onDblClick() {
    LiteGraph?.LGraphCanvas?.active_canvas?.showShowNodePanel?.(this);
  }

  onShowCustomPanelInfo(panel) {
    panel?.querySelector?.('div.property[data-property="Mode"]')?.remove?.();
    panel?.querySelector?.('div.property[data-property="Color"]')?.remove?.();
  }

  draw(ctx) {
    this.color = "#0000";
    this.bgcolor = "#0000";

    const fontSize = Math.max(Number(this.properties["fontSize"] || 1), 1);
    const fontColor = this.properties["fontColor"] || "#ffffff";
    const backgroundColor = this.properties["backgroundColor"] || "transparent";
    const padding = Number(this.properties["padding"] ?? 0) || 0;
    const borderRadius = Number(this.properties["borderRadius"] ?? 0) || 0;
    const align = this.properties["textAlign"] || "left";

    const title = String(this.title ?? "").replace(/\n*$/, "") || "Fire Label Axis";
    const lines = title.split("\n");

    ctx.save();
    const family = axisFontReady ? LABEL_AXIS_FONT_FAMILY : "Arial";
    ctx.font = `${fontSize}px "${family}"`;
    ctx.textBaseline = "top";
    ctx.fillStyle = fontColor;

    const widths = lines.map((s) => ctx.measureText(s || " ").width);
    const maxWidth = Math.max(...widths, 1);

    this.size[0] = Math.ceil(maxWidth + padding * 2);
    this.size[1] = Math.ceil(fontSize * lines.length + padding * 2);

    if (backgroundColor && backgroundColor !== "transparent") {
      ctx.beginPath();
      if (ctx.roundRect) {
        ctx.roundRect(0, 0, this.size[0], this.size[1], [borderRadius]);
      } else {
        ctx.rect(0, 0, this.size[0], this.size[1]);
      }
      ctx.fillStyle = backgroundColor;
      ctx.fill();
      ctx.fillStyle = fontColor;
    }

    let x = padding;
    if (align === "center") x = this.size[0] / 2;
    else if (align === "right") x = this.size[0] - padding;
    ctx.textAlign = align;

    let y = padding;
    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i] || " ", x, y);
      y += fontSize;
    }

    ctx.restore();
  }
}

const oldDrawNode = LiteGraph.LGraphCanvas.prototype.drawNode;
LiteGraph.LGraphCanvas.prototype.drawNode = function (node, ctx) {
  if (node && node.constructor === FireLabelAxis) {
    const v = oldDrawNode.apply(this, arguments);
    node.draw(ctx);
    return v;
  }
  return oldDrawNode.apply(this, arguments);
};

app.registerExtension({
  name: "RectumFireLabelAxis",
  registerCustomNodes() {
    LiteGraph.registerNodeType(FireLabelAxis.type, FireLabelAxis);
    FireLabelAxis.category = "RectumFire > UX";
  },
});
