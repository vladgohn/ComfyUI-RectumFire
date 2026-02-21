import os
import io
import base64
import numpy as np
import torch
from PIL import Image

import folder_paths


class RectumFireMask:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "image": ("IMAGE",),
                "mask_name": ("STRING", {"default": ""}),
                "invert": ("BOOLEAN", {"default": False}),
            },
            "optional": {
                "width": ("INT", {"default": 0, "min": 0, "max": 16384}),
                "height": ("INT", {"default": 0, "min": 0, "max": 16384}),
            },
        }

    # We return IMAGE as a passthrough so ComfyUI gives the node a preview (node.images[0]),
    # which the frontend painter can use as its background.
    RETURN_TYPES = ("IMAGE", "MASK")
    RETURN_NAMES = ("image", "mask")
    FUNCTION = "run"
    CATEGORY = "RectumFire"

    def run(self, image: torch.Tensor, mask_name: str, invert: bool, width: int = 0, height: int = 0):
        # image: [B,H,W,C] float32 0..1
        b, h, w, c = image.shape

        # Optional explicit target size (if you want to force alignment to a specific size)
        tw = int(width) if width and width > 0 else int(w)
        th = int(height) if height and height > 0 else int(h)

        # Default: empty mask aligned to image size
        mask = torch.zeros((b, th, tw), dtype=torch.float32, device="cpu")

        if not mask_name:
            return (image, mask)

        input_dir = folder_paths.get_input_directory()
        path = os.path.join(input_dir, mask_name)

        try:
            img = Image.open(path).convert("L")
        except Exception:
            return (image, mask)

        if img.size != (tw, th):
            img = img.resize((tw, th), resample=Image.BILINEAR)

        arr = np.array(img).astype(np.float32) / 255.0
        if invert:
            arr = 1.0 - arr

        m = torch.from_numpy(arr)[None, ...]  # [1, H, W]
        if b > 1:
            m = m.repeat(b, 1, 1)

        return (image, m)


NODE_CLASS_MAPPINGS = {
    "RectumFireMask": RectumFireMask,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RectumFireMask": "🔥Fire Mask",
}
