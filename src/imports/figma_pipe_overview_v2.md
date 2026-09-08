# Figma Make — Pipe Overview
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, layout, spacing, sizing, type scale, colours and icons already in
this project — **except** the profile graphic, which has an exact specification in section 4.
Reproduce that one precisely.

If anything else here conflicts with an existing pattern, follow the existing pattern.

---

## 1 · Rename the section

In the pipe side panel:

```
CHARACTERISTICS   →   PIPE OVERVIEW
```

Keep the **Edit** button in its current position.

---

## 2 · Widen the panel when a pipe is open

The profile graphic needs roughly 800px to carry its labels. The panel is currently about
500px.

**When a pipe is selected, the right side panel widens to 840px.** Asset panels stay at their
current width. The map compresses to fill the remaining space.

**Add a drag handle on the panel's left edge** so it can be pulled wider or narrower, with the
width remembered.

**Below 700px of available panel width** — narrow windows, tablets in portrait — fall back to
a compact graphic: same lanes, coloured observation ticks, no text labels, with a **Full
Screen** button that opens the full version. This is a fallback, not the default.

The characteristics table also benefits from the extra width, so this isn't only for the
graphic.

---

## 3 · What the section shows

```
PIPE OVERVIEW                                                    [ Edit ]

  From PIPE-001_DS_2024-03-15.mp4 · 15 March 2024 · Nicholas
  Fully inspected · reached the next pipe or structure

  ┌────────────────────────────────────────────────────────────────┐
  │                    PROFILE GRAPHIC — section 4                  │
  └────────────────────────────────────────────────────────────────┘

  START                            END
  Cast iron · 6" · 6.5 ft          Clay · 6" · 8.7 ft

  TOTAL LENGTH                     SLOPE
  127 ft                           1.2%  derived
```

### Source attribution — two lines above the graphic, existing dim-text style

**Line one:** the recording filename, tappable, opening that inspection · the date · the
technician.

**Line two — completeness**, from Step 6 of that inspection:

| Answer | Displays as |
| --- | --- |
| Yes | `Fully inspected · [why the camera stopped]` — positive colour |
| Partially | `Partially inspected — [why not fully] · [N] of [total] ft assessable` — warning colour |
| No | `Not fully inspected — [why not fully]` — warning colour |

Always append **why the camera stopped** to the Yes case. *"Fully inspected · reached the next
pipe or structure"* says more than either half alone.

**Line three, only when a newer inspection exists but isn't complete:**

> *A newer inspection from 12 June is still in progress.*

That's an explanation, not a control. Without it, someone will assume the graphic is broken.

### There is no inspection picker here

**Pipe Overview always draws from the most recent inspection where all seven steps are
complete.** No selector, no mode to leave set wrong.

Viewing an earlier inspection happens in **Saved Analyses**, where each entry already carries
its date. Tapping one shows that inspection's own profile, clearly labelled with its date.

> Pipe Overview answers *what is this pipe now*. Saved Analyses answers *what did we find
> then*. One place per question.

**When no inspection is complete**, fall back to the most recent one with characteristics
recorded and label it:

> *From an inspection still in progress — 12 June*

---

## 4 · The profile graphic — exact specification

Reproduce this exactly. The reference implementation follows; treat the layout, lane order,
colours, label placement and legend as specified rather than as a starting point.

### Structure

Six horizontal lanes on **one shared footage axis**, with left-hand row labels:

| Lane | Label | Content |
| --- | --- | --- |
| 1 | `ABOVE` | Surface zone bands, butted end to end, boundary footages ticked below |
| 2 | `DEPTH` | A single continuous line with a dot and a value at each characteristics row |
| 3 | `PIPE` | The pipe as a solid bar, split into material sections, with access-point markers at each end and a flow arrow |
| 4 | `TIE-INS` | Short stems below the pipe with a dot and a `footage · clock` label |
| 5 | `DEFECTS` | Stems below the pipe into labelled boxes, staggered across two rows |
| 6 | — | Footage axis with ticks, then a legend |

### Colours

```
Text                    #16202A
Dim text / labels       #5F6E7C
Borders                 #D2DAE2

Surface — ordinary      fill #EDF1F4   border #D2DAE2
Surface — finished      fill #FCEFD8   border #D2DAE2
Surface — municipal     fill #FBE3EF   border #CE1A74 at 1.5px, label #8A1150 semibold

Depth line              #5F6E7C at 1.6px, area fill #EDF1F4, dots #38424E
Depth values            #38424E monospace

Pipe — lined            #00803E, label white semibold
Pipe — original         #C6CFD8, label #16202A
Access point            white fill, #1F2933 stroke at 2.5px
Flow arrow              #16202A

Tie-in                  #1B6FB8, stem 2px, dot r=4
Defect — moderate       #A96B00
Defect — severe         #FF7A29, box fill #FDEEE2, text #8A4A12
Defect — critical       #CE1A74, box fill #FBE3EF, text #8A1150
Defect stems            2.5px in the severity colour
```

