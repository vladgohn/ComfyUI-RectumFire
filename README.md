@'
# ComfyUI RectumFire 🔥

RectumFire is a UX-first pack for ComfyUI: sticky notes, execution timer, completion sound, copy/paste helpers, and a resolve hotkey tool.

## Nodes (Python)
- **Fire Note** — UI-only multiline note node.
- **Fire Timer** — UI host node that shows execution time.
- **Fire Done** — ANY→ANY pass-through node that triggers a “done” UI signal (sound/marking).
- **Fire Route** — routing/utility node used together with the JS extension.

## Extensions (JS)
- **fire_timer.js** — draws an execution timer on the node canvas; reacts to ComfyUI execution events.
- **fire_note.js** — sticky note visuals and editing helpers.
- **fire_done.js** — plays `js/assets/done.*` on completion and marks the node.
- **fire_resolve.js** — hotkey tool to fix broken combo/dropdown values (resolve by filename/basename) with toasts + node marking.
- **fire_copy.js** — hotkeys to copy/paste useful values (models/loras/etc.) into Fire Note.
- **fire_toster.js** — toast notification system.
- **js/assets/** — audio + fonts + misc assets.

## Install
Clone into:
`ComfyUI/custom_nodes/comfyui_rectumfire`

Restart ComfyUI.

## Branches
`main` is the primary branch. `master` is kept in sync for compatibility.
'@ | Set-Content -Encoding UTF8 README.md
