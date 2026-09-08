import { useState, useRef, useCallback, useEffect } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetType =
  | "catch-basin" | "storm-basin" | "sanitary-basin"
  | "cleanout-floor" | "cleanout-stack" | "cleanout-foundation" | "cleanout-overhead"
  | "stack-no-cleanout" | "floor-drain" | "gutter-hub" | "turf-drain"
  | "ejector-pump" | "sump-pump"
type Mode = "view" | "add-asset" | "draw-pipe" | "select-area"

interface MapViewRect {
  id: string
  name: string
  x: number   // % from left
  y: number   // % from top
  w: number   // % width
  h: number   // % height
  includedAssets?: string[]   // asset IDs explicitly in this view (undefined = all in bbox)
  includedPipes?: string[]    // pipe IDs explicitly in this view
}

interface ConfirmDialogState {
  title: string
  message: string
  onConfirm: () => void
}
type ObsType = "tie-in" | "defect" | "excavation" | "direction-change" | "pipe-transition"
type Severity = 1 | 2 | 3 | 4 | 5

interface Asset {
  id: string
  type: AssetType
  label: string
  x: number
  y: number
  // Common
  location?: string
  locationOther?: string
  // Basin
  depth?: string
  conditionRating?: 1|2|3|4|5
  // Cleanout
  accessSize?: string
  accessConfig?: string
  undergroundConn?: string
  undergroundConnOther?: string
  verticalPipeSize?: string
  horizontalPipeSize?: string
  // Stack
  stackSize?: string
  // Floor drain / Turf drain
  flowTestDone?: boolean
  flowTestResult?: boolean
  // Ejector / Sump pump
  installDate?: string
  dischargeTestDone?: boolean
  dischargeFunctioning?: boolean
  // Gutter hub
  cameraAccessible?: boolean
  videos?: CamVideo[]
}

interface RoutePoint {
  x: number
  y: number
  assetId?: string  // set when snapped to an asset
}

interface PipeEndpoint {
  type: string
  diameter: string
  depth: string
}

interface PipeTransition {
  id: string
  footage: string   // footage along the run where transition occurs
  type: string      // material/type after transition
  diameter: string  // diameter after transition
}

interface Pipe {
  id: string
  label: string
  fromId: string        // assetId or "free"
  fromX?: number        // used when fromId === "free"
  fromY?: number
  toId: string | null
  toX?: number
  toY?: number
  waypoints: RoutePoint[]  // intermediate routing points
  length: string
  slope: string
  start?: PipeEndpoint
  end?: PipeEndpoint
  transitions?: PipeTransition[]
  videos: CamVideo[]
}

interface CamVideo {
  id: string
  name: string
  date: string
  operator: string
  direction: "upstream" | "downstream"
  observationsClosed: boolean
  runStart?: { footage: string; depth: string; pipeType: string; pipeSize: string }
  runEnd?: { footage: string; depth: string; pipeType: string; pipeSize: string }
  observations: Observation[]
}

interface Observation {
  id: string
  type: ObsType
  footage?: string
  footageTo?: string
  // Tie-in
  tieSubtype?: string
  tieSize?: string
  tieOrientation?: number[]
  tieServes?: string
  // Defect
  defectSubtype?: string
  defectOrientation?: number[]
  severity?: Severity
  // Excavation
  depthBand?: string
  surface?: string
  restoreSqft?: string
  interiorHandDig?: boolean
  bypassPumping?: boolean
  equipmentAccess?: string
  // Direction change
  directionWhich?: string
  directionFitting?: string
  // Pipe transition
  pipeType?: string
  pipeSize?: string
  // Common
  notes?: string
}

// ── Asset type metadata ────────────────────────────────────────────────────────

const ASSET_META: Record<AssetType, { label: string; abbr: string; shape: "circle"|"square"|"diamond"|"triangle"|"hexagon"; group: string }> = {
  "catch-basin":         { label: "Catch Basin",                  abbr: "CB",  shape: "diamond",  group: "basin" },
  "storm-basin":         { label: "Storm Basin",                  abbr: "SB",  shape: "diamond",  group: "basin" },
  "sanitary-basin":      { label: "Sanitary Basin",               abbr: "SAB", shape: "diamond",  group: "basin" },
  "cleanout-floor":      { label: "Clean-out — Floor",            abbr: "CF",  shape: "square",   group: "cleanout" },
  "cleanout-stack":      { label: "Clean-out — Stack Into Floor", abbr: "CS",  shape: "square",   group: "cleanout" },
  "cleanout-foundation": { label: "Clean-out — Foundation Wall",  abbr: "CW",  shape: "square",   group: "cleanout" },
  "cleanout-overhead":   { label: "Clean-out — Overhead",         abbr: "CO",  shape: "square",   group: "cleanout" },
  "stack-no-cleanout":   { label: "Stack — No Clean-out",         abbr: "SK",  shape: "triangle", group: "stack" },
  "floor-drain":         { label: "Floor Drain",                  abbr: "FD",  shape: "circle",   group: "drain" },
  "gutter-hub":          { label: "Gutter Hub",                   abbr: "GH",  shape: "hexagon",  group: "drain" },
  "turf-drain":          { label: "Turf Drain",                   abbr: "TD",  shape: "circle",   group: "drain" },
  "ejector-pump":        { label: "Ejector Pump",                 abbr: "EP",  shape: "hexagon",  group: "pump" },
  "sump-pump":           { label: "Sump Pump",                    abbr: "SP",  shape: "hexagon",  group: "pump" },
}

const ASSET_PREFIX: Record<AssetType, string> = {
  "catch-basin": "CB", "storm-basin": "SB", "sanitary-basin": "SAB",
  "cleanout-floor": "CF", "cleanout-stack": "CS", "cleanout-foundation": "CW", "cleanout-overhead": "CO",
  "stack-no-cleanout": "SK", "floor-drain": "FD", "gutter-hub": "GH", "turf-drain": "TD",
  "ejector-pump": "EP", "sump-pump": "SP",
}

const ALL_ASSET_TYPES = Object.keys(ASSET_META) as AssetType[]

const LOCATION_OPTIONS = ["Basement","Hallway","Outside","Courtyard","Walkway","Front Yard","Unit","Laundry Room","Storage Room","Bike Room","Other"]
const CONDITION_LABELS = ["","Minor","Light","Moderate","Severe","Urgent"]
const CONDITION_COLORS = ["","#00803E","#7DC242","#A96B00","#FF7A29","#CE1A74"]
const CONN_OPTIONS = ["Tee","Wye","Sanitary Tee","90°","Unknown","Other"]

// ── Sample data ────────────────────────────────────────────────────────────────

const SAMPLE_ASSETS: Asset[] = [
  { id: "a1", type: "sanitary-basin",  label: "SAB-001", x: 20, y: 26 },
  { id: "a2", type: "catch-basin",     label: "CB-001",  x: 57, y: 20 },
  { id: "a3", type: "cleanout-floor",  label: "CF-001",  x: 74, y: 63 },
  { id: "a4", type: "floor-drain",     label: "FD-001",  x: 30, y: 70 },
  { id: "a5", type: "ejector-pump",    label: "EP-001",  x: 54, y: 46 },
]

const SAMPLE_PIPES: Pipe[] = [
  {
    id: "p1", label: "PIPE-001", fromId: "a1", toId: "a2",
    waypoints: [], length: "127", slope: "1.2%",
    start: { type: "Cast Iron", diameter: '6"', depth: "6.5" },
    videos: [{
      id: "v1", name: "PIPE-001_DS_2024-03-15.mp4", date: "2024-03-15",
      operator: "J. Martinez", direction: "downstream",
      observationsClosed: false,
      runStart: { footage: "0", depth: "6.5", pipeType: "Cast iron", pipeSize: '6"' },
      observations: [
        { id: "o1", type: "tie-in", footage: "23", tieSubtype: "Wye", tieSize: '4"', tieOrientation: [3], tieServes: "Bldg 1 stack" },
        { id: "o2", type: "defect", footage: "41", defectSubtype: "Crack", defectOrientation: [12], severity: 3 as Severity, notes: "Radial crack at crown, approx 6\" length" },
        { id: "o3", type: "defect", footage: "67", defectSubtype: "Roots", defectOrientation: [9], severity: 2 as Severity, notes: "Root intrusion at joint, estimated 30% blockage" },
        { id: "o4", type: "direction-change", footage: "89", directionWhich: "Left turn", directionFitting: "45°", notes: "Hard bend, jetter will struggle" },
      ]
    }]
  },
  {
    id: "p2", label: "PIPE-002", fromId: "a2", toId: "a5",
    waypoints: [], length: "89", slope: "0.8%",
    videos: []
  },
  {
    id: "p3", label: "PIPE-003", fromId: "a5", toId: "a3",
    waypoints: [], length: "73", slope: "1.5%",
    videos: []
  },
  {
    id: "p4", label: "PIPE-004", fromId: "a4", toId: "a5",
    waypoints: [], length: "54", slope: "2.1%",
    videos: []
  },
]

// ── Colours ────────────────────────────────────────────────────────────────────

const C = {
  bg: "#F0F4F8",
  panel: "#FFFFFF",
  card: "#F8FAFC",
  border: "#DDE3EC",
  cyan: "#0891B2",
  blue: "#0369A1",
  text: "#1E293B",
  muted: "#64748B",
  dim: "#94A3B8",
}

const OBS_COLOR: Record<ObsType, string> = {
  "tie-in": "#1B6FB8",
  "defect": "#A96B00",
  "excavation": "#38424E",
  "direction-change": "#7333D6",
  "pipe-transition": "#00803E",
}

const OBS_LABEL: Record<ObsType, string> = {
  "tie-in": "TIE-IN",
  "defect": "DEFECT",
  "excavation": "EXCAVATION",
  "direction-change": "DIRECTION CHANGE",
  "pipe-transition": "PIPE TRANSITION",
}

const SEV_LABEL = ["", "MINOR", "LIGHT", "MODERATE", "SEVERE", "URGENT"]
const SEV_COLOR = ["", "#00803E", "#7DC242", "#A96B00", "#FF7A29", "#CE1A74"]

const CHOOSER_OPTIONS: { type: ObsType; label: string; desc: string }[] = [
  { type: "tie-in", label: "TIE-IN", desc: "A branch connecting into this run" },
  { type: "defect", label: "DEFECT", desc: "Crack, roots, hole, offset, sag, collapse" },
  { type: "excavation", label: "EXCAVATION POINT", desc: "Somewhere we'd have to open the ground" },
  { type: "direction-change", label: "DIRECTION CHANGE", desc: "Turn, drop, or elevation change" },
  { type: "pipe-transition", label: "PIPE TRANSITION", desc: "Material or diameter changes here" },
]

const TIE_SUBTYPES = ["Wye", "Tee", "Double wye", "Double tee"]
const TIE_SIZES = ['2"', '3"', '4"', '6"', '8"', '10"']
const DEFECT_SUBTYPES = ["Crack", "Roots", "Roots through crack", "Hole", "Offset", "Sagging", "Complete collapse", "Grease", "Scale", "Broken pipe", "Missing bottom"]
const DEPTH_BANDS = ["0–4 ft", "4–6 ft", "6–8 ft", "8 ft +"]
const SURFACES = ["Dirt / gravel", "Landscaping / sod", "Asphalt", "Concrete slab", "Finished floor"]
const EQUIPMENT_ACCESS = ["Mini-excavator can reach it", "Skid steer only", "Hand dig — no machine access"]
const DIRECTION_WAYS = ["Left turn", "Right turn", "Drop", "Elevation change"]
const DIRECTION_FITTINGS = ["90°", "45°", "22.5°", "Sweep / long-turn 90°", "Unknown"]
const PIPE_TYPES = ["Cast iron", "Clay", "PVC", "ABS", "Orangeburg", "Concrete", "Ductile iron", "Transite", "Unknown"]
const PIPE_SIZES = ['2"', '3"', '4"', '6"', '8"', '10"', '12"', '15"', '18"']

// ── Asset icons ────────────────────────────────────────────────────────────────

function AssetIcon({ type, sel, c, size = 28 }: { type: AssetType; sel: boolean; c: string; size?: number }) {
  const meta = ASSET_META[type]
  const abbr = meta.abbr
  const fill = sel ? c : "#E2EDF5"
  const text = sel ? C.bg : c
  const fs = abbr.length > 2 ? 6.5 : 7.5
  const S = size
  const h = S
  if (meta.shape === "circle") return (
    <svg width={S} height={h} viewBox={`0 0 ${S} ${h}`}>
      <circle cx={S/2} cy={h/2} r={S/2-1.5} fill={fill} stroke={c} strokeWidth="1.5" />
      <text x={S/2} y={h/2+fs*0.38} textAnchor="middle" fill={text} fontSize={fs} fontFamily="JetBrains Mono" fontWeight="700">{abbr}</text>
    </svg>
  )
  if (meta.shape === "square") return (
    <svg width={S} height={h} viewBox={`0 0 ${S} ${h}`}>
      <rect x="2" y="2" width={S-4} height={h-4} rx="3" fill={fill} stroke={c} strokeWidth="1.5" />
      <text x={S/2} y={h/2+fs*0.38} textAnchor="middle" fill={text} fontSize={fs} fontFamily="JetBrains Mono" fontWeight="700">{abbr}</text>
    </svg>
  )
  if (meta.shape === "diamond") return (
    <svg width={S} height={h} viewBox={`0 0 ${S} ${h}`}>
      <polygon points={`${S/2},2 ${S-2},${h/2} ${S/2},${h-2} 2,${h/2}`} fill={fill} stroke={c} strokeWidth="1.5" />
      <text x={S/2} y={h/2+fs*0.38} textAnchor="middle" fill={text} fontSize={fs} fontFamily="JetBrains Mono" fontWeight="700">{abbr}</text>
    </svg>
  )
  if (meta.shape === "triangle") return (
    <svg width={S} height={h} viewBox={`0 0 ${S} ${h}`}>
      <polygon points={`${S/2},2 ${S-2},${h-2} 2,${h-2}`} fill={fill} stroke={c} strokeWidth="1.5" />
      <text x={S/2} y={h-6} textAnchor="middle" fill={text} fontSize={fs} fontFamily="JetBrains Mono" fontWeight="700">{abbr}</text>
    </svg>
  )
  // hexagon
  const hx = (i: number) => S/2 + (S/2-2)*Math.cos((i*60-90)*Math.PI/180)
  const hy = (i: number) => h/2 + (h/2-2)*Math.sin((i*60-90)*Math.PI/180)
  const pts = [0,1,2,3,4,5].map(i => `${hx(i)},${hy(i)}`).join(" ")
  return (
    <svg width={S} height={h} viewBox={`0 0 ${S} ${h}`}>
      <polygon points={pts} fill={fill} stroke={c} strokeWidth="1.5" />
      <text x={S/2} y={h/2+fs*0.38} textAnchor="middle" fill={text} fontSize={fs} fontFamily="JetBrains Mono" fontWeight="700">{abbr}</text>
    </svg>
  )
}

