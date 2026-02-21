import os
import json
import time
import random
import string

import numpy as np
from PIL import Image
from PIL.PngImagePlugin import PngInfo

import folder_paths
from comfy.cli_args import args


def _now_stamp_local() -> str:
    t = time.time()
    lt = time.localtime(t)
    ms = int((t - int(t)) * 1000)
    return time.strftime("%Y-%m-%d_%H-%M-%S", lt) + f"-{ms:03d}"


def _rand_tag(n: int = 4) -> str:
    alphabet = string.ascii_lowercase + string.digits
    return "".join(random.choice(alphabet) for _ in range(n))


def _safe_tag(s: str, max_len: int = 10) -> str:
    if not s:
        return ""
    s = os.path.basename(s)
    s = os.path.splitext(s)[0]
    s = "".join(ch for ch in s if ch.isalnum() or ch in ("-", "_"))
    return s[:max_len].strip("-_") if s else ""


def _try_get_checkpoint_name(prompt: dict | None, extra_pnginfo: dict | None) -> str:
    candidates = ("ckpt_name", "checkpoint", "checkpoint_name", "model_name", "unet_name")

    def scan(obj):
        if isinstance(obj, dict):
            for k, v in obj.items():
                if k in candidates and isinstance(v, str):
                    return v
                found = scan(v)
                if found:
                    return found
        elif isinstance(obj, list):
            for it in obj:
                found = scan(it)
                if found:
                    return found
        return ""

    name = scan(prompt or {})
    if name:
        return name
    return scan(extra_pnginfo or {})


class RectumFireSaveImage:
    def __init__(self):
        self.type = "output"
        self.compress_level = 4

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "images": ("IMAGE",),
                "name_prefix": ("STRING", {"default": "render"}),
                "subfolder": ("STRING", {"default": ""}),
                "add_model_tag": ("BOOLEAN", {"default": True}),
            },
            "optional": {
                "caption": ("STRING", {"forceInput": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "extra_pnginfo": "EXTRA_PNGINFO",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ("STRING",)
    RETURN_NAMES = ("filename",)
    FUNCTION = "save"
    OUTPUT_NODE = True
    CATEGORY = "RectumFire/IO"

    def save(self, images, name_prefix="render", subfolder="", add_model_tag=True, caption=None, prompt=None, extra_pnginfo=None, unique_id=None):
        out_dir = folder_paths.get_output_directory()
        full_output = os.path.join(out_dir, subfolder) if subfolder else out_dir
        os.makedirs(full_output, exist_ok=True)

        stamp = _now_stamp_local()
        uniq = _rand_tag(4)

        model_tag = ""
        if add_model_tag:
            ckpt = _try_get_checkpoint_name(prompt, extra_pnginfo)
            model_tag = _safe_tag(ckpt, max_len=10)

        parts = [name_prefix]
        if model_tag:
            parts.append(model_tag)
        parts.append(stamp)
        parts.append(uniq)
        base = "__".join(parts)

        last_file = ""
        for batch_index, image in enumerate(images):
            i = 255.0 * image.cpu().numpy()
            img = Image.fromarray(np.clip(i, 0, 255).astype(np.uint8))

            metadata = None
            if not args.disable_metadata:
                metadata = PngInfo()

                if prompt is not None:
                    metadata.add_text("prompt", json.dumps(prompt, ensure_ascii=False))

                if extra_pnginfo is not None:
                    for k in extra_pnginfo:
                        metadata.add_text(k, json.dumps(extra_pnginfo[k], ensure_ascii=False))

                if caption is not None:
                    metadata.add_text("aipassport.caption", str(caption))

            filename = f"{base}__b{batch_index:02d}.png"
            img.save(os.path.join(full_output, filename), pnginfo=metadata, compress_level=self.compress_level)
            last_file = filename

        return (last_file,)
