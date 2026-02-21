import os
import time
import uuid
from pathlib import Path

import numpy as np
import torch
from PIL import Image, ImageDraw, ImageFont

import folder_paths


# ---------------------------
# Utils
# ---------------------------

def _to_float_list(sigmas):
    """
    SIGMAS can arrive as:
    - torch tensor (1D)
    - list/tuple of floats
    - nested tensors/lists
    """
    if sigmas is None:
        return []
    if isinstance(sigmas, torch.Tensor):
        return [float(x) for x in sigmas.detach().cpu().flatten().tolist()]
    if isinstance(sigmas, (list, tuple)):
        out = []
        for v in sigmas:
            if isinstance(v, torch.Tensor):
                out += [float(x) for x in v.detach().cpu().flatten().tolist()]
            elif isinstance(v, (list, tuple)):
                out += [float(x) for x in v]
            else:
                out.append(float(v))
        return out
    # fallback
    try:
        return [float(x) for x in sigmas]
    except Exception:
        return [float(sigmas)]


def _fmt_table(sigmas):
    vals = _to_float_list(sigmas)
    n = len(vals)
    if n == 0:
        return "(RectumFire) No sigmas"
    mn = min(vals)
    mx = max(vals)
    # normalize 0..1 (match RES4LYF style)
    denom = (mx - mn) if (mx - mn) != 0 else 1.0
    norm = [(v - mn) / denom for v in vals]
    # step sizes
    step = ["--"] + [f"{abs(vals[i-1]-vals[i]):.4f}" for i in range(1, n)]

    lines = []
    lines.append("(RectumFire) ============================================================")
    lines.append("(RectumFire) FIRE SIGMA — PRINT LIST")
    lines.append("(RectumFire) ============================================================")
    lines.append(f"(RectumFire) Total steps: {n}")
    lines.append(f"(RectumFire) Min sigma:   {mn:.4f}")
    lines.append(f"(RectumFire) Max sigma:   {mx:.4f}")
    lines.append("(RectumFire)")
    lines.append(f"(RectumFire) Sigma values ({n} steps):")
    lines.append("(RectumFire) ----------------------------------------")
    if n <= 64:
        svals = "  ".join([f"{v:.4f}" for v in vals])
        lines.append(f"(RectumFire) Step  0-{n-1:2d}:   {svals}")
    else:
        lines.append("(RectumFire) (too many steps to print on one line)")
    lines.append("(RectumFire)")
    lines.append("(RectumFire) Normalized percentages (0.0-1.0):")
    lines.append("(RectumFire) ----------------------------------------")
    lines.append("(RectumFire) Step | Sigma    | Normalized | Step Size")
    lines.append("(RectumFire) -----|----------|------------|----------")
    for i in range(n):
        lines.append(f"(RectumFire) {i:>4} | {vals[i]:>8.4f} | {norm[i]:>10.4f} | {step[i]:>8}")
    lines.append("(RectumFire) ============================================================")
    return "\n".join(lines)


# ---------------------------
# Render (PIL) — 720x180, dark UI, grid, gradient line, big SIGMA
# ---------------------------

COLORS = {
    "white": [(255, 255, 255)],
    "cyan": [(0, 255, 255)],
    "orange": [(255, 165, 0)],
    "pink": [(255, 0, 187)],
    # 3-stop from your Figma: #FFF720 -> #FF00BB -> #8800FF
    "rainbow": [(0xFF, 0xF7, 0x20), (0xFF, 0x00, 0xBB), (0x88, 0x00, 0xFF)],
    # simple spectrum-ish (still 3 stops)
    "spectrum": [(0x00, 0xFF, 0xFF), (0xFF, 0x00, 0xBB), (0xFF, 0xF7, 0x20)],
}


def _lerp(a, b, t):
    return a + (b - a) * t


def _lerp_rgb(c1, c2, t):
    return (
        int(_lerp(c1[0], c2[0], t)),
        int(_lerp(c1[1], c2[1], t)),
        int(_lerp(c1[2], c2[2], t)),
    )


def _pick_gradient(color_name):
    stops = COLORS.get(color_name, COLORS["rainbow"])
    if len(stops) == 1:
        return [stops[0], stops[0], stops[0]]
    if len(stops) == 2:
        return [stops[0], stops[1], stops[1]]
    return stops[:3]


def _load_font(size_px):
    # Try packaged font first (put GShock.ttf next to this file)
    here = Path(__file__).resolve().parent
    candidates = [
        here / "GShock.ttf",
        here / "fonts" / "GShock.ttf",
        here / "fonts" / "DejaVuSans.ttf",
    ]
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size_px)
            except Exception:
                pass
    return ImageFont.load_default()


