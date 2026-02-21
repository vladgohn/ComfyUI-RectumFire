import os
import uuid
import numpy as np
from PIL import Image
import folder_paths

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


ANY = AnyType("*")


class RectumFireBanner:
    CATEGORY = "RectumFire/Test"
    FUNCTION = "run"
    RETURN_TYPES = ()
    OUTPUT_NODE = True
    INPUT_IS_LIST = True

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "rf_banner": ("STRING", {"default": ""}),  # subgraph promotion anchor
                "image": ("IMAGE", {}),                    # the actual trigger + data
            }
        }

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def run(self, rf_banner, image):
        # With INPUT_IS_LIST=True, image arrives as [batch], batch is (B,H,W,C)
        x = image
        if isinstance(x, (list, tuple)) and len(x) > 0:
            x = x[0]

        if hasattr(x, "detach"):
            x = x.detach().cpu().numpy()

        # Reduce to (H,W,C)
        while isinstance(x, np.ndarray) and x.ndim > 3:
            x = x[0]

        # Convert 0..1 float -> uint8
        if x.dtype != np.uint8:
            x = np.clip(x * 255.0, 0, 255).astype(np.uint8)

        pil = Image.fromarray(x)

        filename = f"rf_banner_{uuid.uuid4().hex}.png"
        temp_dir = folder_paths.get_temp_directory()
        os.makedirs(temp_dir, exist_ok=True)
        out_path = os.path.join(temp_dir, filename)

        pil.save(out_path, format="PNG")

        ui = {
            "rf_banner_preview": [{
                "filename": filename,
                "subfolder": "",
                "type": "temp",
            }],
        }

        return {"ui": ui, "result": ()}

NODE_CLASS_MAPPINGS = {
    "RectumFireBanner": RectumFireBanner
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RectumFireBanner": "RectumFire Banner Widget"
}
