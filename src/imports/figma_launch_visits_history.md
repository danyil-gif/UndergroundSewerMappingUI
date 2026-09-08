# Figma Make — Launch Screen, Visits & History
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project — `C.bg`,
`C.panel`, `C.card`, `C.border`, `C.cyan`, `C.blue`, `C.text`, `C.muted`, `C.dim`, the
`Section` and `FieldLabel` components, the existing button and select patterns, `'DM Sans'` for
body and `JetBrains Mono` for values.

**If anything here conflicts with an existing pattern, follow the existing pattern.**

This is all new — nothing needs removing. There is currently no session, visit, or person
concept in the file.

---

## What this adds

```
LAUNCH SCREEN ──── Start visit ────►  SIMD  ──── Close visit ────►  LAUNCH SCREEN
     │
     └───── Browse without a visit ──►  SIMD, read-only
```

**SIMD is only reachable through the launch screen.** That single constraint is what makes the
rest simple: if the map is on screen, a visit is open, so every control is editable and there
is no per-control read-only gating to build.

---

# 1 · New state and data

## People

```ts
const SITE_PERSONS = [
  { id: "p-dino",      name: "Dino",      role: "Manager" },
  { id: "p-nicholas",  name: "Nicholas",  role: "Technician" },
  { id: "p-alexis",    name: "Alexis",    role: "Technician" },
  { id: "p-christian", name: "Christian", role: "Project Lead" },
  { id: "p-joshua",    name: "Joshua",    role: "Sales" },
]
```

## Jobs — sample data

Each job carries a property, so there is no separate property picker.

```ts
interface Job {
  id: string
  number: string          // "#48812"
  jobType: string         // "Emergency"
  property: string        // "Willow Creek Condominium Association"
  summary: string         // "Sewer backup, Bldg 3 laundry"
  when: string            // "8:40 AM" or "Mar 22"
  group: "today" | "scheduled" | "recent"
}
```

Seed six or seven across the three groups, spanning two or three properties.

## Visits

```ts
interface Visit {
  id: string
  jobId: string | null            // null for an office update
  property: string
  visitType: string
  personId: string                // who held the tablet
  technicianIds: string[]         // who was on site
  startedAt: number               // timestamp
  endedAt: number | null
  officeUpdateReason?: string
  visitNote?: string
  log: VisitLogEntry[]
  acceptedAtClose?: { item: string; reason: string }[]
  reportStatus?: "draft" | "in review" | "sent"
}

interface VisitLogEntry {
  id: string
  at: number
  text: string                    // "COF-01 created — Clean-out, Laundry room"
  recordType?: "asset" | "pipe" | "inspection" | "observation" | "media" | "logistics" | "contact"
  recordId?: string
}
```

## App-level state

```ts
const [appView, setAppView] = useState<"launch" | "simd">("launch")
const [browseMode, setBrowseMode] = useState(false)
const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
const [visits, setVisits] = useState<Visit[]>([])          // seed 3 closed visits
const [currentVisitId, setCurrentVisitId] = useState<string | null>(null)
const [viewingVisitId, setViewingVisitId] = useState<string | null>(null)
const [showVisitLog, setShowVisitLog] = useState(false)
const [showCloseVisit, setShowCloseVisit] = useState(false)
```

**`selectedPersonId` starts as null and there is no fallback.** Any derived
`selectedPerson` must be nullable:

```ts
const selectedPerson = SITE_PERSONS.find(p => p.id === selectedPersonId) ?? null
```

**Seed three closed visits** so the history lists have content on first load.

---

# 2 · The launch screen

