class RectumFireRoute:
    """
    UI-only multi-slot route node.
    Frontend JS patches built-in Route behavior.
    """
    def __init__(self):
        pass

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {},
            "hidden": {
                "prompt": "PROMPT",
                "unique_id": "UNIQUE_ID",
            },
        }

    RETURN_TYPES = ()
    FUNCTION = "execute"
    OUTPUT_NODE = True
    CATEGORY = "RectumFire/Utils"

    def execute(self, **kwargs):
        return {}
