# ComfyUI RectumFire 🔥

RectumFire is a small UX-first pack for ComfyUI: sticky notes, an execution timer, completion sound, copy/paste helpers, and a “resolve” hotkey tool.

## What’s inside

### Nodes (Python)
- **Fire Note** — multiline note node (UI-only).
- **Fire Timer** — UI host node for an execution timer.
- **Fire Done** — ANY→ANY pass-through node that triggers a “done” UI signal (sound/marking).
- **Fire Route** — routing/utility node used together with the JS extension.

### Extensions (JS)
- **Fire Timer UI** (`js/fire_timer.js`) — draws an execution timer on the node canvas and reacts to ComfyUI execution events.
- **Fire Note UI** (`js/fire_note.js`) — sticky-note visuals and editing helpers.
- **Fire Done UI** (`js/fire_done.js`) — plays `js/assets/done.*` on completion and marks the node.
- **Fire Resolve** (`js/fire_resolve.js`) — hotkey tool to fix broken combo/dropdown values (resolve by filename/basename, with toasts + node marking).
- **Fire Copy** (`js/fire_copy.js`) — hotkeys to copy/paste useful values (models/loras/etc.) into Fire Note.
- **Fire Toster** (`js/fire_toster.js`) — toast notification system.

## Install
Clone into:
`ComfyUI/custom_nodes/comfyui_rectumfire`

Restart ComfyUI.

## Repo
Main branch: `main` (master is kept in sync).


## Dev
Repo: https://github.com/vladgohn/ComfyUI-RectumFire
"@ | Set-Content -Encoding UTF8 README.md
