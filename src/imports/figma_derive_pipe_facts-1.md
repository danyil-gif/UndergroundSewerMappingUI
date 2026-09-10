# Figma Make — Derive Pipe Start, End, Length and Slope
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

**This is a prototype with no real data.** Change shapes freely.

---

## The problem

`Pipe` stores `start`, `end`, `length` and `slope` directly, and the pipe panel has an editable
form asking for them:

```ts
start?: PipeEndpoint   // { type, diameter, depth }
end?: PipeEndpoint
length: string
slope: string
```

**Every one of those is already produced by the camera inspection:**

| Stored field | Where it actually comes from |
| --- | --- |
| `start.type` · `start.diameter` | The **Start of pipe** observation |
| `end.type` · `end.diameter` | The **End of pipe** or **Camera Stoppage** observation |
| `start.depth` | The Characteristics **START** row |
| `end.depth` | The Characteristics **END** row |
| `length` | The inspection's stop footage, or the estimated total when partial |
| `slope` | Derived — `(end depth − start depth) / length` |

**So it's asked twice, in two vocabularies, with no reconciliation.** Whichever the technician
fills last wins, Pipe Overview reads one source while the pipe record holds another, and the
panel shows contradictory values.

---

# 1 · Delete the stored fields

From `interface Pipe`, remove:

```ts
start?: PipeEndpoint
end?: PipeEndpoint
length: string
slope: string
```

**And delete the `PipeEndpoint` interface** if nothing else uses it.

## Delete the editable form

In the pipe panel, remove the whole **START / END / TOTAL LENGTH / SLOPE** form — the type,
diameter and depth inputs for both ends, the length input and the slope input.

**Remove `pipeForm`'s `start`, `end`, `length` and `slope` keys** and every setter that writes
them.

---

# 2 · Add one derivation helper

Everything that read those fields now calls this:

```ts
function pipeFacts(pipe: Pipe) {
  // the most recent inspection where all six steps are complete
  const insp = [...pipe.videos]
    .filter(v => v.inspStep >= 6)
    .sort((a, b) => b.date.localeCompare(a.date))[0]
  if (!insp) return null

  const obs = insp.observations ?? []
  const sop  = obs.find(o => o.kind === "start-of-pipe")
  const eop  = obs.find(o => o.kind === "end-of-pipe" || o.kind === "camera-stoppage")
  const chars = insp.characteristics ?? []
  const first = chars.find(c => c.isStart)
  const last  = chars.find(c => c.isEnd)

  const lengthFt = insp.fullLengthInspected === false && insp.estimatedTotalFt
    ? parseFloat(insp.estimatedTotalFt)
    : parseFloat(insp.stopFootage ?? "0")

  const startDepth = parseFloat(first?.depth ?? "0")
  const endDepth   = parseFloat(last?.depth ?? "0")

  return {
    startType: sop?.pipeType ?? null,
    startSize: sop?.pipeSize ?? null,
    startDepth: first?.depth ?? null,
    endType: eop?.pipeType ?? null,
    endSize: eop?.pipeSize ?? null,
    endDepth: last?.depth ?? null,
    lengthFt,
    lengthEstimated: insp.fullLengthInspected === false,
    slopePct: lengthFt > 0 ? ((endDepth - startDepth) / lengthFt) * 100 : null,
    endKind: eop?.kind ?? null,          // so consumers can tell a stoppage from a real end
    inspection: insp,
  }
}
```

**Returns `null` when no inspection is complete.** Every consumer must handle that.

---

# 3 · Update every consumer

Nine places currently read the deleted fields. All become `pipeFacts(pipe)`, with a fallback
when it returns null.

| Line | Currently reads | Becomes |
| --- | --- | --- |
| ~921 | `pipe.start?.type` for material | `pipeFacts(pipe)?.startType` |
| ~922 | `pipe.start?.diameter` | `pipeFacts(pipe)?.startSize` |
| ~3444 | `pipe.start?.diameter \|\| "—"` in the left panel row | Same via `pipeFacts` |
| ~4163 | Map label `diameter` + `type` | Same via `pipeFacts` |
| ~4526 | Pipe list row diameter and type | Same via `pipeFacts` |
| ~5774 | Panel subtitle diameter · length · type | Same via `pipeFacts` |
| ~5826–5827 | `pipeForm` seeded from `length` and `slope` | Remove those keys |
| ~5883–5889 | Drawn-vs-inspected comparison using `pipe.length` | `pipeFacts(pipe)?.lengthFt` |
| ~6639, ~7262 | Diagram labels `⌀diameter type` | Same via `pipeFacts` |

**The fallback everywhere is `—`**, as it is now.

---

# 4 · Pipe Overview

**Shows the derived values, each with where it came from**, and is entirely read-only:

```
START                          END
6" Cast iron · 4.5 ft          6" Clay · 8.7 ft

TOTAL LENGTH                   SLOPE
95 ft   EST                    4.4%   derived
```

| Rule | |
| --- | --- |
| `lengthEstimated` is true | Show the `EST` chip beside the length |
| Slope | Always carries a `derived` marker — never entered |
| `endKind` is `camera-stoppage` | Label the END card *Camera stoppage*, not *End of pipe* |

**With no completed inspection**, replace all four cards with:

> *No camera inspection yet. This fills in once one is completed.*

**Not empty input fields.** An editable field there invites someone to type a value the
inspection will then contradict — which is the bug being removed.

---

# 5 · Check `transitions`

`Pipe.transitions` is stored separately and referenced 16 times.

**Material and size changes along a run are already Pipe transition observations.** If
`transitions` duplicates them, delete it and derive from the observations instead:

```ts
const transitions = obs
  .filter(o => o.kind === "pipe-transition")
  .sort((a, b) => parseFloat(a.footage) - parseFloat(b.footage))
```

**If something writes to `transitions` that isn't an observation**, leave it and flag what.

---

## Validation

- `start`, `end`, `length` and `slope` no longer exist on `Pipe`.
- The START / END / TOTAL LENGTH / SLOPE form is gone from the pipe panel.
- `pipeFacts()` is the single source for all of those values.
- All nine consumers use it and fall back to `—` when it returns null.
- Pipe Overview is read-only, shows the source of each value, marks an estimated length with `EST` and slope as `derived`.
- A camera stoppage ending labels the END card accordingly.
- A pipe with no completed inspection shows an explanatory line, not empty fields.
- Nothing in the app lets a technician type a pipe's start type, end type, length or slope directly.