function AssetNode({ asset, selected, drawActive, scale, onClick, onMouseDown, onTouchStart, dimmed }: {
  asset: Asset; selected: boolean; drawActive: boolean; scale: number; dimmed?: boolean
  onClick: () => void; onMouseDown: (e: React.MouseEvent) => void; onTouchStart?: (e: React.TouchEvent) => void
}) {
  const c = drawActive ? "#F59E0B" : "#1a1a1a"
  return (
    <div
      style={{
        position: "absolute", left: `${asset.x}%`, top: `${asset.y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "center center",
        cursor: "pointer", zIndex: 10,
        filter: selected ? `drop-shadow(0 0 6px ${c}88)` : dimmed ? "grayscale(0.6)" : undefined,
        opacity: dimmed ? 0.25 : 1,
        transition: "filter 0.2s, transform 0.15s, opacity 0.2s",
      }}
      onClick={onClick}
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
    >
      <AssetIcon type={asset.type} sel={selected} c={c} size={28} />
      <div style={{
        position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
        marginTop: 3, fontSize: 9, fontFamily: "JetBrains Mono",
        color: selected ? c : C.muted, whiteSpace: "nowrap",
        textShadow: selected ? `0 0 8px ${c}88` : undefined,
      }}>
        {asset.label}
      </div>
    </div>
  )
}

// ── Clock face ────────────────────────────────────────────────────────────────

function ClockFace({ selected, multi, onChange }: { selected: number[]; multi: boolean; onChange: (v: number[]) => void }) {
  const R = 72
  const cr = R - 2
  const nr = cr - 18
  const hours = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  const toggle = (h: number) => {
    if (!multi) { onChange(selected[0] === h ? [] : [h]); return }
    if (selected.includes(h)) { onChange(selected.filter(x => x !== h)); return }
    if (selected.length < 2) { onChange([...selected, h]) }
  }
  const label = selected.length === 0 ? "tap the position" : selected.length === 1 ? `${selected[0]} o'clock` : `${selected[0]} & ${selected[1]} o'clock`
  return (
    <svg width={R * 2} height={R * 2} style={{ userSelect: "none", flexShrink: 0 }}>
      <circle cx={R} cy={R} r={cr} fill="#fff" stroke="#D2DAE2" strokeWidth="1.5" />
      {hours.map((h, i) => {
        const a = (i / 12) * 2 * Math.PI - Math.PI / 2
        const x = R + nr * Math.cos(a)
        const y = R + nr * Math.sin(a)
        const sel = selected.includes(h)
        return (
          <g key={h} onClick={() => toggle(h)} style={{ cursor: "pointer" }}>
            <circle cx={x} cy={y} r={14} fill={sel ? "#00803E" : "transparent"} />
            <text x={x} y={y + 4} textAnchor="middle" fill={sel ? "#fff" : "#5F6E7C"} fontSize="10" fontFamily="JetBrains Mono" fontWeight={sel ? "700" : "400"}>{h}</text>
          </g>
        )
      })}
      <text x={R} y={R + 4} textAnchor="middle" fill={selected.length > 0 ? "#00803E" : "#94A3B8"} fontSize="8.5" fontFamily="JetBrains Mono">{label}</text>
    </svg>
  )
}

// ── Inspection form atoms ─────────────────────────────────────────────────────

const inputSt: React.CSSProperties = {
  width: "100%", padding: "6px 8px", background: "#fff",
  borderTop: "1px solid #D2DAE2", borderRight: "1px solid #D2DAE2",
  borderBottom: "1px solid #D2DAE2", borderLeft: "1px solid #D2DAE2",
  borderRadius: 4, color: "#16202A",
  fontSize: 11, fontFamily: "JetBrains Mono", outline: "none", boxSizing: "border-box",
}

function FieldLabel({ text, pricing }: { text: string; pricing?: boolean }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 5 }}>
      <span style={{ fontSize: 9, fontWeight: 600, color: "#5F6E7C", letterSpacing: "0.09em", textTransform: "uppercase" }}>{text}</span>
      {pricing && <span style={{ fontSize: 8, fontWeight: 600, color: "#A96B00", borderTop: "1px solid #A96B0055", borderRight: "1px solid #A96B0055", borderBottom: "1px solid #A96B0055", borderLeft: "1px solid #A96B0055", borderRadius: 3, padding: "0px 4px", letterSpacing: "0.06em" }}>PRICING</span>}
    </div>
  )
}

// Parse decimal feet string → { ft, inches }
function parseFtIn(val: string): { ft: number; inches: number } {
  const f = parseFloat(val) || 0
  const ft = Math.floor(Math.max(0, f))
  const inches = Math.min(11, Math.round((f - ft) * 12))
  return { ft, inches }
}
// Format { ft, inches } → display string like  23' 8"
function fmtFtIn(val: string): string {
  const { ft, inches } = parseFtIn(val)
  return inches === 0 ? `${ft}'` : `${ft}' ${inches}"`
}

function WheelPicker({ value, onChange, max = 200 }: {
  value: string; onChange: (v: string) => void; max?: number
}) {
  const ITEM_H = 36
  const VISIBLE = 5
  const BG = "#16202A"

  const { ft: currentFt, inches: currentIn } = parseFtIn(value)

  const ftRef = useRef<HTMLDivElement>(null)
  const inRef = useRef<HTMLDivElement>(null)
  const ftLock = useRef(false)
  const inLock = useRef(false)
  const ftTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const inTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const scrollTo = (el: HTMLDivElement | null, idx: number, lock: React.MutableRefObject<boolean>) => {
    if (!el) return
    lock.current = true
    el.scrollTop = idx * ITEM_H
    setTimeout(() => { lock.current = false }, 160)
  }

  useEffect(() => { scrollTo(ftRef.current, currentFt, ftLock) }, [currentFt])
  useEffect(() => { scrollTo(inRef.current, currentIn, inLock) }, [currentIn])

  const emit = () => {
    const ftEl = ftRef.current
    const inEl = inRef.current
    if (!ftEl || !inEl) return
    const ft = Math.max(0, Math.min(max, Math.round(ftEl.scrollTop / ITEM_H)))
    const inches = Math.max(0, Math.min(11, Math.round(inEl.scrollTop / ITEM_H)))
    onChange(String(ft + inches / 12))
  }

  const onFtScroll = () => {
    if (ftLock.current) return
    if (ftTimer.current) clearTimeout(ftTimer.current)
    ftTimer.current = setTimeout(emit, 90)
  }
  const onInScroll = () => {
    if (inLock.current) return
    if (inTimer.current) clearTimeout(inTimer.current)
    inTimer.current = setTimeout(emit, 90)
  }

  const feetItems = Array.from({ length: max + 1 }, (_, i) => i)
  const inchItems = Array.from({ length: 12 }, (_, i) => i)
  const viewH = ITEM_H * VISIBLE

  const colScroll = (
    items: number[], ref: React.RefObject<HTMLDivElement | null>,
    current: number, onScroll: () => void, unit: string
  ) => (
    <div style={{ flex: 1, height: viewH, overflow: "hidden" }}>
      <div ref={ref} onScroll={onScroll} style={{
        width: "calc(100% + 18px)", height: "100%",
        overflowY: "scroll", scrollSnapType: "y mandatory",
        scrollPaddingTop: ITEM_H * 2, paddingTop: ITEM_H * 2, paddingBottom: ITEM_H * 2,
        boxSizing: "content-box",
      }}>
        {items.map(n => {
          const sel = n === current
          return (
            <div key={n} style={{
              height: ITEM_H, display: "flex", alignItems: "center", justifyContent: "center", gap: 4,
              scrollSnapAlign: "start", userSelect: "none",
              color: sel ? "#ffffff" : "rgba(255,255,255,0.18)",
              transition: "color 0.1s",
            }}>
              <span style={{ fontSize: sel ? 22 : 16, fontWeight: sel ? 700 : 400, fontFamily: "JetBrains Mono", lineHeight: 1 }}>{n}</span>
              {sel && <span style={{ fontSize: 12, fontWeight: 500, color: "rgba(255,255,255,0.6)", fontFamily: "JetBrains Mono" }}>{unit}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )

  return (
    <div style={{ position: "relative", display: "flex", width: 148, height: viewH, borderRadius: 10, overflow: "hidden", background: BG }}>
      {/* Selection band */}
      <div style={{ position: "absolute", top: ITEM_H * 2, left: 0, right: 0, height: ITEM_H, background: "rgba(255,255,255,0.1)", borderRadius: 6, zIndex: 1, pointerEvents: "none" }} />
      {/* Top fade */}
      <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: ITEM_H * 1.7, background: `linear-gradient(to bottom, ${BG}, transparent)`, zIndex: 2, pointerEvents: "none" }} />
      {/* Bottom fade */}
      <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: ITEM_H * 1.7, background: `linear-gradient(to top, ${BG}, transparent)`, zIndex: 2, pointerEvents: "none" }} />
      {colScroll(feetItems, ftRef, currentFt, onFtScroll, "ft")}
      <div style={{ width: 1, background: "rgba(255,255,255,0.07)", margin: "10px 0", zIndex: 3 }} />
      {colScroll(inchItems, inRef, currentIn, onInScroll, '"')}
    </div>
  )
}

function FootageRow({ footage, footageTo, onChange, onChangeTo, max }: {
  footage: string; footageTo?: string
  onChange: (v: string) => void; onChangeTo?: (v: string) => void
  max?: number
}) {
  const [open, setOpen] = useState<"from" | "to" | null>(null)
  const [popY, setPopY] = useState(0)
  const [popX, setPopX] = useState(0)
  const [toTouched, setToTouched] = useState(false)
  const fromRef = useRef<HTMLButtonElement>(null)
  const toRef = useRef<HTMLButtonElement>(null)

  const handleFromChange = (v: string) => {
    onChange(v)
    if (!toTouched && onChangeTo) onChangeTo(v)
  }
  const handleToChange = (v: string) => {
    setToTouched(true)
    onChangeTo?.(v)
  }

  const openPicker = (which: "from" | "to") => {
    const btn = which === "from" ? fromRef.current : toRef.current
    if (btn) {
      const r = btn.getBoundingClientRect()
      setPopX(r.left + r.width / 2)
      setPopY(r.top)
    }
    setOpen(which)
  }

  const chipSt: React.CSSProperties = {
    padding: "5px 11px", fontSize: 13, fontWeight: 700, fontFamily: "JetBrains Mono",
    background: "#F8FAFC", color: "#16202A",
    border: "1.5px solid #D2DAE2", borderRadius: 6, cursor: "pointer",
    letterSpacing: "-0.01em", lineHeight: 1,
  }

  const POPUP_H = 36 * 5 + 44  // wheel height + button + padding

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <div style={{ fontSize: 9, fontWeight: 600, color: "#5F6E7C", letterSpacing: "0.09em", textTransform: "uppercase", whiteSpace: "nowrap" }}>
          {onChangeTo !== undefined ? "FROM *" : "FOOTAGE *"}
        </div>
        <button ref={fromRef} onClick={() => openPicker("from")} style={{ ...chipSt, borderColor: open === "from" ? "#00803E" : "#D2DAE2", background: open === "from" ? "#F0FAF5" : "#F8FAFC" }}>
          {fmtFtIn(footage || "0")}
        </button>
        {onChangeTo !== undefined && (
          <>
            <span style={{ fontSize: 11, color: "#CBD5E1" }}>→</span>
            <div style={{ fontSize: 9, fontWeight: 600, color: "#5F6E7C", letterSpacing: "0.09em", textTransform: "uppercase" }}>TO</div>
            <button ref={toRef} onClick={() => openPicker("to")} style={{ ...chipSt, borderColor: open === "to" ? "#00803E" : "#D2DAE2", background: open === "to" ? "#F0FAF5" : "#F8FAFC" }}>
              {fmtFtIn(footageTo || footage || "0")}
            </button>
          </>
        )}
      </div>

      {open && (
        <div style={{ position: "fixed", inset: 0, zIndex: 9990 }} onClick={() => setOpen(null)}>
          <div
            onClick={e => e.stopPropagation()}
            style={{
              position: "absolute",
              left: Math.min(popX - 74, window.innerWidth - 160),
              top: Math.max(8, popY - POPUP_H - 10),
              width: 148,
              background: "#16202A",
              borderRadius: 14,
              overflow: "hidden",
              boxShadow: "0 8px 32px rgba(0,0,0,0.45)",
              display: "flex", flexDirection: "column",
            }}
          >
            <div style={{ padding: "10px 0 6px", textAlign: "center", fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.4)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
              {open === "from" ? (onChangeTo !== undefined ? "From" : "Footage") : "To"}
            </div>
            <WheelPicker
              value={open === "from" ? (footage || "0") : (footageTo || footage || "0")}
              onChange={v => { open === "from" ? handleFromChange(v) : handleToChange(v) }}
              max={max}
            />
            <button onClick={() => setOpen(null)} style={{ margin: "8px 10px 10px", padding: "8px", background: "#00803E", color: "#fff", border: "none", borderRadius: 7, fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'DM Sans', sans-serif" }}>
              Done
            </button>
          </div>
        </div>
      )}
    </>
  )
}

function ChipField({ label, options, value, onChange, color, pricing }: { label: string; options: string[]; value: string; onChange: (v: string) => void; color: string; pricing?: boolean }) {
  return (
    <div>
      <FieldLabel text={label} pricing={pricing} />
      <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
        {options.map(opt => {
          const sel = value === opt
          return (
            <button key={opt} onClick={() => onChange(sel ? "" : opt)} style={{ padding: "4px 9px", fontSize: 9.5, borderRadius: 4, cursor: "pointer", background: sel ? color : "#fff", color: sel ? "#fff" : color, border: `1.5px solid ${color}`, fontWeight: sel ? 700 : 400, transition: "all 0.1s" }}>
              {opt}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function FormActions({ onSave, onCancel, disabled }: { onSave: () => void; onCancel: () => void; disabled?: boolean }) {
  return (
    <div style={{ display: "flex", gap: 7, marginTop: 2 }}>
      <button onClick={onCancel} style={{ flex: 1, padding: "8px", fontSize: 10.5, background: "transparent", color: "#5F6E7C", border: "1px solid #D2DAE2", borderRadius: 5, cursor: "pointer" }}>Cancel</button>
      <button onClick={onSave} disabled={!!disabled} style={{ flex: 2, padding: "8px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", background: disabled ? "#EDF1F4" : "#16202A", color: disabled ? "#94A3B8" : "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: disabled ? "default" : "pointer" }}>
        Save
      </button>
    </div>
  )
}

// ── Small UI atoms ─────────────────────────────────────────────────────────────

function Label({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>
      {children}
    </div>
  )
}

function Section({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div style={{ padding: "14px 16px", borderBottom: `1px solid ${C.border}`, ...style }}>
      {children}
    </div>
  )
}

function InputField({ label, value, onChange, placeholder, type }: {
  label: string; value: string; onChange: (v: string) => void
  placeholder?: string; type?: string
}) {
  return (
    <div>
      <div style={{ fontSize: 9, color: C.muted, marginBottom: 3 }}>{label}</div>
      <input
        type={type || "text"}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        style={{
          width: "100%", padding: "6px 8px", background: C.panel,
          border: `1px solid ${C.border}`, borderRadius: 4, color: C.text,
          fontSize: 11, fontFamily: "JetBrains Mono", outline: "none", boxSizing: "border-box",
        }}
      />
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [assets, setAssets] = useState<Asset[]>(SAMPLE_ASSETS)
  const [pipes, setPipes] = useState<Pipe[]>(SAMPLE_PIPES)
  const [mapImage, setMapImage] = useState<string | null>(null)
  const [mapImageProps, setMapImageProps] = useState({ x: 10, y: 10, w: 60, h: 60, rotation: 0, opacity: 0.85 })
  const [showMapMenu, setShowMapMenu] = useState(false)
  const [editingMap, setEditingMap] = useState(false)
  const [mapDrag, setMapDrag] = useState<{
    type: "move" | "tl" | "tr" | "bl" | "br"
    startMX: number; startMY: number
    startProps: { x: number; y: number; w: number; h: number }
  } | null>(null)
  const [mode, setMode] = useState<Mode>("view")
  const [addAssetType, setAddAssetType] = useState<AssetType>("catch-basin")
  const [drawFrom, setDrawFrom] = useState<string | null>(null)        // assetId start
  const [drawFromCoord, setDrawFromCoord] = useState<{ x: number; y: number; pipeId: string } | null>(null) // pipe-snap start
  const [drawPoints, setDrawPoints] = useState<RoutePoint[]>([])
  const [drawMouse, setDrawMouse] = useState<{ x: number; y: number } | null>(null)
  const [drawHoverPtIdx, setDrawHoverPtIdx] = useState<number | null>(null) // index of drawPoint being hovered for removal
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null)
  const [selectedPipeId, setSelectedPipeId] = useState<string | null>("p1")
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>("v1")
  const [dragId, setDragId] = useState<string | null>(null)
  const [dragOffset, setDragOffset] = useState({ dx: 0, dy: 0 })
  const [lockedAssetIds, setLockedAssetIds] = useState<Set<string>>(new Set(SAMPLE_ASSETS.map(a => a.id)))
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null)
  const [hoverPipeId, setHoverPipeId] = useState<string | null>(null)
  const [leftPanelOpen, setLeftPanelOpen] = useState(true)
  const [rightPanelOpen, setRightPanelOpen] = useState(true)
  const [leftSectionOpen, setLeftSectionOpen] = useState({ infra: true, assets: true, pipes: true })
  const [iconScaleByType, setIconScaleByType] = useState<Record<AssetType, number>>(Object.fromEntries(ALL_ASSET_TYPES.map(t => [t, 1])) as Record<AssetType, number>)
  const [pipeScale, setPipeScale] = useState(1)
  const [globalIconScale, setGlobalIconScale] = useState(1)
  // All asset types + "pipes" selected by default
  const ALL_SCALE_KEYS = [...ALL_ASSET_TYPES, "pipes"] as const
  const [scaleSelected, setScaleSelected] = useState<Set<string>>(new Set(ALL_SCALE_KEYS))
  const [showIconScaleDropdown, setShowIconScaleDropdown] = useState(false)
  const [showLegendDropdown, setShowLegendDropdown] = useState(false)
  const [mapZoom, setMapZoom] = useState(1)
  const [mapPan, setMapPan] = useState({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ mx: 0, my: 0, px: 0, py: 0 })
  const lastPinchDist = useRef<number | null>(null)
  const [mapViews, setMapViews] = useState<MapViewRect[]>([])
  const [selectedViewId, setSelectedViewId] = useState<string | null>(null)
  const [selectStart, setSelectStart] = useState<{ x: number; y: number } | null>(null)
  const [selectCurrent, setSelectCurrent] = useState<{ x: number; y: number } | null>(null)
  const [pendingView, setPendingView] = useState<{ x: number; y: number; w: number; h: number } | null>(null)
  const [newViewName, setNewViewName] = useState("")
  const [pendingViewAssets, setPendingViewAssets] = useState<string[]>([])
  const [pendingViewPipes, setPendingViewPipes] = useState<string[]>([])
  const [viewDialogStep, setViewDialogStep] = useState<"name" | "checklist">("name")
  const [editingViewId, setEditingViewId] = useState<string | null>(null)
  const [editViewName, setEditViewName] = useState("")
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState | null>(null)
  const [activeTabId, setActiveTabId] = useState<"main" | string>("main")
  const [editingPipe, setEditingPipe] = useState(false)
  const [pipeForm, setPipeForm] = useState<{
    start: PipeEndpoint
    end: PipeEndpoint
    length: string
    slope: string
    transitions: PipeTransition[]
  }>({ start: { type: "", diameter: "", depth: "" }, end: { type: "", diameter: "", depth: "" }, length: "", slope: "", transitions: [] })
  const [showVideoForm, setShowVideoForm] = useState(false)
  const [videoForm, setVideoForm] = useState({ name: "", date: "", operator: "", direction: "downstream" as "upstream" | "downstream" })
  const [videoDragOver, setVideoDragOver] = useState(false)
  const [videoPlaying, setVideoPlaying] = useState(false)
  const [captureStep, setCaptureStep] = useState<"none" | "chooser" | ObsType>("none")
  const [captureForm, setCaptureForm] = useState<Record<string, unknown>>({})
  const [showRunEndForm, setShowRunEndForm] = useState(false)
  const [runEndForm, setRunEndForm] = useState({ footage: "", depth: "", pipeType: "PVC", pipeSize: '4"' })
  const [inspectionFullscreen, setInspectionFullscreen] = useState(false)
  const [assetVideoSource, setAssetVideoSource] = useState<{ assetId: string; videoId: string } | null>(null)
  const [incompletePipeIds, setIncompletePipeIds] = useState<Set<string>>(new Set())

  const mapRef = useRef<HTMLDivElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // ── Map zoom/pan via wheel and touch ─────────────────────────────────────────
  useEffect(() => {
    const el = mapRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      if (mode !== "view") return
      e.preventDefault()
      const rect = el.getBoundingClientRect()
      const ox = (e.clientX - rect.left) / rect.width   // 0–1 pivot point
      const oy = (e.clientY - rect.top) / rect.height
      const delta = e.deltaY < 0 ? 1.1 : 1 / 1.1
      setMapZoom(z => {
        const next = Math.min(Math.max(z * delta, 0.25), 8)
        const ratio = next / z
        setMapPan(p => ({ x: ox - 0.5 - (ox - 0.5 - p.x) * ratio, y: oy - 0.5 - (oy - 0.5 - p.y) * ratio }))
        return next
      })
    }
    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        lastPinchDist.current = Math.hypot(dx, dy)
      }
    }
    const onTouchMove = (e: TouchEvent) => {
      if (e.touches.length === 2) {
        e.preventDefault()
        const dx = e.touches[0].clientX - e.touches[1].clientX
        const dy = e.touches[0].clientY - e.touches[1].clientY
        const dist = Math.hypot(dx, dy)
        if (lastPinchDist.current !== null) {
          const delta = dist / lastPinchDist.current
          const rect = el.getBoundingClientRect()
          const cx = (e.touches[0].clientX + e.touches[1].clientX) / 2
          const cy = (e.touches[0].clientY + e.touches[1].clientY) / 2
          const ox = (cx - rect.left) / rect.width
          const oy = (cy - rect.top) / rect.height
          setMapZoom(z => {
            const next = Math.min(Math.max(z * delta, 0.25), 8)
            const ratio = next / z
            setMapPan(p => ({ x: ox - 0.5 - (ox - 0.5 - p.x) * ratio, y: oy - 0.5 - (oy - 0.5 - p.y) * ratio }))
            return next
          })
        }
        lastPinchDist.current = dist
      }
    }
    const onTouchEnd = () => { lastPinchDist.current = null }
    el.addEventListener("wheel", onWheel, { passive: false })
    el.addEventListener("touchstart", onTouchStart, { passive: true })
    el.addEventListener("touchmove", onTouchMove, { passive: false })
    el.addEventListener("touchend", onTouchEnd, { passive: true })
    return () => {
      el.removeEventListener("wheel", onWheel)
      el.removeEventListener("touchstart", onTouchStart)
      el.removeEventListener("touchmove", onTouchMove)
      el.removeEventListener("touchend", onTouchEnd)
    }
  }, [mode])

  // Close icon-size dropdown on outside click
  useEffect(() => {
    if (!showIconScaleDropdown) return
    const handler = () => setShowIconScaleDropdown(false)
    document.addEventListener("mousedown", handler)
    return () => document.removeEventListener("mousedown", handler)
  }, [showIconScaleDropdown])

  // Escape to exit map editing mode
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && editingMap) { setEditingMap(false); setMapDrag(null) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [editingMap])

  // Refs so the zoom effect always reads fresh data without them being deps
  const mapViewsRef = useRef(mapViews)
  const assetsRef = useRef(assets)
  useEffect(() => { mapViewsRef.current = mapViews }, [mapViews])
  useEffect(() => { assetsRef.current = assets }, [assets])

  // After layout settles, zoom + pan to the active view (or fit all assets on main)
  useEffect(() => {
    if (!mapRef.current) return
    const rect = mapRef.current.getBoundingClientRect()
    const VW = rect.width
    const VH = rect.height
    if (VW === 0 || VH === 0) return
    const SCALE = 40
    const padding = 0.88

    const activeView = activeTabId !== "main"
      ? mapViewsRef.current.find(v => v.id === activeTabId) ?? null
      : null

    if (!activeView) {
      const all = assetsRef.current
      if (all.length > 0) {
        const minX = Math.min(...all.map(a => a.x))
        const maxX = Math.max(...all.map(a => a.x))
        const minY = Math.min(...all.map(a => a.y))
        const maxY = Math.max(...all.map(a => a.y))
        const pad = 8
        const bx = Math.max(0, minX - pad)
        const by = Math.max(0, minY - pad)
        const bw = Math.min(100, maxX + pad) - bx
        const bh = Math.min(100, maxY + pad) - by
        const z = Math.min(VW / (bw * SCALE), VH / (bh * SCALE)) * padding
        setMapZoom(z)
        setMapPan({ x: -((bx + bw / 2) * SCALE - 2000) * z / VW, y: -((by + bh / 2) * SCALE - 2000) * z / VH })
      } else {
        setMapZoom(1)
        setMapPan({ x: 0, y: 0 })
      }
      return
    }

    const z = Math.min(VW / (activeView.w * SCALE), VH / (activeView.h * SCALE)) * padding
    setMapZoom(z)
    setMapPan({ x: -((activeView.x + activeView.w / 2) * SCALE - 2000) * z / VW, y: -((activeView.y + activeView.h / 2) * SCALE - 2000) * z / VH })
  }, [activeTabId])

  const applyZoomStep = (direction: 1 | -1) => {
    setMapZoom(z => {
      const next = Math.min(Math.max(z * (direction > 0 ? 1.25 : 1 / 1.25), 0.25), 8)
      setMapPan(p => ({ x: p.x * (next / z), y: p.y * (next / z) }))
      return next
    })
  }

  const selectedAsset = assets.find(a => a.id === selectedAssetId)
  const selectedPipe = pipes.find(p => p.id === selectedPipeId)
  const selectedVideo = assetVideoSource
  ? assets.find(a => a.id === assetVideoSource.assetId)?.videos?.find(v => v.id === assetVideoSource.videoId)
  : selectedPipe?.videos.find(v => v.id === selectedVideoId)
  const assetPipes = selectedAsset ? pipes.filter(p => p.fromId === selectedAsset.id || p.toId === selectedAsset.id) : []

  // ── Map interaction ──────────────────────────────────────────────────────────

  // Convert screen coords → canvas % coords (0–100 over the 4000px canvas)
  // Canvas is 4000×4000px centered in the pan/zoom wrapper.
  // Transform on wrapper: translate(pan.x*100%, pan.y*100%) scale(zoom) origin=50%50%
  // Derivation: cx = (clientX - rect.left - rect.width/2 - pan.x*rect.width) / (zoom * CANVAS_SCALE) + 50
  const CANVAS_SCALE = 40 // 4000px / 100% = 40px per %
  const toContentCoords = useCallback((clientX: number, clientY: number): { x: number; y: number } => {
    if (!mapRef.current) return { x: 0, y: 0 }
    const rect = mapRef.current.getBoundingClientRect()
    const rawX = (clientX - rect.left - rect.width  * (0.5 + mapPan.x)) / (mapZoom * CANVAS_SCALE) + 50
    const rawY = (clientY - rect.top  - rect.height * (0.5 + mapPan.y)) / (mapZoom * CANVAS_SCALE) + 50
    if (activeTabId === "main") return { x: rawX, y: rawY }
    const view = mapViews.find(v => v.id === activeTabId)
    if (!view) return { x: rawX, y: rawY }
    const S = 100 / view.w
    return { x: rawX / S + view.x, y: rawY / S + view.y }
  }, [activeTabId, mapViews, mapZoom, mapPan])

  const getTouchXY = (e: React.TouchEvent) => {
    const t = e.touches[0] ?? e.changedTouches[0]
    return { clientX: t.clientX, clientY: t.clientY }
  }

  const handleMapMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (mapDrag || editingMap) return
    // Middle mouse or plain left-click drag → pan (always available)
    if (e.button === 1 || (e.button === 0 && (mode === "view" || e.altKey))) {
      e.preventDefault()
      setIsPanning(true)
      setPanStart({ mx: e.clientX, my: e.clientY, px: mapPan.x, py: mapPan.y })
      return
    }
    if (mode !== "select-area" || !mapRef.current) return
    e.stopPropagation()
    const { x, y } = toContentCoords(e.clientX, e.clientY)
    setSelectStart({ x, y })
    setSelectCurrent({ x, y })
  }, [mode, toContentCoords, mapPan, mapDrag, editingMap, mapZoom])

  const completePipe = useCallback(() => {
    const hasStart = drawFrom || drawFromCoord
    if (!hasStart || drawPoints.length === 0) return
    const last = drawPoints[drawPoints.length - 1]
    const toAssetId = last.assetId ?? null
    const waypoints = drawPoints.slice(0, toAssetId ? -1 : undefined).map(({ x, y }) => ({ x, y }))
    const newPipe: Pipe = {
      id: `p${Date.now()}`,
      label: `PIPE-${String(pipes.length + 1).padStart(3, "0")}`,
      fromId: drawFrom ?? "free",
      fromX: drawFromCoord?.x,
      fromY: drawFromCoord?.y,
      toId: toAssetId,
      toX: toAssetId ? undefined : last.x,
      toY: toAssetId ? undefined : last.y,
      waypoints,
      length: "", slope: "",
      videos: [],
    }
    setPipes(prev => [...prev, newPipe])
    setDrawFrom(null)
    setDrawFromCoord(null)
    setDrawPoints([])
    setDrawMouse(null)
    setDrawHoverPtIdx(null)
    setMode("view")
    setSelectedPipeId(newPipe.id)
    setSelectedAssetId(null)
    setSelectedVideoId(null)
    setEditingPipe(true)
    setPipeForm({ start: { type: "", diameter: "", depth: "" }, end: { type: "", diameter: "", depth: "" }, length: "", slope: "", transitions: [] })
  }, [drawFrom, drawFromCoord, drawPoints, pipes])

  const handleMapClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (dragId || mode === "select-area") return
    if (!mapRef.current) return
    const drawStarted = drawFrom || drawFromCoord
    // double-click while drawing = complete
    if (mode === "draw-pipe" && drawStarted && e.detail === 2) {
      completePipe()
      return
    }
    const { x, y } = toContentCoords(e.clientX, e.clientY)
    if (mode === "add-asset") {
      const typeCount = assets.filter(a => a.type === addAssetType).length + 1
      const newId = `a${Date.now()}`
      setAssets(prev => [...prev, {
        id: newId, type: addAssetType,
        label: `${ASSET_PREFIX[addAssetType]}-${String(typeCount).padStart(3, "0")}`,
        x, y,
      }])
      setLockedAssetIds(prev => new Set([...prev, newId]))
      setSelectedAssetId(newId)
      setSelectedPipeId(null)
      setMode("view")
      return
    }
    if (mode === "draw-pipe") {
      if (drawStarted) {
        // If hovering near an existing waypoint, remove all points from that index onward
        if (drawHoverPtIdx !== null) {
          setDrawPoints(prev => prev.slice(0, drawHoverPtIdx))
          setDrawHoverPtIdx(null)
          return
        }
        setDrawPoints(prev => [...prev, { x, y }])
      }
    }
  }, [mode, addAssetType, assets, dragId, drawFrom, drawFromCoord, drawHoverPtIdx, completePipe, toContentCoords])

  const handleAssetClick = useCallback((assetId: string) => {
    if (mode === "draw-pipe") {
      const drawStarted = drawFrom || drawFromCoord
      if (!drawStarted) {
        // First click: set start from asset
        setDrawFrom(assetId)
        setDrawFromCoord(null)
        setDrawPoints([])
      } else {
        // Subsequent click on an asset: add as a snapped routing point
        const asset = assets.find(a => a.id === assetId)
        if (asset) setDrawPoints(prev => [...prev, { x: asset.x, y: asset.y, assetId }])
      }
      return
    }
    setSelectedAssetId(assetId)
    setSelectedPipeId(null)
    setSelectedVideoId(null)
    setRightPanelOpen(true)
  }, [mode, drawFrom, assets])

  const handleAssetMouseDown = useCallback((e: React.MouseEvent, assetId: string) => {
    if (mode !== "view") return
    e.stopPropagation()
    // Only drag if asset is in edit-location mode (not locked)
    if (lockedAssetIds.has(assetId) && editingLocationId !== assetId) return
    const asset = assets.find(a => a.id === assetId)
    if (!asset) return
    // Compute cursor position in content-space and record offset from asset center
    const cursorContent = toContentCoords(e.clientX, e.clientY)
    setDragOffset({ dx: asset.x - cursorContent.x, dy: asset.y - cursorContent.y })
    setDragId(assetId)
  }, [mode, assets, toContentCoords, lockedAssetIds, editingLocationId])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!mapRef.current) return
    if (mapDrag) {
      // Delta in screen px → canvas % (canvas is 4000px = 100%, 1% = 40px)
      const dxPct = (e.clientX - mapDrag.startMX) / (mapZoom * 40)
      const dyPct = (e.clientY - mapDrag.startMY) / (mapZoom * 40)
      const sp = mapDrag.startProps
      setMapImageProps(prev => {
        let { x, y, w, h } = sp
        switch (mapDrag.type) {
          case "move": x = sp.x + dxPct; y = sp.y + dyPct; break
          case "tl":   x = sp.x + dxPct; y = sp.y + dyPct; w = Math.max(5, sp.w - dxPct); h = Math.max(5, sp.h - dyPct); break
          case "tr":   y = sp.y + dyPct; w = Math.max(5, sp.w + dxPct); h = Math.max(5, sp.h - dyPct); break
          case "bl":   x = sp.x + dxPct; w = Math.max(5, sp.w - dxPct); h = Math.max(5, sp.h + dyPct); break
          case "br":   w = Math.max(5, sp.w + dxPct); h = Math.max(5, sp.h + dyPct); break
        }
        return { ...prev, x, y, w, h }
      })
      return
    }
    if (isPanning) {
      const rect = mapRef.current.getBoundingClientRect()
      const dx = (e.clientX - panStart.mx) / rect.width
      const dy = (e.clientY - panStart.my) / rect.height
      setMapPan({ x: panStart.px + dx, y: panStart.py + dy })
      return
    }
    const { x, y } = toContentCoords(e.clientX, e.clientY)
    if (dragId) {
      setAssets(prev => prev.map(a => a.id === dragId ? { ...a, x: Math.max(0, Math.min(100, x + dragOffset.dx)), y: Math.max(0, Math.min(100, y + dragOffset.dy)) } : a))
    }
    if (selectStart) {
      setSelectCurrent({ x: Math.max(0, Math.min(100, x)), y: Math.max(0, Math.min(100, y)) })
    }
    const drawStarted = drawFrom || drawFromCoord
    if (mode === "draw-pipe" && drawStarted) {
      setDrawMouse({ x, y })
      // Detect hover over an existing waypoint (within 3% of map space)
      const SNAP_DIST = 3.5
      let found: number | null = null
      for (let i = 0; i < drawPoints.length; i++) {
        const dx = drawPoints[i].x - x
        const dy = drawPoints[i].y - y
        if (Math.sqrt(dx * dx + dy * dy) < SNAP_DIST) { found = i; break }
      }
      setDrawHoverPtIdx(found)
    }
  }, [dragId, selectStart, toContentCoords, mode, drawFrom, drawFromCoord, drawPoints, isPanning, panStart, mapDrag, mapZoom])

  const handleMouseUp = useCallback(() => {
    setMapDrag(null)
    setIsPanning(false)
    setDragId(null)
    if (selectStart && selectCurrent) {
      const x = Math.min(selectStart.x, selectCurrent.x)
      const y = Math.min(selectStart.y, selectCurrent.y)
      const w = Math.abs(selectCurrent.x - selectStart.x)
      const h = Math.abs(selectCurrent.y - selectStart.y)
      if (w > 3 && h > 3) {
        setPendingView({ x, y, w, h })
        setNewViewName(`View ${mapViews.length + 1}`)
        setMode("view")
      }
      setSelectStart(null)
      setSelectCurrent(null)
    }
  }, [selectStart, selectCurrent, mapViews, mapDrag])

  // ── Data mutations ───────────────────────────────────────────────────────────

  const savePipe = () => {
    if (!selectedPipeId) return
    setPipes(prev => prev.map(p => p.id === selectedPipeId ? {
      ...p,
      start: pipeForm.start,
      end: pipeForm.end,
      length: pipeForm.length,
      slope: pipeForm.slope,
      transitions: pipeForm.transitions,
    } : p))
    setEditingPipe(false)
  }

  const applyAnalysisToPipe = (pipeId: string) => {
    const pipe = pipes.find(p => p.id === pipeId)
    if (!pipe) return
    const bestVideo = [...pipe.videos].reverse().find(v => v.runStart && v.runEnd)
    if (!bestVideo) return
    const rs = bestVideo.runStart!
    const re = bestVideo.runEnd!
    const length = String(Math.abs(parseFloat(re.footage) - parseFloat(rs.footage)).toFixed(0))
    setPipes(prev => prev.map(p => p.id === pipeId ? {
      ...p,
      start: { type: rs.pipeType, diameter: rs.pipeSize, depth: rs.depth },
      end:   { type: re.pipeType, diameter: re.pipeSize, depth: re.depth },
      length,
    } : p))
  }

  const addVideoWithName = (name: string) => {
    const vid: CamVideo = {
      id: `v${Date.now()}`, name, date: new Date().toISOString().slice(0, 10),
      operator: "", direction: "downstream", observationsClosed: false, observations: [],
    }
    return vid
  }

  const addVideo = (name = "Camera Run") => {
    if (!selectedPipeId) return
    const vid = addVideoWithName(name)
    setPipes(prev => prev.map(p => p.id === selectedPipeId ? { ...p, videos: [...p.videos, vid] } : p))
    setSelectedVideoId(vid.id)
    setShowVideoForm(false)
    setVideoForm({ name: "", date: "", operator: "", direction: "downstream" })
  }

  const addAssetVideo = (assetId: string, name = "Camera Run") => {
    const vid = addVideoWithName(name)
    setAssets(prev => prev.map(a => a.id === assetId ? { ...a, videos: [...(a.videos ?? []), vid] } : a))
    setAssetVideoSource({ assetId, videoId: vid.id })
    setInspectionFullscreen(true)
    setCaptureStep("none")
    setVideoPlaying(false)
    setShowVideoForm(false)
    setVideoForm({ name: "", date: "", operator: "", direction: "downstream" })
  }

  const saveObservation = () => {
    const obs: Observation = { id: `obs${Date.now()}`, type: captureStep as ObsType, ...captureForm } as Observation
    if (assetVideoSource) {
      setAssets(prev => prev.map(a => a.id === assetVideoSource.assetId ? {
        ...a, videos: (a.videos ?? []).map(v => v.id === assetVideoSource.videoId ? { ...v, observations: [...v.observations, obs] } : v)
      } : a))
    } else {
      if (!selectedPipeId || !selectedVideoId) return
      setPipes(prev => prev.map(p =>
        p.id === selectedPipeId
          ? { ...p, videos: p.videos.map(v => v.id === selectedVideoId ? { ...v, observations: [...v.observations, obs] } : v) }
          : p
      ))
    }
    setCaptureStep("none")
    setCaptureForm({})
  }

  const deleteObservation = (obsId: string) => {
    if (assetVideoSource) {
      setAssets(prev => prev.map(a => a.id === assetVideoSource.assetId ? {
        ...a, videos: (a.videos ?? []).map(v => v.id === assetVideoSource.videoId ? { ...v, observations: v.observations.filter(o => o.id !== obsId) } : v)
      } : a))
    } else {
      if (!selectedPipeId || !selectedVideoId) return
      setConfirmDialog({
        title: "Remove Observation",
        message: "Remove this observation? This cannot be undone.",
        onConfirm: () => {
          setPipes(prev => prev.map(p =>
            p.id === selectedPipeId
              ? { ...p, videos: p.videos.map(v => v.id === selectedVideoId ? { ...v, observations: v.observations.filter(o => o.id !== obsId) } : v) }
              : p
          ))
        },
      })
    }
  }

  const saveRunEnd = () => {
    if (!runEndForm.footage) return
    if (assetVideoSource) {
      setAssets(prev => prev.map(a => a.id === assetVideoSource.assetId ? {
        ...a, videos: (a.videos ?? []).map(v => v.id === assetVideoSource.videoId ? {
          ...v, runEnd: { footage: runEndForm.footage, depth: runEndForm.depth, pipeType: runEndForm.pipeType, pipeSize: runEndForm.pipeSize }
        } : v)
      } : a))
    } else {
      if (!selectedPipeId || !selectedVideoId) return
      setPipes(prev => prev.map(p =>
        p.id === selectedPipeId
          ? { ...p, videos: p.videos.map(v => v.id === selectedVideoId ? { ...v, runEnd: { footage: runEndForm.footage, depth: runEndForm.depth, pipeType: runEndForm.pipeType, pipeSize: runEndForm.pipeSize } } : v) }
          : p
      ))
    }
    setShowRunEndForm(false)
    setRunEndForm({ footage: "", depth: "", pipeType: "PVC", pipeSize: '4"' })
  }

  const setObsClosed = (closed: boolean) => {
    if (assetVideoSource) {
      setAssets(prev => prev.map(a => a.id === assetVideoSource.assetId ? {
        ...a, videos: (a.videos ?? []).map(v => v.id === assetVideoSource.videoId ? { ...v, observationsClosed: closed } : v)
      } : a))
    } else {
      if (!selectedPipeId || !selectedVideoId) return
      setPipes(prev => prev.map(p =>
        p.id === selectedPipeId
          ? { ...p, videos: p.videos.map(v => v.id === selectedVideoId ? { ...v, observationsClosed: closed } : v) }
          : p
      ))
    }
    if (closed) setCaptureStep("none")
  }

  const handleMapUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = ev => {
      const src = ev.target?.result as string
      setMapImage(src)
      // Detect natural image dimensions to size it without stretching
      const img = new Image()
      img.onload = () => {
        const CANVAS = 4000
        const maxW = 60  // max % of canvas width
        const aspect = img.naturalWidth / img.naturalHeight
        const w = maxW
        const h = (w / aspect) * (CANVAS / CANVAS) // stays in % since canvas is square-ish
        const x = (100 - w) / 2
        const y = (100 - h) / 2
        setMapImageProps({ x, y, w, h: w / aspect, rotation: 0, opacity: 0.85 })
      }
      img.src = src
    }
    reader.readAsDataURL(file)
    e.target.value = ""
  }

  // ── Select helpers ───────────────────────────────────────────────────────────

  const selectPipe = (id: string) => {
    setSelectedPipeId(id); setSelectedAssetId(null); setSelectedVideoId(null)
    setEditingPipe(false); setMode("view"); setRightPanelOpen(true)
  }

  const selectAsset = (id: string) => {
    setSelectedAssetId(id); setSelectedPipeId(null); setSelectedVideoId(null)
    setEditingPipe(false); setMode("view"); setRightPanelOpen(true)
  }

  // ── Confirm-gated deletions ──────────────────────────────────────────────────

  const deleteAsset = (id: string) => {
    const a = assets.find(x => x.id === id)
    const linked = pipes.filter(p => p.fromId === id || p.toId === id)
    setConfirmDialog({
      title: "Delete Asset",
      message: `Delete ${a?.label}?${linked.length ? ` This will also remove ${linked.length} connected pipe${linked.length > 1 ? "s" : ""}.` : ""}`,
      onConfirm: () => {
        const linkedIds = linked.map(p => p.id)
        setPipes(prev => prev.filter(p => !linkedIds.includes(p.id)))
        setAssets(prev => prev.filter(x => x.id !== id))
        if (selectedAssetId === id) setSelectedAssetId(null)
        if (selectedPipeId && linkedIds.includes(selectedPipeId)) { setSelectedPipeId(null); setSelectedVideoId(null) }
      },
    })
  }

  const deletePipe = (id: string) => {
    const p = pipes.find(x => x.id === id)
    setConfirmDialog({
      title: "Delete Pipe",
      message: `Delete ${p?.label}? All associated camera inspections and observations will be permanently removed.`,
      onConfirm: () => {
        setPipes(prev => prev.filter(x => x.id !== id))
        if (selectedPipeId === id) { setSelectedPipeId(null); setSelectedVideoId(null) }
      },
    })
  }

  const deleteVideo = (pipeId: string, videoId: string) => {
    const vid = pipes.find(p => p.id === pipeId)?.videos.find(v => v.id === videoId)
    setConfirmDialog({
      title: "Delete Inspection Video",
      message: `Delete "${vid?.name}"? All ${vid?.observations.length ?? 0} observation${vid?.observations.length !== 1 ? "s" : ""} will be permanently lost.`,
      onConfirm: () => {
        setPipes(prev => prev.map(p => p.id === pipeId ? { ...p, videos: p.videos.filter(v => v.id !== videoId) } : p))
        if (selectedVideoId === videoId) setSelectedVideoId(null)
      },
    })
  }

  const deleteMapView = (id: string) => {
    const v = mapViews.find(x => x.id === id)
    setConfirmDialog({
      title: "Delete Map View",
      message: `Delete "${v?.name}"? This cannot be undone.`,
      onConfirm: () => {
        setMapViews(prev => prev.filter(x => x.id !== id))
        if (selectedViewId === id) setSelectedViewId(null)
        if (activeTabId === id) setActiveTabId("main")
      },
    })
  }

  const openViewChecklist = () => {
    if (!pendingView) return
    // Pre-select all assets/pipes inside the bounding box
    const bboxAssets = assets.filter(a =>
      a.x >= pendingView.x && a.x <= pendingView.x + pendingView.w &&
      a.y >= pendingView.y && a.y <= pendingView.y + pendingView.h
    )
    const bboxAssetIds = new Set(bboxAssets.map(a => a.id))
    const bboxPipes = pipes.filter(p => {
      if (p.fromId === "free") return false
      const fr = assets.find(a => a.id === p.fromId)
      const to = p.toId ? assets.find(a => a.id === p.toId) : null
      return fr && (bboxAssetIds.has(fr.id) || (to && bboxAssetIds.has(to.id)))
    })
    setPendingViewAssets(bboxAssets.map(a => a.id))
    setPendingViewPipes(bboxPipes.map(p => p.id))
    setViewDialogStep("checklist")
  }

  const saveMapView = () => {
    if (!pendingView || !newViewName.trim()) return
    const newView: MapViewRect = {
      id: `mv${Date.now()}`,
      name: newViewName.trim(),
      ...pendingView,
      includedAssets: pendingViewAssets,
      includedPipes: pendingViewPipes,
    }
    setMapViews(prev => [...prev, newView])
    setSelectedViewId(newView.id)
    setActiveTabId(newView.id)
    setPendingView(null)
    setNewViewName("")
    setPendingViewAssets([])
    setPendingViewPipes([])
    setViewDialogStep("name")
  }

  const saveViewName = (id: string) => {
    if (!editViewName.trim()) return
    setMapViews(prev => prev.map(v => v.id === id ? { ...v, name: editViewName.trim() } : v))
    setEditingViewId(null)
    setEditViewName("")
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  const activeView = activeTabId !== "main" ? (mapViews.find(v => v.id === activeTabId) ?? null) : null
  const selectedView = selectedViewId && !selectedAssetId && !selectedPipeId
    ? (mapViews.find(v => v.id === selectedViewId) ?? null)
    : null
  const selectedViewAssets = selectedView
    ? (selectedView.includedAssets
        ? assets.filter(a => selectedView.includedAssets!.includes(a.id))
        : assets.filter(a => a.x >= selectedView.x && a.x <= selectedView.x + selectedView.w && a.y >= selectedView.y && a.y <= selectedView.y + selectedView.h))
    : []
  const selectedViewPipes = selectedView
    ? (selectedView.includedPipes
        ? pipes.filter(p => selectedView.includedPipes!.includes(p.id))
        : pipes.filter(p => {
            const fr = assets.find(a => a.id === p.fromId)
            const to = p.toId ? assets.find(a => a.id === p.toId) : null
            if (p.fromId === "free") return false
            return fr && (selectedViewAssets.some(a => a.id === fr.id) || (to && selectedViewAssets.some(a => a.id === to.id)))
          }))
    : []

  // Active view (tab) membership for dimming
  const activeViewIncludedAssets = activeView?.includedAssets
  const activeViewIncludedPipes = activeView?.includedPipes
  const zoomTransform = undefined

  const panelOpen = !!(selectedAssetId || selectedPipeId || selectedViewId)
  const panelW = panelOpen ? (selectedVideo ? 540 : 364) : 0
  const effectivePanelW = (panelOpen && rightPanelOpen) ? (selectedVideo ? 540 : 364) : 0

  return (
    <div
      style={{ height: "100dvh", display: "flex", overflow: "hidden", background: C.bg, color: C.text, fontFamily: "'DM Sans', sans-serif", userSelect: "none" }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={e => { const { clientX, clientY } = getTouchXY(e); handleMouseMove({ clientX, clientY } as React.MouseEvent) }}
      onTouchEnd={handleMouseUp}
    >

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────────── */}
      <div style={{ width: leftPanelOpen ? 252 : 0, minWidth: leftPanelOpen ? 252 : 0, background: C.panel, borderRight: leftPanelOpen ? `1px solid ${C.border}` : "none", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)" }}>

        {/* Logo */}
        <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${C.border}` }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
              <circle cx="11" cy="11" r="10" stroke={C.cyan} strokeWidth="1.5" />
              <circle cx="11" cy="11" r="6" stroke={C.cyan} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.5" />
              <circle cx="11" cy="11" r="2.5" fill={C.cyan} />
              <line x1="11" y1="1" x2="11" y2="5" stroke={C.cyan} strokeWidth="1.2" strokeLinecap="round" />
              <line x1="11" y1="17" x2="11" y2="21" stroke={C.cyan} strokeWidth="1.2" strokeLinecap="round" />
              <line x1="1" y1="11" x2="5" y2="11" stroke={C.cyan} strokeWidth="1.2" strokeLinecap="round" />
              <line x1="17" y1="11" x2="21" y2="11" stroke={C.cyan} strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            <span style={{ fontSize: 13, fontWeight: 700, color: "#1E293B", letterSpacing: "0.06em", textTransform: "uppercase" }}>SewerMap Pro</span>
          </div>
          <div style={{ fontSize: 9, color: C.blue, fontFamily: "JetBrains Mono", letterSpacing: "0.1em" }}>UNDERGROUND INFRASTRUCTURE</div>
        </div>

        {/* Map upload */}
        <Section>
          <Label>Property Map</Label>
          <button
            onClick={() => fileInputRef.current?.click()}
            style={{
              width: "100%", padding: "8px 12px", borderRadius: 5, fontSize: 10, cursor: "pointer",
              background: mapImage ? "#DCFAF3" : C.card,
              border: `1px dashed ${mapImage ? C.cyan : C.border}`,
              color: mapImage ? C.cyan : C.muted,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v7M4 3l2.5-2.5L9 3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M1 9.5v1.5a1 1 0 001 1h9a1 1 0 001-1V9.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {mapImage ? "Map loaded ✓" : "Upload site plan / aerial"}
          </button>
          <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleMapUpload} />
        </Section>

        {/* Add infrastructure */}
        <Section style={{ paddingBottom: leftSectionOpen.infra ? undefined : 0 }}>
          <button
            onClick={() => setLeftSectionOpen(s => ({ ...s, infra: !s.infra }))}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", padding: 0, marginBottom: leftSectionOpen.infra ? 10 : 0 }}
          >
            <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase" }}>Add Infrastructure</div>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ transform: leftSectionOpen.infra ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s", flexShrink: 0 }}>
              <path d="M2 4l4 4 4-4" stroke={C.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {leftSectionOpen.infra && (
            <>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4, marginBottom: 6 }}>
                {ALL_ASSET_TYPES.map(t => {
                  const active = mode === "add-asset" && addAssetType === t
                  const meta = ASSET_META[t]
                  return (
                    <button
                      key={t}
                      onClick={() => { setAddAssetType(t); setMode("add-asset"); setDrawFrom(null); setDrawFromCoord(null); setDrawHoverPtIdx(null) }}
                      style={{
                        padding: "5px 6px", borderRadius: 5, fontSize: 9, fontWeight: 600,
                        background: active ? C.cyan + "18" : C.card,
                        color: active ? C.cyan : C.muted,
                        border: `1.5px solid ${active ? C.cyan : C.border}`,
                        cursor: "pointer", textAlign: "left", transition: "all 0.12s",
                        display: "flex", alignItems: "center", gap: 5,
                      }}
                    >
                      <AssetIcon type={t} sel={active} c={active ? C.cyan : C.muted} size={18} />
                      <span style={{ lineHeight: 1.25, fontSize: 8.5 }}>{meta.label}</span>
                    </button>
                  )
                })}
              </div>
              <button
                onClick={() => { setMode(mode === "draw-pipe" ? "view" : "draw-pipe"); setDrawFrom(null); setDrawFromCoord(null); setDrawPoints([]); setDrawHoverPtIdx(null) }}
                style={{
                  width: "100%", padding: "7px 12px", borderRadius: 5, fontSize: 10, fontWeight: 700,
                  background: mode === "draw-pipe" ? C.blue : C.card,
                  color: mode === "draw-pipe" ? "#fff" : C.muted,
                  border: `1px solid ${mode === "draw-pipe" ? C.blue : C.border}`,
                  cursor: "pointer", letterSpacing: "0.06em", textTransform: "uppercase",
                  display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  transition: "all 0.12s",
                }}
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M2 12l10-10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  <circle cx="2" cy="12" r="2" fill="currentColor" />
                  <circle cx="12" cy="2" r="2" fill="currentColor" />
                </svg>
                {mode === "draw-pipe"
                  ? ((drawFrom || drawFromCoord) ? `${drawPoints.length} pts — Complete or keep clicking` : "Click asset or pipe to start…")
                  : "Draw Pipe"}
              </button>
            </>
          )}
        </Section>

        {/* Assets + Pipes list (combined) */}
        <div style={{ borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0, flex: leftSectionOpen.assets ? 1 : undefined }}>
          <button
            onClick={() => setLeftSectionOpen(s => ({ ...s, assets: !s.assets }))}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", flexShrink: 0 }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Assets &amp; Pipes ({assets.length + pipes.length})</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: leftSectionOpen.assets ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
              <path d="M2 4l4 4 4-4" stroke={C.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {leftSectionOpen.assets && (
            <div style={{ overflowY: "auto", flex: 1, touchAction: "pan-y" }}>
              {/* Assets */}
              {assets.length > 0 && (
                <div style={{ padding: "4px 16px 2px", fontSize: 8.5, fontWeight: 700, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Assets</div>
              )}
              {assets.map(asset => {
                const cnt = pipes.filter(p => p.fromId === asset.id || p.toId === asset.id).length
                const sel = selectedAssetId === asset.id
                return (
                  <div
                    key={asset.id}
                    onClick={() => selectAsset(asset.id)}
                    style={{
                      padding: "7px 16px", cursor: "pointer",
                      background: sel ? "#E0F0FA" : "transparent",
                      borderLeft: `2px solid ${sel ? C.cyan : "transparent"}`,
                      display: "flex", alignItems: "center", gap: 10,
                      transition: "background 0.1s",
                    }}
                  >
                    <div style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <AssetIcon type={asset.type} sel={sel} c={C.cyan} size={24} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 600, color: sel ? C.cyan : C.text, fontFamily: "JetBrains Mono" }}>{asset.label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{asset.type} · {cnt} pipe{cnt !== 1 ? "s" : ""}</div>
                    </div>
                  </div>
                )
              })}
              {/* Pipes */}
              {pipes.length > 0 && (
                <div style={{ padding: "8px 16px 2px", fontSize: 8.5, fontWeight: 700, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", borderTop: assets.length > 0 ? `1px solid ${C.border}` : undefined, marginTop: assets.length > 0 ? 4 : 0 }}>Pipes</div>
              )}
              {pipes.map(pipe => {
                const sel = selectedPipeId === pipe.id
                const fr = assets.find(a => a.id === pipe.fromId)
                const to = assets.find(a => a.id === pipe.toId)
                const analysisComplete = pipe.videos.some(v => v.observationsClosed && v.runEnd)
                const needsAttention = incompletePipeIds.has(pipe.id) || (pipe.videos.length > 0 && !analysisComplete)
                return (
                  <div
                    key={pipe.id}
                    onClick={() => selectPipe(pipe.id)}
                    style={{
                      padding: "6px 16px", cursor: "pointer",
                      background: sel ? "#E0F0FA" : "transparent",
                      borderLeft: `2px solid ${sel ? "#1a1a1a" : needsAttention ? "#A96B00" : "transparent"}`,
                      transition: "background 0.1s",
                      display: "flex", alignItems: "center", gap: 8,
                    }}
                  >
                    <div style={{ width: 28, flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
                        <line x1="0" y1="4" x2="20" y2="4" stroke={sel ? "#1a1a1a" : "#9CA3AF"} strokeWidth="2.5" />
                        <circle cx="0" cy="4" r="2.5" fill={sel ? "#1a1a1a" : "#9CA3AF"} />
                        <circle cx="20" cy="4" r="2.5" fill={sel ? "#1a1a1a" : "#9CA3AF"} />
                      </svg>
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: sel ? "#1a1a1a" : C.text, fontFamily: "JetBrains Mono" }}>{pipe.label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{fr?.label ?? "?"} → {to?.label ?? "free"} · {pipe.start?.diameter || "—"}</div>
                    </div>
                    {analysisComplete && (
                      <div title="Analysis complete" style={{ flexShrink: 0, width: 16, height: 16, borderRadius: "50%", background: "#00803E", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>
                      </div>
                    )}
                    {needsAttention && !analysisComplete && (
                      <div title="Needs attention" style={{ flexShrink: 0, width: 16, height: 16, borderRadius: "50%", background: "#A96B00", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "#fff", fontFamily: "JetBrains Mono" }}>!</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Map Views list */}
        <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 0", maxHeight: 180, overflowY: "auto" }}>
          <div style={{ padding: "0 16px 8px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
              Map Views ({mapViews.length})
            </div>
            <button
              onClick={() => { setMode("select-area"); setSelectedAssetId(null); setSelectedPipeId(null); setSelectedViewId(null) }}
              style={{
                padding: "2px 8px", fontSize: 9, fontWeight: 700, background: mode === "select-area" ? C.cyan : C.card,
                color: mode === "select-area" ? "#fff" : C.cyan, border: `1px solid ${C.cyan}66`,
                borderRadius: 4, cursor: "pointer", letterSpacing: "0.04em",
              }}
            >
              + New View
            </button>
          </div>
          {/* Main / default view entry */}
          {(() => {
            const sel = activeTabId === "main" && !selectedViewId
            return (
              <div
                onClick={() => { setActiveTabId("main"); setSelectedViewId(null); setSelectedAssetId(null); setSelectedPipeId(null) }}
                style={{
                  padding: "6px 16px", cursor: "pointer",
                  background: sel ? "#E0F0FA" : "transparent",
                  borderLeft: `2px solid ${sel ? C.cyan : "transparent"}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="10" height="10" rx="1.5" stroke={sel ? C.cyan : C.muted} strokeWidth="1.2" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: sel ? C.cyan : C.muted }}>
                    {mapImage ? "Site Plan" : "Main Map"}
                  </div>
                  <div style={{ fontSize: 9, color: C.dim }}>{assets.length} assets · default</div>
                </div>
              </div>
            )
          })()}
          {mapViews.length === 0 && (
            <div style={{ padding: "4px 16px 0", fontSize: 10, color: C.dim }}>
              No saved views yet. Click "+ New View" then drag a region.
            </div>
          )}
          {mapViews.map(view => {
            const sel = selectedViewId === view.id
            const count = assets.filter(a => a.x >= view.x && a.x <= view.x + view.w && a.y >= view.y && a.y <= view.y + view.h).length
            return (
              <div
                key={view.id}
                onClick={() => { setSelectedViewId(sel ? null : view.id); setSelectedAssetId(null); setSelectedPipeId(null) }}
                style={{
                  padding: "6px 16px", cursor: "pointer",
                  background: sel ? "#E0F0FA" : "transparent",
                  borderLeft: `2px solid ${sel ? C.cyan : "transparent"}`,
                  display: "flex", alignItems: "center", gap: 8,
                }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <rect x="1" y="1" width="10" height="10" rx="1.5" stroke={sel ? C.cyan : C.muted} strokeWidth="1.2" strokeDasharray="3 2" />
                </svg>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 11, fontWeight: 600, color: sel ? C.cyan : C.muted }}>{view.name}</div>
                  <div style={{ fontSize: 9, color: C.dim }}>{count} asset{count !== 1 ? "s" : ""}</div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* ── MAP ────────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", position: "relative" }}>

        {/* Toolbar */}
        <div style={{
          padding: "0 16px", height: 42, borderBottom: `1px solid ${C.border}`,
          background: C.panel, display: "flex", alignItems: "center", gap: 12, flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div style={{ width: 6, height: 6, borderRadius: "50%", background: mode === "view" ? C.dim : mode === "draw-pipe" ? C.blue : C.cyan, transition: "background 0.2s" }} />
            <span style={{ fontSize: 10, color: C.muted, fontFamily: "JetBrains Mono" }}>
              {editingMap && <span style={{ fontSize: 9.5, color: C.cyan, fontWeight: 700, letterSpacing: "0.06em" }}>SITE PLAN — drag to move · drag corners to resize · press Esc to finish</span>}
              {!editingMap && mode === "view" && "VIEW — select asset or pipe"}
              {mode === "add-asset" && `PLACE — click to add ${addAssetType}`}
              {mode === "draw-pipe" && !(drawFrom || drawFromCoord) && "DRAW — click an asset or existing pipe to start the route"}
              {mode === "draw-pipe" && (drawFrom || drawFromCoord) && !drawPoints.length && `DRAW — click map to add points  ·  click asset to snap  ·  double-click or Complete to finish`}
              {mode === "draw-pipe" && (drawFrom || drawFromCoord) && drawPoints.length > 0 && `DRAW — ${drawPoints.length} pt${drawPoints.length > 1 ? "s" : ""}  ·  hover point to remove  ·  double-click to finish`}
              {mode === "select-area" && "FRAME — drag to define a map view area"}
            </span>
          </div>
          {mode !== "view" && (
            <div style={{ display: "flex", gap: 6 }}>
              {mode === "draw-pipe" && (drawFrom || drawFromCoord) && drawPoints.length > 0 && (
                <button
                  onClick={completePipe}
                  style={{ padding: "3px 12px", fontSize: 9.5, fontWeight: 700, background: C.cyan, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 4, cursor: "pointer", letterSpacing: "0.05em" }}
                >
                  ✓ Complete Pipe
                </button>
              )}
              <button onClick={() => { setMode("view"); setDrawFrom(null); setDrawFromCoord(null); setDrawPoints([]); setDrawMouse(null); setDrawHoverPtIdx(null); setSelectStart(null); setSelectCurrent(null) }} style={{ padding: "3px 9px", fontSize: 9.5, background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontFamily: "JetBrains Mono", letterSpacing: "0.05em" }}>
                ESC / CANCEL
              </button>
            </div>
          )}
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 10 }}>
            {/* Map image controls */}
            {mapImage && (
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowMapMenu(v => !v)}
                  style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", fontSize: 10, fontWeight: 600, background: showMapMenu || editingMap ? C.cyan : C.card, color: showMapMenu || editingMap ? "#fff" : C.muted, border: `1px solid ${showMapMenu || editingMap ? C.cyan : C.border}`, borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                    <rect x="1" y="1" width="10" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                    <path d="M1 5h10M5 1v10" stroke="currentColor" strokeWidth="0.8" opacity="0.5" />
                  </svg>
                  Site Plan
                  <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.6 }}>
                    <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                  </svg>
                </button>
                {showMapMenu && (
                  <div onMouseDown={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", padding: "14px 16px", minWidth: 240, display: "flex", flexDirection: "column", gap: 12 }}>

                    <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>SITE PLAN</div>

                    {/* Move / Resize toggle */}
                    <button
                      onClick={() => { setEditingMap(v => !v); setShowMapMenu(false) }}
                      style={{ width: "100%", padding: "7px 10px", fontSize: 10.5, fontWeight: 600, background: editingMap ? C.cyan : C.panel, color: editingMap ? "#fff" : C.text, border: `1px solid ${editingMap ? C.cyan : C.border}`, borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 7 }}
                    >
                      <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                        <path d="M6 1v10M1 6h10M2 2l8 8M10 2l-8 8" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
                      </svg>
                      {editingMap ? "Stop editing (drag to move/resize)" : "Move & Resize (drag corners)"}
                    </button>

                    {/* Opacity */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 10.5, color: C.text, fontWeight: 500 }}>Opacity</span>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: 9.5, color: C.muted }}>{Math.round(mapImageProps.opacity * 100)}%</span>
                      </div>
                      <input type="range" min="0.05" max="1" step="0.05" value={mapImageProps.opacity}
                        onChange={e => setMapImageProps(p => ({ ...p, opacity: Number(e.target.value) }))}
                        style={{ width: "100%", accentColor: C.cyan, cursor: "pointer" }}
                      />
                    </div>

                    {/* Rotation */}
                    <div>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 10.5, color: C.text, fontWeight: 500 }}>Rotation</span>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: 9.5, color: C.muted }}>{mapImageProps.rotation}°</span>
                      </div>
                      <input type="range" min="-180" max="180" step="1" value={mapImageProps.rotation}
                        onChange={e => setMapImageProps(p => ({ ...p, rotation: Number(e.target.value) }))}
                        style={{ width: "100%", accentColor: C.cyan, cursor: "pointer" }}
                      />
                      <button onClick={() => setMapImageProps(p => ({ ...p, rotation: 0 }))} style={{ marginTop: 4, fontSize: 9, color: C.muted, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", padding: 0, textDecoration: "underline" }}>Reset rotation</button>
                    </div>

                    {/* Reset position */}
                    <button onClick={() => setMapImageProps({ x: 10, y: 10, w: 80, h: 80, rotation: 0, opacity: 0.85 })}
                      style={{ width: "100%", padding: "6px", fontSize: 9.5, background: C.panel, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer" }}>
                      Reset to full canvas
                    </button>

                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 6 }}>
                      {/* Replace */}
                      <button onClick={() => { fileInputRef.current?.click(); setShowMapMenu(false) }}
                        style={{ width: "100%", padding: "6px", fontSize: 9.5, background: C.panel, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer" }}>
                        Replace image…
                      </button>
                      {/* Remove */}
                      <button onClick={() => { setMapImage(null); setShowMapMenu(false); setEditingMap(false) }}
                        style={{ width: "100%", padding: "6px", fontSize: 9.5, background: "#FEF2F2", color: "#DC2626", border: `1px solid #FECACA`, borderRadius: 4, cursor: "pointer" }}>
                        Remove map
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
            {/* Icon size dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowIconScaleDropdown(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", fontSize: 10, fontWeight: 600, background: showIconScaleDropdown ? C.blue : C.card, color: showIconScaleDropdown ? "#fff" : C.muted, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <circle cx="6" cy="6" r="5" stroke="currentColor" strokeWidth="1.2" />
                  <circle cx="6" cy="6" r="2" fill="currentColor" opacity="0.5" />
                </svg>
                Icon Sizes
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.6 }}>
                  <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              {showIconScaleDropdown && (() => {
                const toggleKey = (key: string) => setScaleSelected(prev => {
                  const next = new Set(prev)
                  next.has(key) ? next.delete(key) : next.add(key)
                  return next
                })
                const allKeys = [...ALL_ASSET_TYPES as readonly string[], "pipes"]
                const allSelected = allKeys.every(k => scaleSelected.has(k))
                return (
                  <div onMouseDown={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", right: 0, zIndex: 100, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", padding: "12px 14px", minWidth: 240, display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>SIZE</div>

                    {/* All Selected slider */}
                    <div style={{ background: C.panel, borderRadius: 6, padding: "8px 10px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 5 }}>
                        <span style={{ fontSize: 10.5, color: C.text, fontWeight: 600 }}>All Selected</span>
                        <span style={{ fontFamily: "JetBrains Mono", fontSize: 9.5, color: C.muted }}>{Math.round(globalIconScale * 100)}%</span>
                      </div>
                      <input type="range" min="0.25" max="3" step="0.05" value={globalIconScale}
                        onChange={e => {
                          const v = Number(e.target.value)
                          setGlobalIconScale(v)
                          const updatedTypes = Object.fromEntries(
                            ALL_ASSET_TYPES.map(t => [t, scaleSelected.has(t) ? v : iconScaleByType[t]])
                          ) as Record<AssetType, number>
                          setIconScaleByType(updatedTypes)
                          if (scaleSelected.has("pipes")) setPipeScale(v)
                        }}
                        style={{ width: "100%", accentColor: C.cyan, cursor: "pointer" }}
                      />
                      <div style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
                        <input type="checkbox" id="chk-all" checked={allSelected}
                          onChange={() => {
                            if (allSelected) setScaleSelected(new Set())
                            else setScaleSelected(new Set(allKeys))
                          }}
                          style={{ cursor: "pointer", accentColor: C.cyan, width: 13, height: 13 }}
                        />
                        <label htmlFor="chk-all" style={{ fontSize: 9.5, color: C.muted, cursor: "pointer" }}>Select all</label>
                      </div>
                    </div>

                    {/* By type — scrollable */}
                    <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>BY TYPE</div>
                      <div style={{ maxHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 }}>

                        {/* Asset types */}
                        {ALL_ASSET_TYPES.map(t => {
                          const label = ASSET_META[t].label
                          const v = iconScaleByType[t]
                          const checked = scaleSelected.has(t)
                          return (
                            <div key={t} style={{ opacity: checked ? 1 : 0.45 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleKey(t)}
                                    style={{ cursor: "pointer", accentColor: C.cyan, width: 12, height: 12, flexShrink: 0 }}
                                  />
                                  <span style={{ fontSize: 10.5, color: C.text, fontWeight: 500 }}>{label}</span>
                                </div>
                                <span style={{ fontFamily: "JetBrains Mono", fontSize: 9.5, color: C.muted }}>{Math.round(v * 100)}%</span>
                              </div>
                              <input type="range" min="0.25" max="3" step="0.05" value={v}
                                onChange={e => setIconScaleByType(prev => ({ ...prev, [t]: Number(e.target.value) }))}
                                style={{ width: "100%", accentColor: C.cyan, cursor: "pointer" }}
                              />
                            </div>
                          )
                        })}

                        {/* Pipes */}
                        {(() => {
                          const checked = scaleSelected.has("pipes")
                          return (
                            <div style={{ opacity: checked ? 1 : 0.45, borderTop: `1px solid ${C.border}`, paddingTop: 8 }}>
                              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 3 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleKey("pipes")}
                                    style={{ cursor: "pointer", accentColor: C.cyan, width: 12, height: 12, flexShrink: 0 }}
                                  />
                                  <span style={{ fontSize: 10.5, color: C.text, fontWeight: 500 }}>Pipes</span>
                                </div>
                                <span style={{ fontFamily: "JetBrains Mono", fontSize: 9.5, color: C.muted }}>{Math.round(pipeScale * 100)}%</span>
                              </div>
                              <input type="range" min="0.25" max="3" step="0.05" value={pipeScale}
                                onChange={e => setPipeScale(Number(e.target.value))}
                                style={{ width: "100%", accentColor: C.cyan, cursor: "pointer" }}
                              />
                            </div>
                          )
                        })()}
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        setGlobalIconScale(1)
                        setPipeScale(1)
                        setIconScaleByType(Object.fromEntries(ALL_ASSET_TYPES.map(t => [t, 1])) as Record<AssetType, number>)
                        setScaleSelected(new Set(allKeys))
                      }}
                      style={{ padding: "5px", fontSize: 9.5, background: C.panel, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer" }}
                    >Reset all</button>
                  </div>
                )
              })()}
            </div>

            {/* Pipe Legend dropdown */}
            <div style={{ position: "relative" }}>
              <button
                onClick={() => setShowLegendDropdown(v => !v)}
                style={{ display: "flex", alignItems: "center", gap: 5, padding: "4px 10px", fontSize: 10, fontWeight: 600, background: showLegendDropdown ? C.card : C.card, color: C.muted, border: `1px solid ${showLegendDropdown ? C.border : C.border}`, borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}
              >
                <svg width="20" height="8" viewBox="0 0 20 8" fill="none">
                  <line x1="0" y1="4" x2="20" y2="4" stroke="#1a1a1a" strokeWidth="2" />
                </svg>
                Legend
                <svg width="8" height="8" viewBox="0 0 8 8" fill="none" style={{ opacity: 0.6 }}>
                  <path d="M1 2.5l3 3 3-3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
                </svg>
              </button>
              {showLegendDropdown && (
                <div onMouseDown={e => e.stopPropagation()} style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, zIndex: 100, background: C.card, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 4px 16px rgba(0,0,0,0.10)", padding: "14px 16px", minWidth: 200, display: "flex", flexDirection: "column", gap: 10 }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase" }}>PIPE STATUS</div>
                  {[
                    { color: "#1a1a1a", label: "Inspected", dash: false },
                    { color: "#9CA3AF", label: "Uninspected", dash: true },
                    { color: "#C8D4DE", label: "Out of active view", dash: true },
                  ].map(({ color, label, dash }) => (
                    <div key={label} style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <svg width="28" height="8" style={{ flexShrink: 0 }}>
                        <line x1="0" y1="4" x2="28" y2="4" stroke={color} strokeWidth="2.5" strokeDasharray={dash ? "6 4" : undefined} />
                      </svg>
                      <span style={{ fontSize: 10.5, color: C.text, fontWeight: 500 }}>{label}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div style={{ fontSize: 9, fontFamily: "JetBrains Mono", color: C.dim }}>
              {assets.length} assets · {pipes.length} pipes · {pipes.reduce((s, p) => s + p.videos.length, 0)} inspections
            </div>
          </div>
        </div>

        {/* ── Tab strip ────────────────────────────────────────────────────────── */}
        <div style={{
          display: "flex", alignItems: "stretch", borderBottom: `1px solid ${C.border}`,
          background: C.card, flexShrink: 0, overflowX: "auto",
        }}>
          {/* Main map tab */}
          {(() => {
            const active = activeTabId === "main"
            return (
              <button
                onClick={() => { setActiveTabId("main"); setSelectedViewId(null); setSelectedAssetId(null); setSelectedPipeId(null) }}
                style={{
                  display: "flex", alignItems: "center", gap: 7, padding: "0 16px",
                  height: 36, borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: `2px solid ${active ? C.cyan : "transparent"}`,
                  background: active ? C.panel : "transparent",
                  color: active ? C.cyan : C.muted, fontSize: 11, fontWeight: active ? 700 : 500,
                  cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0, transition: "all 0.12s",
                }}
              >
                <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
                  <rect x="1" y="1" width="11" height="11" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
                  <path d="M1 5h11" stroke="currentColor" strokeWidth="1" opacity="0.5" />
                </svg>
                {mapImage ? "Site Plan" : "Main Map"}
              </button>
            )
          })()}

          {/* Divider */}
          {mapViews.length > 0 && <div style={{ width: 1, background: C.border, margin: "6px 0", flexShrink: 0 }} />}

          {/* View tabs */}
          {mapViews.map(view => {
            const active = activeTabId === view.id
            return (
              <div
                key={view.id}
                style={{
                  display: "flex", alignItems: "center", gap: 0,
                  borderBottom: `2px solid ${active ? C.blue : "transparent"}`,
                  background: active ? C.panel : "transparent",
                  flexShrink: 0, transition: "all 0.12s",
                }}
              >
                <button
                  onClick={() => { setActiveTabId(view.id); setSelectedViewId(view.id); setSelectedAssetId(null); setSelectedPipeId(null); setLeftPanelOpen(false); setRightPanelOpen(false) }}
                  style={{
                    display: "flex", alignItems: "center", gap: 6, padding: "0 12px 0 14px",
                    height: 36, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", background: "transparent",
                    color: active ? C.blue : C.muted, fontSize: 11, fontWeight: active ? 700 : 500,
                    cursor: "pointer", whiteSpace: "nowrap",
                  }}
                >
                  <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                    <rect x="0.5" y="0.5" width="10" height="10" rx="1" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2.5 1.5" />
                  </svg>
                  {view.name}
                </button>
                <button
                  onClick={() => deleteMapView(view.id)}
                  title="Delete view"
                  style={{
                    width: 24, height: 36, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", background: "transparent",
                    color: C.dim, fontSize: 13, cursor: "pointer", paddingRight: 10,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    lineHeight: 1,
                  }}
                >×</button>
              </div>
            )
          })}

          {/* New view button */}
          <button
            onClick={() => { setMode("select-area"); setActiveTabId("main"); setSelectedAssetId(null); setSelectedPipeId(null) }}
            style={{
              marginLeft: "auto", display: "flex", alignItems: "center", gap: 5,
              padding: "0 14px", height: 36, borderTop: "none", borderLeft: "none", borderRight: "none",
              background: mode === "select-area" ? C.cyan + "18" : "transparent",
              color: mode === "select-area" ? C.cyan : C.muted,
              fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", flexShrink: 0,
              borderBottom: `2px solid ${mode === "select-area" ? C.cyan : "transparent"}`,
              transition: "all 0.12s",
            }}
          >
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="0.5" y="0.5" width="12" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.1" strokeDasharray="2.5 2" />
              <path d="M6.5 3.5v6M3.5 6.5h6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            New View
          </button>
        </div>

        {/* Canvas */}
        <div
          ref={mapRef}
          onClick={handleMapClick}
          onMouseDown={handleMapMouseDown}
          onTouchStart={e => {
            if (e.touches.length !== 1) return
            e.preventDefault()
            const { clientX, clientY } = getTouchXY(e)
            handleMapMouseDown({ button: 0, clientX, clientY, preventDefault: () => {}, stopPropagation: () => {} } as React.MouseEvent<HTMLDivElement>)
          }}
          onTouchEnd={e => {
            if (e.changedTouches.length !== 1) return
            const t = e.changedTouches[0]
            handleMapClick({ clientX: t.clientX, clientY: t.clientY, detail: 1, stopPropagation: () => {} } as React.MouseEvent<HTMLDivElement>)
          }}
          style={{
            flex: 1, position: "relative", overflow: "hidden", touchAction: "none",
            background: "#D8DFE8",
            cursor: mode === "add-asset" ? "crosshair" : mode === "draw-pipe" ? "cell" : mode === "select-area" ? "crosshair" : dragId ? "grabbing" : "default",
          }}
        >
          {/* Interactive pan/zoom wrapper */}
          <div style={{
            position: "absolute", inset: 0,
            transform: `translate(${(mapPan.x * 100).toFixed(2)}%, ${(mapPan.y * 100).toFixed(2)}%) scale(${mapZoom})`,
            transformOrigin: "50% 50%",
            cursor: isPanning ? "grabbing" : mode === "view" ? "grab" : undefined,
            willChange: "transform",
          }}>
          {/* Zoomable content wrapper (tab-level view) */}
          <div style={{
            position: "absolute",
            left: "50%", top: "50%",
            width: 4000, height: 4000,
            marginLeft: -2000, marginTop: -2000,
            transformOrigin: "0 0",
            transform: zoomTransform,
            transition: "transform 0.35s cubic-bezier(0.4,0,0.2,1)",
            background: "#EEF3F8",
            boxShadow: "0 0 0 1px #D2DAE2, 0 8px 40px rgba(0,0,0,0.08)",
          }}>
          {/* Map image — inside zoom so it moves with assets/pipes */}
          {mapImage && (() => {
            const mp = mapImageProps
            const cornerSt = (cursor: string): React.CSSProperties => ({
              position: "absolute", width: 14, height: 14,
              background: C.cyan, borderTop: `2px solid #fff`, borderRight: `2px solid #fff`, borderBottom: `2px solid #fff`, borderLeft: `2px solid #fff`,
              borderRadius: 3, cursor, zIndex: 5,
            })
            return (
              <div
                style={{
                  position: "absolute",
                  left: `${mp.x}%`, top: `${mp.y}%`,
                  width: `${mp.w}%`, height: `${mp.h}%`,
                  transform: `rotate(${mp.rotation}deg)`,
                  transformOrigin: "center center",
                  opacity: mp.opacity,
                  cursor: editingMap ? "move" : "default",
                  zIndex: 0,
                  outline: editingMap ? `2px dashed ${C.cyan}` : undefined,
                  outlineOffset: editingMap ? 3 : undefined,
                }}
                onMouseDown={editingMap ? e => {
                  e.stopPropagation()
                  setMapDrag({ type: "move", startMX: e.clientX, startMY: e.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } })
                } : undefined}
                onTouchStart={editingMap ? e => {
                  e.stopPropagation()
                  const t = e.touches[0]
                  setMapDrag({ type: "move", startMX: t.clientX, startMY: t.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } })
                } : undefined}
              >
                <img src={mapImage} style={{ width: "100%", height: "100%", objectFit: "contain", display: "block", userSelect: "none", pointerEvents: "none" }} draggable={false} />
                {editingMap && (
                  <>
                    {/* TL */ }
                    <div style={{ ...cornerSt("nwse-resize"), top: -7, left: -7 }}
                      onMouseDown={e => { e.stopPropagation(); setMapDrag({ type: "tl", startMX: e.clientX, startMY: e.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } }) }}
                      onTouchStart={e => { e.stopPropagation(); const t = e.touches[0]; setMapDrag({ type: "tl", startMX: t.clientX, startMY: t.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } }) }} />
                    {/* TR */ }
                    <div style={{ ...cornerSt("nesw-resize"), top: -7, right: -7 }}
                      onMouseDown={e => { e.stopPropagation(); setMapDrag({ type: "tr", startMX: e.clientX, startMY: e.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } }) }}
                      onTouchStart={e => { e.stopPropagation(); const t = e.touches[0]; setMapDrag({ type: "tr", startMX: t.clientX, startMY: t.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } }) }} />
                    {/* BL */ }
                    <div style={{ ...cornerSt("nesw-resize"), bottom: -7, left: -7 }}
                      onMouseDown={e => { e.stopPropagation(); setMapDrag({ type: "bl", startMX: e.clientX, startMY: e.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } }) }}
                      onTouchStart={e => { e.stopPropagation(); const t = e.touches[0]; setMapDrag({ type: "bl", startMX: t.clientX, startMY: t.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } }) }} />
                    {/* BR */ }
                    <div style={{ ...cornerSt("nwse-resize"), bottom: -7, right: -7 }}
                      onMouseDown={e => { e.stopPropagation(); setMapDrag({ type: "br", startMX: e.clientX, startMY: e.clientY, startProps: { x: mp.x, y: mp.y, w: mp.w, h: mp.h } }) }}
                      onTouchStart={e => { e.stopPropagation(); const t = e.touches[0]; setMapDrag({ type: "br", startMX: t.clientX, startMY: t.clientY, startProps: { x: mp.x, y: mp.y, w: mp.h, h: mp.h } }) }} />
                  </>
                )}
              </div>
            )
          })()}
          {/* Grid */}
          {!mapImage && (
            <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }}>
              <defs>
                <pattern id="sg" width="24" height="24" patternUnits="userSpaceOnUse">
                  <path d="M 24 0 L 0 0 0 24" fill="none" stroke={C.cyan} strokeWidth="0.25" opacity="0.2" />
                </pattern>
                <pattern id="bg" width="120" height="120" patternUnits="userSpaceOnUse">
                  <rect width="120" height="120" fill="url(#sg)" />
                  <path d="M 120 0 L 0 0 0 120" fill="none" stroke={C.cyan} strokeWidth="0.6" opacity="0.12" />
                </pattern>
              </defs>
              <rect width="100%" height="100%" fill="#EEF3F8" />
              <rect width="100%" height="100%" fill="url(#bg)" />
              {/* Property boundary */}
              <rect x="8%" y="8%" width="84%" height="84%" fill="none" stroke={C.cyan} strokeWidth="0.7" strokeDasharray="12 6" opacity="0.45" />
              <text x="50%" y="94%" textAnchor="middle" fill={C.muted} fontSize="10" fontFamily="JetBrains Mono" opacity="0.8">PROPERTY BOUNDARY — upload site plan to replace grid</text>
            </svg>
          )}

          {/* SVG pipe overlay */}
          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
            <defs>
              <marker id="arrow" markerWidth="6" markerHeight="6" refX="3" refY="3" orient="auto">
                <path d="M0,0 L6,3 L0,6 Z" fill={C.blue} opacity="0.7" />
              </marker>
            </defs>

            {/* Live selection rectangle */}
            {selectStart && selectCurrent && (() => {
              const x = Math.min(selectStart.x, selectCurrent.x)
              const y = Math.min(selectStart.y, selectCurrent.y)
              const w = Math.abs(selectCurrent.x - selectStart.x)
              const h = Math.abs(selectCurrent.y - selectStart.y)
              return (
                <rect
                  x={`${x}%`} y={`${y}%`} width={`${w}%`} height={`${h}%`}
                  fill="#0891B218" stroke={C.cyan} strokeWidth="1.2" strokeDasharray="5 3"
                  style={{ pointerEvents: "none" }}
                />
              )
            })()}

            {pipes.map(pipe => {
              const fr = assets.find(a => a.id === pipe.fromId)
              const frX = fr ? fr.x : (pipe.fromX ?? 0)
              const frY = fr ? fr.y : (pipe.fromY ?? 0)
              if (!fr && pipe.fromId !== "free") return null
              const toAsset = pipe.toId ? assets.find(a => a.id === pipe.toId) : null
              const toX = toAsset ? toAsset.x : (pipe.toX ?? frX)
              const toY = toAsset ? toAsset.y : (pipe.toY ?? frY)
              const isFree = !toAsset
              const sel = selectedPipeId === pipe.id
              const hov = hoverPipeId === pipe.id
              const hasVid = pipe.videos.length > 0
              const isAnalysed = pipe.videos.some(v => v.observationsClosed && v.runEnd)
              const outOfView = activeViewIncludedPipes ? !activeViewIncludedPipes.includes(pipe.id) : false
              const lineColor = outOfView ? "#C8D4DE" : sel ? "#000000" : hov ? "#333333" : hasVid ? "#1a1a1a" : "#9CA3AF"

              // Full ordered point list for rendering
              const pts = [
                { x: frX, y: frY },
                ...(pipe.waypoints ?? []),
                { x: toX, y: toY },
              ]
              // Midpoint of the whole route for label
              const midPt = pts[Math.floor(pts.length / 2)]

              return (
                <g key={pipe.id} opacity={outOfView ? 0.25 : 1} style={{ transition: "opacity 0.2s" }}>
                  {/* Hit-area segments */}
                  {pts.slice(0, -1).map((pt, i) => (
                    <line key={i}
                      x1={`${pt.x}%`} y1={`${pt.y}%`}
                      x2={`${pts[i + 1].x}%`} y2={`${pts[i + 1].y}%`}
                      stroke="transparent" strokeWidth="14"
                      style={{ cursor: mode === "draw-pipe" && !(drawFrom || drawFromCoord) ? "crosshair" : "pointer", pointerEvents: "all" }}
                      onClick={e => {
                        e.stopPropagation()
                        if (mode === "draw-pipe") {
                          const snap = toContentCoords(e.clientX, e.clientY)
                          if (!(drawFrom || drawFromCoord)) {
                            // No start yet — begin route from this pipe
                            setDrawFromCoord({ x: snap.x, y: snap.y, pipeId: pipe.id })
                            setDrawFrom(null)
                            setDrawPoints([])
                          } else {
                            // Drawing in progress — snap a waypoint onto this pipe
                            if (drawHoverPtIdx !== null) {
                              setDrawPoints(prev => prev.slice(0, drawHoverPtIdx))
                              setDrawHoverPtIdx(null)
                            } else {
                              setDrawPoints(prev => [...prev, { x: snap.x, y: snap.y }])
                            }
                          }
                        } else {
                          selectPipe(pipe.id)
                        }
                      }}
                      onMouseEnter={() => setHoverPipeId(pipe.id)}
                      onMouseLeave={() => setHoverPipeId(null)}
                    />
                  ))}
                  {/* Visual segments */}
                  {pts.slice(0, -1).map((pt, i) => (
                    <line key={`v${i}`}
                      x1={`${pt.x}%`} y1={`${pt.y}%`}
                      x2={`${pts[i + 1].x}%`} y2={`${pts[i + 1].y}%`}
                      stroke={lineColor} strokeWidth={(sel ? 2.5 : 1.8) * pipeScale}
                      strokeDasharray={sel ? undefined : "9 5"}
                      markerEnd={sel && i === pts.length - 2 ? "url(#arrow)" : undefined}
                      style={{ pointerEvents: "none", transition: "stroke 0.15s" }}
                    />
                  ))}
                  {/* Waypoint dots */}
                  {(pipe.waypoints ?? []).map((wp, i) => (
                    <circle key={`wp${i}`} cx={`${wp.x}%`} cy={`${wp.y}%`} r="3"
                      fill={lineColor} stroke={C.panel} strokeWidth="1.2"
                      style={{ pointerEvents: "none" }}
                    />
                  ))}
                  {/* Free endpoint dot */}
                  {isFree && (
                    <circle cx={`${toX}%`} cy={`${toY}%`} r="4"
                      fill={sel ? C.blue : "#B0C4D8"} stroke={C.panel} strokeWidth="1.5"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {/* Label */}
                  {(hov || sel) && (
                    <g style={{ pointerEvents: "none" }}>
                      <rect x={`calc(${midPt.x}% - 30px)`} y={`calc(${midPt.y}% - 20px)`}
                        width="60" height="28" rx="4"
                        fill={C.panel} stroke={lineColor} strokeWidth="0.7" opacity="0.95"
                        transform="translate(-30, -14)" />
                      <text x={`${midPt.x}%`} y={`${midPt.y}%`} textAnchor="middle" fill={lineColor} fontSize="8.5" fontFamily="JetBrains Mono">
                        <tspan dy="-5" dx="0">{pipe.label}</tspan>
                        <tspan x={`${midPt.x}%`} dy="12" fill="#64748B">{pipe.start?.diameter || "—"}{pipe.start?.type ? ` ${pipe.start.type}` : ""}</tspan>
                      </text>
                    </g>
                  )}
                  {!hov && !sel && (
                    <text x={`${midPt.x}%`} y={`${midPt.y}%`} textAnchor="middle" dy="-7"
                      fill={hasVid ? "#1a1a1a" : "#9CA3AF"} fontSize="8" fontFamily="JetBrains Mono"
                      style={{ pointerEvents: "none" }}>
                      {pipe.label}
                    </text>
                  )}
                  {/* Analysis-complete badge */}
                  {isAnalysed && (
                    <g style={{ pointerEvents: "none" }}>
                      <circle cx={`${midPt.x}%`} cy={`${midPt.y}%`} r="7" fill="#00803E" transform="translate(22, -16)" />
                      <text x={`${midPt.x}%`} y={`${midPt.y}%`} textAnchor="middle" dy="-12.5" dx="22" fontSize="8" fill="#fff" fontFamily="JetBrains Mono" fontWeight="700">✓</text>
                    </g>
                  )}
                </g>
              )
            })}

            {/* ── In-progress pipe route preview ─────────────────────────────── */}
            {mode === "draw-pipe" && (drawFrom || drawFromCoord) && (() => {
              const startAsset = drawFrom ? assets.find(a => a.id === drawFrom) : null
              const startX = startAsset ? startAsset.x : drawFromCoord!.x
              const startY = startAsset ? startAsset.y : drawFromCoord!.y
              const preview: RoutePoint[] = [{ x: startX, y: startY }, ...drawPoints]
              const lastPt = preview[preview.length - 1]
              return (
                <g>
                  {/* Committed segments */}
                  {preview.slice(0, -1).map((pt, i) => (
                    <line key={i}
                      x1={`${pt.x}%`} y1={`${pt.y}%`}
                      x2={`${preview[i + 1].x}%`} y2={`${preview[i + 1].y}%`}
                      stroke={C.cyan} strokeWidth="2" strokeDasharray="6 3"
                      style={{ pointerEvents: "none" }}
                    />
                  ))}
                  {/* Waypoint markers — red when hovered (will be removed on click) */}
                  {drawPoints.map((pt, i) => {
                    const isHovered = drawHoverPtIdx === i
                    const willRemove = drawHoverPtIdx !== null && i >= drawHoverPtIdx
                    return (
                      <g key={i} style={{ pointerEvents: "none" }}>
                        <circle cx={`${pt.x}%`} cy={`${pt.y}%`} r={isHovered ? 7 : 4}
                          fill={willRemove ? "#FEE2E2" : (pt.assetId ? C.cyan : C.panel)}
                          stroke={willRemove ? "#EF4444" : C.cyan}
                          strokeWidth={isHovered ? 2 : 1.8}
                        />
                        {isHovered && (
                          <>
                            <line x1={`calc(${pt.x}% - 3px)`} y1={`calc(${pt.y}% - 3px)`}
                              x2={`calc(${pt.x}% + 3px)`} y2={`calc(${pt.y}% + 3px)`}
                              stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" />
                            <line x1={`calc(${pt.x}% + 3px)`} y1={`calc(${pt.y}% - 3px)`}
                              x2={`calc(${pt.x}% - 3px)`} y2={`calc(${pt.y}% + 3px)`}
                              stroke="#EF4444" strokeWidth="1.8" strokeLinecap="round" />
                          </>
                        )}
                      </g>
                    )
                  })}
                  {/* Live cursor preview segment */}
                  {drawMouse && drawHoverPtIdx === null && (
                    <line
                      x1={`${lastPt.x}%`} y1={`${lastPt.y}%`}
                      x2={`${drawMouse.x}%`} y2={`${drawMouse.y}%`}
                      stroke={C.cyan} strokeWidth="1.5" strokeDasharray="4 4" opacity="0.5"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {/* Start node ring — circle for asset, diamond for pipe-snap */}
                  {startAsset ? (
                    <circle cx={`${startX}%`} cy={`${startY}%`} r="16"
                      fill="none" stroke={C.cyan} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6"
                      style={{ pointerEvents: "none" }}
                    />
                  ) : (
                    <polygon
                      points={`${startX}% ${`calc(${startY}% - 10px)`},${`calc(${startX}% + 10px)`} ${startY}%,${startX}% ${`calc(${startY}% + 10px)`},${`calc(${startX}% - 10px)`} ${startY}%`}
                      fill="none" stroke={C.cyan} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.7"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {/* Pipe-snap start dot */}
                  {drawFromCoord && (
                    <circle cx={`${startX}%`} cy={`${startY}%`} r="4"
                      fill={C.cyan} stroke={C.panel} strokeWidth="1.5"
                      style={{ pointerEvents: "none" }}
                    />
                  )}
                  {/* Point count badge */}
                  {drawPoints.length > 0 && (
                    <>
                      <rect x={`calc(${lastPt.x}% + 10px)`} y={`calc(${lastPt.y}% - 10px)`}
                        width="38" height="16" rx="3" fill={drawHoverPtIdx !== null ? "#EF4444" : C.cyan} />
                      <text x={`calc(${lastPt.x}% + 29px)`} y={`calc(${lastPt.y}% + 1px)`}
                        textAnchor="middle" fill="#fff" fontSize="8.5" fontFamily="JetBrains Mono" fontWeight="700">
                        {drawHoverPtIdx !== null ? `−${drawPoints.length - drawHoverPtIdx}` : `${drawPoints.length}pt`}
                      </text>
                    </>
                  )}
                </g>
              )
            })()}
          </svg>

          {/* Asset nodes */}
          {assets.map(asset => {
            const assetOutOfView = activeViewIncludedAssets ? !activeViewIncludedAssets.includes(asset.id) : false
            return (
              <AssetNode
                key={asset.id}
                asset={asset}
                selected={selectedAssetId === asset.id}
                drawActive={drawFrom === asset.id}
                scale={iconScaleByType[asset.type] ?? 1}
                onClick={() => handleAssetClick(asset.id)}
                onMouseDown={e => handleAssetMouseDown(e, asset.id)}
                onTouchStart={e => {
                  if (e.touches.length !== 1) return
                  e.stopPropagation()
                  const { clientX, clientY } = getTouchXY(e)
                  handleAssetMouseDown({ clientX, clientY, stopPropagation: () => {} } as React.MouseEvent, asset.id)
                }}
                dimmed={assetOutOfView}
              />
            )
          })}

          {/* View overlay — dim outside + border when a view tab is active */}
          {activeView && (() => {
            const v = activeView
            return (
              <svg
                style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none", zIndex: 15 }}
                preserveAspectRatio="none"
              >
                <defs>
                  <mask id="view-mask">
                    {/* White = visible (full canvas) */}
                    <rect x="0" y="0" width="100%" height="100%" fill="white" />
                    {/* Black = hole (the selected view rect — stays unmasked) */}
                    <rect x={`${v.x}%`} y={`${v.y}%`} width={`${v.w}%`} height={`${v.h}%`} fill="black" />
                  </mask>
                </defs>
                {/* Dark overlay over everything outside the view rect */}
                <rect x="0" y="0" width="100%" height="100%" fill="rgba(15,25,40,0.55)" mask="url(#view-mask)" />
                {/* Border around the selected view */}
                <rect
                  x={`${v.x}%`} y={`${v.y}%`}
                  width={`${v.w}%`} height={`${v.h}%`}
                  fill="none"
                  stroke="#ffffff"
                  strokeWidth="2"
                  strokeDasharray="0"
                />
                {/* View name label */}
                <text
                  x={`${v.x + 0.5}%`} y={`${v.y + 1.5}%`}
                  fill="#ffffff" fontSize="11" fontWeight="700"
                  fontFamily="JetBrains Mono"
                  style={{ pointerEvents: "none" }}
                >{v.name}</text>
              </svg>
            )
          })()}

          </div> {/* end tab-level zoom wrapper */}
          </div> {/* end interactive pan/zoom wrapper */}

          {/* Left panel toggle */}
          <button
            onClick={() => setLeftPanelOpen(v => !v)}
            title={leftPanelOpen ? "Collapse left panel" : "Expand left panel"}
            style={{
              position: "absolute", top: "50%", left: 0, transform: "translateY(-50%)",
              width: 18, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
              background: C.panel, borderTop: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, borderLeft: "none",
              borderRadius: "0 6px 6px 0", cursor: "pointer", zIndex: 20, padding: 0,
              color: C.muted, fontSize: 10,
            }}
          >
            {leftPanelOpen ? "‹" : "›"}
          </button>

          {/* Right panel toggle */}
          <button
            onClick={() => setRightPanelOpen(v => !v)}
            title={rightPanelOpen ? "Collapse right panel" : "Expand right panel"}
            style={{
              position: "absolute", top: "50%", right: 0, transform: "translateY(-50%)",
              width: 18, height: 48, display: "flex", alignItems: "center", justifyContent: "center",
              background: C.panel, borderTop: `1px solid ${C.border}`, borderLeft: `1px solid ${C.border}`, borderBottom: `1px solid ${C.border}`, borderRight: "none",
              borderRadius: "6px 0 0 6px", cursor: "pointer", zIndex: 20, padding: 0,
              color: C.muted, fontSize: 10,
            }}
          >
            {rightPanelOpen ? "›" : "‹"}
          </button>

          {/* Zoom controls */}
          <div style={{ position: "absolute", bottom: 16, right: 16, display: "flex", flexDirection: "column", gap: 2, zIndex: 10 }}>
            {[{ label: "+", dir: 1 as const }, { label: "−", dir: -1 as const }].map(({ label, dir }) => (
              <button key={label} onClick={() => applyZoomStep(dir)} style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, fontWeight: 300, background: C.card, color: C.text, border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", lineHeight: 1 }}>
                {label}
              </button>
            ))}
            <button onClick={() => { setMapZoom(1); setMapPan({ x: 0, y: 0 }) }} title="Reset zoom" style={{ width: 36, height: 36, display: "flex", alignItems: "center", justifyContent: "center", background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 7, cursor: "pointer", boxShadow: "0 1px 4px rgba(0,0,0,0.08)", fontSize: 10, marginTop: 4, fontFamily: "JetBrains Mono" }}>
              1:1
            </button>
            <div style={{ textAlign: "center", fontSize: 9, color: C.dim, fontFamily: "JetBrains Mono", marginTop: 2 }}>
              {Math.round(mapZoom * 100)}%
            </div>
          </div>

          {/* Active view badge */}
          {activeView && (
            <div style={{
              position: "absolute", top: 10, right: 12,
              background: C.blue + "EE", color: "#fff",
              padding: "4px 10px", borderRadius: 5, fontSize: 10, fontWeight: 600,
              fontFamily: "JetBrains Mono", backdropFilter: "blur(4px)",
              display: "flex", alignItems: "center", gap: 7,
            }}>
              <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                <rect x="0.5" y="0.5" width="9" height="9" rx="1" stroke="white" strokeWidth="1" strokeDasharray="2 1.5" />
              </svg>
              {activeView.name}
              <button onClick={() => { setActiveTabId("main"); setSelectedViewId(null) }} style={{ background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", color: "rgba(255,255,255,0.75)", cursor: "pointer", padding: 0, fontSize: 13, lineHeight: 1 }}>×</button>
            </div>
          )}
        </div>
      </div>

      {/* ── RIGHT PANEL ───────────────────────────────────────────────────────── */}
      <div style={{ width: effectivePanelW, minWidth: effectivePanelW, background: C.panel, borderLeft: (panelOpen && rightPanelOpen) ? `1px solid ${C.border}` : "none", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)" }}>

        {/* Empty state */}
        {!selectedAssetId && !selectedPipeId && !selectedViewId && (
          <div style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, padding: 32, color: C.dim }}>
            <svg width="52" height="52" viewBox="0 0 52 52" fill="none">
              <circle cx="26" cy="26" r="24" stroke={C.border} strokeWidth="1.5" />
              <circle cx="26" cy="26" r="14" stroke={C.border} strokeWidth="1" strokeDasharray="4 3" />
              <circle cx="26" cy="26" r="4" fill={C.border} />
            </svg>
            <div style={{ fontSize: 12, color: C.dim, textAlign: "center", lineHeight: 1.6 }}>
              Select an asset, pipe, or map view<br />to view and edit details
            </div>
          </div>
        )}

        {/* Map View detail */}
        {selectedView && (() => {
          const view = selectedView
          const viewAssets = selectedViewAssets
          const viewPipes = selectedViewPipes
          return (
            <div style={{ flex: 1, overflowY: "auto", touchAction: "pan-y" }}>
              <Section>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div style={{ flex: 1, minWidth: 0, marginRight: 8 }}>
                    <Label>Map View</Label>
                    {editingViewId === view.id ? (
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        <input
                          autoFocus
                          value={editViewName}
                          onChange={e => setEditViewName(e.target.value)}
                          onKeyDown={e => { if (e.key === "Enter") saveViewName(view.id); if (e.key === "Escape") setEditingViewId(null) }}
                          style={{ flex: 1, padding: "5px 8px", background: C.card, border: `1px solid ${C.cyan}`, borderRadius: 4, color: C.text, fontSize: 15, fontWeight: 700, outline: "none" }}
                        />
                        <button onClick={() => saveViewName(view.id)} style={{ padding: "5px 10px", background: C.cyan, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 4, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>Save</button>
                        <button onClick={() => setEditingViewId(null)} style={{ padding: "5px 10px", background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, fontSize: 11, cursor: "pointer" }}>✕</button>
                      </div>
                    ) : (
                      <div style={{ fontSize: 18, fontWeight: 700, color: C.cyan, fontFamily: "JetBrains Mono" }}>{view.name}</div>
                    )}
                    <div style={{ fontSize: 11, color: C.muted, marginTop: 3 }}>
                      {viewAssets.length} asset{viewAssets.length !== 1 ? "s" : ""} · {viewPipes.length} pipe{viewPipes.length !== 1 ? "s" : ""}
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    <button
                      onClick={() => { setEditingViewId(view.id); setEditViewName(view.name) }}
                      style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, background: C.card, color: C.cyan, border: `1px solid ${C.cyan}44`, borderRadius: 5, cursor: "pointer" }}
                    >Edit</button>
                    <button
                      onClick={() => deleteMapView(view.id)}
                      style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 5, cursor: "pointer" }}
                    >Delete</button>
                  </div>
                </div>
                <div style={{ marginTop: 12, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                  {[
                    { label: "Width", value: `${view.w.toFixed(1)}%` },
                    { label: "Height", value: `${view.h.toFixed(1)}%` },
                  ].map(({ label, value }) => (
                    <div key={label} style={{ padding: "7px 10px", background: C.card, borderRadius: 5, border: `1px solid ${C.border}` }}>
                      <div style={{ fontSize: 9, color: C.muted, marginBottom: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>{label}</div>
                      <div style={{ fontSize: 12, fontFamily: "JetBrains Mono", color: C.text }}>{value}</div>
                    </div>
                  ))}
                </div>
              </Section>
              <Section>
                <Label>Assets in View ({viewAssets.length})</Label>
                {viewAssets.length === 0 && <div style={{ fontSize: 11, color: C.dim }}>No assets within this view boundary.</div>}
                {viewAssets.map(a => (
                  <div key={a.id} onClick={() => selectAsset(a.id)} style={{ padding: "8px 10px", marginBottom: 5, borderRadius: 5, background: C.card, border: `1px solid ${C.border}`, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 24, height: 24, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <AssetIcon type={a.type} sel={false} c={C.cyan} size={22} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.text, fontFamily: "JetBrains Mono" }}>{a.label}</div>
                      <div style={{ fontSize: 10, color: C.muted, textTransform: "capitalize" }}>{a.type}</div>
                    </div>
                  </div>
                ))}
              </Section>
              {viewPipes.length > 0 && (
                <Section>
                  <Label>Pipes in View ({viewPipes.length})</Label>
                  {viewPipes.map(p => (
                    <div key={p.id} onClick={() => selectPipe(p.id)} style={{ padding: "8px 10px", marginBottom: 5, borderRadius: 5, background: C.card, border: `1px solid ${C.border}`, cursor: "pointer" }}>
                      <div style={{ fontSize: 11, fontWeight: 600, color: C.blue, fontFamily: "JetBrains Mono" }}>{p.label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{p.start?.diameter || "—"} · {p.start?.type || "—"} · {p.videos.length} inspection{p.videos.length !== 1 ? "s" : ""}</div>
                    </div>
                  ))}
                </Section>
              )}
            </div>
          )
        })()}

        {/* Asset detail */}
        {selectedAsset && !selectedPipeId && (
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", touchAction: "pan-y" }}>
            <Section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                <div>
                  <Label>Infrastructure Asset</Label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 4 }}>
                    <AssetIcon type={selectedAsset.type} sel={true} c={C.cyan} size={28} />
                    <div>
                      <div style={{ fontSize: 16, fontWeight: 700, color: C.cyan, fontFamily: "JetBrains Mono" }}>{selectedAsset.label}</div>
                      <div style={{ fontSize: 10, color: C.muted }}>{ASSET_META[selectedAsset.type].label}</div>
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5 }}>
                  <button
                    onClick={() => setSelectedAssetId(null)}
                    style={{ padding: "5px 14px", fontSize: 10.5, fontWeight: 700, background: C.cyan, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}
                  >Save & Close</button>
                  <button onClick={() => setSelectedAssetId(null)} title="Close" style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", fontSize: 14, flexShrink: 0 }}>×</button>
                </div>
              </div>

              {/* Map coordinates + edit location */}
              <div style={{ marginTop: 10, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                <div style={{ padding: "6px 10px", background: editingLocationId === selectedAsset.id ? "#EFF8FF" : C.card, borderRadius: 5, border: `1px solid ${editingLocationId === selectedAsset.id ? C.cyan : C.border}` }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>Easting</div>
                  <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: C.text }}>{(selectedAsset.x * 1.23 + 400.5).toFixed(1)} m</div>
                </div>
                <div style={{ padding: "6px 10px", background: editingLocationId === selectedAsset.id ? "#EFF8FF" : C.card, borderRadius: 5, border: `1px solid ${editingLocationId === selectedAsset.id ? C.cyan : C.border}` }}>
                  <div style={{ fontSize: 9, color: C.muted, marginBottom: 2, letterSpacing: "0.06em", textTransform: "uppercase" }}>Northing</div>
                  <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: C.text }}>{(selectedAsset.y * 0.89 + 200.2).toFixed(1)} m</div>
                </div>
              </div>
              {editingLocationId === selectedAsset.id ? (
                <div style={{ marginTop: 8, padding: "8px 10px", borderRadius: 6, background: "#EFF8FF", border: `1px solid ${C.cyan}44`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, fontSize: 10, color: C.cyan }}>Drag the asset on the map to reposition it.</div>
                  <button onClick={() => { setEditingLocationId(null); setLockedAssetIds(prev => new Set([...prev, selectedAsset.id])) }} style={{ flexShrink: 0, padding: "4px 10px", fontSize: 9.5, fontWeight: 700, background: C.cyan, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 4, cursor: "pointer" }}>Confirm</button>
                </div>
              ) : (
                <button onClick={() => { setLockedAssetIds(prev => { const s = new Set(prev); s.delete(selectedAsset.id); return s }); setEditingLocationId(selectedAsset.id) }} style={{ marginTop: 8, width: "100%", padding: "5px", fontSize: 9.5, fontWeight: 600, background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 5 }}>
                  <svg width="10" height="10" viewBox="0 0 11 11" fill="none"><path d="M7.5 1.5l2 2L3 10H1V8L7.5 1.5z" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  Edit Location
                </button>
              )}
            </Section>

            {/* ── Common: Location ─────────────────────────────────────────── */}
            <Section>
              <Label>Location</Label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                {LOCATION_OPTIONS.map(loc => {
                  const sel = selectedAsset.location === loc
                  return (
                    <button key={loc} onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, location: sel ? undefined : loc, locationOther: loc === "Other" && sel ? undefined : a.locationOther } : a))}
                      style={{ padding: "4px 9px", fontSize: 9.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}`, transition: "all 0.1s" }}
                    >{loc}</button>
                  )
                })}
              </div>
              {selectedAsset.location === "Other" && (
                <input value={selectedAsset.locationOther ?? ""} onChange={e => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, locationOther: e.target.value } : a))}
                  placeholder="Describe location…" style={{ marginTop: 8, width: "100%", padding: "6px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }} />
              )}
            </Section>

            {/* ── Photos (all types) ───────────────────────────────────────── */}
            {(() => {
              const a = selectedAsset
              const isBasin = ["catch-basin","storm-basin","sanitary-basin"].includes(a.type)
              const photoLabels = isBasin
                ? ["Wider Area View","Close-Up","Inside — Lid Open"]
                : ["Wider Area View","Close-Up"]
              return (
                <Section>
                  <Label>Photos</Label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {photoLabels.map(lbl => (
                      <div key={lbl} style={{ padding: "10px 12px", borderRadius: 6, border: `1px dashed ${C.border}`, background: C.card, display: "flex", alignItems: "center", gap: 10, cursor: "pointer" }}>
                        <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="3" width="16" height="12" rx="2" stroke={C.muted} strokeWidth="1.2" /><circle cx="9" cy="9" r="3" stroke={C.muted} strokeWidth="1" /><path d="M6 3l1-2h4l1 2" stroke={C.muted} strokeWidth="1" /></svg>
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 10.5, fontWeight: 600, color: C.muted }}>{lbl}</div>
                          <div style={{ fontSize: 9.5, color: C.dim }}>Tap to capture or upload</div>
                        </div>
                        <div style={{ fontSize: 9, color: C.dim, fontFamily: "JetBrains Mono" }}>+ ADD</div>
                      </div>
                    ))}
                  </div>
                </Section>
              )
            })()}

            {/* ── Basin-specific ───────────────────────────────────────────── */}
            {["catch-basin","storm-basin","sanitary-basin"].includes(selectedAsset.type) && (
              <>
                <Section>
                  <Label>Depth</Label>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <input type="number" value={selectedAsset.depth ?? ""} onChange={e => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, depth: e.target.value } : a))}
                      placeholder="0" style={{ width: 70, padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono", border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", textAlign: "center" }} />
                    <span style={{ fontSize: 12, color: C.muted }}>ft</span>
                  </div>
                </Section>
                <Section>
                  <Label>Condition Rating</Label>
                  <div style={{ display: "flex", gap: 5 }}>
                    {([1,2,3,4,5] as const).map(r => {
                      const sel = selectedAsset.conditionRating === r
                      return (
                        <button key={r} onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, conditionRating: r } : a))}
                          style={{ flex: 1, padding: "7px 4px", fontSize: 8, fontWeight: 700, textAlign: "center", borderRadius: 5, cursor: "pointer", background: sel ? CONDITION_COLORS[r] : "#fff", color: sel ? "#fff" : CONDITION_COLORS[r], border: `1.5px solid ${CONDITION_COLORS[r]}` }}>
                          {r}<br />{CONDITION_LABELS[r]}
                        </button>
                      )
                    })}
                  </div>
                </Section>
              </>
            )}

            {/* ── Cleanout-specific ────────────────────────────────────────── */}
            {["cleanout-floor","cleanout-stack","cleanout-foundation","cleanout-overhead"].includes(selectedAsset.type) && (
              <Section>
                <Label>Clean-out Access Size</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" value={selectedAsset.accessSize ?? ""} onChange={e => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, accessSize: e.target.value } : a))}
                    placeholder="4" style={{ width: 70, padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono", border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: C.muted }}>in</span>
                </div>
              </Section>
            )}
            {selectedAsset.type === "cleanout-floor" && (
              <Section>
                <Label>Access Configuration</Label>
                <div style={{ display: "flex", gap: 6 }}>
                  {["One-Way","Two-Way"].map(opt => {
                    const sel = selectedAsset.accessConfig === opt
                    return <button key={opt} onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, accessConfig: sel ? undefined : opt } : a))} style={{ flex: 1, padding: "7px", fontSize: 10.5, fontWeight: sel ? 700 : 500, borderRadius: 5, cursor: "pointer", background: sel ? C.cyan : "#fff", color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                  })}
                </div>
              </Section>
            )}
            {["cleanout-floor","cleanout-stack"].includes(selectedAsset.type) && (
              <Section>
                <Label>Underground Connection</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {CONN_OPTIONS.map(opt => {
                    const sel = selectedAsset.undergroundConn === opt
                    return <button key={opt} onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, undergroundConn: sel ? undefined : opt } : a))} style={{ padding: "4px 9px", fontSize: 9.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                  })}
                </div>
                {selectedAsset.undergroundConn === "Other" && (
                  <input value={selectedAsset.undergroundConnOther ?? ""} onChange={e => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, undergroundConnOther: e.target.value } : a))}
                    placeholder="Describe connection…" style={{ marginTop: 8, width: "100%", padding: "6px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }} />
                )}
              </Section>
            )}
            {["cleanout-stack","cleanout-overhead"].includes(selectedAsset.type) && (
              <Section>
                <Label>Vertical Pipe Size</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" value={selectedAsset.verticalPipeSize ?? ""} onChange={e => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, verticalPipeSize: e.target.value } : a))}
                    placeholder="4" style={{ width: 70, padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono", border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: C.muted }}>in</span>
                </div>
              </Section>
            )}
            {selectedAsset.type === "cleanout-overhead" && (
              <Section>
                <Label>Above-Ground / Horizontal Pipe Size</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" value={selectedAsset.horizontalPipeSize ?? ""} onChange={e => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, horizontalPipeSize: e.target.value } : a))}
                    placeholder="4" style={{ width: 70, padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono", border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: C.muted }}>in</span>
                </div>
              </Section>
            )}

            {/* ── Stack ────────────────────────────────────────────────────── */}
            {selectedAsset.type === "stack-no-cleanout" && (
              <Section>
                <Label>Stack Size</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" value={selectedAsset.stackSize ?? ""} onChange={e => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, stackSize: e.target.value } : a))}
                    placeholder="4" style={{ width: 70, padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono", border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: C.muted }}>in</span>
                </div>
              </Section>
            )}

            {/* ── Flow Test (Floor Drain + Turf Drain) ─────────────────────── */}
            {["floor-drain","turf-drain"].includes(selectedAsset.type) && (
              <Section>
                <div style={{ padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: C.text, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                    {selectedAsset.flowTestDone ? "Flow Test — Completed ✓" : "Flow Test"}
                  </div>
                  {selectedAsset.flowTestDone ? (
                    <div style={{ fontSize: 11, color: selectedAsset.flowTestResult ? "#00803E" : "#DC2626", fontWeight: 600 }}>
                      Result: {selectedAsset.flowTestResult ? "Yes — Flow Confirmed" : "No — No Flow"}
                    </div>
                  ) : (
                    <>
                      <div style={{ padding: "8px 10px", borderRadius: 5, border: `1px dashed ${C.border}`, background: C.panel, display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke={C.muted} strokeWidth="1.1" /><polygon points="5,4.5 5,9.5 10,7" fill={C.muted} /></svg>
                        <span style={{ fontSize: 10.5, color: C.muted }}>Flow Test Video — tap to upload</span>
                      </div>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Is There Flow?</div>
                      <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
                        {[true, false].map(v => {
                          const sel = selectedAsset.flowTestResult === v
                          return <button key={String(v)} onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, flowTestResult: v } : a))} style={{ flex: 1, padding: "8px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: sel ? (v ? "#00803E" : "#DC2626") : "#fff", color: sel ? "#fff" : C.muted, border: `1.5px solid ${sel ? (v ? "#00803E" : "#DC2626") : C.border}` }}>{v ? "YES" : "NO"}</button>
                        })}
                      </div>
                      <button onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, flowTestDone: true } : a))} disabled={selectedAsset.flowTestResult === undefined} style={{ width: "100%", padding: "8px", fontSize: 10.5, fontWeight: 700, background: selectedAsset.flowTestResult !== undefined ? C.cyan : C.card, color: selectedAsset.flowTestResult !== undefined ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: selectedAsset.flowTestResult !== undefined ? "pointer" : "default" }}>Save Test</button>
                    </>
                  )}
                </div>
              </Section>
            )}

            {/* ── Pumps (Ejector + Sump) ────────────────────────────────────── */}
            {["ejector-pump","sump-pump"].includes(selectedAsset.type) && (
              <>
                <Section>
                  <Label>Installation Date</Label>
                  <input type="date" value={selectedAsset.installDate ?? ""} onChange={e => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, installDate: e.target.value } : a))}
                    style={{ padding: "6px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", color: C.text, background: C.card }} />
                </Section>
                <Section>
                  <div style={{ padding: "12px 14px", borderRadius: 8, border: `1.5px solid ${C.border}`, background: C.card }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: C.text, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 10 }}>
                      {selectedAsset.dischargeTestDone ? "Discharge Test — Completed ✓" : "Discharge Test"}
                    </div>
                    {selectedAsset.dischargeTestDone ? (
                      <div style={{ fontSize: 11, color: selectedAsset.dischargeFunctioning ? "#00803E" : "#DC2626", fontWeight: 600 }}>
                        Result: {selectedAsset.dischargeFunctioning ? "YES — Functioning Properly" : "NO — Not Functioning Properly"}
                      </div>
                    ) : (
                      <>
                        <div style={{ padding: "8px 10px", borderRadius: 5, border: `1px dashed ${C.border}`, background: C.panel, display: "flex", alignItems: "center", gap: 8, marginBottom: 10, cursor: "pointer" }}>
                          <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="1" y="2" width="12" height="10" rx="1.5" stroke={C.muted} strokeWidth="1.1" /><polygon points="5,4.5 5,9.5 10,7" fill={C.muted} /></svg>
                          <span style={{ fontSize: 10.5, color: C.muted }}>Discharge Test Video — tap to upload</span>
                        </div>
                        <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 6 }}>Is the Pump Functioning Properly?</div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 5, marginBottom: 10 }}>
                          {[true, false].map(v => {
                            const sel = selectedAsset.dischargeFunctioning === v
                            return <button key={String(v)} onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, dischargeFunctioning: v } : a))} style={{ padding: "8px", fontSize: 10.5, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: sel ? (v ? "#00803E" : "#DC2626") : "#fff", color: sel ? "#fff" : C.muted, border: `1.5px solid ${sel ? (v ? "#00803E" : "#DC2626") : C.border}`, textAlign: "left" }}>{v ? "YES — Functioning Properly" : "NO — Not Functioning Properly"}</button>
                          })}
                        </div>
                        <button onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, dischargeTestDone: true } : a))} disabled={selectedAsset.dischargeFunctioning === undefined} style={{ width: "100%", padding: "8px", fontSize: 10.5, fontWeight: 700, background: selectedAsset.dischargeFunctioning !== undefined ? C.cyan : C.card, color: selectedAsset.dischargeFunctioning !== undefined ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: selectedAsset.dischargeFunctioning !== undefined ? "pointer" : "default" }}>Save Test</button>
                      </>
                    )}
                  </div>
                </Section>
              </>
            )}

            {/* ── Gutter Hub ───────────────────────────────────────────────── */}
            {selectedAsset.type === "gutter-hub" && (
              <>
                <Section>
                  <Label>Accessible for Camera Inspection?</Label>
                  <div style={{ display: "flex", gap: 6 }}>
                    {[true, false].map(v => {
                      const sel = selectedAsset.cameraAccessible === v
                      return <button key={String(v)} onClick={() => setAssets(prev => prev.map(a => a.id === selectedAsset.id ? { ...a, cameraAccessible: sel ? undefined : v } : a))} style={{ flex: 1, padding: "8px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: sel ? C.cyan : "#fff", color: sel ? "#fff" : C.muted, border: `1.5px solid ${sel ? C.cyan : C.border}` }}>{v ? "YES" : "NO"}</button>
                    })}
                  </div>
                </Section>
                {selectedAsset.cameraAccessible && (
                  <Section>
                    <Label>Sewer Camera Runs</Label>
                    {(selectedAsset.videos ?? []).map(video => (
                      <div key={video.id} style={{ padding: "9px 12px", marginBottom: 6, borderRadius: 6, background: C.card, border: `1px solid ${assetVideoSource?.videoId === video.id ? C.cyan : C.border}`, cursor: "pointer" }}
                        onClick={() => { setAssetVideoSource({ assetId: selectedAsset.id, videoId: video.id }); setInspectionFullscreen(true); setCaptureStep("none"); setVideoPlaying(false) }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.cyan, fontFamily: "JetBrains Mono" }}>{video.name}</div>
                          <div style={{ fontSize: 9.5, color: video.observationsClosed ? "#00803E" : C.dim }}>{video.observations.length} obs</div>
                        </div>
                        {video.date && <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{video.date}</div>}
                      </div>
                    ))}
                    {showVideoForm ? (
                      <div
                        onDragOver={e => { e.preventDefault(); setVideoDragOver(true) }}
                        onDragLeave={() => setVideoDragOver(false)}
                        onDrop={e => {
                          e.preventDefault()
                          setVideoDragOver(false)
                          const file = e.dataTransfer.files[0]
                          if (file) addAssetVideo(selectedAsset.id, file.name)
                        }}
                        style={{ borderRadius: 7, border: `2px dashed ${videoDragOver ? C.cyan : C.border}`, background: videoDragOver ? "#EFF8FF" : C.card, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, transition: "all 0.15s" }}
                      >
                        <svg width="32" height="32" viewBox="0 0 32 32" fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={C.muted} strokeWidth="1.5" /><polygon points="13,11 23,16 13,21" fill={C.muted} /></svg>
                        <div style={{ textAlign: "center" }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Drop video here</div>
                          <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>or</div>
                        </div>
                        <label style={{ cursor: "pointer" }}>
                          <input type="file" accept="video/*" style={{ display: "none" }} onChange={e => {
                            const file = e.target.files?.[0]
                            if (file) addAssetVideo(selectedAsset.id, file.name)
                          }} />
                          <div style={{ padding: "7px 16px", background: C.cyan, color: "#fff", borderRadius: 5, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em" }}>CHOOSE FILE</div>
                        </label>
                        <button onClick={() => { setShowVideoForm(false); addAssetVideo(selectedAsset.id) }} style={{ fontSize: 10, color: C.muted, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", textDecoration: "underline" }}>Add without file</button>
                      </div>
                    ) : (
                      <button onClick={() => setShowVideoForm(true)} style={{ width: "100%", padding: "8px", fontSize: 10.5, fontWeight: 700, background: C.card, color: C.cyan, border: `1.5px solid ${C.cyan}`, borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}>+ ADD SEWER CAMERA</button>
                    )}
                  </Section>
                )}
              </>
            )}

            {/* ── Connected Pipes ──────────────────────────────────────────── */}
            <Section>
              <Label>Connected Pipes</Label>
              {assetPipes.length === 0
                ? <div style={{ fontSize: 11, color: C.dim, paddingTop: 4 }}>No pipes connected. Use "Draw Pipe" to add connections.</div>
                : assetPipes.map(pipe => (
                  <div key={pipe.id} onClick={() => selectPipe(pipe.id)} style={{ padding: "9px 12px", marginBottom: 5, borderRadius: 6, cursor: "pointer", background: C.card, border: `1px solid ${C.border}`, display: "flex", justifyContent: "space-between", alignItems: "center" }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = C.blue)} onMouseLeave={e => (e.currentTarget.style.borderColor = C.border)}>
                    <div>
                      <div style={{ fontSize: 11, fontWeight: 600, color: "#0369A1", fontFamily: "JetBrains Mono" }}>{pipe.label}</div>
                      <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>{pipe.start?.diameter || "—"} · {pipe.length ? pipe.length + " ft" : "—"} · {pipe.start?.type || "—"}</div>
                    </div>
                    <div style={{ fontSize: 10, color: pipe.videos.length > 0 ? C.cyan : C.dim }}>{pipe.videos.length} video{pipe.videos.length !== 1 ? "s" : ""}</div>
                  </div>
                ))
              }
            </Section>
            {/* Delete at bottom */}
            <div style={{ marginTop: "auto", padding: "12px 16px 16px", borderTop: `1px solid ${C.border}` }}>
              <button onClick={() => deleteAsset(selectedAsset.id)} style={{ width: "100%", padding: "8px", fontSize: 10.5, fontWeight: 700, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}>
                Delete Asset
              </button>
            </div>
          </div>
        )}

        {/* Pipe detail */}
        {selectedPipe && (
          <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", touchAction: "pan-y" }}>

            {/* Pipe header */}
            <Section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Label>Pipe Segment</Label>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#0369A1", fontFamily: "JetBrains Mono" }}>{selectedPipe.label}</div>
                  <div style={{ fontSize: 11, color: C.muted, marginTop: 2 }}>
                    {selectedPipe.fromId === "free" ? `(${selectedPipe.fromX?.toFixed(0)},${selectedPipe.fromY?.toFixed(0)})` : assets.find(a => a.id === selectedPipe.fromId)?.label} → {selectedPipe.toId ? assets.find(a => a.id === selectedPipe.toId)?.label : "free endpoint"}
                  </div>
                </div>
                <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                  <button
                    onClick={() => {
                      if (editingPipe) { setEditingPipe(false); return }
                      setEditingPipe(true)
                      setPipeForm({
                        start: selectedPipe.start ?? { type: "", diameter: "", depth: "" },
                        end: selectedPipe.end ?? { type: "", diameter: "", depth: "" },
                        length: selectedPipe.length,
                        slope: selectedPipe.slope,
                        transitions: selectedPipe.transitions ?? [],
                      })
                    }}
                    style={{ padding: "5px 10px", fontSize: 10, fontWeight: 600, borderRadius: 5, cursor: "pointer", background: C.card, color: editingPipe ? C.muted : C.cyan, border: `1px solid ${editingPipe ? C.border : C.cyan + "44"}`, letterSpacing: "0.04em" }}
                  >
                    {editingPipe ? "Cancel" : "Edit"}
                  </button>
                  {/* Save & Close + X close */}
                  <button
                    onClick={() => { if (editingPipe) savePipe(); setSelectedPipeId(null); setSelectedVideoId(null); setEditingPipe(false) }}
                    style={{ padding: "5px 14px", fontSize: 10.5, fontWeight: 700, background: C.cyan, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}
                  >Save & Close</button>
                  <button onClick={() => { setSelectedPipeId(null); setSelectedVideoId(null); setEditingPipe(false) }} title="Close" style={{ width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", fontSize: 14 }}>×</button>
                </div>
              </div>
            </Section>

            {/* Characteristics */}
            {(() => {
              const pipe = selectedPipe
              // Best video for auto-fill: last one with both runStart and runEnd
              const bestVideo = [...pipe.videos].reverse().find(v => v.runStart && v.runEnd)
              const analysisStart = bestVideo ? { type: bestVideo.runStart!.pipeType, diameter: bestVideo.runStart!.pipeSize, depth: bestVideo.runStart!.depth } : null
              const analysisEnd   = bestVideo ? { type: bestVideo.runEnd!.pipeType,   diameter: bestVideo.runEnd!.pipeSize,   depth: bestVideo.runEnd!.depth }   : null
              const analysisLength = bestVideo ? String(Math.abs(parseFloat(bestVideo.runEnd!.footage) - parseFloat(bestVideo.runStart!.footage)).toFixed(0)) : null

              const hasPendingUpdate = !!(analysisStart && analysisEnd && (
                !pipe.start ||
                pipe.start.type !== analysisStart.type ||
                pipe.start.diameter !== analysisStart.diameter ||
                pipe.start.depth !== analysisStart.depth ||
                !pipe.end ||
                pipe.end.type !== analysisEnd.type ||
                pipe.end.diameter !== analysisEnd.diameter ||
                pipe.end.depth !== analysisEnd.depth ||
                (analysisLength && pipe.length !== analysisLength)
              ))

              // Coverage
              const totalLength = parseFloat(pipe.length || "0")
              const inspectedLengths = pipe.videos.filter(v => v.runStart && v.runEnd).map(v => Math.abs(parseFloat(v.runEnd!.footage) - parseFloat(v.runStart!.footage)))
              const inspectedLength = inspectedLengths.length > 0 ? Math.max(...inspectedLengths) : 0
              const coveragePct = totalLength > 0 ? Math.min(100, (inspectedLength / totalLength) * 100) : (inspectedLength > 0 ? 100 : 0)
              const coverageColor = coveragePct >= 90 ? "#00803E" : coveragePct > 0 ? "#A96B00" : C.dim

              // Transitions: from explicit list + auto-detected if start≠end
              const hasTypeChange = pipe.start && pipe.end && (pipe.start.type !== pipe.end.type || pipe.start.diameter !== pipe.end.diameter)

              return (
                <Section>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <Label>Characteristics</Label>
                    {!editingPipe && (
                      <button
                        onClick={() => { setEditingPipe(true); setPipeForm({ start: pipe.start ?? { type: "", diameter: "", depth: "" }, end: pipe.end ?? { type: "", diameter: "", depth: "" }, length: pipe.length, slope: pipe.slope, transitions: pipe.transitions ?? [] }) }}
                        style={{ padding: "3px 9px", fontSize: 9.5, fontWeight: 700, background: C.card, color: C.cyan, border: `1px solid ${C.cyan}44`, borderRadius: 4, cursor: "pointer", letterSpacing: "0.04em" }}
                      >Edit</button>
                    )}
                  </div>

                  {/* Coverage bar */}
                  {pipe.videos.length > 0 && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
                        <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>INSPECTION COVERAGE</div>
                        <div style={{ fontSize: 9.5, fontFamily: "JetBrains Mono", fontWeight: 700, color: coverageColor }}>
                          {inspectedLength > 0 ? `${inspectedLength.toFixed(0)} ft` : "—"}{totalLength > 0 ? ` / ${totalLength} ft` : ""}
                        </div>
                      </div>
                      <div style={{ height: 6, borderRadius: 3, background: C.border, overflow: "hidden" }}>
                        <div style={{ height: "100%", width: `${coveragePct}%`, background: coverageColor, borderRadius: 3, transition: "width 0.3s" }} />
                      </div>
                      {coveragePct > 0 && coveragePct < 90 && (
                        <div style={{ marginTop: 4, fontSize: 9.5, color: "#A96B00" }}>Partial inspection — end characteristics may be estimated</div>
                      )}
                    </div>
                  )}

                  {/* Auto-fill banner */}
                  {hasPendingUpdate && !editingPipe && (
                    <div style={{ marginBottom: 12, padding: "9px 11px", borderRadius: 6, background: "#FFF8F0", border: "1px solid #A96B0044", display: "flex", alignItems: "center", gap: 10 }}>
                      <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><circle cx="7" cy="7" r="6" stroke="#A96B00" strokeWidth="1.2"/><path d="M7 4v3.5l2 2" stroke="#A96B00" strokeWidth="1.2" strokeLinecap="round"/></svg>
                      <div style={{ flex: 1, fontSize: 10, color: "#A96B00", lineHeight: 1.4 }}>
                        Analysis data available — start/end characteristics can be updated from the latest complete run.
                      </div>
                      <button
                        onClick={() => applyAnalysisToPipe(pipe.id)}
                        style={{ flexShrink: 0, padding: "4px 10px", fontSize: 9.5, fontWeight: 700, background: "#A96B00", color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 4, cursor: "pointer", letterSpacing: "0.04em" }}
                      >Apply</button>
                    </div>
                  )}

                  {/* START / END columns */}
                  {editingPipe ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {/* START */}
                        <div style={{ padding: "10px 11px", borderRadius: 7, border: `1.5px solid ${C.cyan}`, background: "#F0F8FF", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: C.cyan, letterSpacing: "0.1em", textTransform: "uppercase" }}>START</div>
                          <div>
                            <FieldLabel text="TYPE" />
                            <select value={pipeForm.start.type} onChange={e => setPipeForm(f => ({ ...f, start: { ...f.start, type: e.target.value } }))} style={{ ...inputSt, width: "100%" }}>
                              <option value="">— select —</option>
                              {PIPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <FieldLabel text="DIAMETER" />
                            <select value={pipeForm.start.diameter} onChange={e => setPipeForm(f => ({ ...f, start: { ...f.start, diameter: e.target.value } }))} style={{ ...inputSt, width: "100%" }}>
                              <option value="">— select —</option>
                              {PIPE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <FieldLabel text="DEPTH (ft)" />
                            <input type="number" value={pipeForm.start.depth} onChange={e => setPipeForm(f => ({ ...f, start: { ...f.start, depth: e.target.value } }))} placeholder="0.0" style={{ ...inputSt, width: "100%" }} />
                          </div>
                        </div>
                        {/* END */}
                        <div style={{ padding: "10px 11px", borderRadius: 7, border: `1.5px solid #CE1A74`, background: "#FFF5FA", display: "flex", flexDirection: "column", gap: 8 }}>
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#CE1A74", letterSpacing: "0.1em", textTransform: "uppercase" }}>END</div>
                          <div>
                            <FieldLabel text="TYPE" />
                            <select value={pipeForm.end.type} onChange={e => setPipeForm(f => ({ ...f, end: { ...f.end, type: e.target.value } }))} style={{ ...inputSt, width: "100%" }}>
                              <option value="">— select —</option>
                              {PIPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                            </select>
                          </div>
                          <div>
                            <FieldLabel text="DIAMETER" />
                            <select value={pipeForm.end.diameter} onChange={e => setPipeForm(f => ({ ...f, end: { ...f.end, diameter: e.target.value } }))} style={{ ...inputSt, width: "100%" }}>
                              <option value="">— select —</option>
                              {PIPE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div>
                            <FieldLabel text="DEPTH (ft)" />
                            <input type="number" value={pipeForm.end.depth} onChange={e => setPipeForm(f => ({ ...f, end: { ...f.end, depth: e.target.value } }))} placeholder="0.0" style={{ ...inputSt, width: "100%" }} />
                          </div>
                        </div>
                      </div>

                      {/* Length + Slope */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <FieldLabel text="TOTAL LENGTH (ft)" />
                          <input type="number" value={pipeForm.length} onChange={e => setPipeForm(f => ({ ...f, length: e.target.value }))} placeholder="0" style={{ ...inputSt, width: "100%" }} />
                        </div>
                        <div>
                          <FieldLabel text="SLOPE (%)" />
                          <input value={pipeForm.slope} onChange={e => setPipeForm(f => ({ ...f, slope: e.target.value }))} placeholder="0.00%" style={{ ...inputSt, width: "100%" }} />
                        </div>
                      </div>

                      {/* Transitions edit */}
                      <div>
                        <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>TRANSITIONS</div>
                        {pipeForm.transitions.map((tr, idx) => (
                          <div key={tr.id} style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr auto", gap: 5, marginBottom: 6, alignItems: "flex-end" }}>
                            <div>
                              <FieldLabel text="AT (ft)" />
                              <input type="number" value={tr.footage} onChange={e => setPipeForm(f => ({ ...f, transitions: f.transitions.map((t, i) => i === idx ? { ...t, footage: e.target.value } : t) }))} placeholder="0" style={{ ...inputSt, width: "100%" }} />
                            </div>
                            <div>
                              <FieldLabel text="→ TYPE" />
                              <select value={tr.type} onChange={e => setPipeForm(f => ({ ...f, transitions: f.transitions.map((t, i) => i === idx ? { ...t, type: e.target.value } : t) }))} style={{ ...inputSt, width: "100%" }}>
                                <option value="">—</option>
                                {PIPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                              </select>
                            </div>
                            <div>
                              <FieldLabel text="→ DIA" />
                              <select value={tr.diameter} onChange={e => setPipeForm(f => ({ ...f, transitions: f.transitions.map((t, i) => i === idx ? { ...t, diameter: e.target.value } : t) }))} style={{ ...inputSt, width: "100%" }}>
                                <option value="">—</option>
                                {PIPE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                              </select>
                            </div>
                            <button onClick={() => setPipeForm(f => ({ ...f, transitions: f.transitions.filter((_, i) => i !== idx) }))} style={{ padding: "5px 7px", background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 4, cursor: "pointer", fontSize: 11 }}>✕</button>
                          </div>
                        ))}
                        <button onClick={() => setPipeForm(f => ({ ...f, transitions: [...f.transitions, { id: `tr${Date.now()}`, footage: "", type: "", diameter: "" }] }))} style={{ width: "100%", padding: "6px", fontSize: 10, fontWeight: 600, background: C.card, color: C.muted, border: `1px dashed ${C.border}`, borderRadius: 5, cursor: "pointer" }}>+ Add Transition Point</button>
                      </div>

                      {/* Save / Cancel */}
                      <div style={{ display: "flex", gap: 6, marginTop: 2 }}>
                        <button onClick={() => setEditingPipe(false)} style={{ flex: 1, padding: "8px", fontSize: 10.5, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer" }}>Cancel</button>
                        <button onClick={savePipe} style={{ flex: 2, padding: "8px", fontSize: 10.5, fontWeight: 700, background: C.blue, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: "pointer", letterSpacing: "0.05em", textTransform: "uppercase" }}>Save Changes</button>
                      </div>
                    </div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      {/* START / END view cards */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {([
                          { label: "START", ep: pipe.start, color: C.cyan, bg: "#F0F8FF" },
                          { label: "END",   ep: pipe.end,   color: "#CE1A74", bg: "#FFF5FA" },
                        ] as { label: string; ep: PipeEndpoint | undefined; color: string; bg: string }[]).map(({ label, ep, color, bg }) => (
                          <div key={label} style={{ padding: "10px 12px", borderRadius: 7, border: `1px solid ${color}44`, background: ep ? bg : C.card }}>
                            <div style={{ fontSize: 9, fontWeight: 700, color, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>{label}</div>
                            {ep ? (
                              <>
                                <div style={{ marginBottom: 5 }}>
                                  <div style={{ fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Type</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: "JetBrains Mono" }}>{ep.type || "—"}</div>
                                </div>
                                <div style={{ marginBottom: 5 }}>
                                  <div style={{ fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Diameter</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: "JetBrains Mono" }}>{ep.diameter || "—"}</div>
                                </div>
                                <div>
                                  <div style={{ fontSize: 8.5, color: C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>Depth</div>
                                  <div style={{ fontSize: 12, fontWeight: 600, color: C.text, fontFamily: "JetBrains Mono" }}>{ep.depth ? ep.depth + " ft" : "—"}</div>
                                </div>
                              </>
                            ) : (
                              <div style={{ fontSize: 10, color: C.dim, fontStyle: "italic" }}>Not recorded</div>
                            )}
                          </div>
                        ))}
                      </div>

                      {/* Length + Slope */}
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        {[
                          { label: "Total Length", value: pipe.length ? pipe.length + " ft" : "—" },
                          { label: "Slope", value: pipe.slope || "—" },
                        ].map(({ label, value }) => (
                          <div key={label} style={{ padding: "8px 10px", background: C.card, borderRadius: 5, border: `1px solid ${C.border}` }}>
                            <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 3 }}>{label}</div>
                            <div style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: "JetBrains Mono" }}>{value}</div>
                          </div>
                        ))}
                      </div>

                      {/* Transitions view */}
                      {(hasTypeChange || (pipe.transitions && pipe.transitions.length > 0)) && (
                        <div>
                          <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>TRANSITIONS</div>
                          {hasTypeChange && (!pipe.transitions || pipe.transitions.length === 0) && (
                            <div style={{ padding: "7px 10px", borderRadius: 5, background: "#FFF8F0", border: "1px solid #A96B0033", fontSize: 10, color: "#A96B00" }}>
                              Type or diameter changes between start and end — add a transition point to record where it occurs.
                            </div>
                          )}
                          {(pipe.transitions ?? []).map(tr => (
                            <div key={tr.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", marginBottom: 5, borderRadius: 5, background: C.card, border: `1px solid ${C.border}` }}>
                              <div style={{ fontSize: 10, fontFamily: "JetBrains Mono", color: C.muted, minWidth: 36 }}>{tr.footage ? tr.footage + " ft" : "—"}</div>
                              <svg width="12" height="10" viewBox="0 0 12 10" fill="none"><path d="M1 5h10M7 1l4 4-4 4" stroke={C.muted} strokeWidth="1.2" strokeLinecap="round"/></svg>
                              <div style={{ fontSize: 10, fontWeight: 600, color: C.text }}>{tr.type || "—"}</div>
                              {tr.diameter && <div style={{ fontSize: 10, color: C.muted }}>{tr.diameter}</div>}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </Section>
              )
            })()}

            {/* Saved Analyses (video list) */}
            <Section>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>SAVED ANALYSES</div>
                <button
                  onClick={() => setShowVideoForm(v => !v)}
                  style={{ padding: "3px 9px", fontSize: 9.5, background: "#00803E18", color: "#00803E", border: "1px solid #00803E44", borderRadius: 4, cursor: "pointer", fontWeight: 700, letterSpacing: "0.04em" }}
                >
                  + CAMERA INSPECTION
                </button>
              </div>
              {showVideoForm && (
                <div
                  onDragOver={e => { e.preventDefault(); setVideoDragOver(true) }}
                  onDragLeave={() => setVideoDragOver(false)}
                  onDrop={e => {
                    e.preventDefault()
                    setVideoDragOver(false)
                    const file = e.dataTransfer.files[0]
                    if (file) addVideo(file.name)
                  }}
                  style={{ marginBottom: 10, borderRadius: 7, border: `2px dashed ${videoDragOver ? "#00803E" : C.border}`, background: videoDragOver ? "#E8F4EF" : C.card, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, transition: "all 0.15s" }}
                >
                  <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                    <rect x="4" y="6" width="24" height="20" rx="3" stroke={C.muted} strokeWidth="1.5" />
                    <polygon points="13,11 23,16 13,21" fill={C.muted} />
                  </svg>
                  <div style={{ textAlign: "center" }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Drop video here</div>
                    <div style={{ fontSize: 10, color: C.muted, marginTop: 2 }}>or</div>
                  </div>
                  <label style={{ cursor: "pointer" }}>
                    <input type="file" accept="video/*" style={{ display: "none" }} onChange={e => {
                      const file = e.target.files?.[0]
                      if (file) addVideo(file.name)
                    }} />
                    <div style={{ padding: "7px 16px", background: "#00803E", color: "#fff", borderRadius: 5, fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em" }}>CHOOSE FILE</div>
                  </label>
                  <button onClick={() => addVideo("Camera Run " + (selectedPipe.videos.length + 1))} style={{ fontSize: 10, color: C.muted, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", textDecoration: "underline" }}>
                    Add without file
                  </button>
                </div>
              )}
              {selectedPipe.videos.length === 0 && !showVideoForm && (
                <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic", paddingBottom: 4 }}>No camera inspections yet. Click "+ Camera Inspection" to upload footage and begin logging.</div>
              )}
              {selectedPipe.videos.map(video => {
                const isOpen = selectedVideoId === video.id
                return (
                  <div key={video.id} style={{ marginBottom: 6, borderRadius: 6, border: `1px solid ${isOpen ? "#0369A1" : C.border}`, background: isOpen ? "#E0F0FA" : C.card, overflow: "hidden" }}>
                    <div style={{ padding: "10px 12px", display: "flex", alignItems: "center", gap: 10 }}>
                      {/* Video icon */}
                      <div style={{ width: 32, height: 32, borderRadius: 5, background: "#0A1520", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                        <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                          <polygon points="4,2 12,7 4,12" fill="#38BDF8" />
                        </svg>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: isOpen ? "#0369A1" : C.text, fontFamily: "JetBrains Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                          {video.name}
                        </div>
                        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{video.date} · {video.operator} · {video.observations.length} obs.</div>
                      </div>
                      <div style={{ display: "flex", gap: 5, flexShrink: 0 }}>
                        <button
                          onClick={() => { setSelectedVideoId(isOpen ? null : video.id); setCaptureStep("none"); setVideoPlaying(false) }}
                          style={{ padding: "3px 9px", fontSize: 9.5, fontWeight: 700, background: isOpen ? C.blue : "#00803E", color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 3, cursor: "pointer", letterSpacing: "0.04em" }}
                        >
                          {isOpen ? "CLOSE" : "OPEN"}
                        </button>
                        <button onClick={e => { e.stopPropagation(); deleteVideo(selectedPipe.id, video.id) }} style={{ padding: "3px 7px", fontSize: 9.5, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 3, cursor: "pointer" }}>✕</button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </Section>

            {/* ── Video inspection flow ─────────────────────────────────────── */}
            {selectedVideo && (
              <div style={{ borderTop: `2px solid ${C.border}` }}>

                {/* Region A — header */}
                <div style={{ padding: "12px 16px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>Analysis — {selectedVideo.direction}</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#16202A", fontFamily: "JetBrains Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {selectedVideo.name}
                    </div>
                  </div>
                  <div style={{ fontSize: 9, fontFamily: "JetBrains Mono", color: C.muted, whiteSpace: "nowrap" }}>
                    {selectedVideo.observations.length} obs.
                  </div>
                  <button
                    onClick={() => setInspectionFullscreen(true)}
                    title="Open full screen"
                    style={{ flexShrink: 0, padding: "5px 10px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", background: "#16202A", color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}
                  >
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M1 4V1h3M7 1h3v3M10 7v3H7M4 10H1V7" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Full Screen
                  </button>
                </div>

                {/* Region B — video player */}
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={{ width: "100%", aspectRatio: "16/9", background: "#0A1520", borderRadius: 8, border: `1px solid ${C.border}`, position: "relative", overflow: "hidden", marginBottom: 8 }}>
                    <svg width="100%" height="100%" viewBox="0 0 328 185" preserveAspectRatio="xMidYMid slice">
                      <rect width="328" height="185" fill="#0A1520" />
                      <ellipse cx="164" cy="95" rx="78" ry="78" fill="none" stroke="#0F2030" strokeWidth="12" />
                      <ellipse cx="164" cy="95" rx="78" ry="78" fill="none" stroke="#1B6FB8" strokeWidth="1" opacity="0.25" />
                      <ellipse cx="164" cy="95" rx="52" ry="52" fill="none" stroke="#1B6FB8" strokeWidth="0.5" opacity="0.12" />
                      <ellipse cx="164" cy="160" rx="62" ry="10" fill="#1B6FB8" opacity="0.08" />
                      <path d="M160,18 L164,28 L168,18" stroke="#A96B00" strokeWidth="1.5" fill="none" opacity="0.85" />
                      <circle cx="164" cy="26" r="6" fill="none" stroke="#A96B00" strokeWidth="1" opacity="0.7" />
                      <line x1="158" y1="95" x2="170" y2="95" stroke="#38BDF8" strokeWidth="0.7" opacity="0.4" />
                      <line x1="164" y1="89" x2="164" y2="101" stroke="#38BDF8" strokeWidth="0.7" opacity="0.4" />
                      {Array.from({ length: 7 }).map((_, i) => (
                        <line key={i} x1="86" y1={22 + i * 22} x2="242" y2={22 + i * 22} stroke="#38BDF8" strokeWidth="0.12" opacity="0.04" />
                      ))}
                      <rect x="6" y="6" width="82" height="14" fill="#00000080" rx="2" />
                      <text x="12" y="16" fill="#38BDF8" fontSize="8.5" fontFamily="JetBrains Mono">00:02:47</text>
                      <rect x="250" y="6" width="72" height="14" fill="#00000080" rx="2" />
                      {videoPlaying && <circle cx="258" cy="13" r="3.5" fill="#CE1A74" opacity="0.9" />}
                      <text x={videoPlaying ? "264" : "256"} y="16" fill="#CBD5E1" fontSize="8.5" fontFamily="JetBrains Mono">{videoPlaying ? "REC" : "PAUSED"}</text>
                      <rect x="6" y="166" width="96" height="14" fill="#00000080" rx="2" />
                      <text x="12" y="176" fill="#94A3B8" fontSize="7.5" fontFamily="JetBrains Mono">DIST: 41.0 ft</text>
                      <rect x="238" y="166" width="84" height="14" fill="#00000080" rx="2" />
                      <text x="244" y="176" fill="#94A3B8" fontSize="7.5" fontFamily="JetBrains Mono">⌀{selectedPipe?.start?.diameter || "—"}</text>
                    </svg>
                    {/* Timeline scrubber */}
                    <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "6px 10px 7px", background: "linear-gradient(transparent, #040810E0)" }}>
                      <div style={{ height: 3, background: "rgba(255,255,255,0.15)", borderRadius: 2, position: "relative" }}>
                        <div style={{ width: "35%", height: "100%", background: "#1B6FB8", borderRadius: 2 }} />
                        <div style={{ position: "absolute", left: "35%", top: "50%", transform: "translate(-50%,-50%)", width: 8, height: 8, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 2px #1B6FB8" }} />
                        {selectedVideo.observations.map((obs, i) => (
                          <div key={obs.id} title={obs.footage ? `${obs.footage} ft` : ""} style={{ position: "absolute", top: "50%", transform: "translate(-50%,-50%)", left: `${10 + i * 18}%`, width: 6, height: 6, borderRadius: "50%", background: OBS_COLOR[obs.type], boxShadow: `0 0 0 1.5px rgba(0,0,0,0.4)` }} />
                        ))}
                      </div>
                    </div>
                    {/* Play/pause overlay */}
                    <div
                      onClick={() => { setVideoPlaying(v => !v); if (!videoPlaying) { setCaptureStep("none") } }}
                      style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0, transition: "opacity 0.15s" }}
                      onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                      onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
                    >
                      <div style={{ width: 40, height: 40, borderRadius: "50%", background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                        {videoPlaying
                          ? <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><rect x="2" y="1" width="4" height="12" rx="1" fill="#fff" /><rect x="8" y="1" width="4" height="12" rx="1" fill="#fff" /></svg>
                          : <svg width="14" height="14" viewBox="0 0 14 14" fill="none"><polygon points="3,1 13,7 3,13" fill="#fff" /></svg>
                        }
                      </div>
                    </div>
                  </div>

                  {/* Status + capture row */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
                    <div style={{ flex: 1, fontSize: 10.5, color: videoPlaying ? "#A96B00" : C.muted, fontStyle: "italic" }}>
                      {videoPlaying ? "Pause where you see something." : "Paused. Capture what's on screen."}
                    </div>
                    <button
                      disabled={videoPlaying || selectedVideo.observationsClosed}
                      onClick={() => { setCaptureStep("chooser"); setCaptureForm({ footage: selectedVideo.observations.length > 0 ? String(Math.max(...selectedVideo.observations.map(o => parseFloat(o.footage || "0")))) : "0" }) }}
                      style={{
                        padding: "7px 12px", fontSize: 10, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase",
                        background: (videoPlaying || selectedVideo.observationsClosed) ? C.card : "#00803E",
                        color: (videoPlaying || selectedVideo.observationsClosed) ? C.dim : "#fff",
                        border: (videoPlaying || selectedVideo.observationsClosed) ? `1px solid ${C.border}` : "none",
                        borderRadius: 5, cursor: (videoPlaying || selectedVideo.observationsClosed) ? "default" : "pointer",
                        flexShrink: 0, transition: "all 0.15s",
                      }}
                    >
                      Capture Observation
                    </button>
                  </div>
                </div>

                {/* Region C — chooser or form */}
                {captureStep !== "none" && (
                  <div style={{ margin: "0 16px 12px", borderRadius: 8, border: "1.5px solid #A96B00", background: "#FFFBF5", overflow: "hidden" }}>

                    {/* Chooser */}
                    {captureStep === "chooser" && (
                      <div style={{ padding: "14px 14px 10px" }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#16202A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>WHAT ARE YOU LOOKING AT?</div>
                        <div style={{ fontSize: 10, color: "#5F6E7C", marginBottom: 12 }}>
                          Captured at {captureForm.footage ? captureForm.footage + " ft" : "—"}. It attaches to whatever you pick.
                        </div>

                        {/* Footage quick-set */}
                        <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 12 }}>
                          <div style={{ fontSize: 9, color: C.muted, letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>FOOTAGE</div>
                          <input
                            type="number"
                            value={String(captureForm.footage ?? "")}
                            onChange={e => setCaptureForm(f => ({ ...f, footage: e.target.value }))}
                            style={{ width: 56, padding: "4px 6px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, fontSize: 11, fontFamily: "JetBrains Mono", outline: "none", textAlign: "center" }}
                          />
                          {[0, 5, 10, 25].map(d => (
                            <button key={d} onClick={() => setCaptureForm(f => ({ ...f, footage: String((parseFloat(String(f.footage || "0")) + d).toFixed(0)) }))} style={{ padding: "4px 7px", fontSize: 9.5, fontWeight: 600, background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 3, cursor: "pointer", fontFamily: "JetBrains Mono" }}>
                              +{d}
                            </button>
                          ))}
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                          {CHOOSER_OPTIONS.map(opt => (
                            <button
                              key={opt.type}
                              onClick={() => setCaptureStep(opt.type)}
                              style={{
                                padding: "10px 10px 9px", textAlign: "left", borderRadius: 6,
                                background: "#fff", border: `1.5px solid ${OBS_COLOR[opt.type]}`,
                                cursor: "pointer", transition: "background 0.1s",
                              }}
                              onMouseEnter={e => (e.currentTarget.style.background = OBS_COLOR[opt.type] + "0F")}
                              onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                            >
                              <div style={{ fontSize: 9, fontWeight: 700, color: OBS_COLOR[opt.type], letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{opt.label}</div>
                              <div style={{ fontSize: 9, color: "#5F6E7C", lineHeight: 1.4 }}>{opt.desc}</div>
                            </button>
                          ))}
                        </div>
                        <button onClick={() => setCaptureStep("none")} style={{ marginTop: 10, width: "100%", padding: "7px", fontSize: 10.5, background: "transparent", color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer" }}>Cancel</button>
                      </div>
                    )}

                    {/* Tie-in form */}
                    {captureStep === "tie-in" && (
                      <div style={{ padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#1B6FB8", letterSpacing: "0.1em", textTransform: "uppercase" }}>TIE-IN</div>
                        <FootageRow footage={String(captureForm.footage ?? "")} footageTo={String(captureForm.footageTo ?? "")} onChange={v => setCaptureForm(f => ({ ...f, footage: v }))} onChangeTo={v => setCaptureForm(f => ({ ...f, footageTo: v }))} />
                        <ChipField label="TYPE *" options={TIE_SUBTYPES} value={String(captureForm.tieSubtype ?? "")} onChange={v => setCaptureForm(f => ({ ...f, tieSubtype: v }))} color="#1B6FB8" />
                        <ChipField label="SIZE" options={TIE_SIZES} value={String(captureForm.tieSize ?? "")} onChange={v => setCaptureForm(f => ({ ...f, tieSize: v }))} color="#1B6FB8" />
                        <div>
                          <FieldLabel text={String(captureForm.tieSubtype ?? "").startsWith("Double") ? "ORIENTATION — PICK TWO" : "ORIENTATION"} />
                          <div style={{ display: "flex", justifyContent: "center" }}>
                            <ClockFace selected={(captureForm.tieOrientation as number[]) ?? []} multi={String(captureForm.tieSubtype ?? "").startsWith("Double")} onChange={v => setCaptureForm(f => ({ ...f, tieOrientation: v }))} />
                          </div>
                        </div>
                        <div>
                          <FieldLabel text="WHAT IT SERVES" />
                          <input value={String(captureForm.tieServes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, tieServes: e.target.value }))} placeholder="Bldg 2 stack, laundry, area drain…" style={inputSt} />
                        </div>
                        <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.tieSubtype} />
                      </div>
                    )}

                    {/* Defect form */}
                    {captureStep === "defect" && (
                      <div style={{ padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#A96B00", letterSpacing: "0.1em", textTransform: "uppercase" }}>DEFECT</div>
                        <FootageRow footage={String(captureForm.footage ?? "")} footageTo={String(captureForm.footageTo ?? "")} onChange={v => setCaptureForm(f => ({ ...f, footage: v }))} onChangeTo={v => setCaptureForm(f => ({ ...f, footageTo: v }))} />
                        <ChipField label="TYPE *" options={DEFECT_SUBTYPES} value={String(captureForm.defectSubtype ?? "")} onChange={v => setCaptureForm(f => ({ ...f, defectSubtype: v }))} color="#A96B00" />
                        {captureForm.defectSubtype === "Complete collapse" ? (
                          <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #CE1A7444", background: "#FFF0F5", fontSize: 10.5, color: "#CE1A74", lineHeight: 1.5 }}>
                            <strong>A collapse rules out lining.</strong> Add an excavation point at this distance before you close the run. No orientation or severity needed — a collapse is the whole pipe.
                          </div>
                        ) : (
                          <>
                            <div>
                              <FieldLabel text="ORIENTATION" />
                              <div style={{ display: "flex", justifyContent: "center" }}>
                                <ClockFace selected={(captureForm.defectOrientation as number[]) ?? []} multi={false} onChange={v => setCaptureForm(f => ({ ...f, defectOrientation: v }))} />
                              </div>
                            </div>
                            <div>
                              <FieldLabel text="SEVERITY" />
                              <div style={{ display: "flex", gap: 4 }}>
                                {([1, 2, 3, 4, 5] as Severity[]).map(s => {
                                  const sel = captureForm.severity === s
                                  return (
                                    <button key={s} onClick={() => setCaptureForm(f => ({ ...f, severity: s }))} style={{ flex: 1, padding: "6px 2px", fontSize: 8.5, fontWeight: 700, letterSpacing: "0.04em", textAlign: "center", borderRadius: 4, cursor: "pointer", background: sel ? SEV_COLOR[s] : "#fff", color: sel ? "#fff" : SEV_COLOR[s], border: `1.5px solid ${SEV_COLOR[s]}`, transition: "all 0.1s" }}>
                                      {s}<br />{SEV_LABEL[s]}
                                    </button>
                                  )
                                })}
                              </div>
                            </div>
                          </>
                        )}
                        <div>
                          <FieldLabel text="NOTES" />
                          <textarea value={String(captureForm.notes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} placeholder="Describe what you see…" />
                        </div>
                        <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.defectSubtype} />
                      </div>
                    )}

                    {/* Excavation form */}
                    {captureStep === "excavation" && (
                      <div style={{ padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#38424E", letterSpacing: "0.1em", textTransform: "uppercase" }}>EXCAVATION POINT</div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          <div>
                            <FieldLabel text="FROM (ft) *" />
                            <input type="number" value={String(captureForm.footage ?? "")} onChange={e => setCaptureForm(f => ({ ...f, footage: e.target.value }))} style={inputSt} placeholder="0" />
                          </div>
                          <div>
                            <FieldLabel text="TO (ft) *" />
                            <input type="number" value={String(captureForm.footageTo ?? "")} onChange={e => setCaptureForm(f => ({ ...f, footageTo: e.target.value }))} style={inputSt} placeholder="0" />
                          </div>
                        </div>
                        <ChipField label="DEPTH BAND *" options={DEPTH_BANDS} value={String(captureForm.depthBand ?? "")} onChange={v => setCaptureForm(f => ({ ...f, depthBand: v }))} color="#38424E" pricing />
                        <ChipField label="SURFACE TO OPEN *" options={SURFACES} value={String(captureForm.surface ?? "")} onChange={v => setCaptureForm(f => ({ ...f, surface: v }))} color="#38424E" pricing />
                        <div>
                          <FieldLabel text="RESTORATION SQ FT *" pricing />
                          <input type="number" value={String(captureForm.restoreSqft ?? "")} onChange={e => setCaptureForm(f => ({ ...f, restoreSqft: e.target.value }))} style={inputSt} placeholder="0" />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                          {[{ key: "interiorHandDig", label: "Interior — hand dig" }, { key: "bypassPumping", label: "Bypass pumping needed" }].map(({ key, label }) => (
                            <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: C.text }}>
                              <input type="checkbox" checked={!!captureForm[key]} onChange={e => setCaptureForm(f => ({ ...f, [key]: e.target.checked }))} style={{ accentColor: "#38424E", width: 14, height: 14 }} />
                              {label}
                            </label>
                          ))}
                        </div>
                        <ChipField label="EQUIPMENT ACCESS" options={EQUIPMENT_ACCESS} value={String(captureForm.equipmentAccess ?? "")} onChange={v => setCaptureForm(f => ({ ...f, equipmentAccess: v }))} color="#38424E" />
                        <div>
                          <FieldLabel text="NOTES FOR ESTIMATOR" />
                          <textarea value={String(captureForm.notes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} placeholder="Gas line 3 ft north, slab is 8 in. with rebar…" />
                        </div>
                        <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.footage || !captureForm.footageTo || !captureForm.depthBand || !captureForm.surface || !captureForm.restoreSqft} />
                      </div>
                    )}

                    {/* Direction change form */}
                    {captureStep === "direction-change" && (
                      <div style={{ padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#7333D6", letterSpacing: "0.1em", textTransform: "uppercase" }}>DIRECTION CHANGE</div>
                        <FootageRow footage={String(captureForm.footage ?? "")} footageTo={String(captureForm.footageTo ?? "")} onChange={v => setCaptureForm(f => ({ ...f, footage: v }))} onChangeTo={v => setCaptureForm(f => ({ ...f, footageTo: v }))} />
                        <ChipField label="WHICH WAY *" options={DIRECTION_WAYS} value={String(captureForm.directionWhich ?? "")} onChange={v => setCaptureForm(f => ({ ...f, directionWhich: v }))} color="#7333D6" />
                        <ChipField label="FITTING" options={DIRECTION_FITTINGS} value={String(captureForm.directionFitting ?? "")} onChange={v => setCaptureForm(f => ({ ...f, directionFitting: v }))} color="#7333D6" />
                        <div style={{ padding: "8px 10px", borderRadius: 5, background: "#F0F4F8", fontSize: 10, color: "#5F6E7C", lineHeight: 1.5 }}>
                          A hard 90 is what a liner and a jetter both struggle to get around, so this matters as much to the quote as the defects do.
                        </div>
                        <div>
                          <FieldLabel text="NOTES" />
                          <textarea value={String(captureForm.notes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} placeholder="" />
                        </div>
                        <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.directionWhich} />
                      </div>
                    )}

                    {/* Pipe transition form */}
                    {captureStep === "pipe-transition" && (
                      <div style={{ padding: "14px 14px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: "#00803E", letterSpacing: "0.1em", textTransform: "uppercase" }}>PIPE TRANSITION</div>
                        <FootageRow footage={String(captureForm.footage ?? "")} footageTo={String(captureForm.footageTo ?? "")} onChange={v => setCaptureForm(f => ({ ...f, footage: v }))} onChangeTo={v => setCaptureForm(f => ({ ...f, footageTo: v }))} />
                        <ChipField label="TYPE OF PIPE *" options={PIPE_TYPES} value={String(captureForm.pipeType ?? "")} onChange={v => setCaptureForm(f => ({ ...f, pipeType: v }))} color="#00803E" pricing />
                        <ChipField label="SIZE OF PIPE *" options={PIPE_SIZES} value={String(captureForm.pipeSize ?? "")} onChange={v => setCaptureForm(f => ({ ...f, pipeSize: v }))} color="#00803E" pricing />
                        <div style={{ padding: "8px 10px", borderRadius: 5, background: "#F0F4F8", fontSize: 10, color: "#5F6E7C", lineHeight: 1.5 }}>
                          This runs to the next change, or to the run end. A size change means separate liner setups, so it changes the price.
                        </div>
                        <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.pipeType || !captureForm.pipeSize} />
                      </div>
                    )}
                  </div>
                )}

                {/* Region D — run length */}
                <div style={{ padding: "12px 16px 0" }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>RUN LENGTH & DEPTH</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>

                    {/* Run start */}
                    <div style={{ padding: "10px 11px", borderRadius: 6, border: `1px solid ${C.border}`, background: C.card }}>
                      <div style={{ fontSize: 8.5, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 5 }}>Run start</div>
                      {selectedVideo.runStart ? (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "JetBrains Mono", color: "#16202A" }}>{selectedVideo.runStart.footage} ft</div>
                          {selectedVideo.runStart.depth && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>Depth: {selectedVideo.runStart.depth} ft</div>}
                          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>{selectedVideo.runStart.pipeSize} {selectedVideo.runStart.pipeType}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 10, color: C.dim, fontStyle: "italic" }}>Not set</div>
                      )}
                    </div>

                    {/* Run end */}
                    <div
                      onClick={() => { if (selectedVideo.observationsClosed && !selectedVideo.runEnd) setShowRunEndForm(true) }}
                      style={{
                        padding: "10px 11px", borderRadius: 6,
                        border: selectedVideo.observationsClosed ? `1.5px solid #CE1A74` : `1px dashed ${C.border}`,
                        background: selectedVideo.runEnd ? C.card : "#FAFBFC",
                        opacity: selectedVideo.observationsClosed ? 1 : 0.45,
                        cursor: selectedVideo.observationsClosed && !selectedVideo.runEnd ? "pointer" : "default",
                      }}
                    >
                      <div style={{ fontSize: 8.5, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 5 }}>Run end</div>
                      {selectedVideo.runEnd ? (
                        <>
                          <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "JetBrains Mono", color: "#16202A" }}>{selectedVideo.runEnd.footage} ft</div>
                          {selectedVideo.runEnd.depth && <div style={{ fontSize: 10, color: C.muted, marginTop: 1 }}>Depth: {selectedVideo.runEnd.depth} ft</div>}
                          <div style={{ fontSize: 9.5, color: C.muted, marginTop: 2 }}>{selectedVideo.runEnd.pipeSize} {selectedVideo.runEnd.pipeType}</div>
                        </>
                      ) : (
                        <div style={{ fontSize: 9.5, color: selectedVideo.observationsClosed ? "#CE1A74" : C.dim, fontStyle: "italic", lineHeight: 1.4 }}>
                          {selectedVideo.observationsClosed ? "Tap to record footage, pipe type and size." : "Locked until you've finished logging observations."}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Run end summary */}
                  {selectedVideo.runEnd && selectedVideo.runStart && (
                    <div style={{ marginTop: 8, padding: "7px 10px", borderRadius: 5, background: "#E8F4EF", border: "1px solid #00803E44", textAlign: "center", fontFamily: "JetBrains Mono", fontSize: 12, fontWeight: 700, color: "#00803E" }}>
                      {Math.abs(parseFloat(selectedVideo.runEnd.footage) - parseFloat(selectedVideo.runStart.footage)).toFixed(0)} ft inspected{selectedVideo.runStart.depth && selectedVideo.runEnd.depth ? ` · Δ depth ${Math.abs(parseFloat(selectedVideo.runEnd.depth) - parseFloat(selectedVideo.runStart.depth)).toFixed(1)} ft` : ""}
                    </div>
                  )}

                  {/* Run end form */}
                  {showRunEndForm && (
                    <div style={{ marginTop: 10, padding: "12px 12px 10px", borderRadius: 8, border: "1.5px solid #CE1A74", background: "#FFF8FA", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 10, fontWeight: 700, color: "#CE1A74", letterSpacing: "0.08em", textTransform: "uppercase" }}>RECORD RUN END</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <FieldLabel text="FOOTAGE AT END *" />
                          <input type="number" value={runEndForm.footage} onChange={e => setRunEndForm(f => ({ ...f, footage: e.target.value }))} style={inputSt} placeholder="0" />
                        </div>
                        <div>
                          <FieldLabel text="DEPTH AT END" />
                          <input type="number" value={runEndForm.depth} onChange={e => setRunEndForm(f => ({ ...f, depth: e.target.value }))} style={inputSt} placeholder="ft" />
                        </div>
                      </div>
                      <ChipField label="TYPE OF PIPE *" options={PIPE_TYPES} value={runEndForm.pipeType} onChange={v => setRunEndForm(f => ({ ...f, pipeType: v }))} color="#CE1A74" pricing />
                      <ChipField label="SIZE OF PIPE *" options={PIPE_SIZES} value={runEndForm.pipeSize} onChange={v => setRunEndForm(f => ({ ...f, pipeSize: v }))} color="#CE1A74" pricing />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setShowRunEndForm(false)} style={{ flex: 1, padding: "7px", fontSize: 10, background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer" }}>Cancel</button>
                        <button onClick={saveRunEnd} disabled={!runEndForm.footage || !runEndForm.pipeType || !runEndForm.pipeSize} style={{ flex: 2, padding: "7px", fontSize: 10, fontWeight: 700, background: runEndForm.footage ? "#CE1A74" : C.card, color: runEndForm.footage ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: runEndForm.footage ? "pointer" : "default" }}>
                          Save Run End
                        </button>
                      </div>
                    </div>
                  )}

                  <div style={{ marginTop: 8, marginBottom: 12, fontSize: 9.5, color: C.muted, lineHeight: 1.4 }}>
                    {selectedVideo.observationsClosed ? "Observations closed. Record the run end above." : "Log every tie-in, defect and change first — the run end comes last."}
                  </div>
                </div>

                {/* Region E — observation log */}
                <div style={{ padding: "0 16px 16px" }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>LOGGED ON THIS RUN</div>
                  {selectedVideo.observations.length === 0 ? (
                    <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic" }}>Nothing logged yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {[...selectedVideo.observations].sort((a, b) => parseFloat(a.footage || "0") - parseFloat(b.footage || "0")).map(obs => {
                        const col = OBS_COLOR[obs.type]
                        // Build summary chips
                        const chips: string[] = []
                        if (obs.type === "tie-in") {
                          if (obs.tieSubtype) chips.push(obs.tieSubtype)
                          if (obs.tieSize) chips.push(obs.tieSize)
                          if (obs.tieOrientation?.length) chips.push(obs.tieOrientation.map(h => `${h} o'clock`).join(" & "))
                        } else if (obs.type === "defect") {
                          if (obs.defectSubtype) chips.push(obs.defectSubtype)
                          if (obs.defectOrientation?.length) chips.push(obs.defectOrientation.map(h => `${h} o'clock`).join(" & "))
                          if (obs.severity) chips.push(SEV_LABEL[obs.severity])
                        } else if (obs.type === "excavation") {
                          if (obs.depthBand) chips.push(obs.depthBand + " deep")
                          if (obs.surface) chips.push(obs.surface)
                        } else if (obs.type === "direction-change") {
                          if (obs.directionWhich) chips.push(obs.directionWhich)
                          if (obs.directionFitting) chips.push(obs.directionFitting)
                        } else if (obs.type === "pipe-transition") {
                          if (obs.pipeSize) chips.push(obs.pipeSize)
                          if (obs.pipeType) chips.push(obs.pipeType)
                        }

                        return (
                          <div key={obs.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 6, background: C.card, borderTop: `1px solid ${col}18`, borderRight: `1px solid ${col}18`, borderBottom: `1px solid ${col}18`, borderLeft: `3px solid ${col}` }}>
                            {/* Footage */}
                            <div style={{ flexShrink: 0, minWidth: 34, textAlign: "right" }}>
                              <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", fontWeight: 700, color: col }}>{obs.footage ?? "—"}{obs.footageTo ? `–${obs.footageTo}` : ""}</div>
                              <div style={{ fontSize: 8.5, color: C.dim }}>ft</div>
                            </div>
                            {/* Content */}
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
                                <span style={{ fontSize: 8.5, fontWeight: 700, color: col, letterSpacing: "0.08em", textTransform: "uppercase" }}>{OBS_LABEL[obs.type]}</span>
                                {obs.type === "defect" && obs.severity && (
                                  <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 700, background: SEV_COLOR[obs.severity] + "22", color: SEV_COLOR[obs.severity], letterSpacing: "0.06em" }}>
                                    {obs.severity} {SEV_LABEL[obs.severity]}
                                  </span>
                                )}
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {chips.map((chip, i) => (
                                  <span key={i} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: col + "12", color: col, fontFamily: "JetBrains Mono" }}>{chip}</span>
                                ))}
                              </div>
                              {obs.notes && <div style={{ fontSize: 10, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{obs.notes}</div>}
                              {obs.tieServes && <div style={{ fontSize: 10, color: C.muted, marginTop: 4 }}>{obs.tieServes}</div>}
                            </div>
                            {/* Delete */}
                            <button onClick={() => deleteObservation(obs.id)} style={{ flexShrink: 0, padding: "2px 6px", fontSize: 9, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 3, cursor: "pointer", marginTop: 1 }}>✕</button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Footer — Done */}
                <div style={{ padding: "10px 16px 16px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 7 }}>
                  <button
                    onClick={() => setObsClosed(!selectedVideo.observationsClosed)}
                    style={{ width: "100%", padding: "9px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 5, cursor: "pointer", transition: "all 0.15s", background: selectedVideo.observationsClosed ? "transparent" : "#16202A", color: selectedVideo.observationsClosed ? C.muted : "#fff", border: selectedVideo.observationsClosed ? `1px solid ${C.border}` : "none" }}
                  >
                    {selectedVideo.observationsClosed ? "Back to observations" : "Done adding observations"}
                  </button>
                  <button
                    disabled={!selectedVideo.observationsClosed || !selectedVideo.runEnd}
                    onClick={() => {
                      if (!selectedVideo.observationsClosed || !selectedVideo.runEnd) return
                      setIncompletePipeIds(prev => { const s = new Set(prev); s.delete(selectedPipeId!); return s })
                      setSelectedVideoId(null)
                      setCaptureStep("none")
                    }}
                    style={{ width: "100%", padding: "10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: 6, cursor: (selectedVideo.observationsClosed && selectedVideo.runEnd) ? "pointer" : "default", background: (selectedVideo.observationsClosed && selectedVideo.runEnd) ? "#00803E" : C.card, color: (selectedVideo.observationsClosed && selectedVideo.runEnd) ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" }}
                  >
                    Complete Analysis
                  </button>
                  {!selectedVideo.observationsClosed && (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
                      <div style={{ fontSize: 9.5, color: C.dim }}>Finish logging observations to enable Complete.</div>
                      <button
                        onClick={() => {
                          if (selectedPipeId) setIncompletePipeIds(prev => new Set([...prev, selectedPipeId]))
                          setSelectedVideoId(null)
                          setCaptureStep("none")
                        }}
                        style={{ flexShrink: 0, padding: "4px 10px", fontSize: 9, fontWeight: 600, letterSpacing: "0.04em", background: "transparent", color: "#A96B00", border: "1px solid #A96B00", borderRadius: 4, cursor: "pointer", whiteSpace: "nowrap" }}
                      >
                        Close anyway
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          {/* Delete pipe at bottom */}
          <div style={{ marginTop: "auto", padding: "12px 16px 16px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <button onClick={() => deletePipe(selectedPipe.id)} style={{ width: "100%", padding: "8px", fontSize: 10.5, fontWeight: 700, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}>
              Delete Pipe Segment
            </button>
          </div>
        </div>
        )}
      </div>

      {/* ── INSPECTION FULLSCREEN OVERLAY ────────────────────────────────────── */}
      {(assetVideoSource || (inspectionFullscreen && selectedPipe)) && selectedVideo && (() => {
        const vid = selectedVideo
        const pipe = selectedPipe

        const videoSvg = (
          <svg width="100%" height="100%" viewBox="0 0 640 360" preserveAspectRatio="xMidYMid slice">
            <rect width="640" height="360" fill="#0A1520" />
            <ellipse cx="320" cy="180" rx="152" ry="152" fill="none" stroke="#0F2030" strokeWidth="22" />
            <ellipse cx="320" cy="180" rx="152" ry="152" fill="none" stroke="#1B6FB8" strokeWidth="1.5" opacity="0.25" />
            <ellipse cx="320" cy="180" rx="100" ry="100" fill="none" stroke="#1B6FB8" strokeWidth="0.8" opacity="0.12" />
            <ellipse cx="320" cy="180" rx="50" ry="50" fill="none" stroke="#1B6FB8" strokeWidth="0.5" opacity="0.07" />
            <ellipse cx="320" cy="312" rx="120" ry="18" fill="#1B6FB8" opacity="0.07" />
            <path d="M312,34 L320,54 L328,34" stroke="#A96B00" strokeWidth="2.5" fill="none" opacity="0.85" />
            <circle cx="320" cy="50" r="12" fill="none" stroke="#A96B00" strokeWidth="1.5" opacity="0.7" />
            <line x1="308" y1="180" x2="332" y2="180" stroke="#38BDF8" strokeWidth="1" opacity="0.4" />
            <line x1="320" y1="168" x2="320" y2="192" stroke="#38BDF8" strokeWidth="1" opacity="0.4" />
            <circle cx="320" cy="180" r="3" fill="#38BDF8" opacity="0.2" />
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={i} x1="168" y1={36 + i * 36} x2="472" y2={36 + i * 36} stroke="#38BDF8" strokeWidth="0.2" opacity="0.04" />
            ))}
            <rect x="12" y="12" width="100" height="22" fill="#00000080" rx="3" />
            <text x="18" y="26" fill="#38BDF8" fontSize="13" fontFamily="JetBrains Mono">00:02:47</text>
            <rect x="504" y="12" width="124" height="22" fill="#00000080" rx="3" />
            {videoPlaying && <circle cx="514" cy="23" r="6" fill="#CE1A74" opacity="0.9" />}
            <text x={videoPlaying ? "524" : "510"} y="27" fill="#CBD5E1" fontSize="13" fontFamily="JetBrains Mono">{videoPlaying ? "REC" : "PAUSED"}</text>
            <rect x="12" y="326" width="148" height="22" fill="#00000080" rx="3" />
            <text x="18" y="340" fill="#94A3B8" fontSize="11.5" fontFamily="JetBrains Mono">DIST: 41.0 ft</text>
            <rect x="464" y="326" width="164" height="22" fill="#00000080" rx="3" />
            <text x="470" y="340" fill="#94A3B8" fontSize="11.5" fontFamily="JetBrains Mono">⌀{pipe?.start?.diameter ?? "—"} {pipe?.start?.type ?? ""}</text>
          </svg>
        )

        const obsRows = [...vid.observations].sort((a, b) => parseFloat(a.footage || "0") - parseFloat(b.footage || "0")).map(obs => {
          const col = OBS_COLOR[obs.type]
          const chips: string[] = []
          if (obs.type === "tie-in") {
            if (obs.tieSubtype) chips.push(obs.tieSubtype)
            if (obs.tieSize) chips.push(obs.tieSize)
            if (obs.tieOrientation?.length) chips.push(obs.tieOrientation.map(h => `${h} o'clock`).join(" & "))
          } else if (obs.type === "defect") {
            if (obs.defectSubtype) chips.push(obs.defectSubtype)
            if (obs.defectOrientation?.length) chips.push(obs.defectOrientation.map(h => `${h} o'clock`).join(" & "))
            if (obs.severity) chips.push(SEV_LABEL[obs.severity])
          } else if (obs.type === "excavation") {
            if (obs.depthBand) chips.push(obs.depthBand + " deep")
            if (obs.surface) chips.push(obs.surface)
          } else if (obs.type === "direction-change") {
            if (obs.directionWhich) chips.push(obs.directionWhich)
            if (obs.directionFitting) chips.push(obs.directionFitting)
          } else if (obs.type === "pipe-transition") {
            if (obs.pipeSize) chips.push(obs.pipeSize)
            if (obs.pipeType) chips.push(obs.pipeType)
          }
          return (
            <div key={obs.id} style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "10px 12px", borderRadius: 7, background: "#fff", borderTop: `1px solid ${col}18`, borderRight: `1px solid ${col}18`, borderBottom: `1px solid ${col}18`, borderLeft: `3px solid ${col}` }}>
              <div style={{ flexShrink: 0, minWidth: 38, textAlign: "right" }}>
                <div style={{ fontSize: 13, fontFamily: "JetBrains Mono", fontWeight: 700, color: col }}>{obs.footage ?? "—"}{obs.footageTo ? `–${obs.footageTo}` : ""}</div>
                <div style={{ fontSize: 9, color: "#94A3B8" }}>ft</div>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 5 }}>
                  <span style={{ fontSize: 9.5, fontWeight: 700, color: col, letterSpacing: "0.08em", textTransform: "uppercase" }}>{OBS_LABEL[obs.type]}</span>
                  {obs.type === "defect" && obs.severity && (
                    <span style={{ padding: "1px 6px", borderRadius: 3, fontSize: 8.5, fontWeight: 700, background: SEV_COLOR[obs.severity] + "22", color: SEV_COLOR[obs.severity], letterSpacing: "0.06em" }}>{obs.severity} {SEV_LABEL[obs.severity]}</span>
                  )}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {chips.map((chip, i) => <span key={i} style={{ fontSize: 9.5, padding: "2px 7px", borderRadius: 3, background: col + "12", color: col, fontFamily: "JetBrains Mono" }}>{chip}</span>)}
                </div>
                {obs.notes && <div style={{ fontSize: 10.5, color: "#5F6E7C", marginTop: 5, lineHeight: 1.4 }}>{obs.notes}</div>}
                {obs.tieServes && <div style={{ fontSize: 10.5, color: "#5F6E7C", marginTop: 5 }}>{obs.tieServes}</div>}
              </div>
              <button onClick={() => deleteObservation(obs.id)} style={{ flexShrink: 0, padding: "3px 8px", fontSize: 10, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 3, cursor: "pointer", marginTop: 2 }}>✕</button>
            </div>
          )
        })

        // Shared form content for right panel
        const formPanel = (
          <>
            {captureStep === "chooser" && (
              <div style={{ padding: "14px 16px 12px" }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#16202A", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 2 }}>WHAT ARE YOU LOOKING AT?</div>
                <div style={{ fontSize: 10, color: "#5F6E7C", marginBottom: 10 }}>Captured at {captureForm.footage ? captureForm.footage + " ft" : "—"}. It attaches to whatever you pick.</div>
                <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
                  <div style={{ fontSize: 9, color: "#5F6E7C", letterSpacing: "0.07em", textTransform: "uppercase", whiteSpace: "nowrap" }}>FOOTAGE</div>
                  <input type="number" value={String(captureForm.footage ?? "")} onChange={e => setCaptureForm(f => ({ ...f, footage: e.target.value }))} style={{ ...inputSt, width: 58, textAlign: "center" }} />
                  {[0, 5, 10, 25].map(d => (
                    <button key={d} onClick={() => setCaptureForm(f => ({ ...f, footage: String((parseFloat(String(f.footage || "0")) + d).toFixed(0)) }))} style={{ padding: "4px 8px", fontSize: 9.5, fontWeight: 600, background: "#fff", color: "#5F6E7C", border: "1px solid #D2DAE2", borderRadius: 3, cursor: "pointer", fontFamily: "JetBrains Mono" }}>+{d}</button>
                  ))}
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                  {CHOOSER_OPTIONS.map(opt => (
                    <button key={opt.type} onClick={() => setCaptureStep(opt.type)}
                      style={{ padding: "10px 10px 8px", textAlign: "left", borderRadius: 6, background: "#fff", border: `1.5px solid ${OBS_COLOR[opt.type]}`, cursor: "pointer" }}
                      onMouseEnter={e => (e.currentTarget.style.background = OBS_COLOR[opt.type] + "0F")}
                      onMouseLeave={e => (e.currentTarget.style.background = "#fff")}
                    >
                      <div style={{ fontSize: 9, fontWeight: 700, color: OBS_COLOR[opt.type], letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 3 }}>{opt.label}</div>
                      <div style={{ fontSize: 9, color: "#5F6E7C", lineHeight: 1.4 }}>{opt.desc}</div>
                    </button>
                  ))}
                </div>
                <button onClick={() => setCaptureStep("none")} style={{ marginTop: 10, width: "100%", padding: "7px", fontSize: 10.5, background: "transparent", color: "#5F6E7C", border: "1px solid #D2DAE2", borderRadius: 5, cursor: "pointer" }}>Cancel</button>
              </div>
            )}
            {captureStep === "tie-in" && (
              <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#1B6FB8", letterSpacing: "0.1em", textTransform: "uppercase" }}>TIE-IN</div>
                <FootageRow footage={String(captureForm.footage ?? "")} footageTo={String(captureForm.footageTo ?? "")} onChange={v => setCaptureForm(f => ({ ...f, footage: v }))} onChangeTo={v => setCaptureForm(f => ({ ...f, footageTo: v }))} />
                <ChipField label="TYPE *" options={TIE_SUBTYPES} value={String(captureForm.tieSubtype ?? "")} onChange={v => setCaptureForm(f => ({ ...f, tieSubtype: v }))} color="#1B6FB8" />
                <ChipField label="SIZE" options={TIE_SIZES} value={String(captureForm.tieSize ?? "")} onChange={v => setCaptureForm(f => ({ ...f, tieSize: v }))} color="#1B6FB8" />
                <div><FieldLabel text={String(captureForm.tieSubtype ?? "").startsWith("Double") ? "ORIENTATION — PICK TWO" : "ORIENTATION"} /><div style={{ display: "flex", justifyContent: "center" }}><ClockFace selected={(captureForm.tieOrientation as number[]) ?? []} multi={String(captureForm.tieSubtype ?? "").startsWith("Double")} onChange={v => setCaptureForm(f => ({ ...f, tieOrientation: v }))} /></div></div>
                <div><FieldLabel text="WHAT IT SERVES" /><input value={String(captureForm.tieServes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, tieServes: e.target.value }))} placeholder="Bldg 2 stack, laundry, area drain…" style={inputSt} /></div>
                <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.tieSubtype} />
              </div>
            )}
            {captureStep === "defect" && (
              <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#A96B00", letterSpacing: "0.1em", textTransform: "uppercase" }}>DEFECT</div>
                <FootageRow footage={String(captureForm.footage ?? "")} footageTo={String(captureForm.footageTo ?? "")} onChange={v => setCaptureForm(f => ({ ...f, footage: v }))} onChangeTo={v => setCaptureForm(f => ({ ...f, footageTo: v }))} />
                <ChipField label="TYPE *" options={DEFECT_SUBTYPES} value={String(captureForm.defectSubtype ?? "")} onChange={v => setCaptureForm(f => ({ ...f, defectSubtype: v }))} color="#A96B00" />
                {captureForm.defectSubtype === "Complete collapse"
                  ? <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #CE1A7444", background: "#FFF0F5", fontSize: 10.5, color: "#CE1A74", lineHeight: 1.5 }}><strong>A collapse rules out lining.</strong> Add an excavation point at this distance before you close the run.</div>
                  : <>
                      <div><FieldLabel text="ORIENTATION" /><div style={{ display: "flex", justifyContent: "center" }}><ClockFace selected={(captureForm.defectOrientation as number[]) ?? []} multi={false} onChange={v => setCaptureForm(f => ({ ...f, defectOrientation: v }))} /></div></div>
                      <div><FieldLabel text="SEVERITY" /><div style={{ display: "flex", gap: 4 }}>{([1, 2, 3, 4, 5] as Severity[]).map(s => { const sel = captureForm.severity === s; return <button key={s} onClick={() => setCaptureForm(f => ({ ...f, severity: s }))} style={{ flex: 1, padding: "6px 2px", fontSize: 8, fontWeight: 700, textAlign: "center", borderRadius: 4, cursor: "pointer", background: sel ? SEV_COLOR[s] : "#fff", color: sel ? "#fff" : SEV_COLOR[s], border: `1.5px solid ${SEV_COLOR[s]}` }}>{s}<br />{SEV_LABEL[s]}</button> })}</div></div>
                    </>
                }
                <div><FieldLabel text="NOTES" /><textarea value={String(captureForm.notes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} placeholder="Describe what you see…" /></div>
                <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.defectSubtype} />
              </div>
            )}
            {captureStep === "excavation" && (
              <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#38424E", letterSpacing: "0.1em", textTransform: "uppercase" }}>EXCAVATION POINT</div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div><FieldLabel text="FROM (ft) *" /><input type="number" value={String(captureForm.footage ?? "")} onChange={e => setCaptureForm(f => ({ ...f, footage: e.target.value }))} style={inputSt} placeholder="0" /></div>
                  <div><FieldLabel text="TO (ft) *" /><input type="number" value={String(captureForm.footageTo ?? "")} onChange={e => setCaptureForm(f => ({ ...f, footageTo: e.target.value }))} style={inputSt} placeholder="0" /></div>
                </div>
                <ChipField label="DEPTH BAND *" options={DEPTH_BANDS} value={String(captureForm.depthBand ?? "")} onChange={v => setCaptureForm(f => ({ ...f, depthBand: v }))} color="#38424E" pricing />
                <ChipField label="SURFACE TO OPEN *" options={SURFACES} value={String(captureForm.surface ?? "")} onChange={v => setCaptureForm(f => ({ ...f, surface: v }))} color="#38424E" pricing />
                <div><FieldLabel text="RESTORATION SQ FT *" pricing /><input type="number" value={String(captureForm.restoreSqft ?? "")} onChange={e => setCaptureForm(f => ({ ...f, restoreSqft: e.target.value }))} style={inputSt} placeholder="0" /></div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {[{ key: "interiorHandDig", label: "Interior — hand dig" }, { key: "bypassPumping", label: "Bypass pumping needed" }].map(({ key, label }) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer", fontSize: 11, color: "#16202A" }}>
                      <input type="checkbox" checked={!!captureForm[key]} onChange={e => setCaptureForm(f => ({ ...f, [key]: e.target.checked }))} style={{ accentColor: "#38424E", width: 14, height: 14 }} />{label}
                    </label>
                  ))}
                </div>
                <ChipField label="EQUIPMENT ACCESS" options={EQUIPMENT_ACCESS} value={String(captureForm.equipmentAccess ?? "")} onChange={v => setCaptureForm(f => ({ ...f, equipmentAccess: v }))} color="#38424E" />
                <div><FieldLabel text="NOTES FOR ESTIMATOR" /><textarea value={String(captureForm.notes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} placeholder="Gas line 3 ft north…" /></div>
                <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.footage || !captureForm.footageTo || !captureForm.depthBand || !captureForm.surface || !captureForm.restoreSqft} />
              </div>
            )}
            {captureStep === "direction-change" && (
              <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#7333D6", letterSpacing: "0.1em", textTransform: "uppercase" }}>DIRECTION CHANGE</div>
                <FootageRow footage={String(captureForm.footage ?? "")} footageTo={String(captureForm.footageTo ?? "")} onChange={v => setCaptureForm(f => ({ ...f, footage: v }))} onChangeTo={v => setCaptureForm(f => ({ ...f, footageTo: v }))} />
                <ChipField label="WHICH WAY *" options={DIRECTION_WAYS} value={String(captureForm.directionWhich ?? "")} onChange={v => setCaptureForm(f => ({ ...f, directionWhich: v }))} color="#7333D6" />
                <ChipField label="FITTING" options={DIRECTION_FITTINGS} value={String(captureForm.directionFitting ?? "")} onChange={v => setCaptureForm(f => ({ ...f, directionFitting: v }))} color="#7333D6" />
                <div style={{ padding: "8px 10px", borderRadius: 5, background: "#F0F4F8", fontSize: 10, color: "#5F6E7C", lineHeight: 1.5 }}>A hard 90 is what a liner and a jetter both struggle to get around.</div>
                <div><FieldLabel text="NOTES" /><textarea value={String(captureForm.notes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} /></div>
                <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.directionWhich} />
              </div>
            )}
            {captureStep === "pipe-transition" && (
              <div style={{ padding: "14px 16px 12px", display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: "#00803E", letterSpacing: "0.1em", textTransform: "uppercase" }}>PIPE TRANSITION</div>
                <FootageRow footage={String(captureForm.footage ?? "")} footageTo={String(captureForm.footageTo ?? "")} onChange={v => setCaptureForm(f => ({ ...f, footage: v }))} onChangeTo={v => setCaptureForm(f => ({ ...f, footageTo: v }))} />
                <ChipField label="TYPE OF PIPE *" options={PIPE_TYPES} value={String(captureForm.pipeType ?? "")} onChange={v => setCaptureForm(f => ({ ...f, pipeType: v }))} color="#00803E" pricing />
                <ChipField label="SIZE OF PIPE *" options={PIPE_SIZES} value={String(captureForm.pipeSize ?? "")} onChange={v => setCaptureForm(f => ({ ...f, pipeSize: v }))} color="#00803E" pricing />
                <div style={{ padding: "8px 10px", borderRadius: 5, background: "#F0F4F8", fontSize: 10, color: "#5F6E7C", lineHeight: 1.5 }}>This runs to the next change, or to the run end. A size change means separate liner setups.</div>
                <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.pipeType || !captureForm.pipeSize} />
              </div>
            )}
          </>
        )

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 500, display: "flex", fontFamily: "'DM Sans', sans-serif", background: "#0A1520" }}>

            {/* ── LEFT: video fills full height, edge-to-edge ─────────────────── */}
            <div style={{ flex: "0 0 72%", position: "relative", background: "#0A1520", overflow: "hidden" }}>
              {videoSvg}
              {/* Timeline pinned to bottom of video */}
              <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, padding: "16px 20px 20px", background: "linear-gradient(transparent, #020C18F5)" }}>
                <div style={{ height: 5, background: "rgba(255,255,255,0.1)", borderRadius: 3, position: "relative", cursor: "pointer" }}>
                  <div style={{ width: "35%", height: "100%", background: "#1B6FB8", borderRadius: 3 }} />
                  <div style={{ position: "absolute", left: "35%", top: "50%", transform: "translate(-50%,-50%)", width: 14, height: 14, borderRadius: "50%", background: "#fff", boxShadow: "0 0 0 3px #1B6FB8" }} />
                  {vid.observations.map((obs, i) => (
                    <div key={obs.id} title={obs.footage ? `${obs.footage} ft` : ""} style={{ position: "absolute", top: "50%", transform: "translate(-50%,-50%)", left: `${10 + i * 18}%`, width: 9, height: 9, borderRadius: "50%", background: OBS_COLOR[obs.type], boxShadow: "0 0 0 2px rgba(0,0,0,0.5)" }} />
                  ))}
                </div>
              </div>
              {/* Play/pause hover */}
              <div
                onClick={() => { setVideoPlaying(v => !v); if (!videoPlaying) setCaptureStep("none") }}
                style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", opacity: 0, transition: "opacity 0.15s" }}
                onMouseEnter={e => (e.currentTarget.style.opacity = "1")}
                onMouseLeave={e => (e.currentTarget.style.opacity = "0")}
              >
                <div style={{ width: 72, height: 72, borderRadius: "50%", background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                  {videoPlaying
                    ? <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><rect x="3" y="2" width="7" height="22" rx="2" fill="#fff" /><rect x="16" y="2" width="7" height="22" rx="2" fill="#fff" /></svg>
                    : <svg width="26" height="26" viewBox="0 0 26 26" fill="none"><polygon points="5,1 24,13 5,25" fill="#fff" /></svg>
                  }
                </div>
              </div>
            </div>

            {/* ── RIGHT: status + scrollable content + sticky footer ──────────── */}
            <div style={{ flex: "0 0 28%", display: "flex", flexDirection: "column", background: "#fff", minHeight: 0 }}>

              {/* Status + capture — pinned top */}
              <div style={{ flexShrink: 0, padding: "10px 14px 9px", borderBottom: "1px solid #E8EDF2", display: "flex", alignItems: "center", gap: 10 }}>
                <div style={{ flex: 1, fontSize: 11, color: videoPlaying ? "#A96B00" : "#5F6E7C", fontStyle: "italic", lineHeight: 1.3 }}>
                  {videoPlaying ? "Pause where you see something." : "Paused. Capture what's on screen."}
                </div>
                <button
                  disabled={videoPlaying || vid.observationsClosed}
                  onClick={() => { setCaptureStep("chooser"); setCaptureForm({ footage: vid.observations.length > 0 ? String(Math.max(...vid.observations.map(o => parseFloat(o.footage || "0")))) : "0" }) }}
                  style={{ flexShrink: 0, padding: "8px 12px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", background: (videoPlaying || vid.observationsClosed) ? "#E2E8F0" : "#00803E", color: (videoPlaying || vid.observationsClosed) ? "#94A3B8" : "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: (videoPlaying || vid.observationsClosed) ? "default" : "pointer", transition: "all 0.15s" }}
                >
                  Capture Observation
                </button>
                {/* Exit button */}
                <button onClick={() => { setInspectionFullscreen(false); setAssetVideoSource(null) }} title="Exit full screen" style={{ flexShrink: 0, width: 28, height: 28, display: "flex", alignItems: "center", justifyContent: "center", background: "#F1F5F9", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: "pointer", color: "#5F6E7C" }}>
                  <svg width="12" height="12" viewBox="0 0 12 12" fill="none"><path d="M4.5 1H1v3.5M1 7.5V11h3.5M7.5 11H11V7.5M11 4.5V1H7.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
                </button>
              </div>

              {/* Scrollable middle */}
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

                {/* Form (chooser or typed form) */}
                {captureStep !== "none" && (
                  <div style={{ borderTop: "none", borderRight: "none", borderBottom: "1px solid #E8EDF2", borderLeft: "3px solid #A96B00", background: "#FFFBF5" }}>
                    {formPanel}
                  </div>
                )}

                {/* Run length */}
                <div style={{ padding: "12px 14px", borderBottom: "1px solid #E8EDF2" }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: "#5F6E7C", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>RUN LENGTH & DEPTH</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div style={{ padding: "10px 12px", borderRadius: 6, border: "1px solid #D2DAE2", background: "#F8FAFC" }}>
                      <div style={{ fontSize: 8, color: "#5F6E7C", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 4 }}>RUN START</div>
                      {vid.runStart
                        ? <><div style={{ fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono", color: "#16202A", lineHeight: 1.1 }}>{vid.runStart.footage} ft</div>{vid.runStart.depth && <div style={{ fontSize: 9.5, color: "#5F6E7C", marginTop: 2 }}>Depth: {vid.runStart.depth} ft</div>}<div style={{ fontSize: 9.5, color: "#5F6E7C", marginTop: 2 }}>{vid.runStart.pipeSize} {vid.runStart.pipeType}</div></>
                        : <div style={{ fontSize: 10, color: "#94A3B8", fontStyle: "italic" }}>Not set</div>}
                    </div>
                    <div onClick={() => { if (vid.observationsClosed && !vid.runEnd) setShowRunEndForm(true) }}
                      style={{ padding: "10px 12px", borderRadius: 6, border: vid.observationsClosed ? "1.5px solid #CE1A74" : "1px dashed #D2DAE2", background: "#F8FAFC", opacity: vid.observationsClosed ? 1 : 0.4, cursor: vid.observationsClosed && !vid.runEnd ? "pointer" : "default" }}>
                      <div style={{ fontSize: 8, color: "#5F6E7C", letterSpacing: "0.09em", textTransform: "uppercase", marginBottom: 4 }}>RUN END</div>
                      {vid.runEnd
                        ? <><div style={{ fontSize: 16, fontWeight: 700, fontFamily: "JetBrains Mono", color: "#16202A", lineHeight: 1.1 }}>{vid.runEnd.footage} ft</div>{vid.runEnd.depth && <div style={{ fontSize: 9.5, color: "#5F6E7C", marginTop: 2 }}>Depth: {vid.runEnd.depth} ft</div>}<div style={{ fontSize: 9.5, color: "#5F6E7C", marginTop: 2 }}>{vid.runEnd.pipeSize} {vid.runEnd.pipeType}</div></>
                        : <div style={{ fontSize: 9.5, color: vid.observationsClosed ? "#CE1A74" : "#94A3B8", fontStyle: "italic", lineHeight: 1.35 }}>{vid.observationsClosed ? "Tap to record footage, pipe type and size." : "Locked until you've finished logging observations."}</div>}
                    </div>
                  </div>
                  {vid.runEnd && vid.runStart && (
                    <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 5, background: "#E8F4EF", border: "1px solid #00803E44", textAlign: "center", fontFamily: "JetBrains Mono", fontSize: 12, fontWeight: 700, color: "#00803E" }}>
                      {Math.abs(parseFloat(vid.runEnd.footage) - parseFloat(vid.runStart.footage)).toFixed(0)} ft inspected{vid.runStart.depth && vid.runEnd.depth ? ` · Δ depth ${Math.abs(parseFloat(vid.runEnd.depth) - parseFloat(vid.runStart.depth)).toFixed(1)} ft` : ""}
                    </div>
                  )}
                  {showRunEndForm && (
                    <div style={{ marginTop: 10, padding: "12px 12px 10px", borderRadius: 7, border: "1.5px solid #CE1A74", background: "#FFF8FA", display: "flex", flexDirection: "column", gap: 8 }}>
                      <div style={{ fontSize: 9.5, fontWeight: 700, color: "#CE1A74", letterSpacing: "0.08em", textTransform: "uppercase" }}>RECORD RUN END</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div><FieldLabel text="FOOTAGE AT END *" /><input type="number" value={runEndForm.footage} onChange={e => setRunEndForm(f => ({ ...f, footage: e.target.value }))} style={inputSt} placeholder="0" /></div>
                        <div><FieldLabel text="DEPTH AT END" /><input type="number" value={runEndForm.depth} onChange={e => setRunEndForm(f => ({ ...f, depth: e.target.value }))} style={inputSt} placeholder="ft" /></div>
                      </div>
                      <ChipField label="TYPE OF PIPE *" options={PIPE_TYPES} value={runEndForm.pipeType} onChange={v => setRunEndForm(f => ({ ...f, pipeType: v }))} color="#CE1A74" pricing />
                      <ChipField label="SIZE OF PIPE *" options={PIPE_SIZES} value={runEndForm.pipeSize} onChange={v => setRunEndForm(f => ({ ...f, pipeSize: v }))} color="#CE1A74" pricing />
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={() => setShowRunEndForm(false)} style={{ flex: 1, padding: "7px", fontSize: 10, background: "#F8FAFC", color: "#5F6E7C", border: "1px solid #D2DAE2", borderRadius: 4, cursor: "pointer" }}>Cancel</button>
                        <button onClick={saveRunEnd} disabled={!runEndForm.footage} style={{ flex: 2, padding: "7px", fontSize: 10, fontWeight: 700, background: runEndForm.footage ? "#CE1A74" : "#F8FAFC", color: runEndForm.footage ? "#fff" : "#94A3B8", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 4, cursor: runEndForm.footage ? "pointer" : "default" }}>Save Run End</button>
                      </div>
                    </div>
                  )}
                  <div style={{ marginTop: 8, fontSize: 9.5, color: "#5F6E7C", lineHeight: 1.4 }}>
                    {vid.observationsClosed ? "Observations closed. Record the run end above." : "Log every tie-in, defect and change first — the run end comes last."}
                  </div>
                </div>

                {/* Obs log */}
                <div style={{ padding: "12px 14px 12px" }}>
                  <div style={{ fontSize: 8.5, fontWeight: 700, color: "#5F6E7C", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>LOGGED ON THIS RUN</div>
                  {vid.observations.length === 0
                    ? <div style={{ fontSize: 11, color: "#94A3B8", fontStyle: "italic" }}>Nothing logged yet.</div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{obsRows}</div>
                  }
                </div>
              </div>

              {/* Footer — pinned to bottom */}
              <div style={{ flexShrink: 0, borderTop: "1px solid #E8EDF2" }}>
                <button
                  onClick={() => setObsClosed(!vid.observationsClosed)}
                  style={{ display: "block", width: "100%", padding: "13px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", cursor: "pointer", background: vid.observationsClosed ? "#F1F5F9" : "#16202A", color: vid.observationsClosed ? "#5F6E7C" : "#fff", borderTop: "none", borderLeft: "none", borderRight: "none", borderBottom: "1px solid #E8EDF2", transition: "all 0.15s" }}
                >
                  {vid.observationsClosed ? "Back to observations" : "Done adding observations"}
                </button>
                <button
                  disabled={!vid.observationsClosed || !vid.runEnd}
                  onClick={() => {
                    if (!vid.observationsClosed || !vid.runEnd) return
                    if (!assetVideoSource) setIncompletePipeIds(prev => { const s = new Set(prev); s.delete(pipe?.id ?? ""); return s })
                    setInspectionFullscreen(false)
                    setAssetVideoSource(null)
                    setSelectedVideoId(null)
                    setCaptureStep("none")
                  }}
                  style={{ display: "block", width: "100%", padding: "13px 14px", fontSize: 11, fontWeight: 700, letterSpacing: "0.07em", textTransform: "uppercase", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: (vid.observationsClosed && vid.runEnd) ? "pointer" : "default", background: (vid.observationsClosed && vid.runEnd) ? "#00803E" : "#EDF1F4", color: (vid.observationsClosed && vid.runEnd) ? "#fff" : "#94A3B8" }}
                >
                  Complete Analysis
                </button>
                {!vid.observationsClosed && (
                  <button
                    onClick={() => {
                      if (!assetVideoSource) setIncompletePipeIds(prev => new Set([...prev, pipe?.id ?? ""]))
                      setInspectionFullscreen(false)
                      setAssetVideoSource(null)
                      setSelectedVideoId(null)
                      setCaptureStep("none")
                    }}
                    style={{ display: "block", width: "100%", padding: "9px 14px", fontSize: 10, fontWeight: 600, letterSpacing: "0.05em", textTransform: "uppercase", background: "transparent", color: "#A96B00", borderTop: "1px solid #E8EDF2", borderLeft: "none", borderRight: "none", borderBottom: "none", cursor: "pointer" }}
                  >
                    Close without completing
                  </button>
                )}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── PENDING VIEW DIALOG (2-step: name → checklist) ────────────────────── */}
      {pendingView && (() => {
        const bboxAssets = assets.filter(a =>
          a.x >= pendingView.x && a.x <= pendingView.x + pendingView.w &&
          a.y >= pendingView.y && a.y <= pendingView.y + pendingView.h
        )
        const bboxAssetIds = new Set(bboxAssets.map(a => a.id))
        const bboxPipes = pipes.filter(p => {
          if (p.fromId === "free") return false
          const fr = assets.find(a => a.id === p.fromId)
          const to = p.toId ? assets.find(a => a.id === p.toId) : null
          return fr && (bboxAssetIds.has(fr.id) || (to && bboxAssetIds.has(to.id)))
        })
        const allAssets = assets   // allow user to add anything from full map
        const allPipes = pipes

        const toggleAsset = (id: string) =>
          setPendingViewAssets(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])
        const togglePipe = (id: string) =>
          setPendingViewPipes(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,25,35,0.45)", backdropFilter: "blur(2px)" }}
              onClick={() => { setPendingView(null); setViewDialogStep("name") }} />
            <div style={{
              position: "relative", background: C.panel, border: `1px solid ${C.border}`,
              borderRadius: 12,
              width: viewDialogStep === "checklist" ? "min(900px, 90vw)" : 340,
              height: viewDialogStep === "checklist" ? "min(640px, 85vh)" : undefined,
              boxShadow: "0 20px 60px rgba(0,0,0,0.22)", display: "flex", flexDirection: "column",
              maxHeight: viewDialogStep === "checklist" ? undefined : "80vh",
            }}>
              {/* Step indicator */}
              <div style={{ padding: "18px 22px 0", display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                {(["name", "checklist"] as const).map((step, i) => (
                  <div key={step} style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {i > 0 && <div style={{ width: 20, height: 1, background: C.border }} />}
                    <div style={{
                      width: 20, height: 20, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center",
                      fontSize: 9, fontWeight: 700,
                      background: viewDialogStep === step ? C.cyan : (viewDialogStep === "checklist" && step === "name") ? "#00803E" : C.card,
                      color: viewDialogStep === step || (viewDialogStep === "checklist" && step === "name") ? "#fff" : C.muted,
                      border: `1.5px solid ${viewDialogStep === step ? C.cyan : C.border}`,
                    }}>{viewDialogStep === "checklist" && step === "name" ? "✓" : i + 1}</div>
                    <div style={{ fontSize: 9.5, fontWeight: 600, color: viewDialogStep === step ? C.text : C.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                      {step === "name" ? "Name" : "Confirm"}
                    </div>
                  </div>
                ))}
              </div>

              {viewDialogStep === "name" ? (
                <div style={{ padding: "0 22px 20px" }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 4 }}>Name this map view</div>
                  <div style={{ fontSize: 11, color: C.muted, marginBottom: 14 }}>
                    Captures {bboxAssets.length} asset{bboxAssets.length !== 1 ? "s" : ""} and {bboxPipes.length} pipe{bboxPipes.length !== 1 ? "s" : ""} in selected area
                  </div>
                  <input
                    autoFocus
                    value={newViewName}
                    onChange={e => setNewViewName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newViewName.trim()) openViewChecklist(); if (e.key === "Escape") setPendingView(null) }}
                    placeholder="e.g. North-West Corner"
                    style={{
                      width: "100%", padding: "9px 12px", background: C.card, border: `1px solid ${C.cyan}`,
                      borderRadius: 6, color: C.text, fontSize: 13, outline: "none",
                      fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box", marginBottom: 14,
                    }}
                  />
                  <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                    <button onClick={() => setPendingView(null)} style={{ padding: "7px 16px", background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>Cancel</button>
                    <button
                      onClick={openViewChecklist}
                      disabled={!newViewName.trim()}
                      style={{ padding: "7px 18px", background: newViewName.trim() ? C.cyan : C.border, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: newViewName.trim() ? "pointer" : "default" }}
                    >Next: Confirm Contents →</button>
                  </div>
                </div>
              ) : (
                /* Checklist step — full-width split layout */
                (() => {
                  return (
                    <div style={{ display: "flex", flexDirection: "column", flex: 1, overflow: "hidden" }}>
                      <div style={{ padding: "0 22px 12px", flexShrink: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 3 }}>Confirm view contents</div>
                        <div style={{ fontSize: 11, color: C.muted }}>
                          Uncheck items that should not be part of <strong style={{ color: C.text }}>{newViewName}</strong>. Click assets or pipes on the map to toggle inclusion.
                        </div>
                      </div>

                      {/* Split: checklist left, map right */}
                      <div style={{ display: "flex", flex: 1, overflow: "hidden", gap: 0 }}>
                        {/* LEFT — checklist */}
                        <div style={{ width: 260, flexShrink: 0, overflowY: "auto", borderRight: `1px solid ${C.border}`, padding: "0 16px 16px" }}>
                          {/* Assets section */}
                          <div style={{ marginBottom: 14 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, position: "sticky", top: 0, background: C.panel, paddingTop: 12, zIndex: 1 }}>
                              <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                Assets ({pendingViewAssets.length}/{allAssets.length})
                              </div>
                              <div style={{ display: "flex", gap: 6 }}>
                                <button onClick={() => setPendingViewAssets(bboxAssets.map(a => a.id))} style={{ fontSize: 9, color: C.cyan, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}>Bbox</button>
                                <button onClick={() => setPendingViewAssets(allAssets.map(a => a.id))} style={{ fontSize: 9, color: C.cyan, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}>All</button>
                                <button onClick={() => setPendingViewAssets([])} style={{ fontSize: 9, color: C.muted, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", padding: 0 }}>None</button>
                              </div>
                            </div>
                            {allAssets.map(a => {
                              const checked = pendingViewAssets.includes(a.id)
                              const inBbox = bboxAssetIds.has(a.id)
                              return (
                                <label key={a.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 7px", borderRadius: 4, background: checked ? C.card : "transparent", border: `1px solid ${checked ? C.border : "transparent"}`, cursor: "pointer", marginBottom: 2 }}>
                                  <input type="checkbox" checked={checked} onChange={() => toggleAsset(a.id)} style={{ accentColor: C.cyan }} />
                                  <div style={{ flex: 1, fontSize: 10.5, color: C.text, fontWeight: 500 }}>{a.label}</div>
                                  {!inBbox && <div style={{ fontSize: 8, color: "#A96B00", fontWeight: 600, padding: "1px 4px", background: "#FFF8F0", borderRadius: 2 }}>out</div>}
                                </label>
                              )
                            })}
                          </div>

                          {allPipes.length > 0 && (
                            <div style={{ marginBottom: 14 }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, position: "sticky", top: 0, background: C.panel, paddingTop: 12, zIndex: 1 }}>
                                <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, textTransform: "uppercase", letterSpacing: "0.08em" }}>
                                  Pipes ({pendingViewPipes.length}/{allPipes.length})
                                </div>
                                <div style={{ display: "flex", gap: 6 }}>
                                  <button onClick={() => setPendingViewPipes(bboxPipes.map(p => p.id))} style={{ fontSize: 9, color: C.cyan, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}>Bbox</button>
                                  <button onClick={() => setPendingViewPipes(allPipes.map(p => p.id))} style={{ fontSize: 9, color: C.cyan, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", padding: 0, fontWeight: 600 }}>All</button>
                                  <button onClick={() => setPendingViewPipes([])} style={{ fontSize: 9, color: C.muted, background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", padding: 0 }}>None</button>
                                </div>
                              </div>
                              {allPipes.map(p => {
                                const checked = pendingViewPipes.includes(p.id)
                                const inBbox = bboxPipes.some(bp => bp.id === p.id)
                                return (
                                  <label key={p.id} style={{ display: "flex", alignItems: "center", gap: 7, padding: "4px 7px", borderRadius: 4, background: checked ? C.card : "transparent", border: `1px solid ${checked ? C.border : "transparent"}`, cursor: "pointer", marginBottom: 2 }}>
                                    <input type="checkbox" checked={checked} onChange={() => togglePipe(p.id)} style={{ accentColor: C.cyan }} />
                                    <div style={{ flex: 1, fontSize: 10.5, color: C.text, fontWeight: 500 }}>{p.label}</div>
                                    {!inBbox && <div style={{ fontSize: 8, color: "#A96B00", fontWeight: 600, padding: "1px 4px", background: "#FFF8F0", borderRadius: 2 }}>out</div>}
                                  </label>
                                )
                              })}
                            </div>
                          )}
                        </div>

                        {/* RIGHT — mini map */}
                        <div style={{ flex: 1, position: "relative", overflow: "hidden", background: C.bg }}>
                          {/* Grid background */}
                          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", pointerEvents: "none" }}>
                            <defs>
                              <pattern id="vg-sm" width="24" height="24" patternUnits="userSpaceOnUse">
                                <path d="M 24 0 L 0 0 0 24" fill="none" stroke={C.cyan} strokeWidth="0.25" opacity="0.2" />
                              </pattern>
                              <pattern id="vg-lg" width="120" height="120" patternUnits="userSpaceOnUse">
                                <path d="M 120 0 L 0 0 0 120" fill="none" stroke={C.cyan} strokeWidth="0.6" opacity="0.12" />
                              </pattern>
                            </defs>
                            <rect width="100%" height="100%" fill="url(#vg-sm)" />
                            <rect width="100%" height="100%" fill="url(#vg-lg)" />
                          </svg>

                          {/* Interactive SVG for pipes */}
                          <svg style={{ position: "absolute", inset: 0, width: "100%", height: "100%", overflow: "visible" }}>
                            {/* Draw pending bbox outline */}
                            {pendingView && (
                              <rect
                                x={`${pendingView.x}%`} y={`${pendingView.y}%`}
                                width={`${pendingView.w}%`} height={`${pendingView.h}%`}
                                fill={C.cyan + "10"} stroke={C.cyan} strokeWidth="1" strokeDasharray="6 3"
                              />
                            )}

                            {/* Pipes — clickable */}
                            {pipes.map(pipe => {
                              const fr = assets.find(a => a.id === pipe.fromId)
                              if (!fr && pipe.fromId !== "free") return null
                              const frX = fr ? fr.x : (pipe.fromX ?? 0)
                              const frY = fr ? fr.y : (pipe.fromY ?? 0)
                              const toAsset = pipe.toId ? assets.find(a => a.id === pipe.toId) : null
                              const toX = toAsset ? toAsset.x : (pipe.toX ?? frX)
                              const toY = toAsset ? toAsset.y : (pipe.toY ?? frY)
                              const pts = [{ x: frX, y: frY }, ...(pipe.waypoints ?? []), { x: toX, y: toY }]
                              const included = pendingViewPipes.includes(pipe.id)
                              const lineColor = included ? "#1a1a1a" : "#B0C4D8"
                              return (
                                <g key={pipe.id} style={{ cursor: "pointer" }} onClick={() => togglePipe(pipe.id)}>
                                  {pts.slice(0, -1).map((pt, i) => (
                                    <line key={i}
                                      x1={`${pt.x}%`} y1={`${pt.y}%`}
                                      x2={`${pts[i + 1].x}%`} y2={`${pts[i + 1].y}%`}
                                      stroke="transparent" strokeWidth="12"
                                    />
                                  ))}
                                  {pts.slice(0, -1).map((pt, i) => (
                                    <line key={`v${i}`}
                                      x1={`${pt.x}%`} y1={`${pt.y}%`}
                                      x2={`${pts[i + 1].x}%`} y2={`${pts[i + 1].y}%`}
                                      stroke={lineColor} strokeWidth={included ? 2 : 1.2}
                                      strokeDasharray={included ? undefined : "7 4"}
                                      opacity={included ? 1 : 0.4}
                                      style={{ pointerEvents: "none" }}
                                    />
                                  ))}
                                  <text x={`${pts[Math.floor(pts.length/2)].x}%`} y={`${pts[Math.floor(pts.length/2)].y}%`}
                                    textAnchor="middle" dy="-6" fontSize="7" fill={lineColor} fontFamily="JetBrains Mono"
                                    style={{ pointerEvents: "none" }}>{pipe.label}</text>
                                </g>
                              )
                            })}
                          </svg>

                          {/* Asset dots — clickable */}
                          {assets.map(a => {
                            const included = pendingViewAssets.includes(a.id)
                            return (
                              <div
                                key={a.id}
                                onClick={() => toggleAsset(a.id)}
                                title={a.label}
                                style={{
                                  position: "absolute",
                                  left: `${a.x}%`, top: `${a.y}%`,
                                  transform: "translate(-50%, -50%)",
                                  cursor: "pointer", zIndex: 10,
                                }}
                              >
                                <div style={{
                                  width: 18, height: 18, borderRadius: "50%",
                                  background: included ? C.cyan : "#B0C4D8",
                                  border: `2px solid ${included ? C.cyan : "#8899AA"}`,
                                  opacity: included ? 1 : 0.35,
                                  display: "flex", alignItems: "center", justifyContent: "center",
                                  transition: "all 0.12s",
                                  boxShadow: included ? `0 0 6px ${C.cyan}66` : undefined,
                                }} />
                                {included && (
                                  <div style={{
                                    position: "absolute", top: "100%", left: "50%", transform: "translateX(-50%)",
                                    fontSize: 7, color: C.cyan, fontFamily: "JetBrains Mono", whiteSpace: "nowrap",
                                    marginTop: 2, pointerEvents: "none",
                                  }}>{a.label}</div>
                                )}
                              </div>
                            )
                          })}

                          {/* Legend overlay */}
                          <div style={{ position: "absolute", bottom: 8, right: 8, fontSize: 9, color: C.muted, background: C.panel + "CC", padding: "4px 8px", borderRadius: 4, border: `1px solid ${C.border}` }}>
                            Click to toggle · Bright = included
                          </div>
                        </div>
                      </div>

                      {/* Footer */}
                      <div style={{ padding: "12px 22px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 8, justifyContent: "flex-end", flexShrink: 0 }}>
                        <button onClick={() => setViewDialogStep("name")} style={{ padding: "7px 16px", background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>← Back</button>
                        <button onClick={saveMapView} style={{ padding: "7px 18px", background: C.cyan, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                          Save View ({pendingViewAssets.length}A · {pendingViewPipes.length}P)
                        </button>
                      </div>
                    </div>
                  )
                })()
              )}
            </div>
          </div>
        )
      })()}

      {/* ── CONFIRM DIALOG ───────────────────────────────────────────────────────── */}
      {confirmDialog && (
        <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
          <div style={{ position: "absolute", inset: 0, background: "rgba(15,25,35,0.45)", backdropFilter: "blur(2px)" }} onClick={() => setConfirmDialog(null)} />
          <div style={{
            position: "relative", background: C.panel, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: 24, width: 360, boxShadow: "0 20px 60px rgba(0,0,0,0.18)",
          }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-start", marginBottom: 16 }}>
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "#FEF2F2", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                  <path d="M9 6v4M9 13h.01" stroke="#DC2626" strokeWidth="1.6" strokeLinecap="round" />
                  <path d="M7.5 2.5l-6 11A1 1 0 002.5 15h13a1 1 0 001-1.5l-6-11a1 1 0 00-1.73 0z" stroke="#DC2626" strokeWidth="1.3" />
                </svg>
              </div>
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: C.text, marginBottom: 5 }}>{confirmDialog.title}</div>
                <div style={{ fontSize: 12, color: C.muted, lineHeight: 1.55 }}>{confirmDialog.message}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
              <button onClick={() => setConfirmDialog(null)} style={{ padding: "7px 18px", background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, fontSize: 12, cursor: "pointer" }}>
                Cancel
              </button>
              <button
                onClick={() => { confirmDialog.onConfirm(); setConfirmDialog(null) }}
                style={{ padding: "7px 18px", background: "#DC2626", color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: "pointer" }}
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
