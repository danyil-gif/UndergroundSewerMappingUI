# Figma Make — Map Setup Fixes
### Paste everything below this line.

---

## Keep the existing design and style

Build with the components, colours, type scale and spacing already in this project. These are
bug fixes, not a redesign. If anything here conflicts with an existing pattern, follow the
existing pattern.

Two bugs, one root cause between them.

---

# 1 · The file picker never returns a file

## What's wrong

Both upload paths create a detached input element, click it, and discard it:

```tsx
onClick={() => {
  const inp = document.createElement("input")
  inp.type = "file"
  inp.accept = "image/*"
  inp.onchange = (ev) => { const f = ev.target.files?.[0]; if (f) msUpload(f) }
  inp.click()
}}
```

**The element is never added to the document.** The picker opens, but the `change` event does
not reliably fire on a detached element — it's eligible for garbage collection the moment the
arrow function returns, long before the user has chosen a file.

**So `ms.img` stays `null`.** Everything gated on it stays disabled, which is why *Start
measuring* can't be reached.

Drag-and-drop and paste already work, because neither goes through that input.

## The fix

**Mount one real input in the modal's JSX**, held by a ref.

Add a ref alongside the other refs:

```tsx
const msFileRef = useRef<HTMLInputElement>(null)
```

Render it once inside the map setup modal, hidden:

```tsx
<input
  ref={msFileRef}
  type="file"
  accept="image/*"
  style={{ display: "none" }}
  onChange={e => {
    const f = e.target.files?.[0]
    if (f) msUpload(f)
    e.target.value = ""
  }}
/>
```

**Replace both call sites** — the empty-state drop zone at ~line 8252 and the **Replace** button
at ~line 8338 — with:

```tsx
onClick={() => msFileRef.current?.click()}
```

**`e.target.value = ""` is not optional.** Without it, choosing the same file again after a
Replace won't fire `change`, because the input's value hasn't changed.

---

# 2 · Buttons that look disabled but still fire

## What's wrong

Several controls in the rail compute their opacity and cursor from a condition, but don't pass
that condition to `disabled`:

```tsx
style={{ opacity: cond ? 0.32 : 1, cursor: cond ? "not-allowed" : "pointer" }}
```

with an `onClick` that runs regardless.

**The rotate buttons and the fit and size controls are all like this** — greyed out, still
working. That's worse than either state alone, because the interface says one thing and does
another.

## The fix

**Every control whose opacity is conditional gets the same condition on `disabled`.**

```tsx
disabled={cond}
style={{ opacity: cond ? 0.32 : 1, cursor: cond ? "not-allowed" : "pointer" }}
```

**Sweep the whole map setup rail.** Anywhere `opacity: <condition> ? 0.32 : 1` appears on a
`<button>`, there must be a matching `disabled={<condition>}` — the same expression, not a
similar one.

**For the range input** controlling size, `disabled` works the same way.

## Which conditions apply where

| Control | Disabled when |
| --- | --- |
| Rotate ↺ · Rotate ↻ | `!ms.img \|\| ms.done` |
| Size slider · Fit | `!ms.img \|\| ms.done` |
| Replace | `ms.done` |
| Start measuring · Edit | `!ms.img \|\| ms.done` |
| Confirm on a measurement | No distance entered |
| Select area · Adjust area | `!bothDone \|\| ms.done` |
| Finalize map view | `!bothDone \|\| !ms.view` |

**A `disabled` attribute blocks the click. Styling alone does not.**

---

# 3 · While you're in there — one thing to check

**Do not define the measurement section or the measurement line as components nested inside the
map setup component.**

A component defined inside another is recreated on every render, so React treats it as a new
component type and remounts its subtree. Any input inside loses focus after each keystroke —
the symptom is being able to type only one character at a time into the feet or inches field.

**Define them at module level, or call them as plain functions** — `{msSection({ ... })}` rather
than `<MsSection ... />`.

---

## Validation

- Clicking the empty-state drop zone opens a file picker, and choosing a file displays the image.
- Clicking **Replace** and choosing the same file again still updates the image.
- Once an image is loaded, **Start measuring** is enabled on both Length and Width.
- With no image, rotate, size and fit are disabled — and clicking them does nothing.
- Every button that renders at reduced opacity also carries a `disabled` attribute with the same condition.
- Typing into the feet or inches field accepts more than one character.
