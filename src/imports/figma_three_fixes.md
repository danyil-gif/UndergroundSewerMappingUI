# Figma Make — Three Fixes
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

Two bug fixes and one small addition. The first is the only one with any subtlety.

---

# 1 · A pipe still can't end on an asset

**The previous fix to the lock check was correct and should stay.** The remaining cause is
different: **the asset marker doesn't stop the click from bubbling.**

## What actually happens

Clicking a second asset while drawing fires two handlers in sequence:

| Order | Handler | Effect |
| --- | --- | --- |
| 1 | `handleAssetClick` | Correctly appends a snapped point `{ x, y, assetId }` |
| 2 | `handleMapClick` | Sees `mode === "draw-pipe"` and appends a **second** point at the raw cursor coordinates, with **no `assetId`** |

`completePipe` then reads the **last** point:

```ts
const toAssetId = last.assetId ?? null
```

That last point is the unsnapped one, so `toAssetId` is null and the pipe terminates at a bare
coordinate beside the asset instead of connecting to it.

## The fix

**Stop propagation on the asset marker.** In `AssetNode`, change the click handler so it halts
the event before it reaches the map:

```tsx
onClick={(e) => { e.stopPropagation(); onClick() }}
```

Update the prop type accordingly:

```ts
onClick: (e: React.MouseEvent) => void
```

— or wrap it at the call site in the assets render. Either approach is fine as long as the
event stops at the marker.

**Apply the same to `onTouchStart`** so it behaves on tablets, where this flow will mostly be
used.

## Verify

In draw-pipe mode: click one asset to start, click a second asset, press **Complete Pipe**.

| Check | Expected |
| --- | --- |
| The pipe's `toId` | The second asset's id, not null |
| Where it renders | Terminating **at** the second asset's pin, not beside it |
| The log entry | `PIPE-xxx created — CB-001 → CB-002`, both tags present |
| Selecting the second asset | The new pipe appears in its connected pipes |

---

# 2 · The elapsed time looks frozen

**The timer is working correctly.** `fmtElapsed` returns `HH:MM`, so a visit reads `00:01` for
a full minute and appears stuck. The format is wrong for a session that's usually under two
hours.

**Replace `fmtElapsed`:**

```ts
function fmtElapsed(s: number): string {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
    : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
}
```

| Duration | Displays |
| --- | --- |
| Under an hour | `04:37` |
| Over an hour | `1:14:02` |

**Durations in the visit history lists stay as they are** — `1h 14m` is right for a completed
visit. Only the live ticking clock in the session strip changes.

---

# 3 · Photos open full screen

Add a full-screen viewer for asset photos.

## Opening

**Double-click or double-tap a photo thumbnail** on an asset. Single click keeps its current
behaviour.

## The viewer

A full-window overlay above everything:

| Element | Detail |
| --- | --- |
| Backdrop | Dark scrim, roughly `rgba(15, 23, 42, 0.88)` |
| The image | Centred, scaled to fit within the viewport with a margin, never upscaled past its natural size |
| Caption | Below the image — the slot name and the filename, in the existing dim style |
| Close | An ✕ at the top right |
| Counter | `2 of 3`, top left, in `JetBrains Mono` |

## Moving between photos

**Left and right arrows** on either side of the image, cycling through **that asset's photos in
slot order** — wide area, close up, inside with the lid open.

Arrows hide when the asset has only one photo.

## Dismissing

| Action | Result |
| --- | --- |
| ✕ | Closes |
| Click the backdrop | Closes |
| **Escape** | Closes |
| Left / Right arrow keys | Move between photos |

## Where it applies

Every photo thumbnail in the project, using the same viewer:

- Asset photo slots
- Site logistics entries
- Any media on a pipe or inspection

---

## Validation

- The asset marker stops click propagation; clicking an asset while drawing adds exactly one point.
- A completed pipe between two assets has a non-null `toId` and renders terminating at the second pin.
- The session strip's elapsed time updates every second and shows seconds.
- Completed-visit durations in history lists still read `1h 14m`.
- Double-clicking any photo thumbnail opens the full-screen viewer.
- Escape, the backdrop and the ✕ all close it; arrow keys move between photos.
