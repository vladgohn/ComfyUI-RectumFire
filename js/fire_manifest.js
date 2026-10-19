// FireManifest - lists the workflow's models in a MarkdownNote (links + storage tree).
// Hotkey: Shift+Alt+N (Shift+Alt+M is the core minimap toggle), Extensions menu, canvas context menu.

import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";
import { firetosterShow } from "./fire_toster.js";

const RF = Object.freeze({
  EXT_NAME: "RectumFireManifest",
  COMMAND_ID: "RectumFire.Manifest",
  LABEL: "Fire Manifest: list workflow models",
  ROUTE: "/rectumfire/manifest",
  MARK: "rf_model_manifest",
  NOTE_TYPE: "MarkdownNote",
  NOTE_TITLE: "Model Manifest",
});

function showtoster(theme, lines, ms = 4000) {
  try {
    const sub = Array.isArray(lines) ? lines.map(x => String(x ?? "")).join("\n") : String(lines ?? "");
    firetosterShow({ theme, title: "Fire Manifest", sub, lifeMs: ms });
  } catch (_) { }
}

function graphNodes(graph) {
  return graph?._nodes || graph?.nodes || [];
}

// Active nodes, including subgraph contents. Muted (2) and bypassed (4) nodes are skipped.
function collectNodes(graph, out = [], seen = new Set()) {
  if (!graph || seen.has(graph)) return out;
  seen.add(graph);
  for (const node of graphNodes(graph)) {
    if (node.mode === 2 || node.mode === 4) continue;
    out.push(node);
    if (node.subgraph) collectNodes(node.subgraph, out, seen);
  }
  return out;
}

// Preferred model folder by widget name. Only a preference: the server falls back to all folders.
// Needed when the same file sits in two folders (e.g. a text encoder copied into vae).
const WIDGET_FOLDERS = [
  [/^ckpt_name$/, "checkpoints"],
  [/^unet_name$/, "diffusion_models"],
  [/^vae_name$/, "vae"],
  [/^lora_name$/, "loras"],
  [/^clip_name\d*$/, "text_encoders"],
  [/^control_net_name$/, "controlnet"],
];

function folderHint(node, w) {
  if (/clip_?vision/i.test(String(node.type || ""))) return "clip_vision";
  const name = String(w.name || "");
  for (const [re, folder] of WIDGET_FOLDERS) if (re.test(name)) return folder;
  return undefined;
}

function collectCandidates() {
  const cands = [];
  for (const node of collectNodes(app.graph)) {
    for (const w of node.widgets || []) {
      const v = w.value;
      if (typeof v === "string") {
        cands.push({ value: v, folder: folderHint(node, w) });
      } else if (Array.isArray(v)) {
        // Lora Manager loaders/stackers: [{ name, strength, active }, ...], name without extension.
        for (const e of v) {
          if (e && typeof e.name === "string" && e.active) cands.push({ value: e.name, folder: "loras", loose: true });
        }
      } else if (v && typeof v === "object" && typeof v.lora === "string" && v.on !== false) {
        // rgthree Power Lora Loader: { on, lora, strength }
        cands.push({ value: v.lora, folder: "loras" });
      }
    }
  }
  return cands;
}

function placeNote(note) {
  const nodes = graphNodes(app.graph).filter((n) => n !== note);
  if (!nodes.length) return;
  const minX = Math.min(...nodes.map((n) => n.pos[0]));
  const minY = Math.min(...nodes.map((n) => n.pos[1]));
  note.pos = [minX - note.size[0] - 60, minY];
}

async function buildManifest() {
  let data;
  try {
    const res = await api.fetchApi(RF.ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ candidates: collectCandidates() }),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    data = await res.json();
  } catch (e) {
    showtoster("magenta", ["Request failed.", String(e)]);
    return;
  }

  if (!data.count) {
    showtoster("magenta", ["No models from disk found in this workflow."]);
    return;
  }

  let note = graphNodes(app.graph).find((n) => n.properties?.[RF.MARK]);
  if (!note) {
    note = LiteGraph.createNode(RF.NOTE_TYPE);
    if (!note) {
      showtoster("magenta", [`Node type ${RF.NOTE_TYPE} is not available.`]);
      return;
    }
    note.title = RF.NOTE_TITLE;
    note.properties[RF.MARK] = true;
    note.size = [520, 640];
    app.graph.add(note);
    placeNote(note);
  }

  const w = note.widgets?.[0];
  if (w) {
    w.value = data.markdown;
    w.callback?.(data.markdown);
  }
  note.widgets_values = [data.markdown];
  app.graph.setDirtyCanvas(true, true);

  showtoster("green", [`Models: ${data.count}, with links: ${data.linked}`]);
}

app.registerExtension({
  name: RF.EXT_NAME,
  commands: [
    {
      id: RF.COMMAND_ID,
      label: RF.LABEL,
      icon: "pi pi-list",
      function: () => {
        void buildManifest();
      },
    },
  ],
  keybindings: [
    {
      commandId: RF.COMMAND_ID,
      combo: { key: "n", shift: true, alt: true },
      targetElementId: "graph-canvas",
    },
  ],
  menuCommands: [{ path: ["Extensions"], commands: [RF.COMMAND_ID] }],
  getCanvasMenuItems() {
    return [null, { content: RF.LABEL, callback: () => void buildManifest() }];
  },
});
