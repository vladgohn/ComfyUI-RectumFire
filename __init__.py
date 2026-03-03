WEB_DIRECTORY = "js"

from .fire_timer  import RectumFireTimer
from .fire_done   import RectumFireDone
from .fire_note   import RectumFireNote
from .fire_switch import RectumFireSwitch
from .fire_banner import RectumFireBanner

NODE_CLASS_MAPPINGS = {
    "RectumFireTimer":  RectumFireTimer,
    "RectumFireDone":   RectumFireDone,
    "RectumFireNote":   RectumFireNote,
    "RectumFireSwitch": RectumFireSwitch,
    "RectumFireBanner": RectumFireBanner,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RectumFireDone":   "🔥Fire🔊",
    "RectumFireNote":   "🔥Fire Note",
    "RectumFireTimer":  "🔥Fire Timer",
    "RectumFireSwitch": "🔥Fire Switch",
    "RectumFireBanner": "🔥Fire Banner",
}

__all__ = [
    "WEB_DIRECTORY",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
