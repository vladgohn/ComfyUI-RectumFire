"""
Fire Model Card: pass-through MODEL node that shows the upstream model's Lora Manager
card (cover, title, version, base model, precision) and outputs a readable label.

Local only: reads <model>.metadata.json and the cover file next to the model.
"""
import mimetypes
import os
import re

import folder_paths
from aiohttp import web
from server import PromptServer

from .fire_manifest import _read_sidecar

# Loader widgets that hold a model file name, with their model folder.
MODEL_WIDGETS = {
    "unet_name": "diffusion_models",
    "ckpt_name": "checkpoints",
}
# Tried after the widget's own folder: GGUF and MultiGPU loaders keep models elsewhere.
FALLBACK_FOLDERS = ("diffusion_models", "unet", "checkpoints", "unet_gguf")

BASE_SHORT = {
    "krea 2": "KR2",
    "krea 2 turbo": "K2T",
    "flux.1 d": "F1D",
    "flux.1 s": "F1S",
    "flux.1 krea": "F1K",
    "sdxl 1.0": "XL",
    "pony": "PONY",
    "illustrious": "IL",
    "noobai": "NOOB",
    "sd 1.5": "SD15",
}

# Longest first: "nvfp4" must win over "fp4".
PRECISION_RE = re.compile(r"(nvfp4|mxfp4|fp8|fp16|bf16|fp32|int8|int4|fp4|gguf|q\d_k(?:_[sml])?|q\d_\d)", re.I)

COVER_EXTS = (".jpeg", ".jpg", ".png", ".webp", ".gif", ".mp4", ".webm")

# Text overlay fonts are Latin-only: CJK and other scripts render as boxes.
NON_LATIN_RE = re.compile(r"[^ -ɏ]+")


def _latin(text):
    text = NON_LATIN_RE.sub(" ", text or "")
    text = re.sub(r"\s+([!?.,:;)])", r"\1", text)
    text = re.sub(r"\(\s*\)", "", text)
    return re.sub(r"\s{2,}", " ", text).strip(" -|·")


def _base_short(base):
    if not base:
        return ""
    key = base.strip().lower()
    if key in BASE_SHORT:
        return BASE_SHORT[key]
    return re.sub(r"[^A-Za-z0-9]", "", base).upper()[:5]


def _precision(meta, file_name):
    """Quantization field first, then the version name, then the last match in the file name."""
    q = (meta or {}).get("quantization")
    if isinstance(q, str) and q.strip():
        return q.strip().upper()
    version = ((meta or {}).get("civitai") or {}).get("name") or ""
    for text in (version, os.path.splitext(os.path.basename(file_name))[0]):
        hits = PRECISION_RE.findall(text)
        if hits:
            return hits[-1].upper()
    return ""


def _resolve(folder, name):
    """Full path of a model, only for names ComfyUI itself lists (no arbitrary paths)."""
    if not isinstance(name, str) or not name:
        return None
    for f in (folder,) + FALLBACK_FOLDERS:
        if f not in folder_paths.folder_names_and_paths:
            continue
        try:
            full = folder_paths.get_full_path(f, name)
        except Exception:
            full = None
        if full:
            return full
    return None


def _cover(full_path):
    stem = os.path.splitext(full_path)[0]
    for suffix in ("", ".preview"):
        for ext in COVER_EXTS:
            path = stem + suffix + ext
            if os.path.isfile(path):
                return path
    return None


def card_info(folder, name):
    full = _resolve(folder, name)
    base_name = os.path.splitext(os.path.basename(name or ""))[0]
    if not full:
        return {"found": False, "file": base_name, "label": base_name}

    meta = _read_sidecar(full)
    civ = (meta or {}).get("civitai") or {}
    model = civ.get("model") or {}
    # Civitai titles often repeat themselves in other languages after " | ".
    title = (model.get("name") or (meta or {}).get("model_name") or "").split(" | ")[0].strip()
    version = (civ.get("name") or "").strip()
    base = (meta or {}).get("base_model") or civ.get("baseModel") or ""
    precision = _precision(meta, name)

    parts = [p for p in (_latin(title) or base_name, _latin(version), precision) if p]
    return {
        "found": True,
        "has_meta": meta is not None,
        "file": base_name,
        "title": title,
        "version": version,
        "base": base,
        "base_short": _base_short(base),
        "precision": precision,
        "cover": _cover(full) is not None,
        "label": " · ".join(parts),
    }


@PromptServer.instance.routes.get("/rectumfire/model_card")
async def rectumfire_model_card(request):
    q = request.rel_url.query
    return web.json_response(card_info(q.get("folder", ""), q.get("name", "")))


@PromptServer.instance.routes.get("/rectumfire/model_card/cover")
async def rectumfire_model_card_cover(request):
    q = request.rel_url.query
    full = _resolve(q.get("folder", ""), q.get("name", ""))
    cover = _cover(full) if full else None
    if not cover:
        return web.Response(status=404)
    ctype = mimetypes.guess_type(cover)[0] or "application/octet-stream"
    return web.FileResponse(cover, headers={"Content-Type": ctype, "Cache-Control": "max-age=300"})


def _upstream_model_file(prompt, node_id, seen=None):
    """Follow MODEL links upstream in the API prompt until a loader with a model widget."""
    seen = seen or set()
    if node_id in seen or node_id not in prompt:
        return None
    seen.add(node_id)
    inputs = prompt[node_id].get("inputs", {})
    for widget, folder in MODEL_WIDGETS.items():
        value = inputs.get(widget)
        if isinstance(value, str):
            return folder, value
    for value in inputs.values():
        if isinstance(value, list) and len(value) == 2:
            hit = _upstream_model_file(prompt, str(value[0]), seen)
            if hit:
                return hit
    return None


class RectumFireModelCard:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {"model": ("MODEL",)},
            "hidden": {"prompt": "PROMPT", "unique_id": "UNIQUE_ID"},
        }

    RETURN_TYPES = ("MODEL", "STRING")
    RETURN_NAMES = ("model", "label")
    FUNCTION = "execute"
    CATEGORY = "RectumFire/Utils"

    def execute(self, model, prompt=None, unique_id=None):
        label = ""
        if prompt and unique_id is not None:
            link = prompt.get(str(unique_id), {}).get("inputs", {}).get("model")
            hit = _upstream_model_file(prompt, str(link[0])) if isinstance(link, list) else None
            if hit:
                label = card_info(*hit)["label"]
        return (model, label)
