import { app } from "/scripts/app.js";

// Fire Links
// Inside a subgraph, links from the subgraph input node use the target input's `dir` as their start
// direction. When that input has dir = LEFT, the link leaves the input node to the left and bends back.
// A link never needs to start to the left while also ending to the left, so start it to the right.

app.registerExtension({
  name: "RectumFireLinks",

  setup() {
    const LG = window.LiteGraph;
    const proto = LG?.LGraphCanvas?.prototype;
    if (!proto || typeof proto._renderAllLinkSegments !== "function" || proto.__rf_links_patched__) return;
    proto.__rf_links_patched__ = true;

    const LEFT = LG.LEFT;
    const RIGHT = LG.RIGHT;
    const prev = proto._renderAllLinkSegments;
    proto._renderAllLinkSegments = function (ctx, link, startPos, endPos, reroutes, now, startDir, endDir) {
      if (startDir === LEFT && endDir === LEFT) {
        const args = [...arguments];
        args[6] = RIGHT;
        return prev.apply(this, args);
      }
      return prev.apply(this, arguments);
    };
  },
});
