# Figma Make — Fixes From Testing
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. These are
fixes, not a redesign. If anything here conflicts with an existing pattern, follow the existing
pattern.

**Eight fixes, ordered so the mechanical ones come first.** Items 1, 5, 7 and 8 are small.
Item 3 is the largest and touches 56 call sites.

---

# 1 · The elapsed timer freezes after the first log entry

**Cause:** the `useEffect` around line 2062 has `visits` in its dependency array. Every
`appendLog` call updates `visits`, which tears down and recreates the interval. It stops
ticking as soon as anything is logged.

**Fix — read `startedAt` once and drop `visits` from the deps:**

```ts
const startedAt = visits.find(v => v.id === currentVisitId)?.startedAt

useEffect(() => {
  if (!currentVisitId || !startedAt) { setElapsed(0); return }
  const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
  tick()
  const id = setInterval(tick, 1000)
  return () => clearInterval(id)
}, [currentVisitId, startedAt])
```

---

# 2 · Photo capture on assets does nothing

Tapping a photo slot on an asset has no effect — no file picker, no preview, nothing stored.

**Wire the asset photo capture fields.** Each slot should:

| Behaviour | |
| --- | --- |
| Tap an empty slot | Opens a file picker |
| After selection | Stores the image and shows a thumbnail with the filename |
| Filled slot | Has a **Remove** control that confirms before clearing |
| Sequential slots | Unlock in order — the second is disabled until the first is filled |

Match whatever capture pattern already exists elsewhere in the project.

**Photos are per asset type**, as already specified:

| Type | Sequence |
| --- | --- |
| Basins | Wide area · Close up · Inside with the lid open |
| Clean-outs and stacks | Wide area · Close up |
| Drains and pumps | Wide area · Close up |
| Gutter hub | Wide area · Close up |

---

# 3 · Logging covers only create, delete and archive

**Cause:** `appendLog` is called 9 times, all from archive and delete functions. There are
**32 direct `setAssets`** and **24 direct `setPipes`** calls that bypass it entirely.

Setting a condition, changing a location, adding a photo, drawing a pipe, editing any pipe
field — none of it appears in the log. **Nothing about pipes logs at all.**

**Do not add `appendLog` calls at all 56 sites individually. Centralise it.**

## Add these wrappers beside `appendLog`

```ts
function createAsset(a: Asset) {
  setAssets(prev => [...prev, a])
  appendLog(`${a.label} created — ${ASSET_META[a.type].label}${a.location ? `, ${a.location}` : ""}`)
}

function updateAsset(id: string, patch: Partial<Asset>, description: string) {
  setAssets(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
  const tag = assets.find(a => a.id === id)?.label ?? id
  appendLog(`${tag} ${description}`)
}

function removeAsset(id: string) {
  const tag = assets.find(a => a.id === id)?.label ?? id
  setAssets(prev => prev.filter(a => a.id !== id))
  appendLog(`${tag} deleted`)
}
```

And the same three for pipes: `createPipe`, `updatePipe`, `removePipe`.

**`updateAsset` must read current state for the tag**, not a stale closure — if the log shows
the right action against the wrong tag, that's the cause.

## Then replace every direct setter call

All 32 `setAssets` and 24 `setPipes`, passing a short description:

| Action | Entry |
| --- | --- |
| Place an asset | `CB-002 created — Catch basin, Parking lot` |
| Set or change condition | `CB-002 condition — Fair` |
| Set location | `CB-002 location — Parking lot` |
| Any other field edit | `CB-002 access size — 4"` |
| Add a photo | `CB-002 photo added — Wide area view` |
| Remove a photo | `CB-002 photo removed — Wide area view` |
| Complete a drawn pipe | `PIPE-005 created — COF-001 → CB-002` |
| Any pipe field edit | `PIPE-005 length — 47 ft` |
| Advance a camera inspection step | `PIPE-005 inspection — step 3 complete` |
| Save an observation | `PIPE-005 observation — Roots, Severe, 31 ft` |
| Add a characteristics row | `PIPE-005 characteristics — row at 25 ft` |
| Site logistics entry | `Site logistics added — Parking & truck staging` |
| Contact added | `Contact added — Marcus Reyes` |
| Map image uploaded | `Site plan uploaded` |

**The archive, restore, undo and true-delete entries already work — leave them as they are.**

---

# 4 · The archive dialog doesn't show what's at stake

It asks for a reason but shows none of the context. A technician can't tell whether they're
about to archive an empty pin or three hours of work.

**Add above the reason field:**

