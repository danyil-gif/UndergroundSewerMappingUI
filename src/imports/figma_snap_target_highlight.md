# Figma Make — Highlight Snap Targets While Drawing
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. This is a
small behaviour change to one component and its call site. If anything here conflicts with an
existing pattern, follow the existing pattern.

---

## The problem

While drawing a pipe, only the **start** asset is highlighted. `AssetNode` takes a single
boolean `drawActive`, computed as `drawFrom === asset.id`, and turns the marker amber.

Every other asset looks inert, so a technician has no signal that clicking one will snap the
pipe to it — or that they've already snapped to it.

---

## The fix — three states instead of one

Replace the boolean with a state prop:

```ts
drawState?: "start" | "snapped" | "target" | null
```

| State | When | Rendering |
| --- | --- | --- |
| `start` | This is the start asset | Amber `#F59E0B` — exactly as it renders today |
| `snapped` | Already in the route as a snapped point | Amber at 65% opacity, plus a small amber dot at the top-right of the marker |
| `target` | Draw mode active, a start exists, and the cursor is over this asset | A 2px amber ring around the marker, marker itself unchanged, crosshair cursor |
| `null` | Everything else | Current default |

**`target` only appears once a start point exists.** Before the first click every asset is a
potential start, and ringing all of them on hover would be noise.

---

# 1 · `AssetNode` — the signature

```tsx
function AssetNode({ asset, selected, drawState, scale, onClick, onMouseDown, onTouchStart, onMouseEnter, onMouseLeave, dimmed }: {
  asset: Asset; selected: boolean
  drawState?: "start" | "snapped" | "target" | null
  scale: number; dimmed?: boolean
  onClick: (e: React.MouseEvent) => void; onMouseDown: (e: React.MouseEvent) => void
  onTouchStart?: (e: React.TouchEvent) => void
  onMouseEnter?: () => void; onMouseLeave?: () => void
}) {
  const AMBER = "#F59E0B"
  const c = drawState === "start" || drawState === "snapped" ? AMBER : "#1a1a1a"
```

# 2 · `AssetNode` — the wrapper div

Add the hover handlers, the conditional cursor, the snapped opacity, and the two indicator
elements:

```tsx
      cursor: drawState === "target" ? "crosshair" : "pointer", zIndex: 10,
      filter: selected ? `drop-shadow(0 0 6px ${c}88)` : dimmed ? "grayscale(0.6)" : undefined,
      opacity: dimmed ? 0.25 : drawState === "snapped" ? 0.65 : 1,
      transition: "filter 0.2s, transform 0.15s, opacity 0.2s",
    }}
    onClick={e => { e.stopPropagation(); onClick(e) }}
    onMouseDown={onMouseDown}
    onMouseEnter={onMouseEnter}
    onMouseLeave={onMouseLeave}
    onTouchStart={e => { e.stopPropagation(); onTouchStart?.(e) }}
  >
    {drawState === "target" && (
      <div style={{
        position: "absolute", top: "50%", left: "50%",
        transform: "translate(-50%, -50%)",
        width: 40, height: 40, borderRadius: "50%",
        border: `2px solid ${AMBER}`, pointerEvents: "none",
      }} />
    )}
    {drawState === "snapped" && (
      <div style={{
        position: "absolute", top: -2, right: -2,
        width: 7, height: 7, borderRadius: "50%",
        background: AMBER, pointerEvents: "none",
      }} />
    )}
    <AssetIcon type={asset.type} sel={selected} c={c} size={28} />
```

**The ring is 40px against a 28px icon**, leaving about 6px of clearance. If icon scale runs
large on some asset types, scale the ring with it.

# 3 · New state

Beside the other draw state:

```tsx
const [hoverAssetId, setHoverAssetId] = useState<string | null>(null)
```

# 4 · The call site

Replace `drawActive={drawFrom === asset.id}` with:

```tsx
drawState={
  drawFrom === asset.id ? "start"
  : drawPoints.some(p => p.assetId === asset.id) ? "snapped"
  : (mode === "draw-pipe" && (drawFrom || drawFromCoord) && hoverAssetId === asset.id) ? "target"
  : null
}
onMouseEnter={() => setHoverAssetId(asset.id)}
onMouseLeave={() => setHoverAssetId(prev => prev === asset.id ? null : prev)}
```

**`onMouseLeave` uses the functional form deliberately** — a fast drag between two adjacent
markers can fire leave after the next enter, and this stops it clearing the wrong one.

# 5 · The status line

Replace the two `DRAW —` strings that render while a start point exists with a single
expression that names the hovered snap target:

```tsx
{mode === "draw-pipe" && (drawFrom || drawFromCoord) && (() => {
  const snapTo = hoverAssetId && hoverAssetId !== drawFrom
    ? assets.find(a => a.id === hoverAssetId)?.label
    : null
  const pts = drawPoints.length
  const base = pts > 0
    ? `DRAW — ${pts} pt${pts > 1 ? "s" : ""}`
    : "DRAW — click map to add points"
  const tail = snapTo
    ? ` · snap to ${snapTo}`
    : pts > 0
      ? "  ·  hover point to remove  ·  double-click to finish"
      : "  ·  click asset to snap  ·  double-click or Complete to finish"
  return base + tail
})()}
```

Reads as:

```
DRAW — 2 pts · snap to CB-003
```

**Leave the no-start-point string as it is** — *"DRAW — click an asset or existing pipe to
start the route"*.

# 6 · Clear the hover when drawing ends

Add `setHoverAssetId(null)` wherever draw state is reset — the **ESC / CANCEL** button and
`completePipe`.

---

## Validation

- The start asset renders exactly as it does now.
- Hovering any other asset while drawing shows an amber ring and a crosshair cursor.
- An asset already snapped into the route renders at reduced opacity with a dot, distinct from both other states.
- No ring appears on hover before a start point is set.
- The status line reads `DRAW — 2 pts · snap to CB-003` while hovering a target.
- The hover clears when drawing is cancelled or completed.
