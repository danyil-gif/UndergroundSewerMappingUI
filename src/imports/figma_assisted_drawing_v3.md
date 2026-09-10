# Figma Make — Assisted Pipe Drawing
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

**This is a prototype with no real data.** Change shapes freely.

---

## The idea

A technician drawing a pipe after the inspection already knows the total footage, where every
bend was, and the distance to each one. **Plain draw mode ignores all of it and asks them to
guess.**

**Assisted drawing uses the observation list as the guide.** They tick the run of observations
belonging in the next segment, and place one point. The app knows exactly how long that segment
is and constrains placement to it.

---

# 1 · New data on the pipe route

```ts
interface RouteVertex {
  x: number                  // % of the map
  y: number
  atFootage: number          // distance along the pipe at this vertex
  observationIds: string[]   // the observations in the segment ending here
  assetId?: string           // when snapped to an asset
}
```

**The first vertex is always the pipe's `fromId` asset at `atFootage: 0`.** It can never be
removed.

---

# 2 · When it opens

Completing step 6 — Characteristics — on an undrawn pipe prompts:

```
┌ DRAW THE PATH? ──────────────────────────────────────────────┐
│  The inspection is done, so you now know where this pipe runs.│
│                                                               │
│    75 ft inspected                                            │
│    Ends at a camera stoppage — blocked, roots                 │
│    Left turn 90° at 32 ft · Right turn 90° at 62 ft           │
│                                                               │
│        [ Draw it now ]        [ Later ]                       │
└───────────────────────────────────────────────────────────────┘
```

Also reachable from **Draw the path** on the pipe panel. **Later** is allowed; an undrawn pipe
stays a pricing blocker at close visit.

---

# 3 · The screen

Map on the left, observation panel on the right at ~340px.

---

# 4 · The observation panel

Every observation in footage order, including the three boundary types.

| State | Rendering |
| --- | --- |
| **Placed** | Checked, dimmed, with a `── placed ──` divider after each segment's last one |
| **Selectable** | The next consecutive unplaced run, with checkboxes |
| **Not yet reachable** | Visible at reduced opacity, not clickable |

**Selection is always the next consecutive run.** Ticking one selects everything above it. Ticking
the last-selected item unticks back to just before it.

**Selecting a single direction change on its own** is how a vertex lands exactly at a turn. That's
the common case.

**The footage of the last ticked observation is the segment's length target.**

---

# 5 · Placement is constrained to the ring

**This is the core correction.** A ring that can be ignored is decoration.

## No selection means no placement

**Clicking the map with nothing selected does nothing.** No vertex, no feedback beyond a hint:

> *Select the observations for the next segment first.*

**There is no free-placement mode by default.** Every vertex belongs to a run of observations.

## With a selection, placement snaps to the ring

**A dashed ring appears** centred on the last vertex, at radius `targetFt / siteMap.scale`,
labelled `~30 ft`.

**Clicking anywhere places the vertex on the ring** — at the point on the ring nearest the click.
The distance is always exactly right; the click chooses only the **direction**.

**A live marker** follows the cursor around the ring so it's obvious the click sets bearing, not
distance. The line from the last vertex to that marker is always the target length.

**When the selection contains a direction change**, show it in the status line:

> *Left turn 90° — bend left from the current heading*

## Going off-ring is deliberate

**Hold Shift while clicking** to place at the exact cursor position instead of on the ring.

**A segment placed off-ring is flagged** — its line renders dashed, and the panel shows:

```
Segment 3 · 30 ft expected · 41 ft drawn · +37%
```

The pipe panel keeps that discrepancy visible after finishing.

**Why the escape hatch exists:** a pipe that drops eight feet vertically gains footage without
gaining map distance. That's real, and it should be recordable — but as a deliberate exception,
not the default.

## Adding a shaping point

For a curve with no observations in it, use **+ Shaping point** in the panel, then click the map.

| | |
| --- | --- |
| Consumes no observations | `observationIds: []` |
| Takes an interpolated footage | Between its neighbours |
| Renders smaller than an observation vertex | Visually distinct |
| Not counted as a segment | Doesn't advance the observation list |

**Never available by plain clicking.** It's an explicit action.

---

# 6 · Placing a point

Creates a vertex with:

