import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";

// Fire Filename
// Save nodes default to filename_prefix "ComfyUI", so files from different workflows end up as
// ComfyUI_00001_.png, ComfyUI_00002_.png ... everywhere. At queue time, a prefix that is exactly
// "ComfyUI" (optionally inside a folder, e.g. "krea/ComfyUI") is replaced by the current date and time.
// Only the queued prompt changes; the workflow keeps its own value.

const SETTING_ENABLED = "RectumFire.Filename.Enabled";
const SETTING_TEMPLATE = "RectumFire.Filename.Template";
const DEFAULT_TEMPLATE = "yyyy-MM-dd_HH-mm-ss";
const DEFAULT_PREFIX = /^(.*[\\/])?ComfyUI$/i;

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

function formatDate(template, d) {
  const map = {
    yyyy: d.getFullYear(),
    yy: pad(d.getFullYear() % 100),
    MM: pad(d.getMonth() + 1),
    dd: pad(d.getDate()),
    HH: pad(d.getHours()),
    mm: pad(d.getMinutes()),
    ss: pad(d.getSeconds()),
  };
  return template.replace(/yyyy|yy|MM|dd|HH|mm|ss/g, (t) => map[t]);
}

function getSetting(id, fallback) {
  try {
    const v = app.extensionManager?.setting?.get?.(id);
    return v === undefined || v === null ? fallback : v;
  } catch (_) {
    return fallback;
  }
}

function rewritePrompt(output) {
  if (!output || typeof output !== "object") return;
  if (!getSetting(SETTING_ENABLED, true)) return;
  const template = String(getSetting(SETTING_TEMPLATE, DEFAULT_TEMPLATE) || DEFAULT_TEMPLATE);
  const stamp = formatDate(template, new Date());
  for (const node of Object.values(output)) {
    const inputs = node?.inputs;
    const prefix = inputs?.filename_prefix;
    if (typeof prefix !== "string") continue;
    const m = prefix.match(DEFAULT_PREFIX);
    if (m) inputs.filename_prefix = (m[1] || "") + stamp;
  }
}

app.registerExtension({
  name: "RectumFireFilename",

  settings: [
    {
      id: SETTING_ENABLED,
      category: ["RectumFire", "Filename", "Enabled"],
      name: "Replace the default \"ComfyUI\" filename prefix with the date",
      type: "boolean",
      defaultValue: true,
    },
    {
      id: SETTING_TEMPLATE,
      category: ["RectumFire", "Filename", "Template"],
      name: "Date template (yyyy yy MM dd HH mm ss)",
      type: "text",
      defaultValue: DEFAULT_TEMPLATE,
    },
  ],

  setup() {
    if (api.__rf_filename_patched__) return;
    api.__rf_filename_patched__ = true;
    const prev = api.queuePrompt;
    api.queuePrompt = function (number, data, ...rest) {
      try { rewritePrompt(data?.output); } catch (e) { console.warn("[RectumFire] filename rewrite failed", e); }
      return prev.call(this, number, data, ...rest);
    };
  },
});
