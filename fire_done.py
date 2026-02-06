# fire_done.py

class AnyType(str):
    def __ne__(self, __value: object) -> bool:
        return False

ANY = AnyType("*")


class RectumFireDone:
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
        # enable is list when INPUT_IS_LIST=True
        enabled = bool(enable[0]) if isinstance(enable, list) and enable else bool(enable)

        if not enabled:
            return {"ui": {}, "result": (any,)}

        # IMPORTANT: ui values must be iterable (list)
        return {"ui": {"rf_done": [1]}, "result": (any,)}
