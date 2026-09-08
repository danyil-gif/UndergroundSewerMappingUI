# Figma Make — Camera Process, Set Up to Characteristics
### Paste everything below this line.

---

## Keep the existing design and style

**Do not introduce a new visual style.** Build everything below with the components, section
layout, spacing, sizing, type scale, colours and icons already in this project.

**Keep the observation capture logic exactly as it is now** — the still-first flow, the type
chooser, the defect / tie-in / direction change / pipe transition forms, the clock face, the
severity control, the `WheelPicker` footage popover with its From/To range, and the
observation list. All of it stays. One field is being added to it, described in Step 5.

**Footage stays stored as it is now** — a decimal, so 24 ft 6 in is `24.5`. Use the existing
`parseFtIn` helper to render it as **`24 ft 6 in`**, or **`24 ft`** when inches are zero,
everywhere footage appears: the observation list, the pipe profile, summaries.

**If anything here conflicts with an existing pattern, follow the existing pattern.**

---

## The seven steps

A camera inspection on a pipe runs as a locked stepper. Each step gates the next, completed
steps collapse to a one-line summary with a **Change** control, and steps not yet reached are
visible but disabled.

```
1  Set up
2  Push
3  Why the camera stopped
4  Upload the recording
5  Sewer camera analysis
6  Was the pipe fully inspected?
7  Characteristics
```

**There is no separate locating step.** Locating happens inside Step 5, on the observations
that need it.

---

## Where pipe size, type and depth are recorded

This matters because three similar-looking facts are captured in three different places, for
three different reasons. Do not duplicate them.

| Fact | Where | Why there |
| --- | --- | --- |
| Size, type and depth **at the pipe entry** | **Step 1** | Known before the camera moves. A run abandoned at 3 ft still has a size, a material and a starting depth. |
| Size and type **changing along the run** | **Step 5**, as Pipe transition observations | Visible on the recording, and carries a still |
| Depth and what's above **changing along the run** | **Step 7** | Only obtainable with the sonde |

**Characteristics rows do not have pipe type or size fields.** Material sections come from the
Pipe transition observations logged in Step 5.

---

# Step 1 — Set up

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Purpose | Dropdown | enum | Yes |
| Launched from | Single-select from the pipe's connected assets | reference | Yes |
| Direction | Two-option select — Downstream · Upstream | enum | Yes |
| Zero reference | Dropdown | enum | Yes |
| **Pipe size at entry** | Dropdown — 2" 3" 4" 6" 8" 10" 12" 15" 18" | enum | **Yes** |
| **Pipe type at entry** | Dropdown — Cast iron · Clay · PVC · ABS · Orangeburg · Concrete · Ductile iron · Transite · Unknown | enum | **Yes** |
| **Depth at entry** | Number, ft | decimal | **Yes** |

**Purpose options:** Initial inspection · Re-inspection · Post-cleaning ·
Post-repair verification · Reserve study · Warranty check · Second opinion

**Zero reference options:** At the pipe entry · At the cap · At grade · At the fitting

Default **Zero reference** to *At the pipe entry*, with a short line beneath:

> *Footage measured along the pipe, not from the floor. Keep this consistent between
> inspections of the same run or their footages won't line up.*

**When the pipe has a previous inspection**, pre-fill Launched from, Direction, Zero reference,
size and type from it, with a note:

> *Previous inspection was launched from COF-01, downstream, zeroed at the pipe entry, 4″ cast
> iron. Use the same for a direct comparison.*

**Next** is disabled until every field is set.

---

# Step 2 — Push

No data entry. The screen shows the pipe being inspected and a single action.

> Push at a steady pace. Stop briefly at **every connection** and at **any observation more
> severe than moderate**, until the end is reached or the camera won't go further.
>
> Nothing to enter here — that comes next.

**Action:** `Camera stopped`

---

# Step 3 — Why the camera stopped

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| **Why the camera stopped** | Single-select dropdown | enum | **Yes** |
| Stop footage | `WheelPicker`, single value | decimal | Yes |
| Notes | Multiline | string | No |

**Options:**

```
Reached the next pipe or structure
Reached a connection to the city main
Reached another accessible clean-out
Reached a basin or manhole
Reached a 90° fitting — end of the pipe
Reached a septic tank or lift station
Camera reel maxed out
Blocked — roots
Blocked — grease
Blocked — scale or hard deposits
Blocked — debris or foreign object
Suspected collapse
Offset or separated joint the head won't pass
Hard bend the head won't pass
Standing water — nothing visible
Pipe too small for the head
Other
```

