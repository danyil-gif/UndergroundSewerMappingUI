# Figma Make — Archive & Restore Instead of Delete
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. If
anything here conflicts with an existing pattern, follow the existing pattern.

---

## The principle

**Nothing with history attached is ever destroyed.**

An asset that has been observed, photographed, cameraed or graded is a record of work someone
did. Deleting it destroys the observations, the inspections, the media and the reason those
records exist — and no amount of care prevents an accidental tap.

But archiving *everything* means the archive fills with pins placed in the wrong spot and
deleted ten seconds later, which makes it useless.

**So three tiers, decided by what's attached.**

---

# 1 · Three tiers

| Tier | When | Behaviour |
| --- | --- | --- |
| **Undo** | Immediately after any delete | A toast with an Undo action, 12 seconds |
| **True delete** | Created during the *current* visit **and** has no observations, photos, inspections or connected pipes | Actually removed. It was a mistake, not a record. |
| **Archive** | Everything else | Hidden but intact, restorable, with everything attached preserved |

The tier is computed, never chosen by the user. The confirmation dialog says which one is
about to happen.

---

# 2 · New fields

On both `Asset` and `Pipe`:

```ts
archived?: boolean
archivedById?: string
archivedOn?: number
archivedDuringVisitId?: string
archiveReason?: string
```

**Archived records stay in the `assets` and `pipes` arrays.** Everything that reads them filters
on `!archived` — the map, the left panel lists, counts, the audit, reports.

---

# 3 · Undo — the first line of defence

**Every delete and archive shows a toast**, bottom-centre, using the existing card and border
styling:

```
┌──────────────────────────────────────────────────┐
│  CB-07 archived              [ Undo ]        ✕   │
└──────────────────────────────────────────────────┘
```

**12 seconds**, then it fades. Clicking **Undo** restores it exactly — same tag, same
observations, same media, same position — and appends a log entry:

```
CB-07 archive undone
```

**This handles nearly every accident.** The archive exists for the ones noticed later.

---

# 4 · The confirmation dialog

Replace the current delete confirmation. **It names exactly what is attached and which tier
applies.**

### When it will be archived

```
┌ ARCHIVE CB-07? ──────────────────────────────────────────────┐
│                                                               │
│  Catch basin · Parking lot, north                             │
│  Added by Dino · Master Plan · 14 Mar                         │
│                                                               │
│  This has history attached and will be archived, not deleted: │
│                                                               │
│    3 observations across 2 visits                             │
│    5 photos                                                   │
│    1 camera inspection with 4 observations                    │
│    2 connected pipes — P-04, P-09                             │
│                                                               │
│  REASON *                                                     │
│  [ Select…                                            ▾ ]     │
│                                                               │
│  ☐ Also archive the 2 connected pipes                         │
│                                                               │
│         [ Archive ]              [ Cancel ]                   │
└───────────────────────────────────────────────────────────────┘
```

**Reason options:**

```
Duplicate — already recorded elsewhere
Doesn't exist — recorded in error
Removed from the property
Replaced by another asset
Wrong asset type — re-recorded correctly
Other
```

**Reason is required.** An archived record with no reason is the thing nobody can interpret
later.

### When it will be truly deleted

```
┌ DELETE CB-08? ───────────────────────────────────────────────┐
│                                                               │
│  Catch basin · no location set                                │
│  Added by you a few moments ago, in this visit                │
│                                                               │
│  Nothing is attached — no observations, photos or pipes.       │
│  This will be removed completely.                             │
│                                                               │
│         [ Delete ]               [ Cancel ]                   │
└───────────────────────────────────────────────────────────────┘
```

**No reason required.** It's a misplaced pin, not a record.

---

# 5 · Connected pipes

Archiving an asset that pipes connect to leaves those pipes with a dangling endpoint.

**The dialog offers a checkbox: `Also archive the N connected pipes`.**

| Choice | Result |
| --- | --- |
| Checked | Both archived together, one undo restores all of them |
| Unchecked | The asset is archived; the pipes remain active with a flagged endpoint |

**A pipe with an archived endpoint** shows a marker in the left panel and on the pipe panel:

> ⚠ *Connects to CB-07, which is archived. Restore it or reconnect this pipe.*

Don't silently orphan anything. The flag is what makes it findable.

---

# 6 · Where archived records live

## A left panel section

Add a fifth key to `leftSectionOpen`: **`archived`**. Matching the existing section pattern,
**collapsed by default**, and hidden entirely when nothing is archived.

```
ARCHIVED · 3                                                   ▾

CB-07   Catch basin       Duplicate            Dino · 14 Mar   [ Restore ]
P-09    COF-01 → CB-07    Doesn't exist        Dino · 14 Mar   [ Restore ]
COF-05  Clean-out floor   Replaced             Nicholas · today [ Restore ]
```

Each row: tag, type or endpoints, archive reason, who and when, and a **Restore** action.

**Tapping a row** opens the record in the right panel, read-only, with everything intact — its
observations, its history, its media, its inspections. Nothing was lost.

The panel header shows an archived banner:

```
⚠ ARCHIVED — Duplicate, already recorded elsewhere
  Archived by Dino · Master Plan · 14 Mar
  [ Restore ]
```

## Restoring

**Restore is one tap, no confirmation.** It clears the archive fields, the record reappears on
the map and in the lists, and a log entry is appended:

```
CB-07 restored from archive
```

**When a restored asset's connected pipes are also archived**, prompt:

> *P-04 and P-09 connect to this asset and are also archived. Restore them too?*

---

# 7 · Everything attached survives

**Archiving touches only the archive fields.** Nothing else is modified or removed:

| Preserved | Why it matters |
| --- | --- |
| Asset observations | The condition history is the record |
| Photos and media | Evidence of what was there |
| Camera inspections and their observations | Hours of work |
| Provenance — created by, last verified | Who recorded it and when |
| Visit log entries | Those record what happened, and it did happen |

**Visit log entries are never removed on archive.** The log says an asset was created on 14
March, because it was. Archiving appends a new entry rather than erasing the old one.

**The asset tag is never reused**, whether archived or truly deleted. `CB-07` stays retired.

---

# 8 · Log entries

| Action | Entry |
| --- | --- |
| Archive | `CB-07 archived — duplicate, already recorded elsewhere` |
| Archive with pipes | `CB-07 archived with 2 connected pipes — duplicate` |
| True delete | `CB-08 deleted — created and removed in this visit` |
| Undo | `CB-07 archive undone` |
| Restore | `CB-07 restored from archive` |

---

# 9 · What archived records are excluded from

| Excluded | |
| --- | --- |
| The map | No pin rendered |
| Left panel asset and pipe lists | Except the Archived section |
| All counts — property, visit, close-visit summary | |
| The pre-departure audit | An archived asset can't have outstanding fields |
| Reports and report blocks | |
| Any condition rollup or grade distribution | |

**Included in:** the Archived section, the visit history, and a direct link from a log entry.

---

## Validation

- The tier is computed from what's attached, never chosen by the user.
- Archiving requires a reason; true deletion does not.
- Every delete and archive shows a 12-second undo toast.
- Undo restores the record identically, including its tag.
- Archived records remain in the state arrays; every consumer filters on `!archived`.
- No observation, photo, inspection or log entry is removed when a record is archived.
- Asset and pipe tags are never reused.
- A pipe with an archived endpoint is flagged, not silently orphaned.
- The Archived section is hidden when nothing is archived.
