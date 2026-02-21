import { app } from "/scripts/app.js";

app.registerExtension({
    name: "FireChkLoad",

    nodeCreated(node) {
        if (node.comfyClass !== "FireChkLoad") return;

        const img = document.createElement("img");
        img.style.width = "100%";
        img.style.marginTop = "6px";
        img.style.borderRadius = "6px";
        img.style.display = "none";

        node.addDOMWidget("cover", "div", img);

        const updateCover = () => {
            const w = node.widgets?.find(w => w.name === "ckpt_name");
            if (!w || !w.value) return;

            img.src =
                "/fire/ckpt_cover?name=" +
                encodeURIComponent(w.value) +
                "&t=" + Date.now();

            img.style.display = "block";
        };

        node.onWidgetChanged = updateCover;
        setTimeout(updateCover, 50);
    }
});