| Field | Value |
| --- | --- |
| `x` / `y` | The point on the ring nearest the click — or the exact cursor position with Shift |
| `atFootage` | The footage of the last selected observation |
| `observationIds` | Everything in the selection |
| `assetId` | When snapped to an asset |

**Asset snapping overrides the ring.** Hovering an asset rings it; clicking snaps the vertex to
the asset even if that's off the distance ring, and flags the segment as off-target.

**After placing:** the selection clears, the ring disappears, those observations mark as placed,
and the next run becomes selectable.

---

# 7 · Undo unwinds completely

**Undo must never leave a partial state.** Every undo action does all of the following in one go:

| Clears | |
| --- | --- |
| The vertex | Removed |
| Its observations | Returned to unplaced and **unticked** |
| The current selection | Emptied |
| The distance ring | Removed |
| The live marker and readout | Removed |

**After any undo, the state is clean:** a last vertex, nothing selected, no ring. The next
selection starts fresh.

## Two ways to undo

**Undo point** — steps back one segment.

**Click any placed vertex** — unwinds to that vertex. **Everything after it is removed**, all
those observations return to unplaced, and the selection and ring clear.

**Unplacing a segment that has segments after it resets everything from that point forward.** No
partial state, no downstream segments left with stale targets.

Confirm before unwinding more than one segment:

> *This removes 4 segments and returns 11 observations to unplaced.*
> **[ Unwind ]** · **[ Cancel ]**

**The start vertex can never be removed by either route.**

---

# 8 · Finishing

**Finish enables once the final boundary observation — End of pipe or Camera Stoppage — is
placed.** That vertex is the pipe's end.

Before then, Finish shows what remains:

> *3 observations left to place, up to 75 ft.*

**When the end was a Camera Stoppage**, draw the estimated tail automatically: dashed, in the
warning colour, continuing on the last heading, at the estimated remaining length from step 3,
labelled `~20 ft est.`

**On finishing:**

| Result | |
| --- | --- |
| `geometryStatus` | `"drawn"` |
| `toId` | Set when the last vertex snapped to an asset |
| Log entry | `PIPE-005 path drawn — 6 points, 75 ft mapped` |

**Then on the pipe panel:**

```
Inspected 75 ft  ·  drawn path measures 75 ft  ·  exact
```

With ring snapping, these match unless a segment was placed off-ring — in which case name it:

> *Inspected 75 ft · drawn 86 ft · 1 segment placed off-target*

---

# 9 · What the vertex footages unlock

With `atFootage` on every vertex, any footage along the pipe converts to a map position by
interpolating between the two vertices it falls between:

```ts
function posAtFootage(ft: number, verts: RouteVertex[]) {
  for (let i = 1; i < verts.length; i++) {
    const a = verts[i - 1], b = verts[i]
    if (ft >= a.atFootage && ft <= b.atFootage) {
      const t = b.atFootage === a.atFootage ? 0 : (ft - a.atFootage) / (b.atFootage - a.atFootage)
      return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t }
    }
  }
  return null
}
```

**Build one use of it now: render CIPP concerns on the map** at their interpolated positions once
a pipe is drawn — a small marker with the type and footage.

Those are the points that get excavated. Seeing them on the property map rather than only on a
profile is the most useful thing this produces, and it answers *"where is 68 ft?"* before anyone
walks out with a sonde.

---

# 10 · When assisted drawing is used

| Pipe state | Mode |
| --- | --- |
| Undrawn, with a completed inspection | **Assisted** |
| Undrawn, no inspection yet | **Plain** free draw, no panel |
| Already drawn, being edited | **Plain**, with existing vertices editable |

---

## Validation

- Clicking the map with no selection places nothing and shows a hint.
- With a selection, the click sets direction only — the vertex lands on the ring at the exact target distance.
- A live marker follows the cursor around the ring.
- Shift-click places off-ring, and that segment renders dashed with its discrepancy shown.
- Asset snapping overrides the ring and flags the segment.
- **+ Shaping point** is the only way to place a vertex with no observations.
- Undo clears the vertex, its observations, the selection, the ring and the readout together.
- Clicking a placed vertex unwinds everything after it, with a confirmation past one segment.
- The start vertex cannot be removed.
- Finish is disabled until the final boundary observation is placed.
- A Camera Stoppage ending draws the estimated tail automatically.
- CIPP concerns render on the map at interpolated positions once the pipe is drawn.