**Its own field on the inspection record**, stored and reportable independently. Not derived
from anything else — it's the difference between a run that ended because it finished and one
that ended because something is wrong.

**Next** disabled until a reason and a stop footage are set.

---

# Step 4 — Upload the recording

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Camera recording | Video capture | file | Yes |

> Download from the reel, then upload here. Analysis happens next.

**Next** disabled until a recording is attached.

---

# Step 5 — Sewer camera analysis

**Keep everything about this step exactly as it works now.** The still-first capture, all
observation types with their existing fields and options, the clock face, the severity
control, the `WheelPicker` footage popover with its range, and the observation list.

**Instruction text at the top:**

> Work through the recording and log what you see. Footage opens at the last observation — the
> camera only moves forward. Anything that affects lining is located here, while the camera is
> still at that footage.

## Pipe transitions are logged here

**Material and size changes along the run are Pipe transition observations**, not table rows.
Keep the existing Pipe transition type in the chooser with its `pipeType` and `pipeSize`
fields.

**When Step 5 is completed with no Pipe transition observations**, take that to mean the run is
one continuous material — the size and type from Step 1 apply for its full length. No prompt
needed.

## The one addition — at the end of every observation form

Below the notes field, separated by a divider:

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| **Is it a concern for CIPP installation?** | Two-option select — **No** · **Yes** | enum | **Yes** |

Use the existing inverting-choice button style. **No** in the positive colour, **Yes** in the
warning colour.

### When the answer is Yes, reveal:

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| **Depth** | Number, ft | decimal | **Yes** |
| **Up-close locate image** | Media capture | file | **Yes** |
| **Wide area locate image** | Media capture | file | **Yes** |
| What's above at this point | Dropdown, same options as the Characteristics table | enum | No |
| Notes for the estimator | Multiline | string | No |

**What's above auto-fills from the Characteristics table** once Step 7 is complete, by matching
the observation's footage to the row it falls within. If the technician enters it here first,
that value stands.

**When the surface resolves to Sidewalk, City street or Alley**, show the existing warning
treatment:

> ⚠ *This point is under municipal property. Excavation here means a permit, traffic control,
> and restoration to municipal spec.*

### The answer is pre-set for some observations

| Observation | Pre-set to | Changeable |
| --- | --- | --- |
| Complete collapse | **Yes** | No — a collapse always rules out lining |
| Broken pipe · Missing bottom | **Yes** | Yes |
| Offset or Hole at severity 4–5 | **Yes** | Yes |
| Everything else | **No** | Yes |

When pre-set, show a short line explaining why:

> *Set automatically — a complete collapse always rules out lining.*

### On the observation list

A flagged observation shows a marker. One flagged but still missing its depth or either image
shows an outstanding marker, and the step reports the count:

```
2 CIPP concerns still need a locate
```

**Step 5 cannot be completed while any CIPP concern is missing its depth or either image.**

### On the pipe

Show the count where the pipe is summarised — it's the lining eligibility answer for the whole
run:

```
P-02 · 3 observations · 1 CIPP concern at 52 ft
```

---

# Step 6 — Was the pipe fully inspected?

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| **Was the pipe fully inspected?** | Three-option select — Yes · Partially · No | enum | **Yes** |
| Why not fully inspected | Single-select dropdown, when not Yes | enum | Conditional |
| Footage actually assessable | `WheelPicker`, when not Yes | decimal | No |

**Why not fully inspected — options:**

```
Camera did not reach the end
Heavy grease obscured the view
Standing water obscured the view
Sediment or debris obscured the view
Scale obscured the view
Camera lens fouled
Poor lighting or image quality
Section skipped — could not hold position
Other
```

> A separate judgement from why the camera stopped. A camera can reach the city main and still
> show nothing useable for forty feet because the line was full of grease.

**Two separate fields, deliberately.** *Why the camera stopped* is a physical fact known the
moment the push ends. *Was the pipe fully inspected* can only be judged after watching the
recording. Both belong on the record and in reports:

> *Reached a connection to the city main · Partially inspected — heavy grease obscured 40 ft*

**There is already a hint in the build reading "Partial inspection — end characteristics may be
estimated."** Replace it with this field rather than leaving both.

**Next** disabled until answered, and until a reason is given when the answer isn't Yes.

---

