import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

function dataURLToBlob(dataURL) {
  const [header, b64] = dataURL.split(",");
  const mime = header.match(/data:(.*);base64/)?.[1] ?? "image/png";
  const bytes = atob(b64);
  const arr = new Uint8Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) arr[i] = bytes.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

function makeSoftStamp(radius, hardness = 0.0) {
  const r = Math.max(1, Math.floor(radius));
  const size = r * 2 + 2;
  const cnv = document.createElement("canvas");
  cnv.width = size;
  cnv.height = size;
  const ctx = cnv.getContext("2d");

  const cx = size / 2;
  const cy = size / 2;
  const inner = Math.max(0, r * clamp(hardness, 0, 1));
  const g = ctx.createRadialGradient(cx, cy, inner, cx, cy, r);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  return cnv;
}

function attachPainter(node) {
  // Serialized widget (Comfy reads this value in python)
  const maskNameW = node.addWidget("text", "mask_name", "", (v) => v, { multiline: false });

  // Painter UI state
  node.__rf = node.__rf || {};
  const S = node.__rf;

  S.radius = 42;
  S.strength = 1.0;
  S.hardness = 0.0;
  S.erase = false;

  S.zoom = 1.0;
  S.panX = 0;
  S.panY = 0;

  S.imgW = 0;
  S.imgH = 0;

  S.maskCanvas = document.createElement("canvas"); // offscreen, always image-sized
  S.maskCtx = S.maskCanvas.getContext("2d");

  S.stamp = null;
  S.drawing = false;
  S.panning = false;
  S.last = null;

  const wrap = document.createElement("div");
  wrap.style.width = "100%";
  wrap.style.boxSizing = "border-box";
  wrap.style.padding = "6px";

  const canvas = document.createElement("canvas"); // display canvas
  canvas.style.width = "100%";
  canvas.style.display = "block";
  canvas.style.borderRadius = "10px";
  canvas.style.border = "1px solid var(--border-color)";
  canvas.style.background = "rgba(0,0,0,0.18)";
  canvas.style.touchAction = "none"; // pointer events stable
  wrap.appendChild(canvas);

  const controls = document.createElement("div");
  controls.style.display = "grid";
  controls.style.gridTemplateColumns = "1fr 1fr";
  controls.style.gap = "8px";
  controls.style.marginTop = "8px";

  function mkLabel(text) {
    const d = document.createElement("div");
    d.textContent = text;
    d.style.font = "12px system-ui";
    d.style.opacity = "0.85";
    d.style.marginBottom = "2px";
    return d;
  }

  function mkRow(label, el) {
    const box = document.createElement("div");
    box.style.display = "flex";
    box.style.flexDirection = "column";
    box.appendChild(mkLabel(label));
    box.appendChild(el);
    return box;
  }

  const radiusInp = document.createElement("input");
  radiusInp.type = "range";
  radiusInp.min = "1";
  radiusInp.max = "256";
  radiusInp.value = String(S.radius);

  const strengthInp = document.createElement("input");
  strengthInp.type = "range";
  strengthInp.min = "5";
  strengthInp.max = "100";
  strengthInp.value = String(Math.round(S.strength * 100));

  const hardnessInp = document.createElement("input");
  hardnessInp.type = "range";
  hardnessInp.min = "0";
  hardnessInp.max = "100";
  hardnessInp.value = String(Math.round(S.hardness * 100));

  const eraseBtn = document.createElement("button");
  eraseBtn.textContent = "Erase: OFF";

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "8px";
  btnRow.style.marginTop = "8px";

  const btnClear = document.createElement("button");
  btnClear.textContent = "Clear Mask";

  const btnApply = document.createElement("button");
  btnApply.textContent = "Apply (Upload Mask)";

  btnRow.appendChild(btnClear);
  btnRow.appendChild(btnApply);

  controls.appendChild(mkRow("Radius", radiusInp));
  controls.appendChild(mkRow("Strength", strengthInp));
  controls.appendChild(mkRow("Hardness", hardnessInp));
  controls.appendChild(mkRow("Mode", eraseBtn));

  wrap.appendChild(controls);
  wrap.appendChild(btnRow);

  const ctx = canvas.getContext("2d", { willReadFrequently: true });

  function resizeCanvasToCSS() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.floor(r.width));
    const h = Math.max(1, Math.floor(r.height));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
  }

  function ensureMaskSize(imgW, imgH) {
    if (!imgW || !imgH) return;
    if (S.maskCanvas.width !== imgW || S.maskCanvas.height !== imgH) {
      S.maskCanvas.width = imgW;
      S.maskCanvas.height = imgH;
      S.maskCtx.clearRect(0, 0, imgW, imgH);
    }
  }

  function fitToView() {
    if (!S.imgW || !S.imgH) return;
    resizeCanvasToCSS();
    const vw = canvas.width;
    const vh = canvas.height;
    const fit = Math.min(vw / S.imgW, vh / S.imgH);
    S.zoom = clamp(fit, 0.05, 12.0);
    S.panX = Math.round((vw - S.imgW * S.zoom) / 2);
    S.panY = Math.round((vh - S.imgH * S.zoom) / 2);
  }

  function nodeToImage(nx, ny) {
    const ix = (nx - S.panX) / S.zoom;
    const iy = (ny - S.panY) / S.zoom;
    return { x: clamp(ix, 0, S.imgW - 1), y: clamp(iy, 0, S.imgH - 1) };
  }

  function drawStampAt(p) {
    if (!S.stamp) S.stamp = makeSoftStamp(S.radius, S.hardness);
    const r = Math.max(1, Math.floor(S.radius));
    S.maskCtx.save();
    S.maskCtx.globalAlpha = clamp(S.strength, 0, 1);
    S.maskCtx.globalCompositeOperation = S.erase ? "destination-out" : "source-over";
    S.maskCtx.drawImage(S.stamp, p.x - (r + 1), p.y - (r + 1));
    S.maskCtx.restore();
  }

  function strokeBetween(p0, p1) {
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const step = Math.max(0.5, S.radius * 0.35);
    const n = Math.max(1, Math.ceil(dist / step));
    for (let i = 1; i <= n; i++) {
      const t = i / n;
      drawStampAt({ x: p0.x + dx * t, y: p0.y + dy * t });
    }
  }

  function drawOverlayMaskScaled() {
    if (!S.imgW || !S.imgH) return;

    ctx.save();
    ctx.translate(S.panX, S.panY);
    ctx.scale(S.zoom, S.zoom);

    // 1) draw mask alpha
    ctx.globalAlpha = 0.55;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(S.maskCanvas, 0, 0);

    // 2) tint it to cyan and apply multiply-like blend
    // First, keep only mask shape...
    ctx.globalCompositeOperation = "source-in";
    ctx.fillStyle = "rgba(80, 200, 255, 1)";
    ctx.fillRect(0, 0, S.imgW, S.imgH);

    // ...then multiply over image visually
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = "rgba(80, 200, 255, 1)";
    ctx.fillRect(0, 0, S.imgW, S.imgH);

    ctx.restore();
  }

  function redraw() {
    resizeCanvasToCSS();
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Draw background
    ctx.fillStyle = "rgba(0,0,0,0.08)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // Draw image from Comfy preview if available
    const img = node.images?.[0];
    if (img?.width && img?.height) {
      if (S.imgW !== img.width || S.imgH !== img.height) {
        S.imgW = img.width;
        S.imgH = img.height;
        ensureMaskSize(S.imgW, S.imgH);
        fitToView();
      }

      ctx.save();
      ctx.translate(S.panX, S.panY);
      ctx.scale(S.zoom, S.zoom);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(img, 0, 0);
      ctx.restore();

      // Overlay mask (cyan, semi-transparent)
      drawOverlayMaskScaled();

      // HUD
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.font = "12px system-ui";
      ctx.fillText(
        `Zoom ${(S.zoom).toFixed(2)} | R ${S.radius} | ${S.erase ? "ERASE" : "DRAW"}`,
        10, canvas.height - 10
      );
      ctx.restore();
    } else {
      ctx.save();
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.font = "12px system-ui";
      ctx.fillText("Connect an IMAGE to this node. (Preview will appear here.)", 10, 20);
      ctx.restore();
    }

    app.graph.setDirtyCanvas(true, true);
  }

  // Controls
  radiusInp.addEventListener("input", () => {
    S.radius = Number(radiusInp.value);
    S.stamp = null;
    redraw();
  });

  strengthInp.addEventListener("input", () => {
    S.strength = Number(strengthInp.value) / 100;
  });

  hardnessInp.addEventListener("input", () => {
    S.hardness = Number(hardnessInp.value) / 100;
    S.stamp = null;
  });

  eraseBtn.addEventListener("click", () => {
    S.erase = !S.erase;
    eraseBtn.textContent = `Erase: ${S.erase ? "ON" : "OFF"}`;
  });

  btnClear.addEventListener("click", () => {
    if (!S.imgW || !S.imgH) return;
    S.maskCtx.clearRect(0, 0, S.imgW, S.imgH);
    redraw();
  });

  btnApply.addEventListener("click", async () => {
    if (!S.imgW || !S.imgH) return;

    // Save maskCanvas as PNG (white mask on transparent background)
    const pngDataURL = S.maskCanvas.toDataURL("image/png");
    const blob = dataURLToBlob(pngDataURL);

    const fd = new FormData();
    const fname = `mask_${Date.now()}.png`;
    fd.append("image", blob, fname);
    fd.append("type", "input");

    const res = await api.fetchApi("/upload/mask", { method: "POST", body: fd });
    const j = await res.json();

    const stored = j.subfolder ? `${j.subfolder}/${j.name}` : j.name;
    maskNameW.value = stored;

    app.graph.setDirtyCanvas(true, true);
  });

  // Pointer interaction: draw / pan / zoom
  canvas.addEventListener("pointerdown", (e) => {
    resizeCanvasToCSS();
    canvas.setPointerCapture(e.pointerId);

    // Middle/right/Alt = pan
    if (e.button === 1 || e.button === 2 || e.altKey) {
      S.panning = true;
      S.panStart = { x: e.offsetX, y: e.offsetY, ox: S.panX, oy: S.panY };
      return;
    }

    if (!S.imgW || !S.imgH) return;

    S.drawing = true;
    const p = nodeToImage(e.offsetX, e.offsetY);
    S.last = p;
    drawStampAt(p);
    redraw();
  });

  canvas.addEventListener("pointermove", (e) => {
    if (S.panning && S.panStart) {
      const dx = e.offsetX - S.panStart.x;
      const dy = e.offsetY - S.panStart.y;
      S.panX = S.panStart.ox + dx;
      S.panY = S.panStart.oy + dy;
      redraw();
      return;
    }

    if (!S.drawing) return;
    if (!S.imgW || !S.imgH) return;

    const p = nodeToImage(e.offsetX, e.offsetY);
    if (!S.last) S.last = p;
    strokeBetween(S.last, p);
    S.last = p;
    redraw();
  });

  canvas.addEventListener("pointerup", () => {
    S.drawing = false;
    S.panning = false;
    S.panStart = null;
    S.last = null;
  });

  canvas.addEventListener("wheel", (e) => {
    if (!S.imgW || !S.imgH) return;
    e.preventDefault();
    resizeCanvasToCSS();

    const oldZ = S.zoom;
    const factor = e.deltaY > 0 ? 0.9 : 1.111111;
    const newZ = clamp(oldZ * factor, 0.05, 12.0);

    // Zoom around cursor
    const nx = e.offsetX;
    const ny = e.offsetY;
    const ix = (nx - S.panX) / oldZ;
    const iy = (ny - S.panY) / oldZ;

    S.zoom = newZ;
    S.panX = nx - ix * newZ;
    S.panY = ny - iy * newZ;

    redraw();
  }, { passive: false });

  node.addDOMWidget("Painter", "Painter", wrap, { serialize: false, hideOnZoom: false });

  // Respect node resize: keep canvas inside node, not "floating"
  const origOnResize = node.onResize;
  node.onResize = function (sz) {
    const r = origOnResize?.call(this, sz);

    // Make canvas height depend on node height (so it never overflows)
    const h = Math.max(140, Math.floor((node.size?.[1] ?? 420) - 160));
    canvas.style.height = `${h}px`;

    queueMicrotask(() => {
      resizeCanvasToCSS();
      redraw();
    });

    return r;
  };

  // Initial sizing
  canvas.style.height = "280px";
  queueMicrotask(() => {
    resizeCanvasToCSS();
    redraw();
  });
}

app.registerExtension({
  name: "rectumfire.fire_mask",
  nodeCreated(node) {
    if (node.comfyClass !== "RectumFireMask") return;
    attachPainter(node);
  },
});