### Type

Row labels and axis: 11px, dim. Zone names: 11px. Depth values, footages and spans:
11px monospace. Defect box: name 11px semibold in the severity colour, footage 11px monospace
beneath. Legend: 11px dim.

### Reference implementation

Rendered here at 85 ft with a 20 ft lined section, two tie-ins and five defects. Substitute
real values; keep the geometry.

```svg
<svg viewBox="0 0 940 440" width="100%">
  <!-- header -->
  <text x="70" y="26" font-size="15" font-weight="700" fill="#16202A">P-012 · COF-04 → CB-2 · 85 ft</text>
  <text x="300" y="26" font-size="12" fill="#5F6E7C">Poor · original clay · inspected 14 March</text>

  <!-- LANE 1 — surface bands, y=48 h=26 -->
  <text x="48" y="62" font-size="11" fill="#5F6E7C" text-anchor="end">ABOVE</text>
  <rect x="70"  y="48" width="219" height="26" fill="#EDF1F4" stroke="#D2DAE2"/>
  <text x="179" y="65" font-size="11" fill="#16202A" text-anchor="middle">Concrete (basement)</text>
  <rect x="289" y="48" width="334" height="26" fill="#FCEFD8" stroke="#D2DAE2"/>
  <text x="456" y="65" font-size="11" fill="#16202A" text-anchor="middle">Living spaces</text>
  <rect x="623" y="48" width="114" height="26" fill="#FCEFD8" stroke="#D2DAE2"/>
  <text x="680" y="65" font-size="11" fill="#16202A" text-anchor="middle">Lobby</text>
  <rect x="737" y="48" width="143" height="26" fill="#FBE3EF" stroke="#CE1A74" stroke-width="1.5"/>
  <text x="808" y="65" font-size="11" fill="#8A1150" text-anchor="middle" font-weight="600">Street · municipal</text>

  <!-- zone boundaries, dashed down to the pipe -->
  <line x1="289" y1="48" x2="289" y2="182" stroke="#D2DAE2" stroke-dasharray="3 3"/>
  <line x1="623" y1="48" x2="623" y2="182" stroke="#D2DAE2" stroke-dasharray="3 3"/>
  <line x1="737" y1="48" x2="737" y2="182" stroke="#CE1A74" stroke-dasharray="3 3" opacity="0.6"/>
  <text x="293" y="86" font-size="11" fill="#5F6E7C" font-family="monospace">23</text>
  <text x="627" y="86" font-size="11" fill="#5F6E7C" font-family="monospace">58</text>
  <text x="741" y="86" font-size="11" fill="#8A1150" font-family="monospace">70</text>

  <!-- LANE 2 — depth profile -->
  <text x="68" y="112" font-size="11" fill="#5F6E7C" text-anchor="end">DEPTH</text>
  <path d="M70 113.5 L289 116.7 L451 119.9 L623 124.1 L737 130 L880 138.3 L880 146 L70 146 Z" fill="#EDF1F4"/>
  <path d="M70 113.5 L289 116.7 L451 119.9 L623 124.1 L737 130 L880 138.3" fill="none" stroke="#5F6E7C" stroke-width="1.6"/>
  <g fill="#38424E">
    <circle cx="70" cy="113.5" r="3"/><circle cx="289" cy="116.7" r="3"/><circle cx="451" cy="119.9" r="3"/>
    <circle cx="623" cy="124.1" r="3"/><circle cx="737" cy="130" r="3"/><circle cx="880" cy="138.3" r="3"/>
  </g>
  <g font-size="11" fill="#38424E" font-family="monospace" text-anchor="middle">
    <text x="76" y="108">3.8</text><text x="289" y="111">4.5</text><text x="451" y="114">5.2</text>
    <text x="623" y="118">6.1</text><text x="737" y="124">7.4</text><text x="872" y="133">9.2</text>
  </g>

  <!-- LANE 3 — the pipe, y=158 h=24 -->
  <text x="68" y="174" font-size="11" fill="#5F6E7C" text-anchor="end">PIPE</text>
  <rect x="70" y="158" width="191" height="24" fill="#00803E"/>
  <text x="165" y="174" font-size="11" fill="#FFFFFF" text-anchor="middle" font-weight="600">CIPP lined</text>
  <rect x="261" y="158" width="619" height="24" fill="#C6CFD8"/>
  <text x="570" y="174" font-size="11" fill="#16202A" text-anchor="middle">Original clay · 6"</text>

  <!-- access points + flow arrow -->
  <circle cx="70" cy="170" r="9" fill="#FFFFFF" stroke="#1F2933" stroke-width="2.5"/>
  <rect x="66" y="166" width="8" height="8" fill="#1F2933"/>
  <text x="70" y="200" font-size="11" fill="#16202A" text-anchor="middle" font-weight="600">COF-04</text>
  <rect x="871" y="161" width="18" height="18" rx="2" fill="#38424E" stroke="#FFFFFF" stroke-width="1.5"/>
  <text x="880" y="200" font-size="11" fill="#16202A" text-anchor="middle" font-weight="600">CB-2</text>
  <line x1="884" y1="170" x2="894" y2="170" stroke="#16202A" stroke-width="2"/>
  <path d="M898 170 l-10 -5 v10 z" fill="#16202A"/>

  <!-- LANE 4 — tie-ins -->
  <text x="68" y="222" font-size="11" fill="#5F6E7C" text-anchor="end">TIE-INS</text>
  <g stroke="#1B6FB8" stroke-width="2">
    <line x1="174.8" y1="182" x2="174.8" y2="214"/><line x1="298.7" y1="182" x2="298.7" y2="214"/>
  </g>
  <g fill="#1B6FB8" font-size="11" text-anchor="middle">
    <circle cx="174.8" cy="216" r="4"/><circle cx="298.7" cy="216" r="4"/>
    <text x="174.8" y="238">11 ft · 3 o'clock</text>
    <text x="298.7" y="238">24 ft · 9 o'clock</text>
  </g>

  <!-- LANE 5 — defects, stems then staggered boxes -->
  <text x="68" y="272" font-size="11" fill="#5F6E7C" text-anchor="end">DEFECTS</text>
  <line x1="117.6" y1="182" x2="117.6" y2="262" stroke="#CE1A74" stroke-width="2.5"/>
  <line x1="212.9" y1="182" x2="212.9" y2="304" stroke="#FF7A29" stroke-width="2.5"/>
  <line x1="403.5" y1="182" x2="403.5" y2="262" stroke="#FF7A29" stroke-width="2.5"/>
  <line x1="594.1" y1="182" x2="594.1" y2="304" stroke="#CE1A74" stroke-width="2.5"/>
  <line x1="765.6" y1="182" x2="765.6" y2="262" stroke="#CE1A74" stroke-width="2.5"/>

  <g font-size="11">
    <rect x="72"  y="262" width="92" height="30" rx="4" fill="#FBE3EF" stroke="#CE1A74"/>
    <text x="118" y="275" fill="#8A1150" text-anchor="middle" font-weight="600">Crack · Critical</text>
    <text x="118" y="288" fill="#8A1150" text-anchor="middle" font-family="monospace">5 ft</text>
    <rect x="358" y="262" width="92" height="30" rx="4" fill="#FDEEE2" stroke="#FF7A29"/>
    <text x="404" y="275" fill="#8A4A12" text-anchor="middle" font-weight="600">Roots · Severe</text>
    <text x="404" y="288" fill="#8A4A12" text-anchor="middle" font-family="monospace">35 ft</text>
    <rect x="720" y="262" width="92" height="30" rx="4" fill="#FBE3EF" stroke="#CE1A74"/>
    <text x="766" y="275" fill="#8A1150" text-anchor="middle" font-weight="600">Offset · Major</text>
    <text x="766" y="288" fill="#8A1150" text-anchor="middle" font-family="monospace">73 ft</text>

    <rect x="167" y="304" width="92" height="30" rx="4" fill="#FDEEE2" stroke="#FF7A29"/>
    <text x="213" y="317" fill="#8A4A12" text-anchor="middle" font-weight="600">Roots · Severe</text>
    <text x="213" y="330" fill="#8A4A12" text-anchor="middle" font-family="monospace">15 ft</text>
    <rect x="548" y="304" width="92" height="30" rx="4" fill="#FBE3EF" stroke="#CE1A74"/>
    <text x="594" y="317" fill="#8A1150" text-anchor="middle" font-weight="600">Crack · Critical</text>
    <text x="594" y="330" fill="#8A1150" text-anchor="middle" font-family="monospace">55 ft</text>
  </g>

  <!-- LANE 6 — axis and legend -->
  <line x1="70" y1="366" x2="880" y2="366" stroke="#D2DAE2"/>
  <g font-size="11" fill="#5F6E7C" font-family="monospace" text-anchor="middle">
    <line x1="70"    y1="362" x2="70"    y2="370" stroke="#D2DAE2"/><text x="70"    y="384">0</text>
    <line x1="260.6" y1="362" x2="260.6" y2="370" stroke="#D2DAE2"/><text x="260.6" y="384">20</text>
    <line x1="451.2" y1="362" x2="451.2" y2="370" stroke="#D2DAE2"/><text x="451.2" y="384">40</text>
    <line x1="641.8" y1="362" x2="641.8" y2="370" stroke="#D2DAE2"/><text x="641.8" y="384">60</text>
    <line x1="832.4" y1="362" x2="832.4" y2="370" stroke="#D2DAE2"/><text x="832.4" y="384">80</text>
    <text x="880" y="384" fill="#16202A">85 ft</text>
  </g>
  <g font-size="11" fill="#5F6E7C">
    <rect x="70"  y="404" width="12" height="12" fill="#00803E"/><text x="88"  y="414">Lined</text>
    <rect x="140" y="404" width="12" height="12" fill="#C6CFD8"/><text x="158" y="414">Original</text>
    <circle cx="228" cy="410" r="5" fill="#1B6FB8"/><text x="240" y="414">Tie-in</text>
    <rect x="298" y="404" width="12" height="12" fill="#FF7A29"/><text x="316" y="414">Severe</text>
    <rect x="376" y="404" width="12" height="12" fill="#CE1A74"/><text x="394" y="414">Critical</text>
    <rect x="452" y="404" width="12" height="12" fill="#FBE3EF" stroke="#CE1A74"/>
    <text x="470" y="414">Municipal — permit, traffic control, restoration to spec</text>
  </g>
</svg>
```