A full-window view replacing the entire app, shown whenever `appView === "launch"` — which is
the initial state.

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│              ◎  SEWERMAP PRO                                                     │
│                 UNDERGROUND INFRASTRUCTURE                                       │
│                                                                                  │
│  ┌─ START A VISIT ─────────────────┐   ┌─ RECENT VISITS ──────────────────────┐  │
│  │                                 │   │  [ All people ▾ ]  [ Last 30 days ▾ ] │  │
│  │  WHO ARE YOU?                   │   │                                       │  │
│  │  ┌────────┐ ┌────────┐ ┌──────┐ │   │  Mar 15  Willow Creek         1h 14m  │  │
│  │  │ Dino   │ │Nicholas│ │Alexis│ │   │          Emergency Call · Nicholas    │  │
│  │  │Manager │ │  Tech  │ │ Tech │ │   │          3 assets · 2 pipes · 2 insp  │  │
│  │  └────────┘ └────────┘ └──────┘ │   │          draft                        │  │
│  │  ┌──────────┐ ┌────────┐        │   │                                       │  │
│  │  │Christian │ │ Joshua │        │   │  Mar 12  Lakeview Terrace     2h 40m  │  │
│  │  │Proj Lead │ │ Sales  │        │   │          Excavation · Christian       │  │
│  │  └──────────┘ └────────┘        │   │          1 work event · 1 inspection  │  │
│  │                                 │   │                                       │  │
│  │  JOB                            │   │  Mar 08  Willow Creek         2h 03m  │  │
│  │  TODAY                          │   │          Diagnostic · Alexis          │  │
│  │  ○ 8:40 AM  #48812  Emergency   │   │          11 assets · 4 pipes          │  │
│  │    Willow Creek · Backup Bldg 3 │   │          sent                         │  │
│  │  SCHEDULED                      │   │                                       │  │
│  │  ○ Mar 22  #48901  Reserve      │   │            [ Show more ]              │  │
│  │    Lakeview · Full survey       │   │                                       │  │
│  │  RECENT                         │   │                                       │  │
│  │  ○ Mar 08  #48770  Diagnostic   │   │                                       │  │
│  │    Willow Creek · Slow drains   │   │                                       │  │
│  │                                 │   │                                       │  │
│  │  No job — office update         │   │                                       │  │
│  │                                 │   │                                       │  │
│  │  VISIT TYPE                     │   │                                       │  │
│  │  [ Emergency Call          ▾ ]  │   │                                       │  │
│  │                                 │   │                                       │  │
│  │  TECHNICIANS ON SITE            │   │                                       │  │
│  │  ☑ Nicholas ☐ Alexis ☐ Dino     │   │                                       │  │
│  │  ☐ Christian ☐ Joshua           │   │                                       │  │
│  │                                 │   │                                       │  │
│  │     [    START VISIT    ]       │   │                                       │  │
│  │       Select who you are        │   │                                       │  │
│  │                                 │   │                                       │  │
│  │    Browse without a visit       │   │                                       │  │
│  └─────────────────────────────────┘   └───────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────────────────┘
```

**Left column ~520px. Right column ~440px, scrollable.** Below roughly 1100px of window width
the columns stack, Start a visit on top. Reuse the existing logo mark from the left panel
header.

## 2.1 · Start a visit — left column

| Field | Control | Required |
| --- | --- | --- |
| Person | Card grid, single-select | Yes |
| Job | Grouped radio list | Yes |
| Visit type | Dropdown, auto-filled from the job, editable | Yes |
| Technicians on site | Multi-select checkboxes | Yes |

### Person

**Nothing pre-selected.** Cards showing name and role. Selected card fills with `C.cyan`.

**While `selectedPersonId` is null, the Job, Visit type and Technicians sections render at
reduced opacity and are not interactive.** The person section is the only live thing on the
column.

Choosing a person **pre-checks them in Technicians**, editable afterwards.

> Person is who holds the tablet and whose name lands on every record they create.
> Technicians is who was on site. Alexis on the tablet with Nicholas on the reel means
> person = Alexis, technicians = both.

### Job

Grouped **TODAY · SCHEDULED · RECENT**. Each row: `when`, job number, job type on the first
line; property name and summary on the second, dim.

**Selecting a job auto-fills the visit type** from its `jobType`.

### Visit type

```
Diagnostic Site Visit · Emergency Call · Hydro-Jetting Estimate Survey
Hydro-Jetting · Rodding / Cable Machine · Descaling · CIPP Feasibility
CIPP Installation · Excavation · Post-Repair Verification
Sewer Infrastructure Master Plan · Office Update · Other
```

### Start visit

**Disabled until person, job, visit type and at least one technician are all set.** Beneath it
in `C.muted`, name the first unmet requirement, one at a time:

> *Select who you are* → *Select a job* → *Select at least one technician*

**On click:** create a `Visit`, set `currentVisitId`, set `appView` to `"simd"`,
`browseMode` false.

### Office update

A secondary link under the job list: **`No job — office update`**. Replaces the job list with:

| Field | Control | Required |
| --- | --- | --- |
| Property | Single-select from the properties in the job data | Yes |
| Reason for the change | Multiline | Yes |

With a standing note in `C.muted`:

> *Recorded as an office correction, not a field observation, and labelled as such in any
> report.*

### Browse without a visit

A quiet text link beneath Start visit. Opens a property picker, then `appView = "simd"` with
`browseMode` true and `currentVisitId` null.

## 2.2 · Recent visits — right column

Built from `visits`, closed ones only, newest first.

| Field | Display |
| --- | --- |
| Date | Mono, left |
| Property | Semibold, first line |
| Visit type · person | Second line, dim |
| Counts | Third line, mono dim — only non-zero categories |
| Report status | Fourth line when present — `draft` · `in review` · `sent` |
| Duration | Right-aligned, mono dim — `1h 14m` from `startedAt`/`endedAt` |

~20 rows, then **Show more**. **Office updates** show an `office` chip instead of a duration.

### Filters

| Filter | Options | Default |
| --- | --- | --- |
| Person | All people · each of the five | All people |
| Range | Today · Last 7 days · Last 30 days · Last 90 days · All | Last 30 days |

### Tapping a row

Sets `viewingVisitId`, `browseMode` true, `appView` `"simd"`, and opens the visit log panel.
**Never creates a visit.**

### Empty state

> *No visits yet. Start one on the left and it'll appear here.*

---

# 3 · The session strip

The root is currently `display: flex` with no direction, so it's a row. **Wrap it:**

```
root  →  flexDirection: "column"
├── session strip                                    height 44, flexShrink 0
└── <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
      ├── LEFT PANEL
      ├── MAP
      └── RIGHT PANEL
    </div>
