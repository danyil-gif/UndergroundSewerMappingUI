# Figma AI Prompt — Sewer Camera Analysis
### Paste everything below this line.

---

Build a tablet screen flow for a plumbing technician logging findings from sewer camera
footage. The flow starts with uploading a video and ends when they finish adding
observations. Landscape tablet, 1280×900. Light interface.

---

## Screen 1 — Upload the video

A centred card on a light grey page.

- Heading: **ADD A VIDEO TO ANALYSE**
- Subtext: *Record it, pick it from your library, or paste it. You go straight to observations.*
- Three buttons in a row: **Record** (solid green) · **Library** (outline) · **Paste** (outline)
- Below: an empty state list area labelled **SAVED ANALYSES**

After upload, show a row in Saved analyses: name field ("Analysis 1"), observation count,
and buttons **Open** · **Move to a pipe** · **Remove**.

---

## Screen 2 — The review screen

This is the main screen. Five regions stacked vertically, always in this order.

**Region A — header**
Editable title field ("Analysis 1"), observation count to its right, close ✕ far right.

**Region B — video**
Video player, full width, max height 420, black background, native controls.
Below it a single row:

- Left, grey text: *Paused. Capture what's on screen.*
- Right: **[ Capture Observation ]** — solid green, large

**Region C — empty by default.** The chooser and forms appear here.

**Region D — run length**
Label **RUN LENGTH**. Two cards side by side:

- **Run start** — "0 ft", "6″ Cast iron", small EDIT link
- **Run end** — greyed out at 45% opacity, dashed border, reading *"Locked until you've finished logging observations."*

Below the two cards: grey text *"Log every tie-in, defect and change first — the run end
comes last."* and a button **[ Done adding observations ]**

**Region E — logged observations**
Label **LOGGED ON THIS RUN**. Rows, sorted by distance ascending. Empty state:
*"Nothing logged yet."*

**Footer** — **[ Done ]**, disabled by default.

---

## Screen 3 — The chooser

Appears in Region C when Capture Observation is pressed. An amber-accented card.

Left: the captured video still, 190px wide, rounded.
Right: heading **WHAT ARE YOU LOOKING AT?**, subtext *"Captured at 42.3s. It attaches to
whatever you pick."*, then five option buttons in a two-column grid.

Each option is white with a 1.5px coloured border, an uppercase title in the border
colour, and a grey one-line description:

| Title | Description | Colour |
| --- | --- | --- |
| TIE-IN | A branch connecting into this run | `#1B6FB8` blue |
| DEFECT | Crack, roots, hole, offset, sag, collapse | `#A96B00` amber |
| EXCAVATION POINT | Somewhere we'd have to open the ground | `#38424E` graphite |
| DIRECTION CHANGE | Turn, drop, or elevation change | `#7333D6` purple |
| PIPE TRANSITION | Material or diameter changes here | `#00803E` green |

Below the grid, a **[ Cancel ]** button.

---

## Screens 4–8 — The five forms

Each replaces the chooser in Region C. Same shell: amber-accented card, uppercase title,
fields, then **[ Save ]** (disabled until required fields are filled) and **[ Cancel ]**.

**Every form starts with the same distance field pattern:**

```
FOOTAGE *   [ 42 ]   [ +0 ] [ +5 ] [ +10 ] [ +25 ]
```

The input pre-fills with the furthest distance already logged. The four small buttons jump
forward from it.

---

**4 · TIE-IN**

- Footage into the pipe *
- Type * — Wye · Tee · Double wye · Double tee
- Size — 2″ 3″ 4″ 6″ 8″ 10″
- Orientation * — a clock face component (see below). Wye and Tee allow **one** selection; Double wye and Double tee allow **two**, and the label changes to "ORIENTATION — PICK TWO"
- What it serves — text input, placeholder *"Bldg 2 stack, laundry, area drain…"*

**5 · DEFECT**

- Footage *
- Type * — Crack · Roots · Roots through crack · Hole · Offset · Sagging · Complete collapse · Grease · Scale · Broken pipe · Missing bottom
- Orientation — clock face, single selection
- Severity — five buttons in a row: **1 MINOR** `#00803E` · **2 LIGHT** `#7DC242` · **3 MODERATE** `#A96B00` · **4 SEVERE** `#FF7A29` · **5 URGENT** `#CE1A74`
- Notes — multiline

Variant: when Type is **Complete collapse**, orientation and severity **disappear
entirely**, replaced by a bordered note: *"**A collapse rules out lining.** Add an
excavation point at this distance before you close the run. No orientation or severity
needed — a collapse is the whole pipe."*

**6 · EXCAVATION POINT**

- From (ft) * and To (ft) *
- Depth band * — 0–4 ft · 4–6 ft · 6–8 ft · 8 ft +
- Surface to open * — Dirt / gravel · Landscaping / sod · Asphalt · Concrete slab · Finished floor
- Restoration sq ft *
- Two checkboxes: *Interior — hand dig* · *Bypass pumping needed*
- Equipment access — Mini-excavator can reach it · Skid steer only · Hand dig — no machine access
- Photo of the floor with the X marked * — a capture field
- Notes for the estimator — multiline, placeholder *"Gas line 3 ft north, slab is 8 in. with rebar…"*

**7 · DIRECTION CHANGE**

