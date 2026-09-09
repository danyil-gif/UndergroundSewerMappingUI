# Figma Make — Assets as Observed State
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project —
`C.bg`, `C.panel`, `C.card`, `C.border`, `C.cyan`, `C.text`, `C.muted`, `C.dim`, the
`Section` and `FieldLabel` components, existing button and select patterns, `JetBrains Mono`
for values.

**If anything here conflicts with an existing pattern, follow the existing pattern.**

**This is a prototype with no real data.** Change shapes freely.

---

## The problem

An asset's fields are single-valued and overwritten on edit. A clean-out recorded in March as
**3″ and sealed** becomes **4″ and accessible** in June, and March is gone.

Nothing about the March record was wrong — it was accurate on 14 March. Both readings are true
at their own moment, and the system can only hold one.

**Almost nothing stored about an asset is a permanent fact. It's an observation with a date on
it.**

---

# 1 · What is versioned and what isn't

## Identity — never versioned

`id` · `label` · `type` · `x` · `y` · `location` · `locationOther` · the archive fields.

A catch basin never becomes a clean-out, and where a thing sits isn't an observation of it. If
one of these is wrong it's an edit with a log entry, not a new state.

## Observed state — versioned per visit

```
depth · conditionRating · conditionBlocker
accessSize · accessConfig · undergroundConn · undergroundConnOther
verticalPipeSize · horizontalPipeSize
stackSize · stackMaterial · hasCleanout · cleanoutSize · cleanoutFitting
flowTestDone · flowTestResult
installDate · dischargeTestDone · dischargeFunctioning
cameraAccessible
photos
```

---

# 2 · New data shape

```ts
interface AssetObservation {
  id: string
  assetId: string
  visitId: string
  observedAt: number
  observedById: string

  // every versioned field, all optional
  depth?: string
  conditionRating?: 1|2|3|4|5|"unable"
  conditionBlocker?: string
  accessSize?: string
  accessConfig?: string
  undergroundConn?: string
  undergroundConnOther?: string
  verticalPipeSize?: string
  horizontalPipeSize?: string
  stackSize?: string
  stackMaterial?: string
  hasCleanout?: "no" | "pre-existing" | "installed-by-us"
  cleanoutSize?: string
  cleanoutFitting?: string
  flowTestDone?: boolean
  flowTestResult?: boolean
  installDate?: string
  dischargeTestDone?: boolean
  dischargeFunctioning?: boolean
  cameraAccessible?: boolean
  photos?: string[]

  changeReason?: "work-by-us" | "work-by-others" | "correction" | "unchanged"
}
```

```ts
const [assetObservations, setAssetObservations] = useState<AssetObservation[]>([])
```

## `Asset` keeps every field, as a cached projection

**Don't remove any field from `Asset`.** The map, the archive dialog, the audit and the counts
all read them directly, and walking an observation list on every render would be slow.

Whenever observations change, recompute each asset's versioned fields as the **latest non-null
value per field** — walking that asset's observations newest to oldest and taking the first
non-null value **for each field independently**.

```ts
function projectAsset(asset: Asset, obs: AssetObservation[]): Asset
```

**That per-field rule is the important part.** If June recorded condition but nobody
re-measured the stack, the current stack size still comes from March. It's the latest *known*
value per field, not the latest observation wholesale.

## Provenance comes from observations

There are no `createdBy` / `lastVerifiedBy` fields in the file and none should be added.

| Provenance | Source |
| --- | --- |
| Created by / on / during visit | The asset's **first** observation |
| Last verified by / on / during visit | The asset's **most recent** observation |

One source of truth; the two can't diverge. Assets with no observations show *Created —
unknown*.

---

# 3 · The right panel

Three regions, top to bottom.

```
┌───────────────────────────────────────────────────────────────┐
│  COF-001 · Clean-out — floor                                   │
│  Bldg 3 laundry                                                │
│  Added by Dino · Master Plan · 14 Mar                          │
│                                                                │
│  LATEST STATE                                                  │
│  Access size          3"          Master Plan · 14 Mar         │
│  Access config        One-way     Master Plan · 14 Mar         │
│  Underground conn     Wye         Master Plan · 14 Mar         │
│  Camera accessible    No          Master Plan · 14 Mar         │
│  Condition            Unable      Master Plan · 14 Mar         │
│  Photos               2           Master Plan · 14 Mar         │
│                                                                │
│              [ + New Observation ]                             │
│                                                                │
│  OBSERVATION HISTORY · 3                                  ▾    │
│  12 Jun   Emergency Call    Nicholas   #48812                  │
│           access size, camera accessible                       │
│  14 Mar   Master Plan       Dino       #48770                  │
│           9 fields recorded                                    │
│  22 Feb   Office Update     Dino       —                       │
│           condition corrected                                  │
└────────────────────────────────────────────────────────────────┘
```