overlays (confirm dialog etc) stay outside the wrapper, siblings of the strip
```

**All three columns must be inside that wrapper.** If its closing `</div>` lands after the left
panel, the map and right panel stack vertically instead of sitting in the row.

## 3.1 · Visit open

```
│ ● Willow Creek · Emergency Call · 01:14 · 12 changes ▾    Nicholas    [ Close visit ] │
```

| Element | Detail |
| --- | --- |
| Status dot | 8px, `C.cyan`, gently pulsing |
| Property · visit type · elapsed · change count | Elapsed in `JetBrains Mono`, ticking every second |
| Chevron on the change count | Toggles the visit log panel |
| Person name | Read-only text. **No picker, no chevron.** |
| **Close visit** | Right edge, `C.cyan` |

Background: `C.cyan + "18"`. Bottom border `C.border`, matching the toolbar below it.

**A new log entry briefly highlights the change count** even when the panel is closed.

## 3.2 · Browse mode

```
│ Willow Creek · BROWSING — no changes saved · viewing Emergency Call, 15 Mar   [ Back ]  [ Start a visit ] │
```

| Element | Detail |
| --- | --- |
| `BROWSING — no changes saved` | Mono chip, warning treatment |
| Viewing line | Only when `viewingVisitId` is set |
| **Back** and **Start a visit** | Both return to the launch screen |

Background: `C.panel`.

### Protect browse mode with one wrapper, not per-control conditions

Wrap the three-column layout in a div with `pointerEvents: "none"` when `browseMode` is true,
then re-enable only:

| Re-enabled with `pointerEvents: "auto"` | For |
| --- | --- |
| The map surface | pan and zoom |
| Asset markers and pipe routes | selection |
| Left panel section headers and list rows | navigation |
| The right panel container | scrolling, video playback, profile viewing |

Everything else inherits `none`. **One wrapper — do not add per-control disabled checks.**

---

# 4 · The visit log panel

A dropdown anchored under the strip, ~440px wide, scrollable, dismissed by clicking outside.
**Not the right panel** — that's in use for asset and pipe detail.

```
┌ VISIT LOG · 12 entries ──────────────────────────────┐
│  09:14  Site logistics — Utility shutoffs added       │
│  09:18  COF-01 created — Clean-out, Laundry room      │
│  09:22  COF-01 condition — Good                       │
│  09:31  P-01 camera inspection — 0 to 70 ft           │
│                                                       │
│  [ + Add work performed ]      (disabled)             │
└───────────────────────────────────────────────────────┘
```

**Every action in the app appends an entry automatically**, with a timestamp: creating or
editing an asset, drawing a pipe, adding an inspection, logging observations, updating
condition, adding media, logistics, contacts.

**Entries cannot be deleted.** Undoing a change appends a new entry rather than removing the
old one.

**`+ Add work performed`** is visible, disabled, tooltip *"Coming soon."*

**Tapping an entry** opens its record in the right panel without closing the log.

## 4.1 · Viewing a past visit

When `viewingVisitId` is set, the panel gains a header and drops the add control:

```
┌ EMERGENCY CALL · 15 MARCH ───────────────────────────────────┐
│  Nicholas · Alexis on site · job #48812 · 09:14 – 10:28      │
│  3 assets · 2 pipes · 2 inspections · 7 observations         │
│  ────────────────────────────────────────────────────────     │
│  09:14  Site logistics — Utility shutoffs added              │
│  ...                                                          │
│  ── ACCEPTED AT CLOSE ─────────────────────────────────────    │
│     10 assets — no photos                                    │
│     "Light inventory pass, to be documented if the reserve   │
│      study proceeds."                                        │
└───────────────────────────────────────────────────────────────┘
```

Visit note, when written, sits below the counts in italic. **No `+ Add work performed`.**

**The accepted-at-close block is the record of what was deliberately left**, and it's what
someone asks about three months later.

---

# 5 · Closing a visit

A popover anchored under the Close visit button, ~460px, scrollable.

```
┌ CLOSE VISIT ─────────────────────────────────────────────────┐
│  Closing Emergency Call · started 09:14 by NICHOLAS          │
│  ────────────────────────────────────────────────────────     │
│  3 assets · 2 pipes · 2 inspections · 7 observations · 11 media │
│                                                               │
│  [ the same log entries as section 4 ]                        │
│                                                               │
│  OUTSTANDING                                                  │
│  ⚠ COF-01     access size not recorded    blocks pricing      │
│                              [ Fix now ]  [ Accept ]          │
│  ⚠ 10 assets  no photos                   documentation       │
│                              [ Fix now ]  [ Accept ]          │
│                                                               │
│  VISIT NOTE                                                   │
│  [                                                    ]       │
│                                                               │
│            [ Close visit ]        [ Cancel ]                  │
└───────────────────────────────────────────────────────────────┘
```

**The line naming the person is the last cheap moment to catch a wrong name.**

**Outstanding items** — one row per required field left empty, each marked **blocks pricing**
or **documentation**. **Accept** opens a required reason input and records it in
`acceptedAtClose`.

**Close visit is disabled while any `blocks pricing` item is neither fixed nor accepted with a
reason.** Documentation gaps can be accepted freely.

**On confirm:** set `endedAt`, clear `currentVisitId`, **set `selectedPersonId` back to null**,
clear the job selection, and return to the launch screen.

> That reset is what stops a shared tablet starting the next visit under the previous person's
> name.

---

# 6 · The left panel VISITS section

`leftSectionOpen` is currently `{ infra, assets, pipes }`. **Add a fourth key: `visits`.**
Build the section matching the existing three exactly — same header button, chevron rotation
and spacing.

```
VISITS · 4                                                    ▾

