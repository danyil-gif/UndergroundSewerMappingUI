# Figma Make — Map Section & Upload Flow
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

**This is a prototype with no real data.** Change shapes freely.

---

## What this replaces

Map upload currently sits loose at the top of the left panel with the calibration inline. **It
gets its own collapsible section**, and adding a map becomes a four-step popover that ends with
the technician choosing what the main map view shows.

---

# 1 · The left panel gains a MAP section

Add a key to `leftSectionOpen`: **`map`**. Build it matching the existing sections — same header
button, chevron rotation and spacing.

**Place it first**, above Add Infrastructure. Everything else depends on the map existing.

## When no map exists

```
MAP                                                            ▾

  No map yet.

  [ + Add new map ]
```

## When a map exists

```
MAP                                                            ▾

  Site plan
  Uploaded by Nicholas · Diagnostic · 15 Mar

  SCALE
  0.326 ft/px · 187 ft × 62 ft measured

  VIEW
  Full property                              [ Change view ]

  [ View source image ]
```

| Row | Content |
| --- | --- |
| Name and provenance | Who uploaded it, on which visit, when |
| Scale | The derived ft/px plus the two measurements it came from |
| View | The named area currently shown on the main map, with an edit action |
| Source image | Opens the original upload full screen, unmodified |

**Only the view is editable.** See section 3.

---

# 2 · Add new map — a four-step popover

One popover, four steps, a **Back** control on each, nothing saved until the last step confirms.

## Step 1 · Upload the image

| Field | Control | Required |
| --- | --- | --- |
| Map image | File picker, drag-drop, and paste from clipboard | Yes |

**Helper text:**

> Screenshot the property from your county GIS viewer or Google Maps. Frame the whole property
> with a little margin.

**Once uploaded**, show it at full popover width with **Retake** and **Next**.

## Step 2 · Set length and width with two dots each

Two sub-steps, in sequence, on the uploaded image.

### 2a · Length

> **Step 1 of 2 — length.** Tap the building's foundation wall at each end, the long way.

The technician places two dots. A line draws between them.

**Both dots are draggable** — a 9px visible dot with a 32px touch target — so the placement can
be nudged without starting over.

**Next** enables once both are placed.

### 2b · Width

> **Step 2 of 2 — width.** Same building, the short way across.

Same interaction. The length line stays visible, dimmed, for reference.

## Step 3 · Input measurements

Both lines shown on the image, each with a field beside it.

| Field | Control | Required |
| --- | --- | --- |
| Length | Number, ft | Yes |
| Width | Number, ft | Yes |

**Helper text:**

> In your map source, use the measure tool on the same two points and type the result here.

### Show the agreement

Each measurement gives a ft/px ratio. **Display how closely they agree:**

```
Length   187 ft   →  0.328 ft/px
Width     62 ft   →  0.324 ft/px

Agreement: 1.2%          scale 0.326 ft/px
```

| Agreement | Treatment |
| --- | --- |
| Under 3% | Positive colour |
| 3–8% | Warning colour |
| Over 8% | Warning colour plus: *"Check both measurements — one of them is likely off, or the map is tilted rather than straight down."* |

**Never block on disagreement.** Warn and let them proceed — but say what usually causes it.

**The scale used is the average of the two.**

## Step 4 · Select and confirm the main view

> **What should the main map show?** Drag a box around the area you'll be working in.

**The full uploaded image** with a draggable, resizable selection rectangle over it. Defaults to
the whole image.

| Field | Control | Required |
| --- | --- | --- |
| Selection | Drag to draw, then drag edges or corners to adjust | Yes |
| View name | Text, default `Full property` | Yes |

**Beneath the selection, show what it covers** using the scale from step 3:

```
Selected area: 412 ft × 288 ft
```

**A preview** of exactly what the main map will show, at the size it'll appear.

**Confirm** saves everything: the source image, both measurement lines, both typed distances,
the derived scale, and the selected view.

**Log entry:**

```
Site plan uploaded — 187 ft × 62 ft measured, scale 0.326 ft/px
```

---

# 3 · Coming back — only the view is editable

**Change view** reopens step 4 alone, with the existing selection in place.

| Editable | Not editable |
| --- | --- |
| The selected area | The image |
| The view name | The measurement dot positions |
| | The typed measurements |
| | The derived scale |

**The three locked items show as read-only rows** in the MAP section, not as disabled inputs —
a disabled field invites someone to try.

**Changing the view logs it:**

```
Map view changed — Bldg 3 and the north lot, 180 ft × 140 ft
```

## Why the measurements are locked

Every asset position, pipe length and drawn path is expressed against that scale. Changing it
would silently move everything already recorded.

**Show that as a note** at the bottom of the MAP section, in the dim style:

> *Measurements are locked once set. Assets and pipe paths are positioned against this scale.*

---

# 4 · Explicitly not in this pass

**Do not build any of these**, and don't leave disabled controls for them:

| Not now | |
| --- | --- |
| Re-uploading a new map | No replace action anywhere |
| Editing the measurements or the dots | Locked after confirm |
| Re-scaling or re-registering existing assets and pipes | No migration logic |
| Multiple maps per property | One map, one scale |

**A property has one map.** When one exists, the MAP section shows it and offers only
**Change view**.

---

# 5 · Saved views stay as they are

The existing saved-view tabs above the map are unchanged. **The view selected in step 4 is the
main view** — the `main` tab — and saved views remain a separate feature layered on top.

---

## Validation

- `MAP` is the first section in the left panel, collapsible like the others.
- With no map, it shows an empty state and **+ Add new map**.
- The popover runs four steps with Back on each, saving nothing until Confirm.
- Both measurement lines use two draggable dots with large touch targets.
- Step 3 shows each measurement's ratio, the agreement percentage, and the averaged scale.
- Agreement over 8% warns with the tilted-map explanation but never blocks.
- Step 4 shows a resizable selection with the covered area in feet and a live preview.
- Confirm stores the source image, both lines, both distances, the scale and the view.
- Reopening offers **Change view** only; image, dots and measurements are read-only rows.
- There is no re-upload action, no measurement editing, and no re-scaling logic anywhere.
- **View source image** opens the original upload unmodified.
