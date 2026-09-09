# Figma Make — Full Length, Camera Stoppage & Obscured Sections
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If anything
here conflicts with an existing pattern, follow the existing pattern.

**This is a prototype with no real data.** Change shapes freely.

**What's already built and needs no change:** the step 3 / step 6 merge, `start-of-pipe`,
`end-of-pipe`, editable observations, progressive enabling in the chooser, footage ordering, and
`Standing water` in the defect type list.

Nine changes in three parts.

---

# PART A · Step 3 — the completeness question

The question **"Was the pipe fully inspected?"** is ambiguous. It could mean *did the camera
reach the end* or *could you see everything*. Those are different facts with different homes.

**Step 3 answers only the first.** Visibility moves entirely to step 5.

## A1 · Rename the question

```
Was the pipe fully inspected?   →   Was the full length of the pipe inspected?
```

## A2 · Two answers, not three

```
Yes · Partially · No   →   Yes · No
```

**"Partially" was carrying the visibility meaning.** You either reached the end of the pipe or
you didn't. A run that reached the city main with forty feet under grease is **Yes** — the full
length was inspected; part of it just couldn't be seen.

## A3 · Pre-fill from the stop reason

| Stop reason | Pre-fills |
| --- | --- |
| Reached the next pipe or structure | **Yes** |
| Reached a connection to the city main | **Yes** |
| Reached another accessible clean-out | **Yes** |
| Reached a basin or manhole | **Yes** |
| Reached a 90° fitting — end of the pipe | **Yes** |
| Reached a septic tank or lift station | **Yes** |
| Camera reel maxed out | **No** |
| Blocked — roots | **No** |
| Blocked — grease | **No** |
| Blocked — scale or hard deposits | **No** |
| Blocked — debris or foreign object | **No** |
| Suspected collapse | **No** |
| Offset or separated joint the head won't pass | **No** |
| Hard bend the head won't pass | **No** |
| Standing water — nothing visible | **No** |
| Pipe too small for the head | **No** |
| Other | **Blank** — the technician answers |

**Overridable in every case.** Pre-filling saves a tap; it doesn't remove the judgement.

## A4 · Remove `assessableFootage` from step 3

Delete the field, its state and its display. **It's a visibility figure**, and visibility is now
recorded as obscured defect observations in step 5 with real footage ranges — measured against
the reel counter rather than estimated before watching the recording.

**Also remove the `notFullyReason` dropdown.** Its options were all visibility reasons —
heavy grease, standing water, sediment, lens fouled. Those are now defect observations. The one
non-visibility option, *camera did not reach the end*, is already the stop reason.

## A5 · When the answer is No, ask for the estimated total length

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Estimated total length | Number, ft | decimal | Yes |
| **How do you know?** | Dropdown | enum | **Yes** |

**Source options:**

```
Located the far end with the sonde
Map distance between access points
Plan drawing or as-built
Far access point is visible — paced it
Assumed from building layout
```

**When the source is `Assumed from building layout`**, show a warning in the existing warning
treatment:

> ⚠ *An assumed length must not be used to order materials. Locate the far end before quoting
> full-length work.*

**This is the field that prevents an expensive mistake** — someone enters 100 ft because two
clean-outs look about that far apart, and liner gets cut to it.

## Step 3 becomes

```
WHY THE CAMERA STOPPED *
[ Blocked — roots                                    ▾ ]

STOP FOOTAGE *
[ 52 ] ft

──────────────────────────────────────────────────────────

WAS THE FULL LENGTH OF THE PIPE INSPECTED? *
[    YES    ]  [    NO    ]                    ← pre-filled: No

ESTIMATED TOTAL LENGTH *          HOW DO YOU KNOW? *
[ 85 ] ft                         [ Map distance between access points  ▾ ]

NOTES
[                                                       ]
```

---

# PART B · Camera Stoppage

## B1 · Add the third boundary type

`ObsType` currently has `start-of-pipe` and `end-of-pipe`. **`camera-stoppage` is missing**, so
a blocked run has nowhere correct to record its end.

```ts
type ObsType =
  | "start-of-pipe"
  | "tie-in" | "defect" | "excavation" | "direction-change" | "pipe-transition"
  | "end-of-pipe" | "camera-stoppage"
```

| Type | Meaning | Total length |
| --- | --- | --- |
| **End of pipe** | The pipe physically ends here | **Known** |
| **Camera Stoppage** | The camera couldn't continue but **the pipe does** | **Unknown** |

**The name matters.** *End of camera* would read as though the camera reached an end. It
didn't — the pipe continues and the camera couldn't.

## B2 · Its fields

Everything End of pipe has — footage defaulting to the step 3 stop footage, pipe type, pipe
size, a still, notes — **plus a required locate**, because that's where an excavation would
begin:

