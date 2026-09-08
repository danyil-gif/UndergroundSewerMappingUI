# Figma Make — Site Visit Sessions
### Paste everything below this line.

---

## Do not add any new screens

This app is a **single view** — left panel, map, right panel, all at `100dvh` with no routing.
**Keep it that way.**

Everything below lives in a new top strip and a few popovers. Specifically:

| Do NOT build | Instead |
| --- | --- |
| A sign-in screen | A person picker in the top-right of the strip |
| A "today's jobs" landing screen | A job list inside the Start visit popover |
| A separate close-visit screen | A popover anchored to the strip |
| A separate visit-log screen | A dropdown panel from the strip |

**Nothing should push the map further than one click away.** The app opens on the map, as it
does now.

Use the existing components, colours, type scale and spacing throughout — `C.panel`,
`C.border`, `C.muted`, `C.dim`, the `FieldLabel` style, the existing button and select
patterns, JetBrains Mono for values. If anything here conflicts with an existing pattern,
follow the existing pattern.

---

## 1 · The structural change

The root is currently a flex **row** of three columns. Wrap it so a full-width strip sits
above them:

```
┌─ SESSION STRIP · 44px · full width ─────────────────────────────┐
├──────────┬──────────────────────────────────┬───────────────────┤
│  LEFT    │  toolbar 42px                    │  RIGHT            │
│  252px   │  map                             │  panel            │
└──────────┴──────────────────────────────────┴───────────────────┘
```

The strip is the only new persistent UI. Everything else is a popover.

---

## 2 · The session strip — two states

### State A — no visit open (default)

```
│ Willow Creek Condominium Association    READ-ONLY    [ Start visit ]      Nicholas ▾ │
```

| Element | Detail |
| --- | --- |
| Property name | Left, semibold, existing heading size |
| `READ-ONLY` | Small mono chip in `C.muted` |
| **Start visit** | Primary button, `C.cyan` |
| Person picker | Right edge, name + chevron, opens a menu |

Strip background: `C.panel` with a bottom border, same as the toolbar.

### State B — visit open

```
│ ● Willow Creek · Diagnostic Site Visit · 01:14 · 12 changes ▾    [ Close visit ]   Nicholas ▾ │
```

| Element | Detail |
| --- | --- |
| Status dot | `C.cyan`, gently pulsing |
| Property · visit type · elapsed · change count | Elapsed as `HH:MM` in mono, ticking |
| Chevron on the change count | Opens the visit log dropdown — section 5 |
| **Close visit** | Button, `C.cyan` |

Strip background gets a faint `C.cyan` tint so the two states are unmistakable at a glance.
That difference is the point of the whole feature.

---

## 3 · The person picker

No sign-in screen. A menu from the strip's right edge.

| Field | Control |
| --- | --- |
| Person | Single-select list |

```
Dino          Manager
Nicholas      Technician        ← current
Alexis        Technician
Christian     Project Lead
Joshua        Sales
```

Store the selected person and their role. Roles aren't enforced yet — this is groundwork, and
switching person is how you'll test role behaviour later.

Selected name shows in the strip.

---

## 4 · Start visit — popover, anchored under the button

Width ~380px. Three fields, then the action.

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Job | Single-select list, grouped | reference | Yes |
| Visit type | Dropdown, auto-filled from the job, editable | enum | Yes |
| Technicians | Multi-select from the five people | list | Yes |

**Job list — grouped, each row showing date · job number · type · summary:**

```
TODAY
  8:40 AM   #48812   Emergency      Sewer backup, Bldg 3 laundry
SCHEDULED
  Mar 22    #48901   Reserve study  Full property survey
RECENT
  Mar 08    #48770   Diagnostic     Slow drains, Bldg 1
```

**Visit type options:**

```
Diagnostic Site Visit · Emergency Call · Hydro-Jetting Estimate Survey
Hydro-Jetting · Rodding / Cable Machine · Descaling · CIPP Feasibility
CIPP Installation · Excavation · Post-Repair Verification
Sewer Infrastructure Master Plan · Office Update · Other
```

**Start visit** disabled until a job and at least one technician are set.

**A secondary link at the bottom: `No job — office update`.** Swaps the job list for one
required field:

| Field | Control | Required |
| --- | --- | --- |
| Reason for the change | Multiline | Yes |

With a standing note in `C.muted`:

> *Recorded as an office correction, not a field observation, and labelled as such in any
> report.*

---

## 5 · The visit log — dropdown from the strip

Opened by the chevron on the change count. **Not the right panel** — that's in use for asset
and pipe detail. A dropdown panel, ~440px wide, anchored under the strip, scrollable, with a
click-outside to dismiss.

```
┌ VISIT LOG · 12 entries ──────────────────────────────┐
│  09:14  Site logistics — Utility shutoffs added       │
│  09:18  COF-01 created — Clean-out, Laundry room      │
│  09:22  COF-01 condition — Good                       │
│  09:31  P-01 camera inspection — 0 to 70 ft           │
│  09:44  P-01 3 observations logged                    │
│  10:02  P-02 camera inspection — blocked at 18 ft     │
│                                                       │
│  [ + Add work performed ]                             │
└───────────────────────────────────────────────────────┘
```

**Every action anywhere in the app appends here automatically**, with a timestamp: creating or
editing an asset, drawing a pipe, adding an inspection, logging observations, updating
condition, adding media, site logistics, contacts.

Each entry links to the record it touched.

**Automatic entries cannot be deleted.** Undoing a change appends a new entry rather than
removing the old one.

