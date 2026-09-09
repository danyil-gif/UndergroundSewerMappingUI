import React, { useState, useRef, useMemo, useEffect } from "react";

/* ============================================================
   SIMD — MAP SETUP, ONE WINDOW

   Upload · rotate · resize · measure length · measure width ·
   select the reflected view · finalize.

   Nothing is saved until Finalize. All dot positions are stored
   as percentages of the UNROTATED image, so rotating and
   resizing never move them relative to image features.
   ============================================================ */

const C = {
  bg: "#0F1419", panel: "#161C23", card: "#1C242D", border: "#2A343F",
  text: "#E8EDF2", muted: "#8B97A5", dim: "#5C6875",
  cyan: "#22D3EE", amber: "#F59E0B", green: "#22C55E", red: "#EF4444",
};
const MONO = "'JetBrains Mono','SF Mono',ui-monospace,monospace";
const BODY = "'DM Sans','Segoe UI',system-ui,sans-serif";

/* rotate a point given in unrotated % space into display % space */
const spin = (p, rot) =>
  rot === 90 ? { x: 100 - p.y, y: p.x } :
  rot === 180 ? { x: 100 - p.x, y: 100 - p.y } :
  rot === 270 ? { x: p.y, y: 100 - p.x } : { x: p.x, y: p.y };

/* and back, for storing a click */
const unspin = (p, rot) =>
  rot === 90 ? { x: p.y, y: 100 - p.x } :
  rot === 180 ? { x: 100 - p.x, y: 100 - p.y } :
  rot === 270 ? { x: 100 - p.y, y: p.x } : { x: p.x, y: p.y };

const Label = ({ children, color = C.dim }) => (
  <div style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.1em",
    textTransform: "uppercase", color, marginBottom: 7 }}>{children}</div>
);

const Btn = ({ children, onClick, tone = "ghost", disabled, style }) => {
  const t = {
    solid: { background: C.cyan, color: "#06232B", border: `1px solid ${C.cyan}` },
    ghost: { background: "transparent", color: C.text, border: `1px solid ${C.border}` },
    amber: { background: "transparent", color: C.amber, border: `1px solid ${C.amber}` },
    green: { background: C.green, color: "#052E16", border: `1px solid ${C.green}` },
  }[tone];
  return (
    <button onClick={onClick} disabled={disabled} style={{
      ...t, opacity: disabled ? 0.32 : 1, borderRadius: 6, padding: "8px 12px",
      fontSize: 12, fontWeight: 700, fontFamily: BODY, width: "100%",
      cursor: disabled ? "not-allowed" : "pointer", ...style,
    }}>{children}</button>
  );
};

const NumIn = (p) => (
  <input {...p} style={{ width: "100%", background: C.bg, border: `1px solid ${C.border}`,
    color: C.text, borderRadius: 5, padding: "7px 9px", fontSize: 13,
    fontFamily: MONO, outline: "none", ...(p.style || {}) }} />
);

