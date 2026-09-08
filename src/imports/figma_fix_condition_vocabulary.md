# Figma Make — Fix the Condition Vocabulary
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, layout, spacing, sizing, type scale and colours already in this
project. This is a data-and-copy fix, not a redesign. If anything here conflicts with an
existing pattern, follow the existing pattern.

---

## The problem

`CONDITION_LABELS` is currently the **severity** vocabulary:

```ts
const CONDITION_LABELS = ["","Minor","Light","Moderate","Severe","Urgent"]
```

Those are the words for grading a **defect** inside a pipe. They're the wrong words for
grading an **asset**, and they're identical to the severity labels used elsewhere, so the two
scales are indistinguishable in the interface.

An asset is graded on its own scale, and it needs a sixth value the current type can't hold.

---

## 1 · Replace the labels

```ts
const CONDITION_LABELS = ["","Good","Fair","Poor","Failing","Critical"]
```

Keep `CONDITION_COLORS` as it is — the existing five colours map correctly:

```ts
const CONDITION_COLORS = ["","#00803E","#7DC242","#A96B00","#FF7A29","#CE1A74"]
```

**Severity labels stay untouched.** Defects keep Minor / Light / Moderate / Severe / Urgent.
Two different scales, two different vocabularies, as it should be.

---

## 2 · Add the sixth value

`Asset.conditionRating` is typed `1|2|3|4|5`. It needs a sixth option for the case where
condition genuinely couldn't be determined — a basin full of debris, a clean-out holding
water, a line too dirty to grade.

**Change the type to:**

```ts
conditionRating?: 1|2|3|4|5|"unable"
```

**Label:** `Unable to fully evaluate`
**Colour:** `#5F6E7C` — the existing dim grey, not a severity colour, because it isn't a grade

Add it to the selector as a sixth option, visually set apart from the five graded ones — a
divider above it, or its own row beneath the scale. It's a different kind of answer.

---

## 3 · Show the full descriptions

The current selector shows only a number and a one-word label. These definitions are what the
grade depends on and they should be readable while choosing, not hidden in a tooltip.

Each option displays its label, its grade number, and the description beneath in the existing
dim body style:

| Label | Grade | Description |
| --- | --- | --- |
| **Good** | 1 | Structurally sound and functioning as intended. No significant deterioration, damage, or excessive buildup observed. Continue routine maintenance and monitoring. |
| **Fair** | 2 | Functional but shows moderate age-related wear, deterioration, buildup, or minor defects. No immediate structural repair is required, but maintenance and continued monitoring are recommended. |
| **Poor** | 3 | Significant deterioration, corrosion, cracking, damaged components, heavy buildup, or other conditions that may affect performance. Repair or rehabilitation should be planned. |
| **Failing** | 4 | Advanced deterioration or structural defects that significantly increase the likelihood of backup, leakage, collapse, or operational failure. Corrective work should be prioritised. |
| **Critical** | 5 | Severe structural deterioration, active failure, major damage, collapse risk, or another condition requiring immediate attention. Repair or replacement is recommended as soon as reasonably possible. |
| **Unable to fully evaluate** | — | Condition could not be completely determined due to standing water, debris, grease, access limitations, or another obstruction. Cleaning, pumping, or additional investigation is recommended before assigning a final condition. |

If the selector is currently a compact row of five numbered buttons and the descriptions won't
fit, switch it to a stacked list of full-width selectable rows — each with a coloured left
bar, the label and grade on one line, and the description beneath.

---

## 4 · When "Unable to fully evaluate" is chosen

Reveal one required field:

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| What prevented assessment | Single-select dropdown | enum | Yes |

**Options:**

```
Full of debris
Standing water
Full of grease
Heavy scale
Access limited — could not reach
Access limited — could not open
Structurally unsafe to enter
Other
```

**Then offer a recommendation**, using the existing recommendation pattern if one exists,
otherwise a simple prompt:

> *This asset couldn't be assessed. Add a recommendation to clear it?*
>
> **[ Add recommendation ]**

Pre-filled with:

| Field | Value |
| --- | --- |
| Recommended action | Derived from what prevented assessment — *Full of debris* → **Pump and clean**; *Standing water* → **Pump**; *Full of grease* or *Heavy scale* → **Hydro-jetting**; *Access limited* → **Clean-out installation** or **Excavate to expose** |
| Priority | Immediate |
| Rationale | *"Condition could not be assessed — [what prevented assessment]. Clearing required before a grade can be assigned."* |

**This is the point of the sixth value.** An unassessable asset is a blocked reserve study,
and the fix is a small, quotable job. Without this option a technician either guesses a grade
or leaves it blank, and both lose the sale.

---

## 5 · Condition applies to every asset type, not only basins

**Condition Rating is currently rendered inside the basin-only block** — the section gated on
`["catch-basin","storm-basin","sanitary-basin"]`. Clean-outs, stacks, drains, pumps and gutter
hubs have no way to be graded at all.

**Move it out of that block into a section shown for every asset type.** Every component in a
reserve study needs a grade, because remaining useful life and the funding year are calculated
from it. An asset with no grade can't enter the schedule.

Place it after the type-specific details and before camera runs, so the sequence reads: where
it is → photos → type-specific details → **condition** → camera runs.

**Keep Depth basin-only.** That one is genuinely specific to basins and should stay where it
is. It's only condition that was wrongly scoped.

**Per-type wording, same scale.** The label can read *Condition Rating* everywhere; no need
for type-specific variants.

---

## 6 · Everywhere the grade is displayed

**An asset graded "Unable to fully evaluate" never shows as a number.** It displays the label
in the dim grey, and it must not be treated as a 5 or averaged into any rollup.

| Place | Behaviour |
| --- | --- |
| Asset detail | The label, in dim grey, with what prevented assessment beneath |
| Asset list rows | The label, not a number |
| Map pin colour | Dim grey, distinct from all five grades |
| Property condition summary | Its own count — *"3 assets could not be assessed"* — separate from the graded ones |
| Reports | Stated plainly with the reason, never presented as a grade |

**Sorting and filtering:** unassessable assets sort after Critical, since in practice they're
the ones needing attention first.

---

## Validation

- `CONDITION_LABELS` no longer contains Minor, Light, Moderate, Severe or Urgent.
- Severity labels for defects are unchanged.
- Condition Rating renders for every asset type, not only basins.
- Depth remains basin-only.
- `Unable to fully evaluate` requires a reason before the asset can be saved.
- An unassessable asset is never rendered as a numeric grade or counted in a numeric average.