**A new entry briefly highlights the change count in the strip** even when the dropdown is
closed, so the log is visibly alive without being in the way.

**`+ Add work performed`** at the bottom is a placeholder button for now — work events come
later. Leave it visible and disabled with a tooltip: *"Coming soon."*

---

## 6 · Read-only when no visit is open

**Every editing control in the app becomes disabled** — not hidden.

| Where | What disables |
| --- | --- |
| Left panel | Add asset, add pipe, delete, lock/unlock |
| Toolbar | Add asset mode, draw pipe mode, map edit |
| Right panel — asset | Every field, every capture, Edit, delete |
| Right panel — pipe | Every field, + Camera Inspection, all stepper controls |
| Map | Dragging assets, dragging map image, editing routes |

**Disabled controls keep their position and shape**, at reduced opacity, with a tooltip:

> *Start a visit to make changes.*

**What stays live while read-only:** panning, zooming, selecting assets and pipes, opening the
right panel, playing videos, viewing the pipe profile, saved map views. Everything about
looking, nothing about changing.

**Mode is forced to `view`** while no visit is open — `add-asset`, `draw-pipe` and
`select-area` are unreachable.

---

## 7 · Close visit — popover, anchored under the button

Width ~460px, scrollable.

**Two sections:**

**Visit summary** — the same log from section 5, with a count line above it:

```
3 assets · 2 pipes · 2 inspections · 7 observations · 1 condition update · 11 media
```

**Outstanding items** — one row per required field left empty. Each shows the record, the
missing field, and whether it blocks pricing:

```
⚠  COF-01      access size not recorded        blocks pricing    [ Fix now ]  [ Accept ]
⚠  P-02        video pending                   documentation     [ Fix now ]  [ Accept ]
⚠  10 assets   no photos                       documentation     [ Fix now ]  [ Accept ]
```

**Accept** opens a required text input for the reason.

| Field | Control | Required |
| --- | --- | --- |
| Visit note | Multiline | No |

**Close visit** is disabled while any **blocks pricing** item is neither fixed nor accepted
with a reason. Documentation gaps can be accepted freely.

On close: the strip returns to State A, the property goes read-only, and the visit becomes
part of its history.

---

## 8 · Visit history — in the left panel

The left panel already has collapsible sections (`infra`, `assets`, `pipes`). **Add a fourth:
`VISITS`**, matching the existing section pattern exactly.

Each row:

```
Mar 15   Diagnostic        Nicholas    3 assets · 2 pipes
Mar 08   Emergency Call    Alexis      1 asset · 1 pipe
```

Tapping a row opens that visit's log in the same dropdown panel from section 5, read-only,
with its date in the header.

---

## 9 · Site logistics and contacts — right panel, property level

When nothing is selected, the right panel currently shows property-level content. Add two
sections there, using the existing `Section` and `Label` components.

### Site logistics

A category list; each holds media entries with notes.

| Field per entry | Control | Required |
| --- | --- | --- |
| Category | Dropdown | Yes |
| Photo or video | Media capture | Yes |
| Note | Multiline | No |

**Categories:** Parking & truck staging · Building access · Lockbox and keys ·
Basement or mechanical access · Utility shutoffs · Excavation staging ·
Restoration reference · Hazards and constraints

Each entry shows who added it and on which visit. Most recent per category expanded, older
collapsed under a `previous` control.

**Do not store lockbox or gate codes.** Store *where the lockbox is*. Add a note in `C.muted`
under that category: *"Photograph the location. Codes belong in your access credentials, not
here."*

### Contacts

| Field | Control | Required |
| --- | --- | --- |
| Name | Text | Yes |
| Role | Dropdown — Property manager · On-site maintenance · Board president · Board member · After-hours · Other | Yes |
| Phone | Text | No |
| Email | Text | No |
| Best contact method | Dropdown — Call · Text · Email | No |
| Notes | Multiline | No |

---

## 10 · What every record now stores

Set automatically on every asset, pipe, inspection, observation and media item. **Never
entered by the user.**

| Field | Set when |
| --- | --- |
| `createdBy` · `createdOn` · `createdDuringVisit` | The record is created |
| `lastVerifiedBy` · `lastVerifiedOn` · `lastVerifiedDuringVisit` | Any field on it is edited |

Created values never change. Last-verified overwrites on each edit. Sample data shows
*Created — unknown*.

**Display it on the record**, beneath the title in the right panel, in the existing dim style:

```
COF-01 · Clean-out — floor
Added by Nicholas · Diagnostic · 15 Mar
```

When created and last-verified differ, show both — the gap is meaningful:

```
Added by Dino · Master Plan · 8 months ago
Last verified by Nicholas · Diagnostic · 15 Mar
```

**And in the left panel asset and pipe lists**, a short form on the right of each row:

```
COF-01   Clean-out, floor   Laundry room   Good   Nicholas · today
CB-02    Catch basin        Parking lot    Fair   Dino · 8 mo ago
```

---

## Not in this pass

Leave these out — they come later and adding them now means debugging two new concepts at once:

- Role enforcement. Store the role, don't gate on it.
- Work events. The button is a disabled placeholder.
- Reports. Nothing generated on close.
- Asset state history. Provenance only, no per-visit observation records.

---

## Validation

- A visit cannot start without a job and at least one technician, unless it's an office update with a written reason.
- A visit cannot close while a pricing-blocking item is neither fixed nor explained.
- Every editing control is disabled — not hidden — when no visit is open.
- Mode is forced to `view` when no visit is open.
- Provenance fields are set automatically and are never editable.
- The app never navigates away from the single map view.