def render_sigma_preview_image(sigmas, line_color="rainbow", width=720, height=180):
    vals = _to_float_list(sigmas)
    if len(vals) < 2:
        vals = [1.0, 0.0]

    # normalize 0..1 (top=1)
    mx = max(vals) if max(vals) != 0 else 1.0
    vnorm = [v / mx for v in vals]

    img = Image.new("RGB", (width, height), (20, 22, 26))
    d = ImageDraw.Draw(img)

    # plotting rect (match your style)
    pad_l, pad_r, pad_t, pad_b = 12, 12, 12, 18
    plot_x0, plot_y0 = pad_l, pad_t
    plot_x1, plot_y1 = width - pad_r, height - pad_b

    # subtle grid
    grid_major = (50, 55, 64)
    grid_minor = (34, 38, 46)
    # minor vertical every 24px, major every 120px
    for x in range(plot_x0, plot_x1 + 1, 24):
        d.line([(x, plot_y0), (x, plot_y1)], fill=grid_minor, width=1)
    for x in range(plot_x0, plot_x1 + 1, 120):
        d.line([(x, plot_y0), (x, plot_y1)], fill=grid_major, width=1)
    for y in range(plot_y0, plot_y1 + 1, 18):
        d.line([(plot_x0, y), (plot_x1, y)], fill=grid_minor, width=1)
    for y in range(plot_y0, plot_y1 + 1, 90):
        d.line([(plot_x0, y), (plot_x1, y)], fill=grid_major, width=1)

    # axes border
    d.rectangle([plot_x0, plot_y0, plot_x1, plot_y1], outline=(130, 140, 155), width=2)

    # big SIGMA label
    font = _load_font(64)
    d.text((plot_x0 + 18, plot_y0 + 48), "SIGMA", font=font, fill=(230, 232, 236))

    # polyline points
    n = len(vnorm)
    xs = [plot_x0 + int((plot_x1 - plot_x0) * (i / (n - 1))) for i in range(n)]
    ys = [plot_y0 + int((plot_y1 - plot_y0) * (1.0 - vnorm[i])) for i in range(n)]

    # draw gradient polyline (thick)
    c0, c1, c2 = _pick_gradient(str(line_color))
    # split into two segments: [0..mid] uses c0->c1, [mid..end] uses c1->c2
    mid = max(1, n // 2)
    for i in range(n - 1):
        if i < mid:
            t = i / max(1, (mid - 1))
            col = _lerp_rgb(c0, c1, t)
        else:
            t = (i - mid) / max(1, (n - 1 - mid))
            col = _lerp_rgb(c1, c2, t)
        d.line([(xs[i], ys[i]), (xs[i + 1], ys[i + 1])], fill=col, width=8)

    # points (black stroke, colored fill)
    for i in range(n):
        if i < mid:
            t = i / max(1, (mid - 1))
            col = _lerp_rgb(c0, c1, t)
        else:
            t = (i - mid) / max(1, (n - 1 - mid))
            col = _lerp_rgb(c1, c2, t)

        r = 10
        d.ellipse([xs[i] - r, ys[i] - r, xs[i] + r, ys[i] + r], fill=col, outline=(10, 10, 12), width=4)

    # tiny size label bottom-center like ComfyUI previews
    size_font = _load_font(16)
    label = f"{width} × {height}"
    tw, th = d.textbbox((0, 0), label, font=size_font)[2:]
    d.text(((width - tw) // 2, height - th - 2), label, font=size_font, fill=(190, 195, 205))

    return np.array(img, dtype=np.uint8)


def _save_temp_png(np_img):
    temp_dir = folder_paths.get_temp_directory()
    os.makedirs(temp_dir, exist_ok=True)
    name = f"rectumfire_sigma_{int(time.time())}_{uuid.uuid4().hex[:8]}.png"
    full = os.path.join(temp_dir, name)
    Image.fromarray(np_img).save(full, format="PNG", optimize=True)
    return name


class RectumFireSigma:
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "sigmas": ("SIGMAS",),
                "print_as_list": ("BOOLEAN", {"default": False}),
                "line_color": (
                    ["rainbow", "spectrum", "pink", "white", "cyan", "orange"],
                    {"default": "rainbow"},
                ),
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("IMAGE",)
    FUNCTION = "run"
    CATEGORY = "RectumFire/UI"

    def run(self, sigmas, print_as_list=False, line_color="rainbow"):
        if print_as_list:
            try:
                print(_fmt_table(sigmas))
            except Exception:
                pass

        img_np = render_sigma_preview_image(sigmas, line_color=str(line_color), width=720, height=180)
        # (H,W,3) uint8 -> torch (1,H,W,3) float32 0..1
        img = torch.from_numpy(img_np).unsqueeze(0).float() / 255.0

        # Make node show the preview inside itself (like SaveImage/PreviewImage)
        try:
            fn = _save_temp_png(img_np)
            ui = {"images": [{"filename": fn, "subfolder": "", "type": "temp"}]}
            return {"ui": ui, "result": (img,)}
        except Exception:
            return (img,)