### Geometry rules

**The axis runs x=70 to x=880**, 810px for the pipe's full length. Footage maps as
`x = 70 + (ft / total) × 810`.

**Defect boxes are 92 × 30 with 4px radius**, centred on their stem, staggered between
y=262 and y=304 so adjacent labels don't collide. Alternate rows; if two boxes on the same
row would still overlap, push the later one to the other row.

**Surface zones butt against each other** with no gaps. Boundary footages print just below
the band, left-aligned to the boundary.

**Depth values sit above their dots**, offset upward so they clear the line.

### Interaction

Tapping a **defect box or stem** opens that observation. Tapping a **tie-in dot** opens that
tie-in. Tapping a **surface zone** shows its footage range, depth range, ownership, and unit
numbers where applicable. Tapping an **access point marker** opens that asset.

**A CIPP concern** — an observation answered Yes in Step 5 — gets a small filled marker on its
defect box so lining blockers are visible at a glance.

### States

**No inspection yet:**

> *No camera inspection yet. This fills in once one is completed.*

**Characteristics never completed:** draw the pipe and observation lanes; leave ABOVE and DEPTH
empty with a line beneath:

> *Depth and surface not recorded — the characteristics step wasn't completed on this
> inspection.*

**Partial inspection:** draw the inspected footage solid and the remainder **dashed** in all
lanes, with the uninspected span labelled `? ft`.

