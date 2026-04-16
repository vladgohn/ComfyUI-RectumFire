import { app } from "../../scripts/app.js";

/**
 * Frontend-only (virtual) label.
 * No Python node. Registered via LiteGraph.registerNodeType in registerCustomNodes().
 *
 * Title text is rendered as Unicode Mathematical Bold Fraktur.
 * Letter spacing is implemented manually in pixels (Canvas has no native letter-spacing).
 */

const FRAKTUR_UPPER = {
  A: "𝕬", B: "𝕭", C: "𝕮", D: "𝕯", E: "𝕰", F: "𝕱", G: "𝕲",
  H: "𝕳", I: "𝕴", J: "𝕵", K: "𝕶", L: "𝕷", M: "𝕸", N: "𝕹",
  O: "𝕺", P: "𝕻", Q: "𝕼", R: "𝕽", S: "𝕾", T: "𝕿", U: "𝖀",
  V: "𝖁", W: "𝖂", X: "𝖃", Y: "𝖄", Z: "𝖅",
};

const FRAKTUR_LOWER = {
  a: "𝖆", b: "𝖇", c: "𝖈", d: "𝖉", e: "𝖊", f: "𝖋", g: "𝖌",
  h: "𝖍", i: "𝖎", j: "𝖏", k: "𝖐", l: "𝖑", m: "𝖒", n: "𝖓",
  o: "𝖔", p: "𝖕", q: "𝖖", r: "𝖗", s: "𝖘", t: "𝖙", u: "𝖚",
  v: "𝖛", w: "𝖜", x: "𝖝", y: "𝖞", z: "𝖟",
};

function toFrakturUnicode(s) {
  if (!s) return s;
  let out = "";
  for (const ch of String(s)) {
    out += FRAKTUR_UPPER[ch] || FRAKTUR_LOWER[ch] || ch;
  }
  return out;
}

// IMPORTANT: iterate by codepoints (for...of / Array.from) because Fraktur glyphs are in SMP.
function glyphsOf(text) {
  return Array.from(String(text ?? ""));
}

function textWidthWithSpacing(ctx, text, spacingPx) {
  const glyphs = glyphsOf(text);
  if (glyphs.length === 0) return ctx.measureText(" ").width;

  let w = 0;
  for (let i = 0; i < glyphs.length; i++) {
    w += ctx.measureText(glyphs[i]).width;
    if (i !== glyphs.length - 1) w += spacingPx;
  }
  return w;
}

function drawTextWithSpacing(ctx, text, x, y, spacingPx) {
  const glyphs = glyphsOf(text);
  let cx = x;

  for (let i = 0; i < glyphs.length; i++) {
    const g = glyphs[i];
    ctx.fillText(g, cx, y);
    cx += ctx.measureText(g).width;
    if (i !== glyphs.length - 1) cx += spacingPx;
  }
}

function drawAlignedTextWithSpacing(ctx, text, anchorX, y, align, lineWidth, spacingPx) {
  let startX = anchorX;
  if (align === "center") startX = anchorX - lineWidth / 2;
  else if (align === "right") startX = anchorX - lineWidth;

  drawTextWithSpacing(ctx, text, startX, y, spacingPx);
}

function applyTransparentChrome(node) {
  if (!node) return;
  const transparent = "rgba(0,0,0,0)";
  node.color = transparent;
  node.bgcolor = transparent;
  node.boxcolor = transparent;
  node.groupcolor = transparent;
  node.title_color = transparent;
  node.title_text_color = transparent;
  node.titleTextColor = transparent;
 }

function normalizeBackgroundColor(value) {
  if (value == null) return "transparent";
  const raw = String(value).trim();
  const normalized = raw.toLowerCase();
  if (!normalized) return "transparent";
  if (
    normalized === "transparent" ||
    normalized === "none" ||
    normalized === "#0000" ||
    normalized === "#00000000" ||
    normalized === "rgba(0,0,0,0)"
  ) {
    return "transparent";
  }
  if (
    normalized === "#000" ||
    normalized === "#000000" ||
    normalized === "black" ||
    normalized === "rgb(0,0,0)"
  ) {
    return "transparent";
  }
  return raw;
}

class FireLabel extends LiteGraph.LGraphNode {
  static type  = "🔥Fire Label";
  static title = "🔥Fire Label";
  static title_mode = LiteGraph.NO_TITLE;
  static collapsable = false;

