# Figma Make — Merge Steps 3 and 6
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

---

## The change

The camera inspection currently has seven steps, with **Why the camera stopped** at step 3 and
**Was the pipe fully inspected?** at step 6 — the analysis sitting between them.

**They belong on the same screen.** The technician watches the entire push live on the monitor.
If forty feet was obscured by grease, they saw it happen — they don't need the recording to
know that. Both questions are answerable the moment the push ends.

**Merge step 6 into step 3 and renumber to six steps:**

```
1  Set up
2  Push
3  Why the camera stopped        ← now also holds completeness
4  Upload the recording
5  Sewer camera analysis
6  Characteristics
```

---

## Step 3 becomes

**Title:** `Why the camera stopped`

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Why the camera stopped | Single-select dropdown | enum | **Yes** |
| Stop footage | `WheelPicker` | decimal | **Yes** |
| **Was the pipe fully inspected?** | Three-option select — Yes · Partially · No | enum | **Yes** |
| Why not fully inspected | Single-select dropdown, shown when not Yes | enum | Conditional |
| Footage actually assessable | `WheelPicker`, shown when not Yes | decimal | No |
| Notes | Multiline | string | No |

**Both option lists are unchanged** — the seventeen stop reasons and the nine
not-fully-inspected reasons stay exactly as they are.

## Layout within the step

A divider between the two questions, since they're different facts:

```
WHY THE CAMERA STOPPED *
[ Reached a connection to the city main              ▾ ]

STOP FOOTAGE *
[ 84 ] ft

─────────────────────────────────────────────────────────

WAS THE PIPE FULLY INSPECTED? *
[    YES    ]  [  PARTIALLY  ]  [    NO    ]

WHY NOT FULLY INSPECTED *
[ Heavy grease obscured the view                     ▾ ]

FOOTAGE ACTUALLY ASSESSABLE
[ 44 ] ft

NOTES
[                                                      ]
```

## They remain two separate stored fields

**Do not combine them into one value.** *Reached a connection to the city main* and *partially
inspected — heavy grease obscured 40 ft* are both true, and both belong on the record and in
reports:

> *Reached a connection to the city main · Partially inspected — heavy grease obscured 40 ft*

A camera can reach the far end of a run and still show nothing useable for part of it.

## The collapsed summary

When the step is complete and collapsed, show both:

```
✓  Why the camera stopped
   Reached a connection to the city main · 84 ft · partially inspected
```

## Next

Disabled until:

- A stop reason is chosen
- A stop footage is entered
- The completeness question is answered
- **And**, when the answer isn't Yes, a reason for that is given

---

## Renumbering

| Was | Now |
| --- | --- |
| 1 Set up | 1 Set up |
| 2 Push | 2 Push |
| 3 Why the camera stopped | 3 Why the camera stopped *(+ completeness)* |
| 4 Upload the recording | 4 Upload the recording |
| 5 Sewer camera analysis | 5 Sewer camera analysis |
| 6 Was the pipe fully inspected? | **removed** |
| 7 Characteristics | **6** Characteristics |

**Update every place the step count appears** — the stepper header, any `STEP N OF 7` label, the
Saved Analyses row summary, and the inspection status text.

---

## All steps stay editable while the visit is open

Unchanged from current behaviour: every completed step keeps its **Change** control, and editing
one doesn't clear the others.

**Footage actually assessable may be refined during analysis** — the technician enters a rough
figure at step 3 and can revise it after watching. That's expected, and the Change control
already allows it.

---

## Validation

- The inspection has six steps, not seven.
- Step 3 holds both the stop reason and the completeness question, separated by a divider.
- They remain two distinct stored fields.
- Next is disabled until both are answered, plus a reason when completeness isn't Yes.
- The collapsed summary shows both facts.
- Every `STEP N OF 7` reference now reads 6.
- Characteristics is step 6.
