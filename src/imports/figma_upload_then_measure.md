# Figma Make — Upload First, Then Measure
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

Two changes. The second is why the map appears not to save.

---

# 1 · Upload happens in the left panel, not in the modal

**Move the upload out of the map setup modal.** The modal is for measuring and choosing the
view — it should never be entered without an image already loaded.

## In the left panel MAP section, when no map exists

```
MAP                                                            ▾

  No map yet.

  [ + Upload map image ]
```

**One hidden file input, mounted in the left panel**, held by a ref:

```tsx
const mapFileRef = useRef<HTMLInputElement>(null)

<input
  ref={mapFileRef}
  type="file"
  accept="image/*"
  style={{ display: "none" }}
  onChange={e => {
    const f = e.target.files?.[0]
    if (!f) return
    const fr = new FileReader()
    fr.onload = () => {
      setMapSetup({
        img: fr.result as string,
        rot: 0, zoom: 1,
        len: { a: null, b: null, ft: "", inches: "", confirmed: false },
        wid: { a: null, b: null, ft: "", inches: "", confirmed: false },
        msMode: null, msDrag: null, cursor: null,
        view: null, viewName: "Full property",
        done: false, changeViewOnly: false,
      })
    }
    fr.readAsDataURL(f)
    e.target.value = ""
  }}
/>
```

**The button calls `mapFileRef.current?.click()`.**

**Reading the file opens the setup modal with the image already in it.** One action from the
technician's point of view: pick a file, the measuring window appears.

## Remove from the modal

| Remove | |
| --- | --- |
| The empty-state drop zone | The modal never opens without an image |
| The `msFileRef` input and its handler | Upload lives in the left panel now |
| The **Replace** button | Not in this pass — see section 3 |

**Keep drag-and-drop and paste** on the left panel button area, both routing to the same
`setMapSetup` call.

---

# 2 · Finalize must close the modal

## What's wrong

`FINALIZE MAP VIEW` writes `siteMap` correctly, then sets `done: true` on the setup state — which
**leaves the modal open**. The map is saved and rendering behind it, but the technician can't see
that and assumes it failed.

## The fix

```tsx
setSiteMap({ /* ...as now... */ })
setMapSetup(null)          // ← close the modal
```

**`setMapSetup(null)` instead of `{ ...s, done: true }`.**

**Remove the whole `done` state and every branch that depends on it** — the finalized summary
panel, the *Change view* button inside the modal, and the disabled conditions that reference
`ms.done`. Once finalized, the modal is gone; the left panel shows the saved map.

**Same for SAVE VIEW** in change-view mode: write the new `viewRect` and `viewName` to `siteMap`,
then `setMapSetup(null)`.

## After closing

The left panel MAP section shows the saved map, and the map area renders it — that code is
already correct and needs no change.

---

# 3 · Not in this pass

**No Replace action anywhere.** A property has one map. Re-uploading would require re-scaling
every asset position and pipe path, which isn't built.

**Change view is the only thing reachable after finalizing**, from the left panel — it reopens
the modal with `changeViewOnly: true`, as it does now.

---

## Validation

- The left panel shows **+ Upload map image** when no map exists.
- Choosing a file opens the setup modal with the image already loaded.
- The modal has no drop zone, no file input and no Replace button.
- Drag-and-drop and paste onto the left panel button also open the modal with the image.
- **FINALIZE MAP VIEW** saves and closes the modal in one action.
- After finalizing, the map appears immediately in the map area and in the left panel summary.
- **SAVE VIEW** in change-view mode also closes the modal.
- No `done` state remains in the map setup.