/* ============================================================ */
export default function App() {
  const [img, setImg] = useState(null);          // data URL
  const [rot, setRot] = useState(0);
  const [zoom, setZoom] = useState(1);

  /* each measurement: { a, b, ft, inches, confirmed }  — a/b in unrotated % */
  const [len, setLen] = useState({ a: null, b: null, ft: "", inches: "", confirmed: false });
  const [wid, setWid] = useState({ a: null, b: null, ft: "", inches: "", confirmed: false });

  const [mode, setMode] = useState(null);        // "len" | "wid" | "view" | null
  const [drag, setDrag] = useState(null);        // active drag descriptor
  const [cursor, setCursor] = useState(null);
  const [view, setView] = useState(null);        // { x, y, w, h } in % of displayed image
  const [viewName, setViewName] = useState("Full property");
  const [done, setDone] = useState(false);

  const wrapRef = useRef(null);
  const fileRef = useRef(null);

  /* ---------- geometry ---------- */

  const box = () => wrapRef.current?.getBoundingClientRect();

  const toPct = (e) => {
    const r = box(); if (!r) return null;
    return {
      x: Math.max(0, Math.min(100, ((e.clientX - r.left) / r.width) * 100)),
      y: Math.max(0, Math.min(100, ((e.clientY - r.top) / r.height) * 100)),
    };
  };

  /* pixel distance between two unrotated-% points, at the CURRENT display size */
  const pxDist = (a, b) => {
    const r = box(); if (!r || !a || !b) return 0;
    const A = spin(a, rot), B = spin(b, rot);
    return Math.hypot((A.x - B.x) / 100 * r.width, (A.y - B.y) / 100 * r.height);
  };

  const totalFt = (m) => (parseFloat(m.ft) || 0) + (parseFloat(m.inches) || 0) / 12;

  /* ft per px — normalised against the natural size so zoom can't change it.
     We divide by zoom, since pxDist measures at the zoomed size. */
  const ratio = (m) => {
    const px = pxDist(m.a, m.b);
    if (!px || !totalFt(m)) return null;
    return totalFt(m) / (px / zoom);
  };

  const rL = len.confirmed ? ratio(len) : null;
  const rW = wid.confirmed ? ratio(wid) : null;
  const scale = rL && rW ? (rL + rW) / 2 : null;
  const agree = rL && rW ? (Math.abs(rL - rW) / ((rL + rW) / 2)) * 100 : null;

  const bothDone = len.confirmed && wid.confirmed;

  /* ---------- interaction ---------- */

  const onImgClick = (e) => {
    if (done) return;
    const p = toPct(e); if (!p) return;
    const u = unspin(p, rot);
    if (mode === "len" && (!len.a || !len.b)) {
      setLen(!len.a ? { ...len, a: u } : { ...len, b: u });
    } else if (mode === "wid" && (!wid.a || !wid.b)) {
      setWid(!wid.a ? { ...wid, a: u } : { ...wid, b: u });
    }
  };

  useEffect(() => {
    if (!drag) return;
    const move = (e) => {
      const p = toPct(e); if (!p) return;

      if (drag.t === "dot") {
        const u = unspin(p, rot);
        const set = drag.m === "len" ? setLen : setWid;
        set((m) => ({ ...m, [drag.k]: u }));
      }

      if (drag.t === "view-move") {
        setView((v) => ({
          ...v,
          x: Math.max(0, Math.min(100 - v.w, drag.ox + (p.x - drag.px))),
          y: Math.max(0, Math.min(100 - v.h, drag.oy + (p.y - drag.py))),
        }));
      }

      if (drag.t === "view-corner") {
        setView(() => {
          const { fx, fy } = drag;                     // the fixed corner
          const x = Math.min(fx, p.x), y = Math.min(fy, p.y);
          const w = Math.max(6, Math.abs(p.x - fx)), h = Math.max(6, Math.abs(p.y - fy));
          return { x, y, w: Math.min(w, 100 - x), h: Math.min(h, 100 - y) };
        });
      }

      if (drag.t === "view-edge") {
        setView((v) => {
          const n = { ...v };
          if (drag.e === "l") { const r = v.x + v.w; n.x = Math.min(p.x, r - 6); n.w = r - n.x; }
          if (drag.e === "r") { n.w = Math.max(6, Math.min(p.x - v.x, 100 - v.x)); }
          if (drag.e === "t") { const b = v.y + v.h; n.y = Math.min(p.y, b - 6); n.h = b - n.y; }
          if (drag.e === "b") { n.h = Math.max(6, Math.min(p.y - v.y, 100 - v.y)); }
          return n;
        });
      }
    };
    const up = () => setDrag(null);
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [drag, rot]);

  const startMeasure = (which) => {
    setMode(which);
    const set = which === "len" ? setLen : setWid;
    set((m) => ({ ...m, confirmed: false }));
  };

  const upload = (f) => {
    if (!f) return;
    const fr = new FileReader();
    fr.onload = () => setImg(fr.result);
    fr.readAsDataURL(f);
  };

  const onPaste = (e) => {
    const it = [...(e.clipboardData?.items || [])].find((i) => i.type.startsWith("image/"));
    if (it) upload(it.getAsFile());
  };

  const enterView = () => {
    setMode("view");
    if (!view) setView({ x: 4, y: 4, w: 92, h: 92 });
  };

  /* selected area in feet */
  const areaFt = useMemo(() => {
    const r = box();
    if (!view || !scale || !r) return null;
    return {
      w: (view.w / 100) * r.width / zoom * scale,
      h: (view.h / 100) * r.height / zoom * scale,
    };
  }, [view, scale, zoom, rot, img]);

  /* ---------- rendering helpers ---------- */

  const measureLine = ({ m, which, color }) => {
    if (!m.a) return null;
    const A = spin(m.a, rot);
    const B = m.b ? spin(m.b, rot) : (mode === which && cursor ? cursor : null);
    const live = mode === which;
    return (
      <>
        {B && (
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%",
            pointerEvents: "none", overflow: "visible" }}>
            <line x1={`${A.x}%`} y1={`${A.y}%`} x2={`${B.x}%`} y2={`${B.y}%`}
              stroke={color} strokeWidth="2"
              strokeDasharray={m.b ? "none" : "5 4"} />
          </svg>
        )}
        {[["a", A], ["b", m.b ? spin(m.b, rot) : null]].map(([k, P]) => P && (
          <div key={k}
            onMouseDown={(e) => { e.stopPropagation(); if (!done && live) setDrag({ t: "dot", m: which, k }); }}
            style={{ position: "absolute", left: `${P.x}%`, top: `${P.y}%`,
              width: 32, height: 32, marginLeft: -16, marginTop: -16,
              display: "flex", alignItems: "center", justifyContent: "center",
              cursor: live && !done ? "grab" : "default", zIndex: 6 }}>
            <div style={{ width: 11, height: 11, borderRadius: 99, background: color,
              border: "2px solid #0F1419" }} />
          </div>
        ))}
        {m.b && m.confirmed && (() => {
          const Bp = spin(m.b, rot);
          return (
            <div style={{ position: "absolute", left: `${(A.x + Bp.x) / 2}%`,
              top: `${(A.y + Bp.y) / 2}%`, transform: "translate(-50%,-50%)",
              background: "#0F1419DD", border: `1px solid ${color}`, borderRadius: 4,
              padding: "2px 7px", fontFamily: MONO, fontSize: 11, color,
              pointerEvents: "none", whiteSpace: "nowrap", zIndex: 7 }}>
              {m.ft} ft{m.inches ? ` ${m.inches} in` : ""}
            </div>
          );
        })()}
      </>
    );
  };

  const section = ({ title, m, which, color }) => {
    const set = which === "len" ? setLen : setWid;
    const placing = mode === which;
    const ready = m.a && m.b;
    return (
      <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
        <Label color={m.confirmed ? C.green : placing ? C.amber : C.dim}>{title}</Label>

        {m.confirmed ? (
          <>
            <div style={{ fontFamily: MONO, fontSize: 14, color: C.green, marginBottom: 3 }}>
              ✓ {m.ft} ft{m.inches ? ` ${m.inches} in` : ""}
            </div>
            <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim, marginBottom: 8 }}>
              {ratio(m)?.toFixed(4)} ft/px
            </div>
            <Btn onClick={() => startMeasure(which)} disabled={done}>Edit</Btn>
          </>
        ) : placing ? (
          <>
            <div style={{ fontSize: 11, color: C.amber, lineHeight: 1.5, marginBottom: 9 }}>
              {!m.a ? "Tap the wall at one end."
                : !m.b ? "Now tap the other end."
                : "Type the distance from your map source."}
            </div>
            {ready && (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <div style={{ flex: 2 }}>
                    <div style={{ fontSize: 9, color: C.dim, marginBottom: 3 }}>FEET</div>
                    <NumIn value={m.ft} inputMode="decimal" placeholder="187"
                      onChange={(e) => set({ ...m, ft: e.target.value })} />
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 9, color: C.dim, marginBottom: 3 }}>INCHES</div>
                    <NumIn value={m.inches} inputMode="numeric" placeholder="0"
                      onChange={(e) => set({ ...m, inches: e.target.value })} />
                  </div>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn tone="solid" disabled={!totalFt(m)}
                    onClick={() => { set({ ...m, confirmed: true }); setMode(null); }}>
                    Confirm
                  </Btn>
                  <Btn onClick={() => { set({ a: null, b: null, ft: "", inches: "", confirmed: false }); setMode(null); }}>
                    Clear
                  </Btn>
                </div>
              </>
            )}
            {!ready && (
              <Btn onClick={() => { set({ a: null, b: null, ft: "", inches: "", confirmed: false }); setMode(null); }}>
                Cancel
              </Btn>
            )}
          </>
        ) : (
          <>
            <div style={{ fontSize: 11, color: C.dim, marginBottom: 8 }}>Not measured</div>
            <Btn onClick={() => startMeasure(which)} disabled={!img || done}>Start measuring</Btn>
          </>
        )}
      </div>
    );
  };

  /* ---------- layout ---------- */

  return (
    <div style={{ background: C.bg, color: C.text, fontFamily: BODY, minHeight: "100vh",
      display: "flex", flexDirection: "column" }} onPaste={onPaste} tabIndex={0}>

      <div style={{ height: 46, borderBottom: `1px solid ${C.border}`, display: "flex",
        alignItems: "center", padding: "0 16px", gap: 12, flexShrink: 0 }}>
        <span style={{ fontWeight: 700, fontSize: 14 }}>Set up the map</span>
        <span style={{ color: C.muted, fontSize: 12 }}>Willow Creek Condominium Association</span>
        {done && <span style={{ marginLeft: "auto", color: C.green, fontSize: 12, fontWeight: 700 }}>
          ✓ FINALIZED
        </span>}
      </div>

      <div style={{ display: "flex", flex: 1, overflow: "hidden" }}>

        {/* ── IMAGE ── */}
        <div style={{ flex: 1, padding: 20, display: "flex", alignItems: "center",
          justifyContent: "center", overflow: "auto", background: "#0B0F13" }}>

          {!img ? (
            <div onClick={() => fileRef.current?.click()}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files?.[0]); }}
              style={{ border: `2px dashed ${C.border}`, borderRadius: 10, padding: 60,
                textAlign: "center", cursor: "pointer", maxWidth: 460 }}>
              <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>
                Drop a map screenshot here
              </div>
              <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.6 }}>
                Click to browse, drag a file in, or paste from the clipboard.
                <br /><br />
                Screenshot the property from your county GIS viewer. Frame the whole property
                with a little margin.
              </div>
            </div>
          ) : (
            <div style={{ position: "relative", transform: `scale(${zoom})`,
              transformOrigin: "center", transition: drag ? "none" : "transform 0.15s" }}>
              <div ref={wrapRef} onClick={onImgClick}
                onMouseMove={(e) => { const p = toPct(e); if (p) setCursor(p); }}
                onMouseLeave={() => setCursor(null)}
                style={{ position: "relative", width: 620, height: 460,
                  cursor: mode === "len" || mode === "wid" ? "crosshair" : "default",
                  border: `1px solid ${C.border}` }}>

                <img src={img} alt="" draggable={false} style={{
                  position: "absolute", inset: 0, width: "100%", height: "100%",
                  objectFit: "contain", transform: `rotate(${rot}deg)`,
                  transformOrigin: "center", userSelect: "none", pointerEvents: "none",
                }} />

                {/* the view overlay */}
                {view && (
                  <>
                    {/* dim outside — four panels */}
                    {[
                      { left: 0, top: 0, width: "100%", height: `${view.y}%` },
                      { left: 0, top: `${view.y + view.h}%`, width: "100%", height: `${100 - view.y - view.h}%` },
                      { left: 0, top: `${view.y}%`, width: `${view.x}%`, height: `${view.h}%` },
                      { left: `${view.x + view.w}%`, top: `${view.y}%`, width: `${100 - view.x - view.w}%`, height: `${view.h}%` },
                    ].map((s, i) => (
                      <div key={i} style={{ position: "absolute", ...s,
                        background: "rgba(11,15,19,0.72)", pointerEvents: "none", zIndex: 4 }} />
                    ))}

                    {/* the selection */}
                    <div
                      onMouseDown={(e) => {
                        if (mode !== "view" || done) return;
                        e.stopPropagation();
                        const p = toPct(e); if (!p) return;
                        setDrag({ t: "view-move", ox: view.x, oy: view.y, px: p.x, py: p.y });
                      }}
                      style={{ position: "absolute", left: `${view.x}%`, top: `${view.y}%`,
                        width: `${view.w}%`, height: `${view.h}%`,
                        border: `2px solid ${C.cyan}`, zIndex: 5,
                        cursor: mode === "view" && !done ? "move" : "default" }}>

                      {/* corners */}
                      {mode === "view" && !done && [
                        ["nw", 0, 0, view.x + view.w, view.y + view.h, "nwse-resize"],
                        ["ne", 100, 0, view.x, view.y + view.h, "nesw-resize"],
                        ["sw", 0, 100, view.x + view.w, view.y, "nesw-resize"],
                        ["se", 100, 100, view.x, view.y, "nwse-resize"],
                      ].map(([k, cx, cy, fx, fy, cur]) => (
                        <div key={k}
                          onMouseDown={(e) => { e.stopPropagation(); setDrag({ t: "view-corner", fx, fy }); }}
                          style={{ position: "absolute", left: `${cx}%`, top: `${cy}%`,
                            width: 28, height: 28, marginLeft: -14, marginTop: -14,
                            display: "flex", alignItems: "center", justifyContent: "center",
                            cursor: cur }}>
                          <div style={{ width: 11, height: 11, background: C.cyan,
                            border: "2px solid #0B0F13", borderRadius: 2 }} />
                        </div>
                      ))}

                      {/* edges */}
                      {mode === "view" && !done && [
                        ["l", { left: 0, top: 0, width: 14, height: "100%", marginLeft: -7 }, "ew-resize"],
                        ["r", { left: "100%", top: 0, width: 14, height: "100%", marginLeft: -7 }, "ew-resize"],
                        ["t", { left: 0, top: 0, height: 14, width: "100%", marginTop: -7 }, "ns-resize"],
                        ["b", { left: 0, top: "100%", height: 14, width: "100%", marginTop: -7 }, "ns-resize"],
                      ].map(([e_, s, cur]) => (
                        <div key={e_}
                          onMouseDown={(ev) => { ev.stopPropagation(); setDrag({ t: "view-edge", e: e_ }); }}
                          style={{ position: "absolute", ...s, cursor: cur }} />
                      ))}
                    </div>
                  </>
                )}

                {measureLine({ m: len, which: "len", color: C.cyan })}
                {measureLine({ m: wid, which: "wid", color: C.amber })}
              </div>
            </div>
          )}

          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }}
            onChange={(e) => upload(e.target.files?.[0])} />
        </div>

        {/* ── RAIL ── */}
        <div style={{ width: 310, background: C.panel, borderLeft: `1px solid ${C.border}`,
          overflowY: "auto", flexShrink: 0 }}>

          {/* image controls */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
            <Label>Image</Label>
            {!img ? (
              <div style={{ fontSize: 11, color: C.dim }}>Upload one to begin.</div>
            ) : (
              <>
                <div style={{ display: "flex", gap: 6, marginBottom: 9 }}>
                  <Btn onClick={() => setRot((r) => (r + 270) % 360)} disabled={done}>↺ 90°</Btn>
                  <Btn onClick={() => setRot((r) => (r + 90) % 360)} disabled={done}>↻ 90°</Btn>
                </div>
                <div style={{ fontSize: 9, color: C.dim, marginBottom: 4 }}>
                  SIZE · {Math.round(zoom * 100)}%
                </div>
                <input type="range" min="0.5" max="2" step="0.05" value={zoom} disabled={done}
                  onChange={(e) => setZoom(parseFloat(e.target.value))}
                  style={{ width: "100%", marginBottom: 8 }} />
                <div style={{ display: "flex", gap: 6 }}>
                  <Btn onClick={() => setZoom(1)} disabled={done}>Fit</Btn>
                  <Btn onClick={() => fileRef.current?.click()} disabled={done}>Replace</Btn>
                </div>
                <div style={{ fontSize: 10, color: C.dim, marginTop: 8, lineHeight: 1.5 }}>
                  Rotating and resizing never move the measurement dots relative to the image.
                </div>
              </>
            )}
          </div>

          {section({ title: "Length", m: len, which: "len", color: C.cyan })}
          {section({ title: "Width", m: wid, which: "wid", color: C.amber })}

          {/* scale */}
          {bothDone && (
            <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}` }}>
              <Label>Scale</Label>
              <div style={{ fontFamily: MONO, fontSize: 13, marginBottom: 4 }}>
                {scale?.toFixed(4)} ft/px
              </div>
              <div style={{ fontFamily: MONO, fontSize: 11,
                color: agree < 3 ? C.green : agree < 8 ? C.amber : C.red }}>
                agreement {agree?.toFixed(1)}%
              </div>
              {agree >= 8 && (
                <div style={{ fontSize: 10, color: C.red, marginTop: 6, lineHeight: 1.5 }}>
                  Check both measurements — one is likely off, or the map is tilted rather than
                  straight down.
                </div>
              )}
            </div>
          )}

          {/* view */}
          <div style={{ padding: "12px 14px", borderBottom: `1px solid ${C.border}`,
            opacity: bothDone ? 1 : 0.4 }}>
            <Label color={view ? C.cyan : C.dim}>Reflected view</Label>
            {!bothDone ? (
              <div style={{ fontSize: 11, color: C.dim }}>Measure length and width first.</div>
            ) : (
              <>
                {!view ? (
                  <Btn tone="solid" onClick={enterView}>Select area</Btn>
                ) : (
                  <>
                    <div style={{ fontSize: 9, color: C.dim, marginBottom: 3 }}>VIEW NAME</div>
                    <NumIn value={viewName} onChange={(e) => setViewName(e.target.value)}
                      style={{ fontFamily: BODY, marginBottom: 9 }} />
                    {areaFt && (
                      <div style={{ fontFamily: MONO, fontSize: 12, color: C.cyan, marginBottom: 9 }}>
                        {areaFt.w.toFixed(0)} ft × {areaFt.h.toFixed(0)} ft
                      </div>
                    )}
                    {!done && (
                      <div style={{ fontSize: 10, color: C.dim, lineHeight: 1.5, marginBottom: 9 }}>
                        Drag a corner to resize, an edge to move one side, or hold inside to move
                        the whole area.
                      </div>
                    )}
                    {mode !== "view" && !done && <Btn onClick={enterView}>Adjust area</Btn>}
                  </>
                )}
              </>
            )}
          </div>

          {/* finalize */}
          <div style={{ padding: 14 }}>
            {done ? (
              <>
                <div style={{ fontSize: 11, color: C.green, lineHeight: 1.6, marginBottom: 10 }}>
                  Saved — image, rotation, both measurements, scale and the selected view.
                </div>
                <div style={{ fontFamily: MONO, fontSize: 10, color: C.dim, lineHeight: 1.7,
                  background: C.bg, border: `1px solid ${C.border}`, borderRadius: 5,
                  padding: 9, marginBottom: 10 }}>
                  Site plan uploaded — {len.ft} ft × {wid.ft} ft measured,
                  scale {scale?.toFixed(4)} ft/px,
                  view {areaFt?.w.toFixed(0)} × {areaFt?.h.toFixed(0)} ft
                </div>
                <Btn onClick={() => { setDone(false); setMode("view"); }}>Change view</Btn>
              </>
            ) : (
              <>
                <Btn tone="green" disabled={!bothDone || !view}
                  onClick={() => { setDone(true); setMode(null); }}>
                  FINALIZE MAP VIEW
                </Btn>
                {!(bothDone && view) && (
                  <div style={{ fontSize: 10, color: C.dim, marginTop: 7, lineHeight: 1.5 }}>
                    {!img ? "Upload a map image."
                      : !len.confirmed ? "Confirm the length measurement."
                      : !wid.confirmed ? "Confirm the width measurement."
                      : "Select the area the main map will show."}
                  </div>
                )}
              </>
            )}
            <div style={{ fontSize: 10, color: C.dim, marginTop: 12, lineHeight: 1.5 }}>
              Measurements lock once finalized. Assets and pipe paths are positioned against
              this scale.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
