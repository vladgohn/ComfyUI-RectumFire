"""
Fire Manifest: lists the models used by the open workflow in a MarkdownNote,
with download links and storage locations (format of the official templates).

Local only: ComfyUI model lists plus Lora Manager sidecars (<model>.metadata.json
next to the model file). No network, no hashing.
"""
import json
import os

import folder_paths
from aiohttp import web
from server import PromptServer

CIVITAI_HOST = "https://civitai.com"
CIVARCHIVE_HOST = "https://civarchive.com"

SKIP_FOLDERS = {"custom_nodes", "configs"}
MODEL_EXTS = (".safetensors", ".ckpt", ".pt", ".pth", ".bin", ".gguf", ".sft", ".onnx")
# ComfyUI has folder aliases (unet/diffusion_models, clip/text_encoders): canonical names first.
PREFERRED = [
    "checkpoints", "diffusion_models", "unet", "loras", "text_encoders", "clip", "vae",
    "clip_vision", "controlnet", "model_patches", "upscale_models", "embeddings",
]


def _norm(p):
    return p.replace("\\", "/")


def _stem(p):
    return os.path.splitext(_norm(p))[0]


def _folder_order():
    keys = [k for k in folder_paths.folder_names_and_paths.keys() if k not in SKIP_FOLDERS]
    return [k for k in PREFERRED if k in keys] + [k for k in keys if k not in PREFERRED]


def _read_sidecar(full_path):
    path = os.path.splitext(full_path)[0] + ".metadata.json"
    if not os.path.isfile(path):
        return None
    try:
        with open(path, encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return None


def _link(meta):
    """Return (url, title, archived) from a Lora Manager sidecar."""
    if not meta:
        return None, None, False
    civ = meta.get("civitai") or {}
    model = civ.get("model") or {}

    title = model.get("name") or meta.get("model_name")
    if model.get("name") and civ.get("name"):
        title += f" ({civ['name']})"

    model_id = civ.get("modelId") or civ.get("civitai_model_id") or model.get("id")
    version_id = civ.get("id") or civ.get("civitai_model_version_id")
    query = f"?modelVersionId={version_id}" if version_id else ""
    deleted = bool(meta.get("civitai_deleted") or civ.get("is_deleted"))
    # Set by hand in Lora Manager (Set source URL); Hugging Face and other hosts.
    source = meta.get("source_url") or meta.get("hf_url")

    if model_id and not deleted:
        return f"{CIVITAI_HOST}/models/{model_id}{query}", title, False
    if source:
        return source, title, False
    if model_id:
        return f"{CIVARCHIVE_HOST}/models/{model_id}{query}", title, True
    return None, title, False


def _md_escape(text):
    return text.replace("[", "\\[").replace("]", "\\]")


def _markdown(items):
    rank = {k: i for i, k in enumerate(_folder_order())}
    by_folder = {}
    for it in sorted(items, key=lambda i: rank.get(i["folder"], len(rank))):
        by_folder.setdefault(it["folder"], []).append(it)

    lines = ["## Model Links", ""]
    for folder, its in by_folder.items():
        lines += [f"**{folder}**", ""]
        for it in sorted(its, key=lambda i: i["name"].lower()):
            base = os.path.basename(it["name"])
            if it["url"]:
                line = f"- [{_md_escape(base)}]({it['url']})"
            else:
                line = f"- `{base}` — no link found"
            if it["title"] and it["title"] not in (base, os.path.splitext(base)[0]):
                line += f" · {it['title']}"
            if it["archived"]:
                line += " · removed from Civitai, CivArchive copy"
            lines.append(line)
        lines.append("")

    lines += ["## Model Storage Location", "", "```", "📂 ComfyUI/", "└── 📂 models/"]
    folders = list(by_folder.items())
    for i, (folder, its) in enumerate(folders):
        last_folder = i == len(folders) - 1
        lines.append(f"    {'└──' if last_folder else '├──'} 📂 {folder}/")
        prefix = "    " + ("    " if last_folder else "│   ")
        names = sorted((it["name"] for it in its), key=str.lower)
        for j, name in enumerate(names):
            lines.append(f"{prefix}{'└──' if j == len(names) - 1 else '├──'} {name}")
    lines.append("```")
    return "\n".join(lines)


class _Index:
    """Per-request lookup tables over folder_paths.get_filename_list()."""

    def __init__(self):
        self._cache = {}

    def get(self, folder):
        if folder not in self._cache:
            try:
                names = folder_paths.get_filename_list(folder)
            except Exception:
                names = []
            exact, stems, bases = {}, {}, {}
            for n in names:
                exact.setdefault(_norm(n), n)
                stems.setdefault(_stem(n), n)
                bases.setdefault(os.path.basename(_stem(n)), n)
            self._cache[folder] = (exact, stems, bases)
        return self._cache[folder]

    def find(self, value, hint, loose, order):
        v = _norm(value)
        for folder in ([hint] if hint else []) + order:
            exact, stems, bases = self.get(folder)
            if v in exact:
                return folder, exact[v]
            if loose and folder == hint:
                # Lora Manager stores the file name without extension and usually without subfolder.
                s = _stem(v)
                hit = stems.get(s) or bases.get(os.path.basename(s))
                if hit:
                    return folder, hit
        return None


@PromptServer.instance.routes.post("/rectumfire/manifest")
async def rectumfire_manifest(request):
    data = await request.json()
    candidates = data.get("candidates", [])

    index = _Index()
    order = _folder_order()
    seen, names, items = set(), set(), []
    # Hinted candidates first: an unhinted value then reuses their folder instead of
    # picking a stray copy of the same file from another folder.
    for cand in sorted(candidates, key=lambda c: not c.get("folder")):
        # folder: preferred folder (from the widget name); loose: Lora Manager entry without extension.
        value, hint, loose = cand.get("value"), cand.get("folder"), bool(cand.get("loose"))
        if not isinstance(value, str) or not value or len(value) > 1024:
            continue
        if not loose and not value.lower().endswith(MODEL_EXTS):
            continue
        if not hint and _norm(value) in names:
            continue

        hit = index.find(value, hint, loose, order)
        if not hit:
            continue

        full = folder_paths.get_full_path(*hit)
        key = os.path.normcase(full) if full else f"{hit[0]}/{hit[1]}"
        names.add(_norm(value))
        if key in seen:
            continue
        seen.add(key)

        url, title, archived = _link(_read_sidecar(full) if full else None)
        items.append({
            "folder": hit[0],
            "name": _norm(hit[1]),
            "url": url,
            "title": title,
            "archived": archived,
        })

    return web.json_response({
        "markdown": _markdown(items) if items else "",
        "count": len(items),
        "linked": sum(1 for i in items if i["url"]),
    })
