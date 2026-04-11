import gc

import comfy.model_management as mm


class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False


ANY = AnyType("*")


class RectumFireDone:
    @staticmethod
    def _clear_vram():
        gc.collect()
        mm.unload_all_models()
        mm.soft_empty_cache()

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any": (ANY, {}),
                "enable": ("BOOLEAN", {"default": True}),
                "clear_vram": ("BOOLEAN", {"default": True}),
            }
        }

    FUNCTION = "nop"
    INPUT_IS_LIST = True

    # Output/bell node: it must be an execution root, but must have zero outputs.
    OUTPUT_NODE = True
    RETURN_TYPES = ()

    CATEGORY = "RectumFire/UX"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def nop(self, any, enable, clear_vram):
        enabled = bool(enable[0]) if isinstance(enable, list) and enable else bool(enable)
        clear_enabled = bool(clear_vram[0]) if isinstance(clear_vram, list) and clear_vram else bool(clear_vram)

        if not enabled:
            return {"ui": {}, "result": ()}

        if clear_enabled:
            self._clear_vram()

        # IMPORTANT: ui values must be iterable (list)
        return {"ui": {"rf_done": [1]}, "result": ()}