- Footage *
- Which way * — Left turn · Right turn · Drop · Elevation change
- Fitting — 90° · 45° · 22.5° · Sweep / long-turn 90° · Unknown
- Grey note: *"A hard 90 is what a liner and a jetter both struggle to get around, so this matters as much to the quote as the defects do."*
- Notes

**8 · PIPE TRANSITION**

- Footage where this pipe starts *
- Type of pipe * — Cast iron · Clay · PVC · ABS · Orangeburg · Concrete · Ductile iron · Transite · Unknown
- Size of pipe * — 2″ 3″ 4″ 6″ 8″ 10″ 12″ 15″ 18″
- Grey note: *"This runs to the next change, or to the run end. A size change means separate liner setups, so it changes the price."*

---

## The clock face component

Used for orientation in the tie-in and defect forms.

A 172px circle with a 2px light grey border and white fill. Twelve numbers (12 at top,
clockwise) positioned around the inside edge, each a 32px circular tap target.

- Unselected: no fill, no border, grey number
- Selected: green fill `#00803E`, white bold number
- Centre: grey *"tap the position"* when empty, green *"3 o'clock"* or *"3 & 9 o'clock"* when set

---

## Observation rows in Region E

One row per logged item, left-accented in its type colour, with a 44×30 thumbnail of the
captured still, then values, then **EDIT** and **✕** on the right.

```
[img] 12 ft   3 o'clock   Wye · 4"      REINSTATEMENT        [EDIT] [✕]
[img] 24 ft   6 o'clock   Roots         SEVERE   NO LINER    [EDIT] [✕]
[img] 38 ft              Left turn 45°  BEND                 [EDIT] [✕]
[img] 51–55 ft  DIG 1     4–6 ft deep                        [EDIT] [✕]
```

---

## Screen 9 — Closing the run

When **Done adding observations** is pressed:

- The **Run end** card goes to full opacity with a solid pink border and becomes tappable, reading *"Tap to record the footage, pipe type and size where this run finishes."*
- The helper text changes to *"Observations closed. Record the run end above."*
- The button changes to **[ Back to observations ]** in outline style

Tapping the Run end card opens a form in Region C:

- Footage at the end of the run *
- Type of pipe * and Size of pipe * (same option lists as Pipe transition)
- Grey note: *"This becomes the inspected footage for the run and closes the last pipe section."*
- What's there — text, placeholder *"90° fitting, connection to the next pipe, city main…"*

Once saved, both cards are filled and a summary strip appears below them reading
**"84 ft inspected"** in a monospaced face. **Done** in the footer becomes enabled.

---

## Screen 10 — Validation dialog

If **Done** is pressed while the run start and run end pipes differ but no Pipe transition
was logged, show a centred dialog over a dark scrim. 520px wide, pink border.

```
CAN'T FINISH YET

The pipe changes but nothing was logged

This run starts as 6" Cast iron and ends as 6" Clay. A pipe can't
change between those two points without a transition somewhere in
between, and none was recorded.

┌ WHAT TO DO ────────────────────────────────────────────────┐
│ • Scrub back through the video and find where the material │
│   or size changes.                                         │
│ • Capture Observation at that spot and choose Pipe         │
│   transition.                                              │
│ • If the start or end was entered wrong, use CHANGE on the │
│   Run length cards to correct it.                          │
└────────────────────────────────────────────────────────────┘

[ Back to the review ]
```

---

## States to build

| Control | Disabled when |
| --- | --- |
| Capture Observation | The video is playing |
| Any form's Save | Required fields are incomplete |
| Run end card | Before "Done adding observations" is pressed |
| Done | Before "Done adding observations" is pressed |

While the video is playing, the status text turns amber and reads *"Pause where you see
something."*, and any open chooser or form closes.

---

## Visual rules

**Colours** — white panels `#FFFFFF` on a light grey page `#EDF1F4`. Borders `#D2DAE2`.
Text `#16202A`, secondary text `#5F6E7C`. Accents: green `#00803E`, blue `#1B6FB8`, amber
`#A96B00`, pink `#CE1A74`, graphite `#38424E`, purple `#7333D6`.

**Type** — a condensed grotesque for headings, labels and buttons, set **uppercase with
wide letter spacing**. A clean sans for body copy. A **monospaced face for every number
that represents a measurement** — footage, depth, percentages — so figures align.

**Field labels** are uppercase, 11px, wide-tracked, grey. Required fields carry a small
pink "required" tag beside the label. Fields that affect pricing carry a small amber
outlined badge reading **PRICING** — put this on depth band, surface, restoration square
footage, and both pipe type and size fields.

**Selection inverts.** Choice buttons — severity, observation types, yes/no — are white
with coloured text and a coloured border by default, and fill solid with white text when
selected.

**Touch targets** are large. This is used with gloved hands in a basement.

---

## Don't

- Don't put the forms in a modal on top of the video. They appear inline beneath it and push content down.
- Don't hide the logged observation list in a tab or drawer. It stays visible while working.
- Don't add a progress bar or percentage. The number of observations isn't known in advance.
- Don't use colour as the only difference between two things.
- Don't invent friendly microcopy. No exclamation marks, no "Oops", no "Great job". The domain words — tie-in, reinstatement, cleanout, belly — are the correct ones.