# Step 7 — Characteristics

The sonar pass. The camera goes back in the pipe; the surface technician locates it and
records **how depth and what's above change** along the run.

**A table of change points, not a fixed interval.** A row is added whenever depth or what's
above the ground changes. Between two rows, both hold.

**No pipe type or size columns.** Those come from Step 1 and the Pipe transition observations.

**Build the table from the project's existing row, label and field components.** Match the row
height, borders and type treatment of the lists already on the pipe screen.

## The interface

```
         LENGTH   DEPTH    ABOVE GROUND
  START   0 ft    4.5 ft   Hallway
    1     25 ft   6.3 ft   Basement                  ✕
    2     30 ft   6.5 ft   Storage units             ✕
    3     43 ft   6.9 ft   Unit — 3B, 3C             ✕
    4     65 ft   7.6 ft   Front yard — grass        ✕
    5     75 ft   8.2 ft   Sidewalk            ⚠     ✕
    6     92 ft   8.5 ft   City street         ⚠     ✕
  END     98 ft   8.7 ft   City street         ⚠

  [ + Add change ]
```

## Rows

**Start and End rows are fixed** — always present, never removable.

**The Start row pre-fills its length as 0 and its depth from Step 1's depth at entry.** The
technician confirms rather than re-entering. Only *Above ground* is empty on it.

**The End row pre-fills its length from the inspection's stop footage** and is editable.

**Middle rows are added with `+ Add change`** and are removable. They sort by length
automatically.

## Fields per row

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Length | `WheelPicker`, single value | decimal | Yes |
| Depth | Number, ft | decimal | Yes |
| Above ground | Dropdown | enum | Yes |
| Unit number(s) | Text — shown only when Above ground is Unit | string | Conditional |
| Ownership | Dropdown — Association · Individual unit · Municipal · Utility easement · Unknown | enum | Yes, auto-filled |

**Above ground — options:**

```
Hallway · Lobby or finished space · Unit · Basement · Storage units
Laundry room · Mechanical room · Crawlspace · Garage or parking deck
Building slab — common area · Under mechanical equipment
Front yard — grass · Landscaping · Courtyard · Walkway
Parking lot · Driveway · Gravel
Sidewalk · City street · Alley
Unknown
```

**Unit numbers.** When Above ground is **Unit**, reveal a text field beneath accepting one or
more identifiers — placeholder *"e.g. 3B, or 3B and 3C"*. A stretch of pipe routinely crosses
two or three units.

**Ownership auto-fills from the surface selection** — Sidewalk, City street and Alley default
to **Municipal**; Unit to **Individual unit**; everything else to **Association**. Editable,
because a sidewalk can be private.

**Any row with Municipal ownership shows a ⚠** using the existing warning treatment, and the
pipe carries a municipal flag.

## Behaviour

**A new row pre-fills depth and surface from the row above it**, so the technician edits only
what moved. Most rows change one field.

**Helper text beneath the table:**

> A row is a change point. Add one whenever depth or what's above the ground changes — a new
> row copies the one above it, so you edit only what moved. Pipe material and size changes are
> logged as observations in step 5.

## What the table produces

**The pipe profile** — the horizontal visualisation at the top of the pipe section, in the
project's existing graphic style, on one footage axis:

| Lane | Source |
| --- | --- |
| Surface zones above the line | Characteristics rows |
| Depth profile | Characteristics rows |
| Material sections in the pipe bar | Step 1's entry values, split at each Pipe transition observation |
| Observation markers below the line | Step 5, with CIPP concerns marked distinctly |

**Sections for pricing.** Rows 3 to 4 is 22 ft at 6.9 ft deep under units 3B and 3C. Rows 5 to
6 is 17 ft at 8.2 ft under a public sidewalk. Those price completely differently, and neither
figure exists unless this table does.

**Finish inspection** is disabled until every row has a length, depth and what's above.

---

## Validation

- Step 1 requires purpose, launched from, direction, zero reference, size at entry, type at entry and depth at entry.
- Step 3 requires a stop reason and a stop footage.
- Step 4 requires a recording.
- Step 5 requires every observation to answer the CIPP concern question, and every Yes to have a depth and both locate images.
- Step 6 requires an answer, and a reason when the answer isn't Yes.
- Step 7 requires a Start and an End row, ascending lengths, and length, depth and above-ground on every row.
- Row lengths cannot exceed the stop footage.
- Unit number is required when Above ground is Unit.
