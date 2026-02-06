class RectumFireNote:
    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "text": ("STRING", {"default": "", "multiline": True})
            }
        }

    RETURN_TYPES = ()
    RETURN_NAMES = ()
    FUNCTION = "noop"
    CATEGORY = "Fire"

    def noop(self, text):
        return ()
