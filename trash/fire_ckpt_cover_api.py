import os
from aiohttp import web
import folder_paths
from server import PromptServer

EXTS = (".png", ".jpg", ".jpeg", ".webp")


def _dummy_path():
    # dummy.png лежит в custom_nodes/comfyui_rectumfire/js/dummy.png
    here = os.path.dirname(os.path.abspath(__file__))
    return os.path.join(here, "js", "dummy.png")


def _find_ckpt_abs(name: str):
    # ищем в тех root'ах, которые реально используются у тебя
    for root in ("checkpoints", "diffusion_models", "unet"):
        p = folder_paths.get_full_path(root, name)
        if p and os.path.isfile(p):
            return p
    return None


def _find_cover_for_ckpt(ckpt_abs: str):
    stem, _ = os.path.splitext(ckpt_abs)
    for ext in EXTS:
        cand = stem + ext
        if os.path.isfile(cand):
            return cand
    return None


@PromptServer.instance.routes.get("/fire/ckpt_cover")
async def fire_ckpt_cover(request):
    name = request.query.get("name", "")
    if not name:
        # даже если нет name — покажем dummy, чтобы UI всегда видел картинку
        return web.FileResponse(_dummy_path())

    ckpt_abs = _find_ckpt_abs(name)
    if ckpt_abs:
        cover = _find_cover_for_ckpt(ckpt_abs)
        if cover:
            return web.FileResponse(cover)

    # если не нашли — возвращаем dummy
    return web.FileResponse(_dummy_path())
