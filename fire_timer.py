class RectumFireTimer:
    """
    Display-only UI node: scalable execution timer
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
    CATEGORY = "RectumFire/UI"

    def execute(self, **kwargs):
        return {}