## Latest state

**Read-only.** Field label, value in `JetBrains Mono`, then the visit and date it came from,
dim and right-aligned.

**A field never observed** shows `—` and *not recorded*, dim.

**Only fields relevant to that asset type** — the same conditions the editable form already
uses.

**Every value row is tappable**, opening that field's history — section 5.

## Observation history

A collapsible `Section`, **collapsed by default**, matching the existing section pattern.

**Each row, newest first:**

| Column | Content |
| --- | --- |
| Date | Mono |
| Visit type | |
| Person | |
| ServiceTitan job | The job number, or `—` for an office update |
| Second line | Which fields that observation carried, dim |

**The `—` in the job column is what distinguishes a desk correction from a field observation** —
no separate chip needed.

**Tapping a row** shows that observation's full set of values.

## On an asset with no observations

**Skip the Latest state view entirely** and open the existing editable form as it works today.
The first save writes the first observation.

---

# 4 · New Observation

**One button, and the fast path is the first thing inside it.**

```
┌ NEW OBSERVATION · COF-001 ───────────────────────────────────┐
│  Emergency Call · 12 June · Nicholas · job #48812             │
│                                                               │
│  [       NOTHING CHANGED — CONFIRM ALL 7 FIELDS       ]       │
│                                                               │
│  ── or update what's different ────────────────────────────    │
│                                                               │
│  Access size          [ 3"        ▾ ]   Master Plan · 14 Mar  │
│  Access config        [ One-way   ▾ ]   Master Plan · 14 Mar  │
│  Underground conn     [ Wye       ▾ ]   Master Plan · 14 Mar  │
│  Camera accessible    [ No        ▾ ]   Master Plan · 14 Mar  │
│  Condition            [ Unable    ▾ ]   Master Plan · 14 Mar  │
│  Photos               [ 2 · manage    ]  Master Plan · 14 Mar │
│                                                               │
│           [ Save observation ]      [ Cancel ]                │
└───────────────────────────────────────────────────────────────┘
```

**Header line:** the current visit type, date, person and ServiceTitan job — so it's obvious
what this observation will be stamped with.

**Every field pre-filled with its projected value**, and each showing where that value came
from.

## Confirm all

Writes one observation carrying **every currently-projected value**, with
`changeReason: "unchanged"`. **One tap.**

On a reserve study of a known property most assets are one tap, which is what makes this
affordable in the field. If it isn't there, people stop recording.

## Save observation

Writes one observation containing **only the fields that differ** from the projection. Anything
untouched carries forward as already verified — nothing needs re-entering.

**Save is disabled when nothing has been changed** — use Confirm all instead. Show why in the
existing helper style.

---

# 5 · Field history

Tapping a value row in Latest state opens:

```
┌ ACCESS SIZE ─────────────────────────────────────────────────┐
│   4"     Emergency Call · 12 June · Nicholas · #48812         │
│          changed — work performed by us                       │
│                                                               │
│   3"     Master Plan · 14 March · Dino · #48770               │
└───────────────────────────────────────────────────────────────┘
```

Newest first. Value, visit, date, person, job number, and the change reason where one exists.

**A field with one entry** shows it plainly, no history affordance.

---

# 6 · A changed attribute means work was performed

**A 3″ clean-out doesn't become a 4″ clean-out on its own.** Either you did work, or someone
else did — and if it was someone else, this observation is the only evidence you'll ever get.

**When Save observation is pressed and any of these differ from the projection**, show a dialog
before writing:

```
accessSize · accessConfig · undergroundConn · verticalPipeSize
horizontalPipeSize · stackSize · stackMaterial
hasCleanout · cleanoutSize · cleanoutFitting
installDate · cameraAccessible
```

```
┌ SOMETHING CHANGED ───────────────────────────────────────────┐
│  Since Master Plan · 14 March                                │
│                                                              │
│    Access size        3"        →   4"                       │
│    Camera accessible  No        →   Yes                      │
│                                                              │
│  Was work performed on this asset?                           │
│                                                              │
│  [ Yes — by us ]  [ Yes — by someone else ]                  │
│  [ No — the earlier reading was wrong ]                      │
└──────────────────────────────────────────────────────────────┘
```