Mar 15   Emergency Call   Nicholas   3 assets · 2 pipes    1h 14m   draft
Mar 08   Diagnostic       Alexis     11 assets · 4 pipes   2h 03m   sent
Feb 22   Office Update    Dino       1 asset               office
```

Filtered to the current property. **Office updates** show an `office` chip instead of a
duration.

**Tapping a row** sets `viewingVisitId` and opens the log panel, read-only.

**While a visit is open**, it appears at the top with a live marker and ticking elapsed time.

---

# 7 · Site logistics and contacts

New sections in the **right panel**, shown when no asset or pipe is selected. Use the existing
`Section` and `FieldLabel` components.

## Site logistics

| Field per entry | Control | Required |
| --- | --- | --- |
| Category | Dropdown | Yes |
| Photo or video | Media capture, matching the existing capture pattern | Yes |
| Note | Multiline | No |

**Categories:** Parking & truck staging · Building access · Lockbox and keys ·
Basement or mechanical access · Utility shutoffs · Excavation staging ·
Restoration reference · Hazards and constraints

Each entry shows who added it and on which visit. Most recent per category expanded, older
collapsed under a `previous` control.

**Do not store lockbox or gate codes.** Add a note under that category in `C.muted`:
*"Photograph the location. Codes belong in your access credentials, not here."*

## Contacts

| Field | Control | Required |
| --- | --- | --- |
| Name | Text | Yes |
| Role | Dropdown — Property manager · On-site maintenance · Board president · Board member · After-hours · Other | Yes |
| Phone | Text | No |
| Email | Text | No |
| Best contact method | Dropdown — Call · Text · Email | No |
| Notes | Multiline | No |

---

# 8 · Provenance on every record

Add to **every** asset, pipe, inspection, observation and media item. **Set automatically,
never entered.**

| Field | Set when |
| --- | --- |
| `createdBy` · `createdOn` · `createdDuringVisitId` | The record is created |
| `lastVerifiedBy` · `lastVerifiedOn` · `lastVerifiedDuringVisitId` | Any field on it is edited |

Created values never change. Last-verified overwrites on each edit. Existing sample data shows
*Created — unknown*.

## Where it displays

**On the record**, beneath the title in the right panel, in the existing dim style:

```
COF-01 · Clean-out — floor
Added by Nicholas · Emergency Call · 15 Mar
```

When created and last-verified differ, **show both** — the gap is meaningful:

```
Added by Dino · Master Plan · 8 months ago
Last verified by Nicholas · Emergency Call · 15 Mar
```

**In the left panel asset and pipe lists**, a short form on the right of each row:

```
COF-01   Clean-out, floor   Laundry room   Good   Nicholas · today
CB-02    Catch basin        Parking lot    Fair   Dino · 8 mo ago
```

**Records created during an Office Update visit are labelled as such**, since a desk
correction is a different claim from a field observation.

---

# 9 · Fix the left panel toggle

The collapse button currently sits inside the **map** container at around line 2860, so during
the width animation the panel is partially open and the button overlays the map.

**Move it into the left panel's own header**, top-right beside the logo block. When collapsed
to 0 width, render a narrow 20px rail against the left edge holding only the expand chevron.

| State | Rendering |
| --- | --- |
| Open | 252px panel, toggle at the top-right of its header |
| Collapsed | 20px rail, chevron only, no overlap with the map |

---

# 10 · Navigation summary

| From | Action | To |
| --- | --- | --- |
| Launch screen | Start visit | SIMD, visit open |
| Launch screen | Tap a recent visit | That property, browse mode, that visit's log open |
| Launch screen | Browse without a visit | Property picker, then SIMD read-only |
| SIMD | Close visit → confirm | Launch screen, person and job cleared |
| SIMD | Left panel `VISITS` → a row | That visit's log panel |
| SIMD | Strip change count chevron | The current visit's log |
| Visit log | Tap an entry | That record in the right panel, log stays open |
| Browse mode | **Back** or **Start a visit** | Launch screen |

---

## Not in this pass

Leave these out. Adding them now means debugging several new concepts at once.

- **Role enforcement.** Store the role; don't gate on it.
- **Work events.** The button is a disabled placeholder.
- **Reports.** Nothing is generated on close; `reportStatus` is sample data only.
- **Asset state history.** Provenance only, no per-visit observation records.

---

## Validation

- The launch screen is the first thing shown on load, every time.
- `selectedPerson` has no fallback and can be null.
- Nothing below the person section is interactive until a person is chosen.
- Start visit is disabled until all four fields are set, naming the first unmet requirement.
- SIMD is unreachable except through the launch screen.
- With a visit open, no control anywhere is disabled for read-only reasons.
- Browse mode blocks edits through a single wrapper, not per-control conditions.
- All three columns sit inside the `flex: 1` row wrapper.
- Tapping a recent visit never creates a visit.
- Closing a visit returns to the launch screen with `selectedPersonId` null.
- Log entries cannot be deleted.
- The left panel toggle never overlaps the map.
