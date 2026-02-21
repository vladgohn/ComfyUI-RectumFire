from __future__ import annotations
from typing import Any, Dict, Tuple

ANY = "*"


class RectumFireSwitch:
    @classmethod
    def INPUT_TYPES(cls) -> Dict[str, Dict[str, Any]]:
        optional = {f"input{i}": (ANY,) for i in range(1, 33)}
        return {
            "required": {
                "select": ("INT", {"default": 1, "min": 1, "max": 32, "step": 1}),
            },
            "optional": optional,
        }

    RETURN_TYPES = (ANY, "INT")
    RETURN_NAMES = ("out", "selected_index")
    FUNCTION = "run"
    CATEGORY = "RectumFire/Utils"

    def run(self, select: int, **kwargs: Any) -> Tuple[Any, int]:
        idx = max(1, min(32, int(select)))
        out = kwargs.get(f"input{idx}", None)
        return (out, idx)


NODE_CLASS_MAPPINGS = {"RectumFireSwitch": RectumFireSwitch}
NODE_DISPLAY_NAME_MAPPINGS = {"RectumFireSwitch": "🔥Fire Switch (Any)"}
