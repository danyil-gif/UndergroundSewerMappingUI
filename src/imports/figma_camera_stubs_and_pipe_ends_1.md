# Figma Make — Camera Inspection: Stubs, Start & End of Pipe
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

**This is a prototype with no real data.** Change shapes freely.

Four changes.

---

# 1 · Pipes are created as stubs and drawn later

**You can't draw a pipe you haven't inspected.** Before the camera goes in, nobody knows the
direction, the length, or where it bends. Requiring a full path at creation means every pipe is
drawn as a guess and never corrected.

## New field on `Pipe`

```ts
geometryStatus: "stub" | "drawn"
```

## Creating a pipe

**Only a start point is required.** Click an asset, and a short stub is placed in the rough
direction the technician indicates — enough to show the pipe exists on the map.

`geometryStatus: "stub"`.

**A stub renders distinctly on the map** — dashed line, and it ends in an open circle rather
than a terminator, so it reads as unfinished rather than as a short pipe.

## Finishing the drawing

**On the pipe panel, above Pipe Overview**, when the status is `stub`:

> ⚠ **Path not drawn.** Finish the drawing once you know where it runs.
> **[ Finish drawing ]**

**Finish drawing** re-enters draw mode with:

| Locked | Editable |
| --- | --- |
| The start point and its asset | Every point after it |

The existing stub becomes the first segment. On completion, `geometryStatus: "drawn"`.

**This can happen at any time** — during the inspection, after it, or on a later visit. It's
not a step in the inspection stepper.

**Log entries:**

| Action | Entry |
| --- | --- |
| Stub created | `PIPE-005 created — from COF-001, path not yet drawn` |
| Drawing finished | `PIPE-005 path drawn — 91 ft, ends at CB-002` |

## Length comparison, once both exist

When a pipe has a drawn path **and** an inspection with a stop footage, show the comparison on
the pipe panel:

```
Inspected 84 ft  ·  drawn path measures 91 ft  ·  8% longer
```

| Difference | Treatment |
| --- | --- |
| Under 5% | Positive colour |
| 5–15% | Warning colour |
| Over 15% | Warning colour, plus: *"Check the traced path or the reel counter."* |

A large gap means the path was traced wrong or the counter is off. Both are worth knowing and
neither is currently visible.

---

# 2 · Set-up loses Purpose and stops asking about the pipe

## Remove entirely

| Field | Why |
| --- | --- |
| **Purpose** | Never used downstream |
| **Pipe size at entry** | Moves to Start of pipe — section 3 |
| **Pipe type at entry** | Moves to Start of pipe — section 3 |
| **Depth at entry** | Already collected on the Characteristics Start row |

## Launched from — pre-fill when there's no choice

| Case | Behaviour |
| --- | --- |
| The pipe has an access point at one end only | **Pre-filled and read-only.** The pipe already knows where it starts. |
| Access points at both ends | A choice — a run can be pushed from either end |

## Set-up becomes

```
LAUNCHED FROM   COF-001                      (read-only)
DIRECTION       [ Downstream  ▾ ]
ZERO REFERENCE  [ At the pipe entry  ▾ ]
```

Three fields, two of them usually pre-filled. **Next** enables once direction and zero
reference are set.

---

# 3 · Start of pipe and End of pipe are observations

Size and material belong with the observations, not in Set-up. Every size-and-material fact on
a run is the same kind of record — a section beginning at a footage. **Start of pipe is the one
at 0 ft. End of pipe is the one at the stop footage. Transitions are the rest.**

They also carry stills, which a Set-up field can't — and judging cast iron from clay is far
easier on a paused frame than squinting into a clean-out.

## The observations step opens gated

**Before anything can be logged:**

```
┌ START OF PIPE — required before logging observations ────────┐
│  Everything on this run is measured forward from here.        │
│                                                               │
│  PIPE TYPE *      [ Select…            ▾ ]                    │
│  PIPE SIZE *      [ Select…            ▾ ]                    │
│  STILL AT 0 FT    [ capture ]                                 │
│                                                               │
│              [ Save start of pipe ]                           │
└───────────────────────────────────────────────────────────────┘
```

**No observation buttons are shown until this is saved.** No tie-ins, no defects, no
transitions.

**Pipe type options:** Cast iron · Clay · PVC · ABS · Orangeburg · Concrete · Ductile iron ·
Transite · Unknown

**Pipe size options:** 2" 3" 4" 6" 8" 10" 12" 15" 18"

## Then observations work as they do now

Once Start of pipe is saved, the existing chooser and forms appear unchanged.

## The step can't be completed without End of pipe

At the bottom of the observations step, after the logged list:

```
┌ END OF PIPE — required to finish this step ──────────────────┐
│  What the pipe is at 84 ft, where the camera stopped.         │
│                                                               │
│  PIPE TYPE *      [ Select…            ▾ ]                    │
│  PIPE SIZE *      [ Select…            ▾ ]                    │
│  STILL AT 84 FT   [ capture ]                                 │
│                                                               │
│              [ Save end of pipe ]                             │
└───────────────────────────────────────────────────────────────┘
```

**The footage is taken from the inspection's stop footage**, read-only.

**Next is disabled until End of pipe is saved.**

## Both are stored as observations

Add two observation kinds, or reuse `pipe-transition` with a flag — either is fine as long as
they appear in the observation list and the pipe profile:

| Kind | Footage | Appears in |
| --- | --- | --- |
| `start-of-pipe` | 0 | The observation list, pinned first |
| `end-of-pipe` | The stop footage | The observation list, pinned last |

Both sort to their ends regardless of when they were entered.

---

# 4 · A start–end mismatch requires a transition

**A pipe can't change material or size between two points without changing somewhere.**

**When Next is pressed and the start and end differ in either type or size, and no
`pipe-transition` observation exists**, block it and explain:

```
┌ CAN'T FINISH THIS STEP ──────────────────────────────────────┐
│  The pipe changes but nothing was logged                      │
│                                                               │
│  Start    6" Cast iron    at 0 ft                             │
│  End      6" Clay         at 84 ft                            │
│                                                               │
│  A pipe can't change between those two points without a       │
│  transition somewhere in between, and none was recorded.      │
│                                                               │
│  ┌ WHAT TO DO ────────────────────────────────────────────┐   │
│  │ • Scrub back through the recording and find where the  │   │
│  │   material or size changes.                            │   │
│  │ • Log a Pipe transition observation at that footage.    │   │
│  │ • If the start or end was entered wrong, edit it here.  │   │
│  └────────────────────────────────────────────────────────┘   │
│                                                               │
│      [ Back to observations ]     [ Edit start ]  [ Edit end ]│
└───────────────────────────────────────────────────────────────┘
```

**Name both pipes explicitly** — that's what tells the technician which one to go looking for.

**When a transition does exist**, Next proceeds normally. Don't check whether the transition
values reconcile — a run can change more than once, and a technician who logged one is telling
you where it happened.

---

## Validation

- A pipe can be created with only a start point, and renders as a dashed stub with an open end.
- **Finish drawing** locks the start point and allows the rest of the path to be traced.
- The length comparison appears once a pipe has both a drawn path and a stop footage.
- Purpose, pipe size at entry, pipe type at entry and depth at entry no longer appear in Set-up.
- Launched from is read-only when the pipe has only one access point.
- No observation can be logged until Start of pipe is saved.
- The observations step cannot be completed until End of pipe is saved.
- Start of pipe and End of pipe appear in the observation list, pinned first and last.
- A start–end mismatch with no transition logged blocks the step and names both pipes.