  static "@fontSize"  = { type: "number" };
  static "@fontColor" = { type: "string" };
  static "@textAlign" = { type: "combo", values: ["left", "center", "right"] };
  static "@backgroundColor" = { type: "string" };
  static "@borderRadius"  = { type: "number" };
  static "@letterSpacing" = { type: "number" }; // px
  static "@padding" = { type: "number" };

  constructor(title = "Fire Label") {
    super(title);

    this.properties = this.properties || {};
    this.properties["fontSize"] = 70;
    this.properties["fontColor"] = "#cd7eff";
    this.properties["textAlign"] = "center";
    this.properties["backgroundColor"] = "transparent";
    this.properties["padding"] = 6;
    this.properties["borderRadius"] = 6;
    this.properties["letterSpacing"] = -2.5; // Letter spacing in PIXELS (negative = tighter)

    applyTransparentChrome(this);
    this.size = this.size || [260, 80];

    this.isVirtualNode = true;
    this.serialize_widgets = true;
  }

  onConfigure() {
    this.properties = this.properties || {};
    this.properties["backgroundColor"] = normalizeBackgroundColor(this.properties["backgroundColor"]);
    applyTransparentChrome(this);
  }

  onDblClick() {
    LiteGraph?.LGraphCanvas?.active_canvas?.showShowNodePanel?.(this);
  }

  onShowCustomPanelInfo(panel) {
    panel?.querySelector?.('div.property[data-property="Mode"]')?.remove?.();
    panel?.querySelector?.('div.property[data-property="Color"]')?.remove?.();
  }

  draw(ctx) {
    applyTransparentChrome(this);

    const fontSize = Math.max(Number(this.properties["fontSize"] || 1), 1);
    const fontColor = this.properties["fontColor"] || "#ffffff";
    const backgroundColor = normalizeBackgroundColor(this.properties["backgroundColor"]);
    this.properties["backgroundColor"] = backgroundColor;
    const padding = Number(this.properties["padding"] ?? 0) || 0;
    const borderRadius = Number(this.properties["borderRadius"] ?? 0) || 0;

    const align = this.properties["textAlign"] || "left";
    const letterSpacing = Number(this.properties["letterSpacing"] ?? 0) || 0;

    const rawTitle = String(this.title ?? "").replace(/\n*$/, "");
    const frakturTitle = toFrakturUnicode(rawTitle || "Fire Label");
    const lines = frakturTitle.split("\n");

    ctx.save();

    // Use a normal font; glyphs are already Fraktur Unicode.
    // If a system lacks these glyphs, it will show tofu; but your previous state proved it's available.
    ctx.font = `${fontSize}px Arial`;
    ctx.textBaseline = "top";
    ctx.fillStyle = fontColor;

    // Measure widths WITH spacing
    const widths = lines.map((s) => textWidthWithSpacing(ctx, s || " ", letterSpacing));
    const maxWidth = Math.max(...widths, 1);

    // Auto-fit size
    this.size[0] = Math.ceil(maxWidth + padding * 2);
    this.size[1] = Math.ceil(fontSize * lines.length + padding * 2);

    // Background
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

    // Anchor X for alignment
    let anchorX = padding;
    if (align === "center") anchorX = this.size[0] / 2;
    else if (align === "right") anchorX = this.size[0] - padding;

    let y = padding;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i] || " ";
      const lineW = widths[i] ?? textWidthWithSpacing(ctx, line, letterSpacing);
      drawAlignedTextWithSpacing(ctx, line, anchorX, y, align, lineW, letterSpacing);
      y += fontSize;
    }

    ctx.restore();
  }
}

// Hijack canvas drawNode like rgthree does, to render our label cleanly
const oldDrawNode = LiteGraph.LGraphCanvas.prototype.drawNode;
LiteGraph.LGraphCanvas.prototype.drawNode = function (node, ctx) {
  if (node && node.constructor === FireLabel) {
    applyTransparentChrome(node);
    node.draw(ctx);
    return;
  }
  return oldDrawNode.apply(this, arguments);
};

app.registerExtension({
  name: "RectumFireLabel",
  registerCustomNodes() {
    LiteGraph.registerNodeType(FireLabel.type, FireLabel);
    FireLabel.category = "RectumFire > UX";
  },
});
