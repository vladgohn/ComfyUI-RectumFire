# fire_gif.py

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

ANY = AnyType("*")


class RectumFireGif:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "any": (ANY, {}),
                "enable": ("BOOLEAN", {"default": True}),
            }
        }

    FUNCTION = "nop"
    INPUT_IS_LIST = True
    OUTPUT_IS_LIST = (True,)
    OUTPUT_NODE = True
    RETURN_TYPES = (ANY,)
    CATEGORY = "RectumFire/UX"

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("nan")

    def nop(self, any, enable):
        enabled = bool(enable[0]) if isinstance(enable, list) and enable else bool(enable)
        if not enabled:
            return {"ui": {}, "result": (any,)}

        # UI payload is optional; keep it minimal.
        return {"ui": {"rf_gif": [1]}, "result": (any,)}
