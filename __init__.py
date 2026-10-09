WEB_DIRECTORY = "js"

from .fire_timer       import RectumFireTimer
from .fire_done        import RectumFireDone
from .fire_note        import RectumFireNote
from .fire_switch      import RectumFireSwitch
from .fire_banner      import RectumFireBanner
from .fire_load_image  import RectumFireLoadImage

NODE_CLASS_MAPPINGS = {
    "RectumFireTimer":      RectumFireTimer,
    "RectumFireDone":       RectumFireDone,
    "RectumFireNote":       RectumFireNote,
    "RectumFireSwitch":     RectumFireSwitch,
    "RectumFireBanner":     RectumFireBanner,
    "RectumFireLoadImage":  RectumFireLoadImage,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RectumFireDone":       "🔥Fire🔊",
    "RectumFireNote":       "🔥Fire Note",
    "RectumFireTimer":      "🔥Fire Timer",
    "RectumFireSwitch":     "🔥Fire Switch",
    "RectumFireBanner":     "🔥Fire Banner",
    "RectumFireLoadImage":  "🔥Fire Load Image",
}

__all__ = [
    "WEB_DIRECTORY",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]