| Field | Control | Data type | Required |
| --- | --- | --- | --- |
| Depth | Number, ft | decimal | **Yes** |
| What's above | Dropdown, the 22 surface options | enum | **Yes** |
| Unit number(s) | Text, shown when Above ground is Unit | string | Conditional |
| Ownership | Dropdown, auto-filled from the surface | enum | **Yes** |
| Surface marked | Painted · Marked on the photo · Not marked | enum | **Yes** |
| **Photo — the mark, close** | Media capture | file | **Yes** |
| **Photo — wide area with a landmark** | Media capture | file | **Yes** |
| Notes for the estimator | Multiline | string | No |

**When ownership resolves to Municipal**, show the existing warning:

> ⚠ *This point is under municipal property. Excavation here means a permit, traffic control,
> and restoration to municipal spec.*

**End of pipe requires no locate.** You reached a known structure — nothing will be excavated
there. **That asymmetry is why the two types exist.**

## B3 · Which end type is selectable

**Driven by the step 3 stop reason** — the same mapping as A3.

| Step 3 stop reason | Selectable | Greyed |
| --- | --- | --- |
| The six "Reached…" reasons | **End of pipe** | Camera Stoppage |
| Reel maxed · any Blocked · Suspected collapse · Offset · Hard bend · Standing water · Pipe too small | **Camera Stoppage** | End of pipe |
| Other | **Both selectable** | — |

**The greyed one explains itself:**

```
Camera Stoppage — greyed
  The camera reached the city main, so the pipe ends here.
  Change the stop reason in step 3 if that's wrong.

End of pipe — greyed
  The camera stopped before the end of the pipe.
  Change the stop reason in step 3 if that's wrong.
```

**Only one of the three boundary types may exist**, and each greys once recorded while staying
editable from the logged list.

## B4 · In the list and the profile

**Camera Stoppage pins last**, like End of pipe, and renders with a **neutral or boundary
treatment** rather than a severity colour — it isn't a defect.

**It carries a marker indicating the run continues past it.** That's the fact the profile's
dashed section depends on.

---

# PART C · Obscured sections

If the camera pushed through twenty feet of grease and kept going, **that twenty feet is a
defect with a footage range** — not a boundary, and not a completeness question. The camera
advanced, the pipe didn't end, and something was in the way.

## C1 · Add the field

```ts
viewObscured?: boolean
```

On `Observation`, alongside `footage` and `footageTo`.

| Field | Control | Shown when |
| --- | --- | --- |
| **View obscured through this section** | Checkbox | `footageTo` is set — the Range checkbox is on |

**Only meaningful with a range.** A point defect can't obscure a length.

**Defaults on for:** Grease · Scale · Standing water · Sediment or debris. **Editable in every
case** — a light grease film doesn't obscure anything.

## C2 · Three distinct profile treatments

| Treatment | Means |
| --- | --- |
| **Solid** | Inspected and visible |
| **Hatched** | The camera passed through but couldn't see |
| **Dashed** | Never inspected — past a Camera Stoppage |

Draw a hatched band over the pipe lane across each obscured observation's footage range.

**A hatched section was reached; a dashed one wasn't.** Three different facts, three treatments.

**Legend entries:**

```
▨  Obscured — passed through, not visible
┈┈ Not inspected — past camera stoppage
```

## C3 · No cross-check, no locate

**There is no comparison against step 3** — `assessableFootage` no longer exists, so there's
nothing to reconcile. No range merging, no mismatch warning.

**An obscured section requires no locate.** Nothing gets excavated because the view was poor. If
a defect inside an obscured section matters, it gets its own CIPP concern with its own locate at
its own footage.

## C4 · In reports

An obscured section is stated as such, never presented as inspected:

> *Twenty feet between 30 and 50 ft could not be visually assessed due to grease. The camera
> passed through and reached the city main.*

**That's a different claim from "we couldn't get past 30 ft"**, and a board reads it
differently.

---

## Validation

**Part A**
- The question reads *"Was the full length of the pipe inspected?"* with two answers, Yes and No.
- It pre-fills from the stop reason per the table, and remains overridable.
- `assessableFootage` and `notFullyReason` no longer exist anywhere.
- Answering No requires an estimated total length **and** a source.
- An assumed source shows the materials warning.

**Part B**
- `camera-stoppage` exists in `ObsType`, and no reference to "End of camera" appears anywhere.
- Camera Stoppage requires depth, what's above, ownership, marking method and both locate photos.
- End of pipe requires no locate.
- Only one of End of pipe / Camera Stoppage is selectable, chosen by the stop reason; `Other` leaves both.
- The greyed type names the stop reason that made it unavailable.
- Camera Stoppage pins last with a boundary treatment and a continues-past marker.

**Part C**
- `viewObscured` exists on `Observation`.
- The checkbox appears only when a footage range is set, defaulting on for the four types listed.
- Obscured sections render hatched, distinct from both solid and dashed.
- No step 3 cross-check or mismatch warning exists.
