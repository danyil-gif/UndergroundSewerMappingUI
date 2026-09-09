# Figma Make — Merge Stack and Stack Clean-Out
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

**This is a prototype with no real data.** Change shapes freely — nothing needs preserving for
compatibility.

---

## The problem

`cleanout-stack` (prefix `CS`) and `stack-no-cleanout` (prefix `SK`) are separate asset types.
They are the same physical pipe in two different states.

Cutting a clean-out into a stack is one of the most common things done on a reserve study. As
built, that means one asset ceases to exist and another appears — the tag changes, the history
splits, and the record reads as two objects where there is only one.

**Whether a stack has a clean-out is an attribute of that stack, not a different kind of
object.**

---

# 1 · Replace two types with one

```ts
type AssetType =
  | "catch-basin" | "storm-basin" | "sanitary-basin"
  | "cleanout-floor" | "cleanout-foundation" | "cleanout-overhead"
  | "stack"
  | "floor-drain" | "gutter-hub" | "turf-drain"
  | "ejector-pump" | "sump-pump"
```

```ts
const ASSET_PREFIX: Record<AssetType, string> = {
  "catch-basin": "CB", "storm-basin": "SB", "sanitary-basin": "SAB",
  "cleanout-floor": "CF", "cleanout-foundation": "CW", "cleanout-overhead": "CO",
  "stack": "STK",
  "floor-drain": "FD", "gutter-hub": "GH", "turf-drain": "TD",
  "ejector-pump": "EP", "sump-pump": "SP",
}
```

**The other three clean-out types stay exactly as they are.** Floor, foundation wall and
overhead are genuine access points in their own right, not a state of something else.

**Update `ASSET_META`** with a single `stack` entry labelled **Stack**.

**Update the sample data.** Replace any `cleanout-stack` or `stack-no-cleanout` entries with
`stack`, and give at least two of them **different `hasCleanout` values** so both icon states
are visible on load.

---

# 2 · New fields on `Asset`

```ts
hasCleanout?: "no" | "pre-existing" | "installed-by-us"
cleanoutSize?: string
cleanoutFitting?: string
stackMaterial?: string
```

The existing `stackSize`, `undergroundConn` and `verticalPipeSize` now apply to a `stack`.

---

# 3 · The stack panel

## Always shown

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Stack size | Dropdown — 2" 3" 4" 6" 8" 10" 12" | enum | Yes |
| Stack material | Dropdown — Cast iron · Clay · PVC · ABS · Copper · Galvanised · Unknown | enum | Yes |
| **Has a clean-out** | Three-option select | enum | Yes |

**Has a clean-out options:**

```
No
Yes — pre-existing
Yes — installed by us
```

Use the existing inverting-choice button style. **No** in the warning colour, both **Yes**
options in the positive colour.

## When "No"

Show a callout using the existing warning treatment:

> **No access on this stack.** A clean-out must be cut in — wye by default — before this line
> can be cameraed.

## When either "Yes"

Reveal:

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Clean-out size | Dropdown — 2" 3" 4" 6" 8" | enum | Yes |
| Fitting | Dropdown — Wye · Tee · Sanitary tee · Combo · Unknown | enum | Yes |
| How it connects underground | Dropdown — One-way 90° · One-way wye · Two-way tee · Two-way sanitary tee · Can't tell | enum | Yes |
| Vertical pipe size | Dropdown — 2" 3" 4" 6" 8" 10" 12" | enum | Yes |

## Why the two Yes answers are separate

A clean-out you found and one you cut in look identical on site and are completely different
commercially. One carries a warranty and belongs in the report as work delivered; the other
doesn't. The system currently can't tell them apart at all.

---

# 4 · Cutting one in never creates a new asset

This is the point of the whole change.

When `hasCleanout` changes from `no` to `installed-by-us`:

| Must happen | Must not happen |
| --- | --- |
| The same asset keeps the same `STK-003` tag | A new asset is created |
| A log entry: `STK-003 clean-out installed — 4" wye` | The old asset is archived |
| The third photo slot unlocks | The tag changes |
| Camera inspection becomes available | The history splits across two records |

The stack's history reads as one continuous record:

```
STK-003 · Stack · Bldg 1 mechanical room · 4" cast iron

  14 Mar   Master Plan     No clean-out — no access
  12 Jun   Excavation      4" wye installed by us · now accessible
```

**Do not offer the archive or replacement flow here.** Installing a clean-out on a stack is not
a replacement — that path stays for basins rebuilt and pipes fully replaced.

---

# 5 · Camera inspection is gated on access

**A stack with `hasCleanout: "no"` cannot start a camera inspection.**

Disable **+ Camera Inspection** and show the reason rather than a dead button:

> *No access on this stack. Cut in a clean-out first.*

Once `hasCleanout` is either Yes value, the button enables normally.

---

# 6 · The icon

**One glyph, two states**, switched on `hasCleanout` rather than on asset type:

| State | Rendering |
| --- | --- |
| `no` | **Dashed** circle, **no plug**, tab above — reads as unfinished |
| `pre-existing` or `installed-by-us` | Solid circle with the square plug, tab above |

**Both drawings already exist** — they're the current `stack-no-cleanout` and `cleanout-stack`
glyphs. Keep both; only what selects between them changes.

The map then shows the state without needing two types, and a stack that still needs a
clean-out cut in stays visually obvious.

---

# 7 · Photos

| Slot | When |
| --- | --- |
| 1 · Wide view of the area | Always |
| 2 · Close up of the stack | Always |
| 3 · Photo after clean-out installation | **Only when `hasCleanout` is `installed-by-us`** |

---

# 8 · The audit

**A stack with no clean-out is not a documentation gap.** It is a correctly recorded state.

Exclude it from outstanding items on close-visit, and surface it instead as a recommendation:
*Clean-out installation required for access.*

Otherwise every reserve study generates false outstanding items on every stack that hasn't been
cut yet.

---

## Validation

- `cleanout-stack` and `stack-no-cleanout` no longer exist anywhere in the file.
- `stack` exists with prefix `STK`, and sample data includes both `hasCleanout` states.
- Changing `hasCleanout` never creates or archives an asset, and never changes the tag.
- A stack with `hasCleanout: "no"` cannot start a camera inspection and shows why.
- The icon switches on the `hasCleanout` attribute, not on asset type.
- The third photo slot appears only when a clean-out was installed by us.
- A stack with no clean-out does not appear as a documentation gap in the close-visit audit.
