import folder_paths
from nodes import CheckpointLoaderSimple


class FireChkLoad:
    @classmethod
    def INPUT_TYPES(cls):
        ckpts = folder_paths.get_filename_list("checkpoints")
        return {
            "required": {
                "ckpt_name": (
                    ckpts,
                    {"default": ckpts[0] if ckpts else ""}
                ),
            }
        }

    RETURN_TYPES = ("MODEL", "CLIP", "VAE")
    RETURN_NAMES = ("model", "clip", "vae")
    FUNCTION = "load"
    CATEGORY = "Fire"

    def load(self, ckpt_name):
        loader = CheckpointLoaderSimple()
        return loader.load_checkpoint(ckpt_name)