---

## 5 · Where every value comes from

Nothing in this section is typed here.

| Field | Source |
| --- | --- |
| Start — type and diameter | Step 1, size and type at entry |
| Start — depth | Characteristics, Start row |
| End — type and diameter | The last Pipe transition observation; when none, Step 1's entry values |
| End — depth | Characteristics, End row |
| Total length | The inspection's stop footage. When incomplete, the estimated total with an `est.` marker. |
| Slope | Derived — `(end depth − start depth) ÷ total length` as a percentage, with a `derived` marker |
| Surface zones | Characteristics rows |
| Depth profile | Characteristics rows |
| Material sections | Step 1 entry values, split at each Pipe transition observation |
| Tie-ins and defects | Step 5 |
| Completeness | Step 6 |
| Why it stopped | Step 3 |

**The END card currently reads "Not recorded."** It populates from the characteristics End row
and the last pipe transition once an inspection completes. Keep *Not recorded* only when no
completed inspection exists.

---

## 6 · Saved Analyses

Unchanged, with two additions:

**The inspection currently feeding Pipe Overview gets a marker** in the list, so the
relationship between the two sections is visible.

**Tapping any entry shows that inspection's own profile** — the same graphic, drawn from that
inspection, with its date in the header. That's where historical views live.

---

## Validation

- Pipe Overview is read-only. Every value traces to a step in an inspection.
- **Edit** opens the source inspection's characteristics step, not a separate editor.
- Slope is always derived, never entered.
- Total length shows as an estimate when the inspection was partial.
- There is no inspection selector in Pipe Overview.
