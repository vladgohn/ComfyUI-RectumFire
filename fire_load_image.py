import nodes


class RectumFireLoadImage(nodes.LoadImage):
    # Same as the core Load Image. Inside a subgraph, the subgraph node shows its preview
    # and accepts drag & drop / click-to-upload (see js/fire_banner.js).
    CATEGORY = "RectumFire/Utils"
