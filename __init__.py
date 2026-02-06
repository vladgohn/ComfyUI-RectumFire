WEB_DIRECTORY = "js"

from .fire_timer import RectumFireTimer
from .fire_route import RectumFireRoute
from .fire_done  import RectumFireDone
from .fire_note  import RectumFireNote

NODE_CLASS_MAPPINGS = {
    "RectumFireNote":  RectumFireNote,
    "RectumFireTimer": RectumFireTimer,
    "RectumFireRoute": RectumFireRoute,
    "RectumFireDone":  RectumFireDone,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "RectumFireNote":  "🔥Fire Note",
    "RectumFireTimer": "🔥Fire Timer",
    "RectumFireRoute": "🔥Fire Route",
    "RectumFireDone":  "🔥Fire🔊",
}

__all__ = [
    "WEB_DIRECTORY",
    "NODE_CLASS_MAPPINGS",
    "NODE_DISPLAY_NAME_MAPPINGS",
]
