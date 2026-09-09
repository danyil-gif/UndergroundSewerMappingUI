# Figma Make — Accessibility Check on New Observations
### Paste everything below this line.

**An amendment to the observed-state work.** Send it after that lands, or fold it in if that
build hasn't started.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

---

## The problem

A technician can't always reach an asset. A car is parked over the basin. The storage room is
locked. The clean-out is under six inches of mulch. The unit resident isn't home.

None of that is recorded anywhere. The asset simply doesn't get observed, and three months
later nobody can tell whether it was skipped, forgotten, or unreachable.

**Whether you could reach an asset is itself an observation, and it should always be asked.**

---

## This is not the same as "Unable to fully evaluate"

Two different failures, two different fixes.

| | **Couldn't access** | **Unable to fully evaluate** |
| --- | --- | --- |
| What happened | You never reached it | You reached it and opened it |
| Cause | A car, a locked door, mulch, snow | Standing water, debris, grease |
| The fix | Coordinate, return, get a key | Pump, jet, clean |
| Where it's recorded | The new accessibility field | The existing condition rating |

**They must stay separate.** Collapsing them loses the difference between *"send someone back
when the car's moved"* and *"this needs a vacuum truck."*

---

# 1 · New fields on `AssetObservation`

```ts
accessible: boolean            // required on every observation
inaccessibleReason?: string
inaccessibleNotes?: string
inaccessibleMedia?: string[]   // photos and video
```

**`accessible` is required on every observation** — including Confirm all.

---

# 2 · It's the first question in New Observation

Above everything else, including the Confirm all button:

```
┌ NEW OBSERVATION · CB-007 ────────────────────────────────────┐
│  Reserve Study · 12 June · Nicholas · job #48901              │
│                                                               │
│  COULD YOU ACCESS IT TODAY? *                                 │
│  [      YES      ]  [      NO      ]                          │
│                                                               │
│  ─────────────────────────────────────────────────────────    │
│  ( the rest of the form, once answered )                      │
└───────────────────────────────────────────────────────────────┘
```

Two-option select in the existing inverting-choice style — **Yes** positive, **No** warning.
**Nothing below is shown until it's answered.**

## When Yes

The form proceeds exactly as specified — Confirm all, then the field list.

## When No

**Hide everything else.** No Confirm all, no fields, no photo slots. You can't verify what you
couldn't reach, and offering the fields invites someone to carry forward last year's values as
though they'd checked.

Show instead:

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Why | Dropdown | enum | **Yes** |
| Details | Multiline | string | No |
| Photos or video | Media capture, repeating | list | No |

**Why — options:**

```
Vehicle parked over it
Locked room — no key
Blocked by stored items
Buried under landscaping or mulch
Under snow or ice
Resident not home
Area under construction
Standing water over it
Could not locate it
Unsafe to approach
Other
```

**Details placeholder:** *"Silver sedan, plate ABC-1234. Manager said resident parks there
nightly."*

**The media field matters more than it looks.** A photo of the car over the basin is what turns
*"we couldn't get to it"* into something a property manager will act on.

**Save** writes an observation with `accessible: false`, the reason, and nothing else.

---

# 3 · What an inaccessible observation does to the projection

**Nothing — and that's the point.**

An observation with `accessible: false` carries no field values, so the per-field projection
leaves every field at its previous value **with its previous date**.

The Latest State view then correctly reads:

```
LATEST STATE
  Depth               6.5 ft      Master Plan · 14 Mar
  Condition           Fair        Master Plan · 14 Mar
```

Even though it's now June. **The values are from March because that's the last time anyone
actually looked**, and the panel says so.

---

# 4 · On the asset panel

**A banner above Latest State when the most recent observation was inaccessible:**

```
⚠  NOT ACCESSED — 12 June
   Vehicle parked over it · Nicholas · Reserve Study
   Values below are from the last successful observation.
```

Existing warning treatment. **Tapping it** opens that observation with its photos and notes.

**In the observation history**, an inaccessible entry shows the reason in place of the field
list:

```
12 Jun   Reserve Study    Nicholas   #48901
         not accessed — vehicle parked over it
14 Mar   Master Plan      Dino       #48770
         9 fields recorded
```

---

# 5 · Repeated inaccessibility is a finding

**When an asset's last three observations are all `accessible: false`**, escalate the banner:

```
⚠  NOT ACCESSED ON THE LAST 3 VISITS
   14 Mar · 22 Apr · 12 June — vehicle parked over it each time
```

**That's a real problem worth reporting**, not a scheduling annoyance. An asset nobody can ever
reach isn't in the reserve study, and the association needs to know.

---

# 6 · On the map and in the left panel

| Where | Treatment |
| --- | --- |
| Map pin | A small warning marker on any asset whose latest observation was inaccessible |
| Left panel row | The reason in place of the last-observed line — `not accessed · vehicle parked` |

**The stale marker and this are different signals.** Stale means nobody has tried in over a
year. Not-accessed means someone tried and couldn't.

---

# 7 · Close visit

**Every asset marked inaccessible during this visit appears in outstanding items** as a
**documentation** gap, not a pricing blocker:

```
⚠  CB-007   not accessed — vehicle parked over it   documentation   [ Fix now ]  [ Accept ]
```

**Fix now** returns to the asset so a second attempt can be recorded. **Accept** takes a
reason as usual.

**It is never a pricing blocker.** The technician did the right thing by recording it, and
blocking their close for something outside their control would teach them not to record it.

---

# 8 · Log entries

| Action | Entry |
| --- | --- |
| Inaccessible observation saved | `CB-007 not accessed — vehicle parked over it` |
| Accessible observation | Unchanged from the existing entries |

---

# 9 · Seed data

**Give one sample asset an inaccessible observation as its most recent**, with a reason and a
note — so the banner, the history row, the map marker and the left panel treatment all render
on load.

**Give another asset two consecutive inaccessible observations**, so the repeated-inaccessibility
escalation is visible without anyone having to create it.

---

## Validation

- `accessible` is required on every observation, including Confirm all.
- The question appears above everything else in New Observation, and nothing shows until it's answered.
- Answering No hides all field inputs, Confirm all included.
- A reason is required when the answer is No.
- An inaccessible observation writes no field values, so the projection keeps the previous values **and their previous dates**.
- The asset panel shows a banner when the latest observation was inaccessible.
- Three consecutive inaccessible observations escalate the banner.
- Inaccessible assets are a documentation gap at close, never a pricing blocker.
- "Couldn't access" and "Unable to fully evaluate" remain separate concepts throughout.