| Answer | `changeReason` | Log entry |
| --- | --- | --- |
| **Yes — by us** | `work-by-us` | `COF-001 updated — access size 3" → 4" · work performed by us` |
| **Yes — by someone else** | `work-by-others` | `COF-001 updated — access size 3" → 4" · work by another party` |
| **No — the earlier reading was wrong** | `correction` | `COF-001 corrected — access size 3" → 4" · earlier reading was wrong` |

**Never show this for condition, test results or photos.** Those change on their own — a basin
fills with debris, a pump fails, a photo is retaken.

**Depth gets a simplified version.** A basin's depth doesn't change either, so a difference
means a mismeasurement. Offer only **the earlier reading was wrong** and **keep both readings**.

**The third answer matters.** Someone mismeasured, and a correction should stay distinguishable
from a real change forever after.

---

# 7 · Photo slots hold history

`photos` is versioned, so a slot can hold images from several visits.

**In Latest state**, the Photos row shows the current count and its date.

**In New Observation**, a slot with an image shows the current one plus a count:

```
INSIDE WITH THE LID OPEN
┌──────────┐  Current — Nicholas · Post-Repair · 12 June
│  [image] │  3 photos in this slot
└──────────┘
[ Retake ] [ View all 3 ]
```

**Retake appends** rather than replacing, and **does not automatically become current.** The
newest photo is often not the best — a shot in poor light, or of a basin still half full, can
be worse than what's already there.

**View all** lists them newest first with visit and date, each offering **Make current**.

**Promoting asks why:**

| Reason | Meaning |
| --- | --- |
| Better view | Same conditions, clearer photo |
| Conditions changed | The asset itself is different now — pumped, cleaned, cleared |
| Component replaced | Part of it was replaced — ring, lid, cover |

That's the difference between *"we took a better picture"* and *"we cleaned it"*, and a board
reads those very differently.

---

# 8 · Log entries

Route all of these through the existing `appendLog`:

| Action | Entry |
| --- | --- |
| Confirm all | `COF-001 verified — 7 fields unchanged` |
| Save, no explanation needed | `COF-001 updated — condition: Unable → Poor` |
| Save with a change reason | `COF-001 updated — access size 3" → 4" · work performed by us` |
| Correction | `COF-001 corrected — access size 3" → 4" · earlier reading was wrong` |
| Photo promoted | `COF-001 current photo changed — conditions changed` |

---

# 9 · The stale marker

In the left panel asset list, flag anything whose latest observation is more than 12 months old:

```
CB-007   Catch basin   Bldg 1 exterior   Poor   Dino · 14 mo ago   ⚠
```

**Not an error — a prompt.** On a reserve study those are the assets to walk to first. Existing
warning treatment, tooltip *"Not observed in over a year."*

**Archived assets are excluded** from the stale marker, from observation counts, and from any
re-observation prompt.

---

# 10 · Seed data

**Two sample assets with two observations each**, several months apart, one field differing —
so Latest state, the history section and the field history all have content on load.

**Make one a clean-out that went from 3″ and not camera-accessible to 4″ and accessible**, with
`changeReason: "work-by-others"`. That's the exact case this feature exists for, and it should
be visible without entering anything.

**Give one asset two photos in the same slot** from different visits, so the photo history and
Make current have something to show.

**Give the observations real ServiceTitan job numbers**, and make one an office update with no
job so the `—` renders.

---

## Not in this pass

- **Pipes.** Same treatment eventually, but pipes already have inspections doing similar work.
- **Per-section verify.** One Confirm-all for now.
- **Work event linkage.** The change dialog records the reason; work events don't exist yet.

---

## Validation

- No field is removed from `Asset` — it stays a cached projection.
- Projection takes the latest non-null value **per field**, not the latest observation wholesale.
- Provenance derives from the first and latest observations, not stored fields.
- The panel shows Latest state, then `+ New Observation`, then Observation history.
- Observation history rows show date, visit type, person and job number, with `—` for office updates.
- Confirm all writes every projected value with `changeReason: "unchanged"`.
- Save observation writes only differing fields, and is disabled when nothing changed.
- The change dialog fires only for physical dimension and configuration fields.
- Depth differences offer only the correction path.
- Retaking a photo appends and does not auto-promote; promoting requires a reason.
- Every observation writes a log entry and carries a `visitId`.
- Archived assets are excluded from the stale marker and observation counts.
- Assets with no observations open the existing editable form directly.