```
Catch basin · Parking lot, north
Added by Dino · Master Plan · 14 Mar

This has history attached and will be archived, not deleted:

  3 observations across 2 visits
  5 photos
  1 camera inspection with 4 observations
  2 connected pipes — PIPE-004, PIPE-009
```

| Line | Source |
| --- | --- |
| Type and location | The asset record |
| Added by | The provenance fields — `createdBy`, the visit and its date |
| Each count | Computed from the record; **omit any category that is zero** |
| Connected pipes | Listed by tag |

**On the true-delete dialog**, keep it as it is — it correctly states nothing is attached and
asks for no reason.

---

# 5 · A pipe cannot end on an asset

**Cause:** `handleAssetMouseDown` around line 1573 returns early for any asset in
`lockedAssetIds` — and **every sample asset is locked on load** (line 1172). The mousedown
swallows the event before `handleAssetClick` can register the endpoint.

`handleAssetClick` itself is correct — it adds a snapped point with an `assetId`, and
`completePipe` reads `last.assetId` properly. Only the lock check is wrong.

**Fix — the lock check must apply only in `view` mode**, where its purpose is preventing
accidental dragging:

```ts
if (mode === "view" && lockedAssetIds.has(assetId) && editingLocationId !== assetId) return
```

In `draw-pipe` mode, clicking a locked asset must register as an endpoint.

---

# 6 · Close visit has no outstanding items and a truncated log

Two problems in the close-visit popover.

## The full log

It currently shows only part of the log. **Show every entry**, scrollable, matching the visit
log panel exactly.

## The outstanding items list

Absent entirely. **Build it.** One row per required field left empty across all non-archived
assets and pipes:

```
OUTSTANDING

⚠  CB-002    condition not set          blocks pricing    [ Fix now ]  [ Accept ]
⚠  CB-002    no photos                  documentation     [ Fix now ]  [ Accept ]
⚠  PIPE-005  no camera inspection       documentation     [ Fix now ]  [ Accept ]
```

**Which fields count as blocking:**

| Blocks pricing | Documentation |
| --- | --- |
| Condition rating not set | No photos |
| Location not set | No camera inspection on a pipe |
| Access size / stack size not set | Camera inspection started but not completed |
| Depth not set on a basin | Flow or discharge test not run |

**Fix now** navigates to that record with the missing field in view. **Accept** opens a
required reason input and records it in `acceptedAtClose`.

**Close visit is disabled while any `blocks pricing` item is neither fixed nor accepted with a
reason.** Documentation gaps can be accepted freely.

**Archived assets and pipes are excluded** — an archived record has no outstanding fields.

---

# 7 · Left panel sections start closed

On first load every section is expanded, which makes the panel unusable with any real number of
records.

```ts
const [leftSectionOpen, setLeftSectionOpen] = useState({
  infra: false, assets: false, pipes: false, visits: false, archived: false
})
```

**All closed.** The user opens what they need.

---

# 8 · The left panel can't scroll

With 9 assets and 4 visits the sections overlap and there's no way to scroll to the bottom.

## Fix the panel's layout

```
left panel (252px, display: flex, flexDirection: column)
├── logo header          flexShrink: 0          — stays fixed
└── scroll container     flex: 1, minHeight: 0, overflowY: "auto"
    └── all sections
```

**`minHeight: 0` on the scroll container is the part that's usually missing.** Without it a
flex child won't shrink below its content height and the scroll never engages, no matter what
`overflowY` says.

## Cap each section

Each section's content area gets `maxHeight: 280` and `overflowY: "auto"`.

**Section headers stay visible while their contents scroll**, so a property with 40 assets
doesn't push Pipes, Visits and Archived off the screen.

## Show counts on the headers

So a collapsed section still tells you what's inside:

```
ADD INFRASTRUCTURE                          ▾
ASSETS · 9                                  ▾
PIPES · 4                                   ▾
VISITS · 4                                  ▾
ARCHIVED · 2                                ▾
```

**The Archived section stays hidden entirely when nothing is archived.**

---

## Validation

- The elapsed timer keeps ticking after log entries are written.
- Tapping a photo slot opens a file picker and stores the result.
- Setting a condition, a location, or adding a photo each writes a log entry.
- Drawing a pipe and editing pipe fields each write log entries.
- `appendLog` is called from wrapper functions, not from 56 individual call sites.
- The archive dialog lists attached observations, photos, inspections and connected pipes.
- A pipe can be completed by clicking a second asset as its endpoint.
- Close visit lists outstanding items and disables while a blocks-pricing item is unresolved.
- The close-visit popover shows the complete log.
- All left panel sections are closed on first load.
- The left panel scrolls vertically with the logo header fixed.
- Each section scrolls internally past roughly 280px.
