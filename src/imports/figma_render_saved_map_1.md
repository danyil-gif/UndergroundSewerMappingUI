# Figma Make — Render the Saved Map
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. This is one
bug fix. If anything here conflicts with an existing pattern, follow the existing pattern.

---

## The bug

**There are two unconnected map states.**

| State | Written by | Read by |
| --- | --- | --- |
| `siteMap` | The map setup modal, on Finalize | **Only the left panel summary card** |
| `mapImage` + `mapImageProps` | **Nothing, any more** | **The map area** |

The setup saves correctly. The map area renders `mapImage`, which is still `null`, so the
property shows an empty grid.

**Fix it by deleting `mapImage` and rendering from `siteMap`.** Do not sync the two — two
sources of truth for the same image will keep drifting apart.

---

# 1 · Delete the old state

Remove these and every reference to them:

```ts
const [mapImage, setMapImage] = useState<string | null>(null)
const [mapImageProps, setMapImageProps] = useState({ x, y, w, h, rotation, opacity })
```

**Including these controls in the map toolbar**, which are now redundant:

| Remove | Because |
| --- | --- |
| The **opacity** slider | It was a workaround for not knowing whether the image was aligned. The measured scale replaces it. |
| The **rotation** slider | Rotation is set during map setup. |
| Position and size controls for the map image | Those are the view rectangle, set during setup. |
| The `mapImage ? "Site Plan" : "Main Map"` label logic | Use `siteMap` instead. |

---

# 2 · Render the map from `siteMap`

`siteMap.viewRect` is stored as **fractions of the source image** — `{ x, y, w, h }`, each
0 to 1. To show only that region filling the map frame, scale the image up by `1/w` and offset
it by `-x/w`.

**Place this in the map area, beneath assets, pipes, routes and every overlay:**

```tsx
{siteMap && (
  <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
    <img
      src={siteMap.sourceUrl}
      alt=""
      draggable={false}
      style={{
        position: "absolute",
        width: `${100 / siteMap.viewRect.w}%`,
        height: `${100 / siteMap.viewRect.h}%`,
        left: `${-(siteMap.viewRect.x / siteMap.viewRect.w) * 100}%`,
        top: `${-(siteMap.viewRect.y / siteMap.viewRect.h) * 100}%`,
        transform: `rotate(${siteMap.rotation ?? 0}deg)`,
        transformOrigin: "center",
        userSelect: "none",
        pointerEvents: "none",
      }}
    />
  </div>
)}
```

**The existing map pan and zoom transform applies to this container**, exactly as it does now,
so navigation keeps working unchanged.

**`pointerEvents: "none"` matters** — without it the image swallows clicks meant for assets,
pipes and the map surface.

---

# 3 · The empty state

When `siteMap` is null, keep the current grid background and add a centred prompt:

> *No map yet.*
> **[ Add a map ]**

Opening the same map setup modal the left panel's action opens.

---

# 4 · One scale for everything

`siteMap.scale` becomes the single ft/px value used by:

| Consumer | For |
| --- | --- |
| Pipe drawing | Segment lengths |
| The assisted drawing distance ring | Its radius |
| Any distance measured on the map | Converting pixels to feet |
| The map toolbar | Displaying the scale |

**Show it in the toolbar**, small and dim:

```
0.326 ft/px
```

---

## Validation

- `mapImage` and `mapImageProps` no longer appear anywhere in the file.
- The opacity, rotation, position and size sliders are gone from the map toolbar.
- Finalizing the map setup immediately shows the image in the map area, cropped to the selected view.
- Assets, pipes, routes and overlays all render above the map image.
- Clicking the map still selects assets and places points — the image doesn't intercept clicks.
- Panning and zooming move the map image with everything else.
- With no map, the map area shows the grid and an **Add a map** action.
- `siteMap.scale` is shown in the toolbar and used for every distance calculation.
