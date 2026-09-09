import { useState, useRef, useCallback, useEffect } from "react"

// ── Types ─────────────────────────────────────────────────────────────────────

type AssetType =
  | "catch-basin" | "storm-basin" | "sanitary-basin"
  | "cleanout-floor" | "cleanout-foundation" | "cleanout-overhead"
  | "stack"
  | "floor-drain" | "gutter-hub" | "turf-drain"
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
  conditionRating?: 1|2|3|4|5|"unable"
  conditionBlocker?: string
  // Cleanout
  accessSize?: string
  accessConfig?: string
  undergroundConn?: string
  undergroundConnOther?: string
  verticalPipeSize?: string
  horizontalPipeSize?: string
  // Stack
  stackSize?: string
  stackMaterial?: string
  hasCleanout?: "no" | "pre-existing" | "installed-by-us"
  cleanoutSize?: string
  cleanoutFitting?: string
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
  photos?: string[]  // base64 data URLs, in order per photoLabels
  archived?: boolean
  archivedById?: string
  archivedOn?: number
  archivedDuringVisitId?: string
  archiveReason?: string
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
  archived?: boolean
  archivedById?: string
  archivedOn?: number
  archivedDuringVisitId?: string
  archiveReason?: string
}

interface CharRow {
  id: string
  isStart?: boolean
  isEnd?: boolean
  length: string
  depth: string
  aboveGround: string
  unitNumbers?: string
  ownership: string
  images?: string[]
}

interface CamVideo {
  id: string
  name: string
  date: string
  operator: string
  // Step 1 — Set up
  purpose?: string
  launchedFrom?: string
  direction: "upstream" | "downstream"
  zeroRef?: string
  entryPipeSize?: string
  entryPipeType?: string
  entryDepth?: string
  // Step 3 — Why stopped
  whyStopped?: string
  stopFootage?: string
  stopNotes?: string
  // Step 5 — Analysis
  observationsClosed: boolean
  observations: Observation[]
  // Step 6 — Fully inspected
  fullyInspected?: "Yes" | "Partially" | "No"
  notFullyReason?: string
  assessableFootage?: string
  // Step 7 — Characteristics
  characteristics?: CharRow[]
  // Stepper progress (1–8; 8 = complete)
  inspStep: number
  // Legacy run start/end
  runStart?: { footage: string; depth: string; pipeType: string; pipeSize: string }
  runEnd?: { footage: string; depth: string; pipeType: string; pipeSize: string }
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
  // CIPP concern
  cippConcern?: boolean
  cippLocked?: boolean
  cippLockedReason?: string
  cippDepth?: string
  cippLocateClose?: boolean
  cippLocateWide?: boolean
  cippAboveGround?: string
  cippNotes?: string
}

// ── Visit / Session types ──────────────────────────────────────────────────────

interface LogisticsEntry { id: string; category: string; note: string; addedBy: string; visitId: string | null }
interface ContactEntry { id: string; name: string; role: string; phone: string; email: string; bestContact: string; notes: string }

interface AssetObservation {
  id: string
  assetId: string
  visitId: string
  observedAt: number
  observedById: string
  jobNumber?: string
  depth?: string
  conditionRating?: 1|2|3|4|5|"unable"
  conditionBlocker?: string
  accessSize?: string
  accessConfig?: string
  undergroundConn?: string
  undergroundConnOther?: string
  verticalPipeSize?: string
  horizontalPipeSize?: string
  stackSize?: string
  stackMaterial?: string
  hasCleanout?: "no" | "pre-existing" | "installed-by-us"
  cleanoutSize?: string
  cleanoutFitting?: string
  flowTestDone?: boolean
  flowTestResult?: boolean
  installDate?: string
  dischargeTestDone?: boolean
  dischargeFunctioning?: boolean
  cameraAccessible?: boolean
  photos?: string[]
  changeReason?: "work-by-us" | "work-by-others" | "correction" | "unchanged"
}

interface VisitLogEntry {
  id: string
  at: number
  text: string
  recordType?: "asset" | "pipe" | "inspection" | "observation" | "media" | "logistics" | "contact"
  recordId?: string
}

interface Visit {
  id: string
  jobId: string | null
  property: string
  visitType: string
  personId: string
  technicianIds: string[]
  startedAt: number
  endedAt: number | null
  officeUpdateReason?: string
  visitNote?: string
  log: VisitLogEntry[]
  acceptedAtClose?: { item: string; reason: string }[]
  reportStatus?: "draft" | "in review" | "sent"
}

// ── Site people ───────────────────────────────────────────────────────────────

const SITE_PERSONS = [
  { id: "p-dino",      name: "Dino",      role: "Manager" },
  { id: "p-nicholas",  name: "Nicholas",  role: "Technician" },
  { id: "p-alexis",    name: "Alexis",    role: "Technician" },
  { id: "p-christian", name: "Christian", role: "Project Lead" },
  { id: "p-joshua",    name: "Joshua",    role: "Sales" },
]

// ── Sample jobs ───────────────────────────────────────────────────────────────

const SAMPLE_JOBS = [
  { id: "j1", group: "today",     when: "8:40 AM", number: "#48812", jobType: "Emergency",          property: "Willow Creek Condominium Association",      summary: "Sewer backup, Bldg 3 laundry" },
  { id: "j2", group: "scheduled", when: "Mar 22",  number: "#48901", jobType: "Reserve Study",       property: "Lakeview Terrace HOA",                      summary: "Full property survey" },
  { id: "j3", group: "scheduled", when: "Mar 28",  number: "#48910", jobType: "Hydro-Jetting",       property: "Elmwood Court",                             summary: "Annual main line cleaning" },
  { id: "j4", group: "recent",    when: "Mar 08",  number: "#48770", jobType: "Diagnostic",          property: "Willow Creek Condominium Association",      summary: "Slow drains, Bldg 1" },
  { id: "j5", group: "recent",    when: "Mar 05",  number: "#48755", jobType: "Excavation",          property: "Lakeview Terrace HOA",                      summary: "Collapsed section, parking lot" },
  { id: "j6", group: "recent",    when: "Feb 28",  number: "#48720", jobType: "CIPP Feasibility",    property: "Elmwood Court",                             summary: "Pre-liner assessment" },
]

const VISIT_TYPES = [
  "Diagnostic Site Visit", "Emergency Call", "Hydro-Jetting Estimate Survey",
  "Hydro-Jetting", "Rodding / Cable Machine", "Descaling", "CIPP Feasibility",
  "CIPP Installation", "Excavation", "Post-Repair Verification",
  "Sewer Infrastructure Master Plan", "Office Update", "Other",
]

const ALL_PROPERTIES = [...new Set(SAMPLE_JOBS.map(j => j.property))]

const LOGISTICS_CATEGORIES = [
  "Parking & truck staging", "Building access", "Lockbox and keys",
  "Basement or mechanical access", "Utility shutoffs", "Excavation staging",
  "Restoration reference", "Hazards and constraints",
]

const CONTACT_ROLES = ["Property manager", "On-site maintenance", "Board president", "Board member", "After-hours", "Other"]
const CONTACT_METHODS = ["Call", "Text", "Email"]

const ARCHIVE_REASONS = [
  "Duplicate — already recorded elsewhere",
  "Doesn't exist — recorded in error",
  "Removed from the property",
  "Replaced by another asset",
  "Wrong asset type — re-recorded correctly",
  "Other",
]

// ── Seed closed visits ────────────────────────────────────────────────────────

function makeLog(entries: string[]): VisitLogEntry[] {
  return entries.map((text, i) => ({ id: `l${i}`, at: Date.now() - (entries.length - i) * 600000, text }))
}

const SEED_VISITS: Visit[] = [
  {
    id: "sv1", jobId: "j4", property: "Willow Creek Condominium Association",
    visitType: "Emergency Call", personId: "p-nicholas", technicianIds: ["p-nicholas", "p-alexis"],
    startedAt: Date.now() - 86400000 * 3 - 4140000, endedAt: Date.now() - 86400000 * 3,
    log: makeLog(["Visit started", "COF-01 created — Clean-out, Laundry room", "COF-01 condition — Good", "P-01 camera inspection — 0 to 70 ft", "P-01 3 observations logged", "P-02 camera inspection — blocked at 18 ft"]),
    reportStatus: "draft",
    acceptedAtClose: [{ item: "10 assets — no photos", reason: "Light inventory pass, to be documented if the reserve study proceeds." }],
  },
  {
    id: "sv2", jobId: "j5", property: "Lakeview Terrace HOA",
    visitType: "Excavation", personId: "p-christian", technicianIds: ["p-christian", "p-dino"],
    startedAt: Date.now() - 86400000 * 6 - 9600000, endedAt: Date.now() - 86400000 * 6,
    log: makeLog(["Visit started", "Excavation site marked", "P-03 pipe section exposed", "P-03 material confirmed — Cast Iron", "1 work event logged — debris removed"]),
    reportStatus: "in review",
  },
  {
    id: "sv3", jobId: "j4", property: "Willow Creek Condominium Association",
    visitType: "Diagnostic Site Visit", personId: "p-alexis", technicianIds: ["p-alexis"],
    startedAt: Date.now() - 86400000 * 10 - 7380000, endedAt: Date.now() - 86400000 * 10,
    log: makeLog(["Visit started", "11 assets surveyed", "4 pipes inspected", "CB-03 condition — Poor", "P-04 camera run — 0 to 45 ft"]),
    reportStatus: "sent",
  },
]

// ── Asset type metadata ────────────────────────────────────────────────────────

const ASSET_META: Record<AssetType, { label: string; abbr: string; shape: "circle"|"square"|"diamond"|"triangle"|"hexagon"; group: string }> = {
  "catch-basin":         { label: "Catch Basin",                  abbr: "CB",  shape: "diamond",  group: "basin" },
  "storm-basin":         { label: "Storm Basin",                  abbr: "SB",  shape: "diamond",  group: "basin" },
  "sanitary-basin":      { label: "Sanitary Basin",               abbr: "SAB", shape: "diamond",  group: "basin" },
  "cleanout-floor":      { label: "Clean-out — Floor",            abbr: "CF",  shape: "square",   group: "cleanout" },
  "cleanout-foundation": { label: "Clean-out — Foundation Wall",  abbr: "CW",  shape: "square",   group: "cleanout" },
  "cleanout-overhead":   { label: "Clean-out — Overhead",         abbr: "CO",  shape: "square",   group: "cleanout" },
  "stack":               { label: "Stack",                         abbr: "STK", shape: "triangle", group: "stack" },
  "floor-drain":         { label: "Floor Drain",                  abbr: "FD",  shape: "circle",   group: "drain" },
  "gutter-hub":          { label: "Gutter Hub",                   abbr: "GH",  shape: "hexagon",  group: "drain" },
  "turf-drain":          { label: "Turf Drain",                   abbr: "TD",  shape: "circle",   group: "drain" },
  "ejector-pump":        { label: "Ejector Pump",                 abbr: "EP",  shape: "hexagon",  group: "pump" },
  "sump-pump":           { label: "Sump Pump",                    abbr: "SP",  shape: "hexagon",  group: "pump" },
}

const ASSET_PREFIX: Record<AssetType, string> = {
  "catch-basin": "CB", "storm-basin": "SB", "sanitary-basin": "SAB",
  "cleanout-floor": "CF", "cleanout-foundation": "CW", "cleanout-overhead": "CO",
  "stack": "STK", "floor-drain": "FD", "gutter-hub": "GH", "turf-drain": "TD",
  "ejector-pump": "EP", "sump-pump": "SP",
}

const ALL_ASSET_TYPES = Object.keys(ASSET_META) as AssetType[]

const LOCATION_OPTIONS = ["Basement","Hallway","Outside","Courtyard","Walkway","Front Yard","Unit","Laundry Room","Storage Room","Bike Room","Other"]
const CONDITION_LABELS = ["","Good","Fair","Poor","Failing","Critical"]
const CONDITION_COLORS = ["","#00803E","#7DC242","#A96B00","#FF7A29","#CE1A74"]
const CONDITION_DESCS = [
  "",
  "Structurally sound and functioning as intended. No significant deterioration, damage, or excessive buildup observed. Continue routine maintenance and monitoring.",
  "Functional but shows moderate age-related wear, deterioration, buildup, or minor defects. No immediate structural repair is required, but maintenance and continued monitoring are recommended.",
  "Significant deterioration, corrosion, cracking, damaged components, heavy buildup, or other conditions that may affect performance. Repair or rehabilitation should be planned.",
  "Advanced deterioration or structural defects that significantly increase the likelihood of backup, leakage, collapse, or operational failure. Corrective work should be prioritised.",
  "Severe structural deterioration, active failure, major damage, collapse risk, or another condition requiring immediate attention. Repair or replacement is recommended as soon as reasonably possible.",
]
const CONDITION_UNABLE_COLOR = "#5F6E7C"
const CONDITION_BLOCKER_OPTIONS = [
  "Full of debris", "Standing water", "Full of grease", "Heavy scale",
  "Access limited — could not reach", "Access limited — could not open",
  "Structurally unsafe to enter", "Other",
]
function conditionBlockerRec(blocker: string): string {
  if (blocker === "Standing water") return "Pump"
  if (blocker === "Full of grease" || blocker === "Heavy scale") return "Hydro-jetting"
  if (blocker.startsWith("Access limited — could not reach")) return "Clean-out installation"
  if (blocker.startsWith("Access limited — could not open")) return "Excavate to expose"
  if (blocker === "Full of debris") return "Pump and clean"
  return "Inspect and clear obstruction"
}
const CONN_OPTIONS = ["Tee","Wye","Sanitary Tee","90°","Unknown","Other"]

// ── Sample data ────────────────────────────────────────────────────────────────

const SAMPLE_ASSETS: Asset[] = [
  { id: "a1", type: "sanitary-basin",  label: "SAB-001", x: 20, y: 26 },
  { id: "a2", type: "catch-basin",     label: "CB-001",  x: 57, y: 20 },
  { id: "a3", type: "cleanout-floor",  label: "CF-001",  x: 74, y: 63, accessSize: '4"', accessConfig: "One-Way", undergroundConn: "Wye", cameraAccessible: true, conditionRating: 3 },
  { id: "a4", type: "floor-drain",     label: "FD-001",  x: 30, y: 70 },
  { id: "a5", type: "ejector-pump",    label: "EP-001",  x: 54, y: 46 },
  { id: "a6", type: "stack",           label: "STK-001", x: 40, y: 55, hasCleanout: "installed-by-us", stackSize: '4"', stackMaterial: "Cast Iron", cleanoutSize: '4"', cleanoutFitting: "Wye" },
  { id: "a7", type: "stack",           label: "STK-002", x: 65, y: 38, hasCleanout: "no", stackSize: '3"', stackMaterial: "Cast Iron" },
]

// Two sample observations per asset for a3 (cleanout-floor: 3"→4", not-accessible→accessible)
// and a2 (catch-basin: with two photos in slot 0)
const SAMPLE_OBSERVATIONS: AssetObservation[] = [
  // a3 · CF-001 — first visit (Master Plan, Dino, job #48770, 14 Mar)
  {
    id: "obs-a3-1", assetId: "a3", visitId: "sv1", observedAt: new Date("2024-03-14").getTime(),
    observedById: "p-dino", jobNumber: "#48770",
    accessSize: '3"', accessConfig: "One-Way", undergroundConn: "Wye",
    cameraAccessible: false, conditionRating: 3,
  },
  // a3 · CF-001 — second visit (Emergency Call, Nicholas, job #48812, 12 Jun)
  {
    id: "obs-a3-2", assetId: "a3", visitId: "sv2", observedAt: new Date("2024-06-12").getTime(),
    observedById: "p-nicholas", jobNumber: "#48812",
    accessSize: '4"', cameraAccessible: true,
    changeReason: "work-by-others",
  },
  // a2 · CB-001 — first visit (Master Plan, Dino, job #48770, 14 Mar) — with a photo
  {
    id: "obs-a2-1", assetId: "a2", visitId: "sv1", observedAt: new Date("2024-03-14").getTime(),
    observedById: "p-dino", jobNumber: "#48770",
    conditionRating: 2, depth: "4.5",
    photos: ["data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iIzMzNDQ1NSIvPjx0ZXh0IHg9IjEwMCIgeT0iODAiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM2Njc3ODgiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkNhbWVyYSBwaG90bywgMTQgTWFyPC90ZXh0Pjwvc3ZnPg=="],
  },
  // a2 · CB-001 — second visit (Office Update, Dino, no job, 22 Feb 2025)
  {
    id: "obs-a2-2", assetId: "a2", visitId: "sv3", observedAt: new Date("2025-02-22").getTime(),
    observedById: "p-dino", jobNumber: undefined,
    conditionRating: 3,
    photos: ["data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCB3aWR0aD0iMjAwIiBoZWlnaHQ9IjE1MCIgZmlsbD0iIzQ0NTU2NiIvPjx0ZXh0IHg9IjEwMCIgeT0iODAiIGZvbnQtc2l6ZT0iMTQiIGZpbGw9IiM3Nzg4OTkiIHRleHQtYW5jaG9yPSJtaWRkbGUiPkZvbGxvdy11cCBwaG90bywgMjIgRmViPC90ZXh0Pjwvc3ZnPg=="],
    changeReason: "correction",
  },
]

const SAMPLE_PIPES: Pipe[] = [
  {
    id: "p1", label: "PIPE-001", fromId: "a1", toId: "a2",
    waypoints: [], length: "127", slope: "1.2%",
    start: { type: "Cast Iron", diameter: '6"', depth: "6.5" },
    videos: [{
      id: "v1", name: "PIPE-001_DS_2024-03-15.mp4", date: "2024-03-15",
      operator: "J. Martinez", direction: "downstream",
      inspStep: 5, purpose: "Initial inspection", launchedFrom: "CF-01", zeroRef: "At the pipe entry",
      entryPipeSize: '6"', entryPipeType: "Cast iron", entryDepth: "6.5",
      whyStopped: "Reached the next pipe or structure", stopFootage: "127",
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

const PURPOSE_OPTIONS = ["Initial inspection", "Re-inspection", "Post-cleaning", "Post-repair verification", "Reserve study", "Warranty check", "Second opinion"]
const ZERO_REF_OPTIONS = ["At the pipe entry", "At the cap", "At grade", "At the fitting"]
const WHY_STOPPED_OPTIONS = [
  "Reached the next pipe or structure",
  "Reached a connection to the city main",
  "Reached another accessible clean-out",
  "Reached a basin or manhole",
  "Reached a 90° fitting — end of the pipe",
  "Reached a septic tank or lift station",
  "Camera reel maxed out",
  "Blocked — roots",
  "Blocked — grease",
  "Blocked — scale or hard deposits",
  "Blocked — debris or foreign object",
  "Suspected collapse",
  "Offset or separated joint the head won't pass",
  "Hard bend the head won't pass",
  "Standing water — nothing visible",
  "Pipe too small for the head",
  "Other",
]
const NOT_FULLY_REASON_OPTIONS = [
  "Camera did not reach the end",
  "Heavy grease obscured the view",
  "Standing water obscured the view",
  "Sediment or debris obscured the view",
  "Scale obscured the view",
  "Camera lens fouled",
  "Poor lighting or image quality",
  "Section skipped — could not hold position",
  "Other",
]
const ABOVE_GROUND_OPTIONS = [
  "Hallway", "Lobby or finished space", "Living Space(s)", "Basement", "Storage units",
  "Laundry room", "Mechanical room", "Crawlspace", "Garage or parking deck",
  "Building slab — common area", "Under mechanical equipment",
  "Front yard — grass", "Landscaping", "Courtyard", "Walkway",
  "Parking lot", "Driveway", "Gravel",
  "Sidewalk", "City street", "Alley",
  "Front Gate", "Property Sidewalk", "Entrance",
  "Unknown",
]
const MUNICIPAL_SURFACES = ["Sidewalk", "City street", "Alley"]

function ownershipFor(ag: string): string {
  if (MUNICIPAL_SURFACES.includes(ag)) return "Municipal"
  if (ag === "Living Space(s)") return "Individual unit"
  return "Association"
}

const STEP_TITLES = ["", "Set up", "Push", "Why the camera stopped", "Upload the recording", "Sewer camera analysis", "Was the pipe fully inspected?", "Characteristics"]

// ── Asset icons ────────────────────────────────────────────────────────────────

function AssetIcon({ type, sel, c, size = 28, hasCleanout }: { type: AssetType; sel: boolean; c: string; size?: number; hasCleanout?: string }) {
  const meta = ASSET_META[type]
  const abbr = meta.abbr
  const fill = sel ? c : "#E2EDF5"
  const text = sel ? C.bg : c
  const fs = abbr.length > 2 ? 6.5 : 7.5
  const S = size
  const h = S
  // Stack: two glyph states based on hasCleanout
  if (type === "stack") {
    const hasAccess = hasCleanout === "pre-existing" || hasCleanout === "installed-by-us"
    return (
      <svg width={S} height={h} viewBox={`0 0 ${S} ${h}`}>
        {/* tab above */}
        <rect x={S/2-3} y={0} width={6} height={5} rx="1" fill={fill} stroke={c} strokeWidth="1.2" />
        {/* main circle — dashed if no cleanout */}
        <circle cx={S/2} cy={h*0.62} r={S*0.35} fill={fill} stroke={c} strokeWidth="1.5"
          strokeDasharray={hasAccess ? "none" : "3 2"} />
        {/* plug square only when has cleanout */}
        {hasAccess && <rect x={S/2-3} y={h*0.62-3} width={6} height={6} rx="1" fill={c} />}
        <text x={S/2} y={h*0.68+fs*0.38} textAnchor="middle" fill={hasAccess ? (sel ? "#fff" : C.bg) : text} fontSize={fs-1} fontFamily="JetBrains Mono" fontWeight="700">{abbr}</text>
      </svg>
    )
  }
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

function AssetNode({ asset, selected, drawState, scale, onClick, onMouseDown, onTouchStart, onMouseEnter, onMouseLeave, dimmed }: {
  asset: Asset; selected: boolean
  drawState?: "start" | "snapped" | "target" | null
  scale: number; dimmed?: boolean
  onClick: (e: React.MouseEvent) => void; onMouseDown: (e: React.MouseEvent) => void
  onTouchStart?: (e: React.TouchEvent) => void
  onMouseEnter?: () => void; onMouseLeave?: () => void
}) {
  const AMBER = "#F59E0B"
  const c = drawState === "start" || drawState === "snapped" ? AMBER : "#1a1a1a"
  return (
    <div
      style={{
        position: "absolute", left: `${asset.x}%`, top: `${asset.y}%`,
        transform: `translate(-50%, -50%) scale(${scale})`,
        transformOrigin: "center center",
        cursor: drawState === "target" ? "crosshair" : "pointer", zIndex: 10,
        filter: selected ? `drop-shadow(0 0 6px ${c}88)` : dimmed ? "grayscale(0.6)" : undefined,
        opacity: dimmed ? 0.25 : drawState === "snapped" ? 0.65 : 1,
        transition: "filter 0.2s, transform 0.15s, opacity 0.2s",
      }}
      onClick={e => { e.stopPropagation(); onClick(e) }}
      onMouseDown={onMouseDown}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onTouchStart={e => { e.stopPropagation(); onTouchStart?.(e) }}
    >
      {drawState === "target" && (
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%, -50%)",
          width: 40 * scale, height: 40 * scale, borderRadius: "50%",
          border: `2px solid ${AMBER}`, pointerEvents: "none",
        }} />
      )}
      {drawState === "snapped" && (
        <div style={{
          position: "absolute", top: -2, right: -2,
          width: 7, height: 7, borderRadius: "50%",
          background: AMBER, pointerEvents: "none",
        }} />
      )}
      <AssetIcon type={asset.type} sel={selected} c={c} size={28} hasCleanout={asset.hasCleanout} />
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

// ── Pipe profile graphic ───────────────────────────────────────────────────────

const PROFILE_MUNICIPAL = ["Sidewalk", "City street", "Alley", "Property Sidewalk"]
const PROFILE_FINISHED  = ["Hallway", "Lobby or finished space", "Living Space(s)", "Laundry room", "Mechanical room", "Crawlspace", "Garage or parking deck", "Building slab — common area", "Under mechanical equipment"]

function profileSurfaceStyle(ag: string) {
  if (PROFILE_MUNICIPAL.includes(ag)) return { fill: "#FBE3EF", stroke: "#CE1A74", sw: 1.5, tf: "#8A1150", fw: "600" }
  if (PROFILE_FINISHED.includes(ag))  return { fill: "#FCEFD8", stroke: "#D2DAE2", sw: 1, tf: "#16202A", fw: "400" }
  return { fill: "#EDF1F4", stroke: "#D2DAE2", sw: 1, tf: "#16202A", fw: "400" }
}

function profileDefStyle(sev: number) {
  if (sev >= 5) return { stem: "#CE1A74", fill: "#FBE3EF", stroke: "#CE1A74", tf: "#8A1150", lbl: "Critical" }
  if (sev >= 4) return { stem: "#FF7A29", fill: "#FDEEE2", stroke: "#FF7A29", tf: "#8A4A12", lbl: "Severe"   }
  return           { stem: "#A96B00", fill: "#FFF8F0", stroke: "#A96B00", tf: "#7A4E00", lbl: "Moderate" }
}

function PipeProfileSVG({ video, pipe, onClickObs }: {
  video: CamVideo
  pipe: Pipe
  onClickObs?: (obsId: string) => void
}) {
  const X0 = 70, X1 = 880, AW = 810
  const totalFt = Math.max(1, parseFloat(video.stopFootage || "0"))
  const ftToX = (ft: number) => X0 + (ft / totalFt) * AW

  const chars = video.characteristics ?? []
  const hasChars = chars.length >= 2

  // ── Surface bands ──
  const rawBands: { startFt: number; endFt: number; ag: string }[] = []
  if (hasChars) {
    for (let i = 0; i < chars.length - 1; i++) {
      rawBands.push({ startFt: parseFloat(chars[i].length) || 0, endFt: parseFloat(chars[i + 1].length) || totalFt, ag: chars[i].aboveGround })
    }
    const last = chars[chars.length - 1]
    if (parseFloat(last.length) < totalFt) rawBands.push({ startFt: parseFloat(last.length) || totalFt, endFt: totalFt, ag: last.aboveGround })
  }
  const bands: typeof rawBands = []
  for (const b of rawBands) {
    const prev = bands[bands.length - 1]
    if (prev && prev.ag === b.ag) prev.endFt = b.endFt
    else bands.push({ ...b })
  }

  // ── Depth profile ──
  const depthPts = chars.map(r => ({ ft: parseFloat(r.length) || 0, d: parseFloat(r.depth) || 0 })).filter(p => p.d > 0)
  const DTOP = 100, DBOT = 145
  const allD = depthPts.map(p => p.d)
  const minD = allD.length ? Math.min(...allD) * 0.98 : 0
  const maxD = allD.length ? Math.max(...allD) * 1.02 : 10
  const dToY = (d: number) => maxD === minD ? DBOT : DTOP + ((d - minD) / (maxD - minD)) * (DBOT - DTOP)
  const dXY = depthPts.map(p => ({ x: ftToX(p.ft), y: dToY(p.d), d: p.d }))

  // ── Material sections ──
  const pipeTrans = video.observations.filter(o => o.type === "pipe-transition")
    .sort((a, b) => parseFloat(a.footage || "0") - parseFloat(b.footage || "0"))
  const matSecs: { s: number; e: number; type: string; size: string }[] = []
  let mType = video.entryPipeType || pipe.start?.type || ""
  let mSize = video.entryPipeSize || pipe.start?.diameter || ""
  let mStart = 0
  for (const tr of pipeTrans) {
    const ft = parseFloat(tr.footage || "0")
    matSecs.push({ s: mStart, e: ft, type: mType, size: mSize })
    mType = String(tr.pipeType ?? mType)
    mSize = String(tr.pipeSize ?? mSize)
    mStart = ft
  }
  matSecs.push({ s: mStart, e: totalFt, type: mType, size: mSize })

  // ── Observations ──
  const tieIns = video.observations.filter(o => o.type === "tie-in")
    .sort((a, b) => parseFloat(a.footage || "0") - parseFloat(b.footage || "0"))
  const defects = video.observations.filter(o => o.type === "defect")
    .sort((a, b) => parseFloat(a.footage || "0") - parseFloat(b.footage || "0"))

  // Stagger defects
  const BW = 92, BH = 30, ROW_A = 262, ROW_B = 304
  const staggered: { obs: typeof defects[0]; row: "A" | "B"; x: number }[] = []
  for (const obs of defects) {
    const x = ftToX(parseFloat(obs.footage || "0"))
    const lastA = staggered.filter(s => s.row === "A").slice(-1)[0]
    const lastB = staggered.filter(s => s.row === "B").slice(-1)[0]
    const okA = !lastA || Math.abs(x - lastA.x) >= BW + 6
    const okB = !lastB || Math.abs(x - lastB.x) >= BW + 6
    staggered.push({ obs, row: okA ? "A" : okB ? "B" : "A", x })
  }

  // Axis ticks
  const interval = totalFt <= 50 ? 10 : totalFt <= 150 ? 20 : totalFt <= 300 ? 50 : 100
  const ticks: number[] = []
  for (let t = 0; t <= totalFt; t += interval) ticks.push(t)
  if (!ticks.includes(totalFt)) ticks.push(totalFt)

  const hasCipp = staggered.some(s => s.obs.cippConcern)
  const assessFt = video.fullyInspected !== "Yes" && video.assessableFootage ? parseFloat(video.assessableFootage) : null

  return (
    <svg viewBox="0 0 940 440" width="100%" style={{ display: "block", fontFamily: "system-ui, sans-serif" }}>

      {/* LANE 1 — ABOVE */}
      <text x="48" y="62" fontSize="11" fill="#5F6E7C" textAnchor="end">ABOVE</text>
      {hasChars ? bands.map((b, i) => {
        const bx = ftToX(b.startFt), bw = Math.max(0, ftToX(b.endFt) - bx)
        const st = profileSurfaceStyle(b.ag)
        return (
          <g key={i}>
            <rect x={bx} y={48} width={bw} height={26} fill={st.fill} stroke={st.stroke} strokeWidth={st.sw} />
            {bw > 50 && <text x={bx + bw / 2} y={65} fontSize="11" fill={st.tf} textAnchor="middle" fontWeight={st.fw}
              clipPath={`url(#clip-zone-${i})`}>{b.ag}</text>}
            <clipPath id={`clip-zone-${i}`}><rect x={bx + 2} y={46} width={bw - 4} height={30} /></clipPath>
          </g>
        )
      }) : <rect x={X0} y={48} width={AW} height={26} fill="#F1F5F9" stroke="#D2DAE2" strokeDasharray="4 3" />}

      {hasChars && bands.slice(0, -1).map((b, i) => {
        const bx = ftToX(b.endFt)
        const mu = PROFILE_MUNICIPAL.includes(bands[i + 1]?.ag ?? "")
        return (
          <g key={i}>
            <line x1={bx} y1={48} x2={bx} y2={182} stroke={mu ? "#CE1A74" : "#D2DAE2"} strokeDasharray="3 3" opacity={mu ? 0.6 : 1} />
            <text x={bx + 3} y={86} fontSize="11" fill={mu ? "#8A1150" : "#5F6E7C"} fontFamily="monospace">{Math.round(b.endFt)}</text>
          </g>
        )
      })}

      {/* LANE 2 — DEPTH */}
      <text x="68" y="112" fontSize="11" fill="#5F6E7C" textAnchor="end">DEPTH</text>
      {hasChars && dXY.length >= 2 ? (
        <>
          <path d={`M${dXY[0].x} ${dXY[0].y} ${dXY.slice(1).map(p => `L${p.x} ${p.y}`).join(" ")} L${dXY[dXY.length - 1].x} ${DBOT} L${dXY[0].x} ${DBOT} Z`} fill="#EDF1F4" />
          <path d={`M${dXY[0].x} ${dXY[0].y} ${dXY.slice(1).map(p => `L${p.x} ${p.y}`).join(" ")}`} fill="none" stroke="#5F6E7C" strokeWidth="1.6" />
          {dXY.map((p, i) => (
            <g key={i}>
              <circle cx={p.x} cy={p.y} r="3" fill="#38424E" />
              <text x={p.x} y={p.y - 5} fontSize="11" fill="#38424E" textAnchor="middle" fontFamily="monospace">{p.d.toFixed(1)}</text>
            </g>
          ))}
        </>
      ) : (
        <text x={X0 + AW / 2} y={128} fontSize="11" fill="#94A3B8" textAnchor="middle" fontStyle="italic">Not recorded</text>
      )}

      {/* LANE 3 — PIPE */}
      <text x="68" y="174" fontSize="11" fill="#5F6E7C" textAnchor="end">PIPE</text>
      {matSecs.map((sec, i) => {
        const sx = ftToX(sec.s), sw = Math.max(0, ftToX(sec.e) - sx)
        const lined = /cipp|lined/i.test(sec.type)
        return (
          <g key={i}>
            <rect x={sx} y={158} width={sw} height={24} fill={lined ? "#00803E" : "#C6CFD8"} />
            {sw > 60 && <text x={sx + sw / 2} y={174} fontSize="11" fill={lined ? "#FFFFFF" : "#16202A"} textAnchor="middle" fontWeight={lined ? "600" : "400"}>{sec.type}{sec.size ? ` · ${sec.size}` : ""}</text>}
          </g>
        )
      })}
      {/* Access point start */}
      <circle cx={X0} cy={170} r="9" fill="#FFFFFF" stroke="#1F2933" strokeWidth="2.5" />
      <rect x={X0 - 4} y={166} width={8} height={8} fill="#1F2933" />
      <text x={X0} y={200} fontSize="11" fill="#16202A" textAnchor="middle" fontWeight="600">{pipe.fromId || "—"}</text>
      {/* Access point end */}
      <rect x={X1 - 9} y={161} width={18} height={18} rx="2" fill="#38424E" stroke="#FFFFFF" strokeWidth="1.5" />
      <text x={X1} y={200} fontSize="11" fill="#16202A" textAnchor="middle" fontWeight="600">{pipe.toId || "—"}</text>
      {/* Flow arrow */}
      <line x1={X1 + 4} y1={170} x2={X1 + 14} y2={170} stroke="#16202A" strokeWidth="2" />
      <path d={`M${X1 + 18} 170 l-10 -5 v10 z`} fill="#16202A" />

      {/* Partial dashed overlay */}
      {assessFt !== null && assessFt < totalFt && (
        <>
          <rect x={ftToX(assessFt)} y={48} width={ftToX(totalFt) - ftToX(assessFt)} height={26} fill="rgba(248,250,252,0.75)" stroke="#D2DAE2" strokeDasharray="4 3" />
          <rect x={ftToX(assessFt)} y={158} width={ftToX(totalFt) - ftToX(assessFt)} height={24} fill="rgba(198,207,216,0.35)" stroke="#D2DAE2" strokeDasharray="4 3" />
          <text x={(ftToX(assessFt) + X1) / 2} y={172} fontSize="10" fill="#94A3B8" textAnchor="middle">? ft</text>
        </>
      )}

      {/* LANE 4 — TIE-INS */}
      <text x="68" y="222" fontSize="11" fill="#5F6E7C" textAnchor="end">TIE-INS</text>
      {tieIns.map(obs => {
        const tx = ftToX(parseFloat(obs.footage || "0"))
        const clock = obs.tieOrientation?.[0] != null ? ` · ${obs.tieOrientation[0]} o'clock` : ""
        return (
          <g key={obs.id} onClick={() => onClickObs?.(obs.id)} style={{ cursor: onClickObs ? "pointer" : "default" }}>
            <line x1={tx} y1={182} x2={tx} y2={214} stroke="#1B6FB8" strokeWidth="2" />
            <circle cx={tx} cy={216} r="4" fill="#1B6FB8" />
            <text x={tx} y={238} fontSize="11" fill="#1B6FB8" textAnchor="middle">{obs.footage ? fmtFtIn(obs.footage) : "—"}{clock}</text>
          </g>
        )
      })}

      {/* LANE 5 — DEFECTS */}
      <text x="68" y="272" fontSize="11" fill="#5F6E7C" textAnchor="end">DEFECTS</text>
      {staggered.map(({ obs, row, x: dx }) => {
        const st = profileDefStyle(obs.severity || 1)
        const ry = row === "A" ? ROW_A : ROW_B
        return (
          <g key={obs.id} onClick={() => onClickObs?.(obs.id)} style={{ cursor: onClickObs ? "pointer" : "default" }}>
            <line x1={dx} y1={182} x2={dx} y2={ry} stroke={st.stem} strokeWidth="2.5" />
            <rect x={dx - BW / 2} y={ry} width={BW} height={BH} rx="4" fill={st.fill} stroke={st.stroke} />
            <text x={dx} y={ry + 13} fontSize="11" fill={st.tf} textAnchor="middle" fontWeight="600">{obs.defectSubtype || "Defect"}</text>
            <text x={dx} y={ry + 26} fontSize="11" fill={st.tf} textAnchor="middle" fontFamily="monospace">{obs.footage ? fmtFtIn(obs.footage) : "—"}</text>
            {obs.cippConcern && <circle cx={dx + BW / 2 - 7} cy={ry + 7} r="4" fill="#CE1A74" />}
          </g>
        )
      })}

      {/* LANE 6 — AXIS */}
      <line x1={X0} y1={366} x2={X1} y2={366} stroke="#D2DAE2" />
      {ticks.map(t => {
        const tx = ftToX(t)
        const isLast = t === Math.round(totalFt) || (ticks.indexOf(t) === ticks.length - 1)
        return (
          <g key={t}>
            <line x1={tx} y1={362} x2={tx} y2={370} stroke="#D2DAE2" />
            <text x={tx} y={384} fontSize="11" fill={isLast ? "#16202A" : "#5F6E7C"} fontFamily="monospace" textAnchor="middle">{isLast ? `${Math.round(totalFt)} ft` : String(t)}</text>
          </g>
        )
      })}

      {/* Legend */}
      <g fontSize="11" fill="#5F6E7C">
        <rect x={70} y={404} width={12} height={12} fill="#00803E" /><text x={88} y={414}>Lined</text>
        <rect x={138} y={404} width={12} height={12} fill="#C6CFD8" /><text x={156} y={414}>Original</text>
        <circle cx={224} cy={410} r={5} fill="#1B6FB8" /><text x={235} y={414}>Tie-in</text>
        <rect x={289} y={404} width={12} height={12} fill="#FF7A29" /><text x={307} y={414}>Severe</text>
        <rect x={362} y={404} width={12} height={12} fill="#CE1A74" /><text x={380} y={414}>Critical</text>
        <rect x={440} y={404} width={12} height={12} fill="#FBE3EF" stroke="#CE1A74" /><text x={458} y={414}>Municipal</text>
        {hasCipp && <><circle cx={535} cy={410} r={4} fill="#CE1A74" /><text x={545} y={414}>CIPP concern</text></>}
      </g>
    </svg>
  )
}

// ───────────────────────────────────────────────────────────────────────────────

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

// ── Observation projection ────────────────────────────────────────────────────

const OBS_VERSIONED_KEYS: (keyof AssetObservation)[] = [
  "depth","conditionRating","conditionBlocker",
  "accessSize","accessConfig","undergroundConn","undergroundConnOther",
  "verticalPipeSize","horizontalPipeSize",
  "stackSize","stackMaterial","hasCleanout","cleanoutSize","cleanoutFitting",
  "flowTestDone","flowTestResult","installDate","dischargeTestDone","dischargeFunctioning",
  "cameraAccessible","photos",
]

function projectAsset(asset: Asset, obs: AssetObservation[]): Asset {
  const mine = obs.filter(o => o.assetId === asset.id).sort((a, b) => b.observedAt - a.observedAt)
  if (mine.length === 0) return asset
  const patch: Partial<Asset> = {}
  for (const key of OBS_VERSIONED_KEYS) {
    for (const o of mine) {
      const v = o[key as keyof AssetObservation]
      if (v !== undefined && v !== null) {
        ;(patch as Record<string, unknown>)[key] = v
        break
      }
    }
  }
  return { ...asset, ...patch }
}

function obsFieldCount(obs: AssetObservation): number {
  return OBS_VERSIONED_KEYS.filter(k => obs[k as keyof AssetObservation] !== undefined).length
}

function obsFieldNames(obs: AssetObservation): string {
  const names: string[] = []
  const map: Partial<Record<keyof AssetObservation, string>> = {
    depth: "depth", conditionRating: "condition", accessSize: "access size",
    accessConfig: "access config", undergroundConn: "underground conn",
    verticalPipeSize: "vertical pipe size", horizontalPipeSize: "horizontal pipe size",
    stackSize: "stack size", stackMaterial: "stack material", hasCleanout: "clean-out",
    cleanoutSize: "cleanout size", cleanoutFitting: "fitting",
    flowTestDone: "flow test", installDate: "install date",
    dischargeTestDone: "discharge test", cameraAccessible: "camera accessible",
    photos: "photos",
  }
  for (const k of OBS_VERSIONED_KEYS) {
    if (obs[k as keyof AssetObservation] !== undefined && map[k as keyof AssetObservation]) {
      names.push(map[k as keyof AssetObservation]!)
    }
  }
  return names.join(", ")
}

// Dimension/config fields that trigger the "something changed" dialog
const WORK_FIELDS: (keyof AssetObservation)[] = [
  "accessSize","accessConfig","undergroundConn","verticalPipeSize","horizontalPipeSize",
  "stackSize","stackMaterial","hasCleanout","cleanoutSize","cleanoutFitting",
  "installDate","cameraAccessible",
]

// ── Main App ──────────────────────────────────────────────────────────────────

export default function App() {
  const [assets, setAssets] = useState<Asset[]>(SAMPLE_ASSETS)
  const [pipes, setPipes] = useState<Pipe[]>(SAMPLE_PIPES)
  const [assetObservations, setAssetObservations] = useState<AssetObservation[]>(SAMPLE_OBSERVATIONS)
  // Observation UI state
  const [obsMode, setObsMode] = useState<"view" | "new-obs" | null>(null) // null = edit form (no obs yet)
  const [obsDraft, setObsDraft] = useState<Partial<AssetObservation>>({})
  const [obsHistoryOpen, setObsHistoryOpen] = useState(false)
  const [obsFieldHistoryField, setObsFieldHistoryField] = useState<keyof AssetObservation | null>(null)
  const [obsViewingId, setObsViewingId] = useState<string | null>(null) // viewing a past obs detail
  const [obsChangeDialog, setObsChangeDialog] = useState<{
    changes: { field: keyof AssetObservation; from: unknown; to: unknown }[]
    depthOnly: boolean
    onResolve: (reason: AssetObservation["changeReason"]) => void
  } | null>(null)
  const [obsPhotoSlot, setObsPhotoSlot] = useState<{
    assetId: string; slotIdx: number
    photos: { src: string; obsId: string; observedAt: number; observedById: string }[]
  } | null>(null) // photo history viewer for a slot
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
  const [hoverAssetId, setHoverAssetId] = useState<string | null>(null)
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
  const [leftSectionOpen, setLeftSectionOpen] = useState({ infra: false, assets: false, pipes: false, visits: false, archived: false })
  // ── Visit / session state ───────────────────────────────────────────────────
  const [appView, setAppView] = useState<"launch" | "simd">("launch")
  const [browseMode, setBrowseMode] = useState(false)
  const [selectedPersonId, setSelectedPersonId] = useState<string | null>(null)
  const [visits, setVisits] = useState<Visit[]>(SEED_VISITS)
  const [currentVisitId, setCurrentVisitId] = useState<string | null>(null)
  const [viewingVisitId, setViewingVisitId] = useState<string | null>(null)
  const [showVisitLog, setShowVisitLog] = useState(false)
  const [showCloseVisit, setShowCloseVisit] = useState(false)
  const [visitLogHighlight, setVisitLogHighlight] = useState(false)
  // Launch form state
  const [launchJobId, setLaunchJobId] = useState("")
  const [launchVisitType, setLaunchVisitType] = useState("")
  const [launchTechIds, setLaunchTechIds] = useState<string[]>([])
  const [launchOfficeMode, setLaunchOfficeMode] = useState(false)
  const [launchOfficeProperty, setLaunchOfficeProperty] = useState("")
  const [launchOfficeReason, setLaunchOfficeReason] = useState("")
  const [launchBrowseProperty, setLaunchBrowseProperty] = useState("")
  const [showLaunchBrowsePicker, setShowLaunchBrowsePicker] = useState(false)
  const [historyPersonFilter, setHistoryPersonFilter] = useState("all")
  const [historyRangeFilter, setHistoryRangeFilter] = useState("30")
  const [historyShowAll, setHistoryShowAll] = useState(false)
  // Close visit state
  const [closeVisitNote, setCloseVisitNote] = useState("")
  const [closeAccepted, setCloseAccepted] = useState<Record<string, string>>({})
  const [elapsed, setElapsed] = useState(0)
  // Logistics + contacts (right panel, property level)
  const [logistics, setLogistics] = useState<LogisticsEntry[]>([])
  const [contacts, setContacts] = useState<ContactEntry[]>([])
  const [lightbox, setLightbox] = useState<{ srcs: string[]; labels: string[]; idx: number } | null>(null)
  const [showAddLogistics, setShowAddLogistics] = useState(false)
  const [logisticsForm, setLogisticsForm] = useState({ category: "", note: "" })
  const [showAddContact, setShowAddContact] = useState(false)
  const [contactForm, setContactForm] = useState({ name: "", role: "", phone: "", email: "", bestContact: "", notes: "" })
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
  // ── Archive / undo toast ──────────────────────────────────────────────────
  const [undoToast, setUndoToast] = useState<{ label: string; onUndo: () => void; timer: ReturnType<typeof setTimeout> } | null>(null)
  const [archiveDialog, setArchiveDialog] = useState<{
    type: "asset" | "pipe"
    id: string
    tier: "delete" | "archive"
    archiveReason: string
    alsoArchivePipes: boolean
  } | null>(null)
  const [activeTabId, setActiveTabId] = useState<"main" | string>("main")
  const [pipePanelW, setPipePanelW] = useState(840)
  const pipeDragRef = useRef<{ startX: number; startW: number } | null>(null)
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
  // Stepper state
  const [editingStep, setEditingStep] = useState<number | null>(null)
  const [step1Form, setStep1Form] = useState({ purpose: "", launchedFrom: "", direction: "downstream" as "upstream"|"downstream", zeroRef: "At the pipe entry", entryPipeSize: "", entryPipeType: "", entryDepth: "" })
  const [step3Form, setStep3Form] = useState({ whyStopped: "", stopFootage: "0", stopNotes: "" })
  const [step6Form, setStep6Form] = useState({ fullyInspected: "" as "Yes"|"Partially"|"No"|"", notFullyReason: "", assessableFootage: "0" })
  const [step7Rows, setStep7Rows] = useState<CharRow[]>([])
  const [charRowEditing, setCharRowEditing] = useState<string | null>(null)

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

  // Initialise stepper forms when a video is selected
  useEffect(() => {
    if (!selectedVideoId || !selectedPipeId) return
    const vid = pipes.find(p => p.id === selectedPipeId)?.videos.find(v => v.id === selectedVideoId)
    if (!vid) return
    setStep1Form({ purpose: vid.purpose ?? "", launchedFrom: vid.launchedFrom ?? "", direction: vid.direction, zeroRef: vid.zeroRef ?? "At the pipe entry", entryPipeSize: vid.entryPipeSize ?? "", entryPipeType: vid.entryPipeType ?? "", entryDepth: vid.entryDepth ?? "" })
    setStep3Form({ whyStopped: vid.whyStopped ?? "", stopFootage: vid.stopFootage ?? "0", stopNotes: vid.stopNotes ?? "" })
    setStep6Form({ fullyInspected: (vid.fullyInspected ?? "") as "Yes"|"Partially"|"No"|"", notFullyReason: vid.notFullyReason ?? "", assessableFootage: vid.assessableFootage ?? "0" })
    const chars = vid.characteristics
    if (chars && chars.length > 0) {
      setStep7Rows(chars)
    } else {
      setStep7Rows([
        { id: "start", isStart: true, length: "0", depth: vid.entryDepth ?? "", aboveGround: "", ownership: "Association" },
        { id: "end", isEnd: true, length: vid.stopFootage ?? "", depth: "", aboveGround: "", ownership: "Association" },
      ])
    }
    setEditingStep(null)
  }, [selectedVideoId])

  const applyZoomStep = (direction: 1 | -1) => {
    setMapZoom(z => {
      const next = Math.min(Math.max(z * (direction > 0 ? 1.25 : 1 / 1.25), 0.25), 8)
      setMapPan(p => ({ x: p.x * (next / z), y: p.y * (next / z) }))
      return next
    })
  }

  const selectedAssetRaw = assets.find(a => a.id === selectedAssetId)
  const selectedAsset = selectedAssetRaw ? projectAsset(selectedAssetRaw, assetObservations) : undefined
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
    createPipe(newPipe)
    setDrawFrom(null)
    setDrawFromCoord(null)
    setDrawPoints([])
    setDrawMouse(null)
    setDrawHoverPtIdx(null)
    setHoverAssetId(null)
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
      const newAsset: Asset = { id: newId, type: addAssetType, label: `${ASSET_PREFIX[addAssetType]}-${String(typeCount).padStart(3, "0")}`, x, y }
      createAsset(newAsset)
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
    if (mode === "view" && lockedAssetIds.has(assetId) && editingLocationId !== assetId) return
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
    updatePipe(selectedPipeId, {
      start: pipeForm.start,
      end: pipeForm.end,
      length: pipeForm.length,
      slope: pipeForm.slope,
      transitions: pipeForm.transitions,
    }, "pipe endpoint updated")
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
    updatePipe(pipeId, {
      start: { type: rs.pipeType, diameter: rs.pipeSize, depth: rs.depth },
      end:   { type: re.pipeType, diameter: re.pipeSize, depth: re.depth },
      length,
    }, "pipe endpoint updated")
  }

  const addVideoWithName = (name: string) => {
    const vid: CamVideo = {
      id: `v${Date.now()}`, name, date: new Date().toISOString().slice(0, 10),
      operator: "", direction: "downstream", observationsClosed: false, observations: [],
      inspStep: 1, zeroRef: "At the pipe entry",
    }
    return vid
  }

  const addVideo = (name = "Camera Run") => {
    if (!selectedPipeId) return
    const vid = addVideoWithName(name)
    const pipe = pipes.find(p => p.id === selectedPipeId)
    if (!pipe) return
    updatePipe(selectedPipeId, { videos: [...pipe.videos, vid] }, "inspection added")
    setSelectedVideoId(vid.id)
    setShowVideoForm(false)
    setVideoForm({ name: "", date: "", operator: "", direction: "downstream" })
  }

  const addAssetVideo = (assetId: string, name = "Camera Run") => {
    const vid = addVideoWithName(name)
    const asset = assets.find(a => a.id === assetId)
    updateAsset(assetId, { videos: [...(asset?.videos ?? []), vid] }, "inspection updated")
    setAssetVideoSource({ assetId, videoId: vid.id })
    setInspectionFullscreen(true)
    setCaptureStep("none")
    setVideoPlaying(false)
    setShowVideoForm(false)
    setVideoForm({ name: "", date: "", operator: "", direction: "downstream" })
  }

  const updateVideo = (fields: Partial<CamVideo>) => {
    if (!selectedPipeId || !selectedVideoId) return
    const pipe = pipes.find(p => p.id === selectedPipeId)
    if (!pipe) return
    updatePipe(selectedPipeId, { videos: pipe.videos.map(v => v.id === selectedVideoId ? { ...v, ...fields } : v) }, "inspection updated")
  }

  const saveObservation = () => {
    const obs: Observation = { id: `obs${Date.now()}`, type: captureStep as ObsType, ...captureForm } as Observation
    if (assetVideoSource) {
      const srcAsset = assets.find(a => a.id === assetVideoSource.assetId)
      updateAsset(assetVideoSource.assetId, {
        videos: (srcAsset?.videos ?? []).map(v => v.id === assetVideoSource.videoId ? { ...v, observations: [...v.observations, obs] } : v)
      }, "inspection updated")
    } else {
      if (!selectedPipeId || !selectedVideoId) return
      const pipe = pipes.find(p => p.id === selectedPipeId)
      if (!pipe) return
      const obsDesc = `observation — ${obs.type}${(obs as any).severity ? ", " + (obs as any).severity : ""}${(obs as any).footage ? ", " + (obs as any).footage + " ft" : ""}`
      updatePipe(selectedPipeId, {
        videos: pipe.videos.map(v => v.id === selectedVideoId ? { ...v, observations: [...v.observations, obs] } : v)
      }, obsDesc)
    }
    setCaptureStep("none")
    setCaptureForm({})
  }

  const deleteObservation = (obsId: string) => {
    if (assetVideoSource) {
      const srcAsset = assets.find(a => a.id === assetVideoSource.assetId)
      updateAsset(assetVideoSource.assetId, {
        videos: (srcAsset?.videos ?? []).map(v => v.id === assetVideoSource.videoId ? { ...v, observations: v.observations.filter(o => o.id !== obsId) } : v)
      }, "inspection updated")
    } else {
      if (!selectedPipeId || !selectedVideoId) return
      setConfirmDialog({
        title: "Remove Observation",
        message: "Remove this observation? This cannot be undone.",
        onConfirm: () => {
          const pipe = pipes.find(p => p.id === selectedPipeId)
          if (!pipe) return
          updatePipe(selectedPipeId, {
            videos: pipe.videos.map(v => v.id === selectedVideoId ? { ...v, observations: v.observations.filter(o => o.id !== obsId) } : v)
          }, "inspection updated")
        },
      })
    }
  }

  const saveRunEnd = () => {
    if (!runEndForm.footage) return
    if (assetVideoSource) {
      const srcAsset = assets.find(a => a.id === assetVideoSource.assetId)
      updateAsset(assetVideoSource.assetId, {
        videos: (srcAsset?.videos ?? []).map(v => v.id === assetVideoSource.videoId ? {
          ...v, runEnd: { footage: runEndForm.footage, depth: runEndForm.depth, pipeType: runEndForm.pipeType, pipeSize: runEndForm.pipeSize }
        } : v)
      }, "inspection — run end recorded")
    } else {
      if (!selectedPipeId || !selectedVideoId) return
      const pipe = pipes.find(p => p.id === selectedPipeId)
      if (!pipe) return
      updatePipe(selectedPipeId, {
        videos: pipe.videos.map(v => v.id === selectedVideoId ? { ...v, runEnd: { footage: runEndForm.footage, depth: runEndForm.depth, pipeType: runEndForm.pipeType, pipeSize: runEndForm.pipeSize } } : v)
      }, "inspection — run end recorded")
    }
    setShowRunEndForm(false)
    setRunEndForm({ footage: "", depth: "", pipeType: "PVC", pipeSize: '4"' })
  }

  const setObsClosed = (closed: boolean) => {
    const obsDesc = `inspection — observations ${closed ? "closed" : "reopened"}`
    if (assetVideoSource) {
      const srcAsset = assets.find(a => a.id === assetVideoSource.assetId)
      updateAsset(assetVideoSource.assetId, {
        videos: (srcAsset?.videos ?? []).map(v => v.id === assetVideoSource.videoId ? { ...v, observationsClosed: closed } : v)
      }, obsDesc)
    } else {
      if (!selectedPipeId || !selectedVideoId) return
      const pipe = pipes.find(p => p.id === selectedPipeId)
      if (!pipe) return
      updatePipe(selectedPipeId, {
        videos: pipe.videos.map(v => v.id === selectedVideoId ? { ...v, observationsClosed: closed } : v)
      }, obsDesc)
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
    // Reset observation UI when switching assets
    setObsMode(null); setObsDraft({}); setObsHistoryOpen(false); setObsFieldHistoryField(null); setObsViewingId(null)
  }

  // ── Archive / delete helpers ────────────────────────────────────────────────

  function computeAssetTier(id: string): "delete" | "archive" {
    const a = assets.find(x => x.id === id)
    if (!a) return "delete"
    const connectedPipes = pipes.filter(p => p.fromId === id || p.toId === id)
    const hasObs = (a.conditionRating !== undefined) || ((a.videos ?? []).length > 0)
    const isCurrentVisit = currentVisitId !== null
    const hasHistory = hasObs || connectedPipes.length > 0
    if (!hasHistory && isCurrentVisit) return "delete"
    if (hasHistory) return "archive"
    return "delete"
  }

  function showArchiveAsset(id: string) {
    const tier = computeAssetTier(id)
    setArchiveDialog({ type: "asset", id, tier, archiveReason: "", alsoArchivePipes: false })
  }

  function showArchivePipe(id: string) {
    const p = pipes.find(x => x.id === id)
    const hasHistory = (p?.videos.length ?? 0) > 0
    const tier: "delete" | "archive" = hasHistory ? "archive" : "delete"
    setArchiveDialog({ type: "pipe", id, tier, archiveReason: "", alsoArchivePipes: false })
  }

  function commitArchiveAsset(id: string, reason: string, alsoArchivePipes: boolean) {
    const a = assets.find(x => x.id === id)
    if (!a) return
    const connectedPipes = pipes.filter(p => p.fromId === id || p.toId === id)
    const now = Date.now()
    const who = selectedPersonId ?? "unknown"

    setAssets(prev => prev.map(x => x.id === id
      ? { ...x, archived: true, archivedById: who, archivedOn: now, archivedDuringVisitId: currentVisitId ?? undefined, archiveReason: reason }
      : x
    ))

    if (alsoArchivePipes && connectedPipes.length > 0) {
      setPipes(prev => prev.map(p => connectedPipes.some(cp => cp.id === p.id)
        ? { ...p, archived: true, archivedById: who, archivedOn: now, archivedDuringVisitId: currentVisitId ?? undefined, archiveReason: reason }
        : p
      ))
    }

    if (selectedAssetId === id) setSelectedAssetId(null)

    const logText = alsoArchivePipes && connectedPipes.length > 0
      ? `${a.label} archived with ${connectedPipes.length} connected pipe${connectedPipes.length > 1 ? "s" : ""} — ${reason.split(" —")[0].toLowerCase()}`
      : `${a.label} archived — ${reason.split(" —")[0].toLowerCase()}`
    appendLog(logText)

    const prevAssets = assets
    const prevPipes = pipes
    showUndoToast(`${a.label} archived`, () => {
      setAssets(prevAssets)
      if (alsoArchivePipes) setPipes(prevPipes)
      appendLog(`${a.label} archive undone`)
    })
    setArchiveDialog(null)
  }

  function commitDeleteAsset(id: string) {
    const a = assets.find(x => x.id === id)
    if (!a) return
    const linked = pipes.filter(p => p.fromId === id || p.toId === id)
    const linkedIds = linked.map(p => p.id)
    setPipes(prev => prev.filter(p => !linkedIds.includes(p.id)))
    setAssets(prev => prev.filter(x => x.id !== id))
    if (selectedAssetId === id) setSelectedAssetId(null)
    if (selectedPipeId && linkedIds.includes(selectedPipeId)) { setSelectedPipeId(null); setSelectedVideoId(null) }
    appendLog(`${a.label} deleted — created and removed in this visit`)

    const prevAssets = assets
    const prevPipes = pipes
    showUndoToast(`${a.label} deleted`, () => {
      setAssets(prevAssets)
      setPipes(prevPipes)
    })
    setArchiveDialog(null)
  }

  function commitArchivePipe(id: string, reason: string) {
    const p = pipes.find(x => x.id === id)
    if (!p) return
    const now = Date.now()
    const who = selectedPersonId ?? "unknown"
    setPipes(prev => prev.map(x => x.id === id
      ? { ...x, archived: true, archivedById: who, archivedOn: now, archivedDuringVisitId: currentVisitId ?? undefined, archiveReason: reason }
      : x
    ))
    if (selectedPipeId === id) { setSelectedPipeId(null); setSelectedVideoId(null) }
    appendLog(`${p.label} archived — ${reason.split(" —")[0].toLowerCase()}`)

    const prevPipes = pipes
    showUndoToast(`${p.label} archived`, () => {
      setPipes(prevPipes)
      appendLog(`${p.label} archive undone`)
    })
    setArchiveDialog(null)
  }

  function commitDeletePipe(id: string) {
    const p = pipes.find(x => x.id === id)
    if (!p) return
    setPipes(prev => prev.filter(x => x.id !== id))
    if (selectedPipeId === id) { setSelectedPipeId(null); setSelectedVideoId(null) }
    appendLog(`${p.label} deleted — created and removed in this visit`)

    const prevPipes = pipes
    showUndoToast(`${p.label} deleted`, () => {
      setPipes(prevPipes)
    })
    setArchiveDialog(null)
  }

  function restoreAsset(id: string) {
    const a = assets.find(x => x.id === id)
    if (!a) return
    setAssets(prev => prev.map(x => x.id === id
      ? { ...x, archived: false, archivedById: undefined, archivedOn: undefined, archivedDuringVisitId: undefined, archiveReason: undefined }
      : x
    ))
    appendLog(`${a.label} restored from archive`)
    const connectedArchived = pipes.filter(p => (p.fromId === id || p.toId === id) && p.archived)
    if (connectedArchived.length > 0) {
      const names = connectedArchived.map(p => p.label).join(", ")
      setConfirmDialog({
        title: "Restore connected pipes?",
        message: `${names} connect${connectedArchived.length === 1 ? "s" : ""} to this asset and ${connectedArchived.length === 1 ? "is" : "are"} also archived. Restore ${connectedArchived.length === 1 ? "it" : "them"} too?`,
        onConfirm: () => {
          setPipes(prev => prev.map(p => connectedArchived.some(cp => cp.id === p.id)
            ? { ...p, archived: false, archivedById: undefined, archivedOn: undefined, archivedDuringVisitId: undefined, archiveReason: undefined }
            : p
          ))
        },
      })
    }
  }

  function restorePipe(id: string) {
    const p = pipes.find(x => x.id === id)
    if (!p) return
    setPipes(prev => prev.map(x => x.id === id
      ? { ...x, archived: false, archivedById: undefined, archivedOn: undefined, archivedDuringVisitId: undefined, archiveReason: undefined }
      : x
    ))
    appendLog(`${p.label} restored from archive`)
  }

  function showUndoToast(label: string, onUndo: () => void) {
    if (undoToast) clearTimeout(undoToast.timer)
    const timer = setTimeout(() => setUndoToast(null), 12000)
    setUndoToast({ label, onUndo, timer })
  }

  const deleteAsset = showArchiveAsset
  const deletePipe = showArchivePipe

  const deleteVideo = (pipeId: string, videoId: string) => {
    const vid = pipes.find(p => p.id === pipeId)?.videos.find(v => v.id === videoId)
    setConfirmDialog({
      title: "Delete Inspection Video",
      message: `Delete "${vid?.name}"? All ${vid?.observations.length ?? 0} observation${vid?.observations.length !== 1 ? "s" : ""} will be permanently lost.`,
      onConfirm: () => {
        const pipe = pipes.find(p => p.id === pipeId)
        if (pipe) updatePipe(pipeId, { videos: pipe.videos.filter(v => v.id !== videoId) }, "inspection deleted")
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

  // ── Visit helpers ────────────────────────────────────────────────────────────

  const startedAt = visits.find(v => v.id === currentVisitId)?.startedAt

  useEffect(() => {
    if (!currentVisitId || !startedAt) { setElapsed(0); return }
    const tick = () => setElapsed(Math.floor((Date.now() - startedAt) / 1000))
    tick()
    const id = setInterval(tick, 1000)
    return () => clearInterval(id)
  }, [currentVisitId, startedAt])

  function appendLog(text: string) {
    if (!currentVisitId) return
    const entry: VisitLogEntry = { id: `le${Date.now()}`, at: Date.now(), text }
    setVisits(vs => vs.map(v => v.id === currentVisitId ? { ...v, log: [...v.log, entry] } : v))
    setVisitLogHighlight(true)
    setTimeout(() => setVisitLogHighlight(false), 1800)
  }

  // ── Logging wrappers ──────────────────────────────────────────────────────
  function createAsset(a: Asset) {
    setAssets(prev => [...prev, a])
    appendLog(`${a.label} created — ${ASSET_META[a.type].label}${a.location ? `, ${a.location}` : ""}`)
  }

  function updateAsset(id: string, patch: Partial<Asset>, description: string) {
    setAssets(prev => prev.map(a => a.id === id ? { ...a, ...patch } : a))
    const tag = assets.find(a => a.id === id)?.label ?? id
    appendLog(`${tag} ${description}`)
  }

  function createPipe(p: Pipe) {
    setPipes(prev => [...prev, p])
    const fr = assets.find(a => a.id === p.fromId)
    const to = p.toId ? assets.find(a => a.id === p.toId) : null
    appendLog(`${p.label} created — ${fr?.label ?? "free"} → ${to?.label ?? "free"}`)
  }

  function updatePipe(id: string, patch: Partial<Pipe>, description: string) {
    setPipes(prev => prev.map(p => p.id === id ? { ...p, ...patch } : p))
    const tag = pipes.find(p => p.id === id)?.label ?? id
    appendLog(`${tag} ${description}`)
  }

  function startVisit() {
    const job = SAMPLE_JOBS.find(j => j.id === launchJobId) ?? null
    const person = SITE_PERSONS.find(p => p.id === selectedPersonId)
    if (!person) return
    const property = launchOfficeMode ? launchOfficeProperty : (job?.property ?? "")
    const vt = launchOfficeMode ? "Office Update" : launchVisitType
    const newVisit: Visit = {
      id: `v${Date.now()}`, jobId: launchJobId || null, property, visitType: vt,
      personId: person.id, technicianIds: launchTechIds,
      startedAt: Date.now(), endedAt: null,
      officeUpdateReason: launchOfficeMode ? launchOfficeReason : undefined,
      log: [{ id: "l0", at: Date.now(), text: "Visit started" }],
    }
    setVisits(vs => [newVisit, ...vs])
    setCurrentVisitId(newVisit.id)
    setBrowseMode(false)
    setViewingVisitId(null)
    setShowVisitLog(false)
    setAppView("simd")
  }

  function closeVisit() {
    if (!currentVisitId) return
    setVisits(vs => vs.map(v => v.id === currentVisitId
      ? { ...v, endedAt: Date.now(), visitNote: closeVisitNote, acceptedAtClose: Object.entries(closeAccepted).map(([item, reason]) => ({ item, reason })) }
      : v))
    setCurrentVisitId(null)
    setSelectedPersonId(null)
    setLaunchJobId("")
    setLaunchVisitType("")
    setLaunchTechIds([])
    setLaunchOfficeMode(false)
    setLaunchOfficeProperty("")
    setLaunchOfficeReason("")
    setCloseVisitNote("")
    setCloseAccepted({})
    setShowCloseVisit(false)
    setShowVisitLog(false)
    setViewingVisitId(null)
    setAppView("launch")
  }

  function fmtDuration(ms: number): string {
    const h = Math.floor(ms / 3600000)
    const m = Math.floor((ms % 3600000) / 60000)
    return h > 0 ? `${h}h ${m}m` : `${m}m`
  }

  function fmtElapsed(s: number): string {
    const h = Math.floor(s / 3600)
    const m = Math.floor((s % 3600) / 60)
    const sec = s % 60
    return h > 0
      ? `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
      : `${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`
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
  const effectivePanelW = (panelOpen && rightPanelOpen) ? (selectedPipeId ? pipePanelW : selectedVideo ? 540 : 364) : 0

  // ── Visit derived ─────────────────────────────────────────────────────────
  const currentVisit = currentVisitId ? visits.find(v => v.id === currentVisitId) ?? null : null
  const viewingVisit = viewingVisitId ? visits.find(v => v.id === viewingVisitId) ?? null : null
  const selectedPerson = SITE_PERSONS.find(p => p.id === selectedPersonId) ?? null
  const launchJob = SAMPLE_JOBS.find(j => j.id === launchJobId) ?? null

  const launchCanStart = selectedPersonId !== null && launchTechIds.length > 0 && (
    launchOfficeMode
      ? launchOfficeProperty !== "" && launchOfficeReason.trim() !== ""
      : launchJobId !== "" && launchVisitType !== ""
  )
  const launchHint = !selectedPersonId ? "Select who you are"
    : !launchOfficeMode && !launchJobId ? "Select a job"
    : launchTechIds.length === 0 ? "Select at least one technician"
    : launchOfficeMode && !launchOfficeProperty ? "Select a property"
    : launchOfficeMode && !launchOfficeReason.trim() ? "Enter a reason for this update"
    : ""

  const closedVisits = visits.filter(v => v.endedAt !== null).sort((a, b) => b.startedAt - a.startedAt)
  const historyFiltered = closedVisits.filter(v => {
    if (historyPersonFilter !== "all" && v.personId !== historyPersonFilter) return false
    if (historyRangeFilter !== "all") {
      const days = Number(historyRangeFilter)
      if (v.startedAt < Date.now() - days * 86400000) return false
    }
    return true
  })
  const historyVisible = historyShowAll ? historyFiltered : historyFiltered.slice(0, 5)

  // ── Launch screen ─────────────────────────────────────────────────────────
  if (appView === "launch") {
    const LogoMark = () => (
      <svg width="36" height="36" viewBox="0 0 22 22" fill="none">
        <circle cx="11" cy="11" r="10" stroke={C.cyan} strokeWidth="1.5" />
        <circle cx="11" cy="11" r="6" stroke={C.cyan} strokeWidth="0.8" strokeDasharray="3 2" opacity="0.5" />
        <circle cx="11" cy="11" r="2.5" fill={C.cyan} />
        <line x1="11" y1="1" x2="11" y2="5" stroke={C.cyan} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="11" y1="17" x2="11" y2="21" stroke={C.cyan} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="1" y1="11" x2="5" y2="11" stroke={C.cyan} strokeWidth="1.2" strokeLinecap="round" />
        <line x1="17" y1="11" x2="21" y2="11" stroke={C.cyan} strokeWidth="1.2" strokeLinecap="round" />
      </svg>
    )
    const sectionLabel = (text: string) => (
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", whiteSpace: "nowrap" }}>{text}</span>
        <div style={{ flex: 1, height: 1, background: C.border }} />
      </div>
    )

    return (
      <div style={{ height: "100dvh", background: C.bg, fontFamily: "'DM Sans', sans-serif", color: C.text, overflow: "auto", display: "flex", flexDirection: "column" }}>
        {/* top bar with logo */}
        <div style={{ padding: "20px 32px 0", display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
          <LogoMark />
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>SewerMap Pro</div>
            <div style={{ fontSize: 9, color: C.blue, fontFamily: "JetBrains Mono", letterSpacing: "0.1em" }}>UNDERGROUND INFRASTRUCTURE</div>
          </div>
        </div>

        {/* two-column area */}
        <div style={{ flex: 1, display: "flex", gap: 24, padding: "28px 32px 32px", flexWrap: "wrap", alignItems: "flex-start", minHeight: 0 }}>

          {/* ── LEFT: Start a visit ── */}
          <div style={{ flex: "1 1 480px", maxWidth: 540, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: "24px 24px 20px", display: "flex", flexDirection: "column", gap: 20 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: C.text, letterSpacing: "0.06em", textTransform: "uppercase", borderBottom: `1px solid ${C.border}`, paddingBottom: 12 }}>Start a visit</div>

            {/* WHO ARE YOU */}
            <div>
              {sectionLabel("Who are you?")}
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
                {SITE_PERSONS.map(p => {
                  const sel = selectedPersonId === p.id
                  return (
                    <button key={p.id} onClick={() => {
                      setSelectedPersonId(p.id)
                      setLaunchTechIds(prev => prev.includes(p.id) ? prev : [...prev, p.id])
                    }}
                      style={{ padding: "12px 10px", borderRadius: 7, border: `1.5px solid ${sel ? C.cyan : C.border}`, background: sel ? C.cyan : C.card, cursor: "pointer", textAlign: "left", transition: "all 0.12s" }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: sel ? "#fff" : C.text, marginBottom: 1 }}>{p.name}</div>
                      <div style={{ fontSize: 9.5, color: sel ? "rgba(255,255,255,0.75)" : C.muted }}>{p.role}</div>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* rest locked until person chosen */}
            <div style={{ opacity: selectedPersonId ? 1 : 0.38, pointerEvents: selectedPersonId ? "auto" : "none", transition: "opacity 0.2s", display: "flex", flexDirection: "column", gap: 18 }}>

              {/* JOB */}
              {!launchOfficeMode ? (
                <div>
                  {sectionLabel("Job")}
                  {(["today", "scheduled", "recent"] as const).map(grp => {
                    const jobs = SAMPLE_JOBS.filter(j => j.group === grp)
                    if (jobs.length === 0) return null
                    return (
                      <div key={grp} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 8.5, fontWeight: 700, color: C.dim, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 4 }}>{grp}</div>
                        {jobs.map(j => {
                          const sel = launchJobId === j.id
                          return (
                            <button key={j.id} onClick={() => { setLaunchJobId(j.id); setLaunchVisitType(j.jobType) }}
                              style={{ width: "100%", display: "flex", gap: 10, padding: "9px 10px", marginBottom: 3, borderRadius: 6, background: sel ? C.cyan + "12" : C.card, border: `1.5px solid ${sel ? C.cyan : C.border}`, cursor: "pointer", textAlign: "left" }}>
                              <div style={{ width: 16, height: 16, borderRadius: "50%", border: `1.5px solid ${sel ? C.cyan : C.border}`, background: sel ? C.cyan : "transparent", flexShrink: 0, marginTop: 2, display: "flex", alignItems: "center", justifyContent: "center" }}>
                                {sel && <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#fff" }} />}
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ display: "flex", gap: 8, alignItems: "baseline", flexWrap: "wrap" }}>
                                  <span style={{ fontSize: 10, color: C.dim, fontFamily: "JetBrains Mono", flexShrink: 0 }}>{j.when}</span>
                                  <span style={{ fontSize: 10, fontWeight: 700, color: sel ? C.cyan : C.text, fontFamily: "JetBrains Mono" }}>{j.number}</span>
                                  <span style={{ fontSize: 10, color: C.muted }}>{j.jobType}</span>
                                </div>
                                <div style={{ fontSize: 9.5, color: C.dim, marginTop: 1 }}>{j.property} · {j.summary}</div>
                              </div>
                            </button>
                          )
                        })}
                      </div>
                    )
                  })}
                  <button onClick={() => { setLaunchOfficeMode(true); setLaunchJobId(""); setLaunchVisitType("Office Update") }}
                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.muted, textDecoration: "underline", padding: "2px 0" }}>
                    No job — office update
                  </button>
                </div>
              ) : (
                <div>
                  {sectionLabel("Office update")}
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Property *</div>
                      <select value={launchOfficeProperty} onChange={e => setLaunchOfficeProperty(e.target.value)}
                        style={{ width: "100%", padding: "8px 10px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, outline: "none" }}>
                        <option value="">Select property…</option>
                        {ALL_PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Reason for the change *</div>
                      <textarea value={launchOfficeReason} onChange={e => setLaunchOfficeReason(e.target.value)} rows={3}
                        placeholder="Describe what is being corrected…"
                        style={{ width: "100%", padding: "8px 10px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                    </div>
                    <div style={{ fontSize: 9.5, color: C.muted, fontStyle: "italic", lineHeight: 1.5 }}>
                      Recorded as an office correction, not a field observation, and labelled as such in any report.
                    </div>
                    <button onClick={() => { setLaunchOfficeMode(false); setLaunchJobId(""); setLaunchVisitType("") }}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.muted, textDecoration: "underline", padding: "2px 0", textAlign: "left" }}>
                      ← Back to job list
                    </button>
                  </div>
                </div>
              )}

              {/* VISIT TYPE */}
              <div>
                {sectionLabel("Visit type")}
                <select value={launchVisitType} onChange={e => setLaunchVisitType(e.target.value)}
                  style={{ width: "100%", padding: "9px 10px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: launchVisitType ? C.text : C.muted, outline: "none" }}>
                  <option value="">Select visit type…</option>
                  {VISIT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                </select>
              </div>

              {/* TECHNICIANS */}
              <div>
                {sectionLabel("Technicians on site")}
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                  {SITE_PERSONS.map(p => {
                    const sel = launchTechIds.includes(p.id)
                    return (
                      <button key={p.id} onClick={() => setLaunchTechIds(prev => sel ? prev.filter(id => id !== p.id) : [...prev, p.id])}
                        style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 10px", borderRadius: 6, border: `1.5px solid ${sel ? C.cyan : C.border}`, background: sel ? C.cyan + "12" : C.card, cursor: "pointer" }}>
                        <div style={{ width: 13, height: 13, borderRadius: 3, background: sel ? C.cyan : C.panel, border: `1.5px solid ${sel ? C.cyan : C.border}`, display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                          {sel && <svg width="8" height="8" viewBox="0 0 8 8" fill="none"><path d="M1.5 4l2 2 3-3" stroke="#fff" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                        </div>
                        <span style={{ fontSize: 11, fontWeight: 500, color: sel ? C.cyan : C.muted }}>{p.name}</span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </div>

            {/* START VISIT + browse */}
            <div style={{ display: "flex", flexDirection: "column", alignItems: "stretch", gap: 6, paddingTop: 4 }}>
              <button onClick={startVisit} disabled={!launchCanStart}
                style={{ padding: "12px", fontSize: 13, fontWeight: 700, background: launchCanStart ? C.cyan : C.card, color: launchCanStart ? "#fff" : C.dim, border: `1px solid ${launchCanStart ? C.cyan : C.border}`, borderRadius: 7, cursor: launchCanStart ? "pointer" : "not-allowed", letterSpacing: "0.04em", transition: "all 0.15s" }}>
                Start visit
              </button>
              {launchHint && <div style={{ textAlign: "center", fontSize: 10.5, color: C.muted, fontStyle: "italic" }}>{launchHint}</div>}
              {!showLaunchBrowsePicker ? (
                <button onClick={() => setShowLaunchBrowsePicker(true)}
                  style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.muted, textDecoration: "underline", padding: "4px 0", textAlign: "center" }}>
                  Browse without a visit
                </button>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <select value={launchBrowseProperty} onChange={e => setLaunchBrowseProperty(e.target.value)}
                    style={{ width: "100%", padding: "8px 10px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: launchBrowseProperty ? C.text : C.muted, outline: "none" }}>
                    <option value="">Select property to browse…</option>
                    {ALL_PROPERTIES.map(p => <option key={p} value={p}>{p}</option>)}
                  </select>
                  <button onClick={() => { setBrowseMode(true); setCurrentVisitId(null); setViewingVisitId(null); setAppView("simd") }}
                    disabled={!launchBrowseProperty}
                    style={{ padding: "8px", fontSize: 11, fontWeight: 700, background: launchBrowseProperty ? C.cyan : C.card, color: launchBrowseProperty ? "#fff" : C.dim, border: `1px solid ${launchBrowseProperty ? C.cyan : C.border}`, borderRadius: 5, cursor: launchBrowseProperty ? "pointer" : "not-allowed" }}>
                    Browse
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── RIGHT: Recent visits ── */}
          <div style={{ flex: "1 1 380px", maxWidth: 480, display: "flex", flexDirection: "column", gap: 0 }}>
            <div style={{ background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              <div style={{ padding: "16px 20px 12px", borderBottom: `1px solid ${C.border}`, fontSize: 12, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", color: C.text }}>Recent visits</div>
              {/* Filters */}
              <div style={{ padding: "10px 20px", borderBottom: `1px solid ${C.border}`, display: "flex", gap: 8 }}>
                <select value={historyPersonFilter} onChange={e => setHistoryPersonFilter(e.target.value)}
                  style={{ flex: 1, padding: "5px 8px", fontSize: 10.5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, outline: "none" }}>
                  <option value="all">All people</option>
                  {SITE_PERSONS.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
                <select value={historyRangeFilter} onChange={e => setHistoryRangeFilter(e.target.value)}
                  style={{ flex: 1, padding: "5px 8px", fontSize: 10.5, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, outline: "none" }}>
                  <option value="1">Today</option>
                  <option value="7">Last 7 days</option>
                  <option value="30">Last 30 days</option>
                  <option value="90">Last 90 days</option>
                  <option value="all">All</option>
                </select>
              </div>
              {/* Visit rows */}
              <div style={{ overflowY: "auto", maxHeight: 480 }}>
                {historyVisible.length === 0 ? (
                  <div style={{ padding: "32px 20px", textAlign: "center", fontSize: 11, color: C.dim, fontStyle: "italic" }}>
                    No visits yet. Start one on the left and it will appear here.
                  </div>
                ) : (
                  historyVisible.map(v => {
                    const person = SITE_PERSONS.find(p => p.id === v.personId)
                    const dur = v.endedAt ? fmtDuration(v.endedAt - v.startedAt) : ""
                    const d = new Date(v.startedAt)
                    const dateStr = d.toLocaleDateString("en-US", { month: "short", day: "numeric" })
                    const isOffice = v.visitType === "Office Update"
                    return (
                      <div key={v.id}
                        onClick={() => { setViewingVisitId(v.id); setBrowseMode(true); setCurrentVisitId(null); setShowVisitLog(true); setAppView("simd") }}
                        style={{ padding: "14px 20px", borderBottom: `1px solid ${C.border}`, cursor: "pointer", display: "flex", gap: 14, transition: "background 0.1s" }}
                        onMouseEnter={e => (e.currentTarget.style.background = C.card)}
                        onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                        <div style={{ width: 40, flexShrink: 0 }}>
                          <span style={{ fontSize: 10, color: C.dim, fontFamily: "JetBrains Mono" }}>{dateStr}</span>
                        </div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontSize: 12, fontWeight: 600, color: C.text, marginBottom: 1 }}>{v.property}</div>
                          <div style={{ fontSize: 10.5, color: C.muted }}>{v.visitType} · {person?.name ?? "—"}</div>
                          <div style={{ fontSize: 10, color: C.dim, fontFamily: "JetBrains Mono", marginTop: 2 }}>
                            {v.log.length} log {v.log.length !== 1 ? "entries" : "entry"}
                          </div>
                          {v.reportStatus && (
                            <div style={{ marginTop: 3 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: v.reportStatus === "sent" ? "#D1FAE5" : v.reportStatus === "in review" ? "#FEF3C7" : C.card, color: v.reportStatus === "sent" ? "#065F46" : v.reportStatus === "in review" ? "#92400E" : C.muted, border: `1px solid ${v.reportStatus === "sent" ? "#6EE7B7" : v.reportStatus === "in review" ? "#FCD34D" : C.border}` }}>
                                {v.reportStatus}
                              </span>
                            </div>
                          )}
                        </div>
                        <div style={{ flexShrink: 0, textAlign: "right" }}>
                          {isOffice ? (
                            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", padding: "2px 6px", borderRadius: 3, background: C.card, color: C.muted, border: `1px solid ${C.border}` }}>office</span>
                          ) : dur ? (
                            <span style={{ fontSize: 10, color: C.dim, fontFamily: "JetBrains Mono" }}>{dur}</span>
                          ) : null}
                        </div>
                      </div>
                    )
                  })
                )}
                {historyFiltered.length > 5 && (
                  <div style={{ padding: "12px 20px", textAlign: "center" }}>
                    <button onClick={() => setHistoryShowAll(v => !v)}
                      style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: C.cyan, fontWeight: 600 }}>
                      {historyShowAll ? "Show less" : `Show ${historyFiltered.length - 5} more`}
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      style={{ height: "100dvh", display: "flex", flexDirection: "column", overflow: "hidden", background: C.bg, color: C.text, fontFamily: "'DM Sans', sans-serif", userSelect: "none" }}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onTouchMove={e => { const { clientX, clientY } = getTouchXY(e); handleMouseMove({ clientX, clientY } as React.MouseEvent) }}
      onTouchEnd={handleMouseUp}
    >

      {/* ── SESSION STRIP ──────────────────────────────────────────────────────── */}
      <div style={{ height: 44, flexShrink: 0, background: C.panel, borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", paddingLeft: 14, paddingRight: 14, gap: 10, position: "relative", zIndex: 200 }}>
        {browseMode ? (
          /* BROWSE MODE strip */
          <>
            <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", textTransform: "uppercase", padding: "3px 8px", borderRadius: 4, background: C.cyan + "22", color: C.cyan, border: `1px solid ${C.cyan}55`, flexShrink: 0 }}>BROWSING</span>
            {viewingVisit && (
              <span style={{ fontSize: 11, color: C.dim, flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {viewingVisit.property} · {viewingVisit.visitType}
              </span>
            )}
            <div style={{ marginLeft: "auto", display: "flex", gap: 8, alignItems: "center" }}>
              <button onClick={() => { setAppView("launch"); setBrowseMode(false); setViewingVisitId(null); setShowVisitLog(false) }}
                style={{ fontSize: 11, padding: "4px 10px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", color: C.muted }}>
                Back
              </button>
              <button onClick={() => setAppView("launch")}
                style={{ fontSize: 11, padding: "4px 10px", background: C.cyan, border: "none", borderRadius: 4, cursor: "pointer", color: "#fff", fontWeight: 600 }}>
                Start a visit
              </button>
            </div>
          </>
        ) : currentVisit ? (
          /* ACTIVE VISIT strip */
          <>
            {/* pulsing dot */}
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22C55E", flexShrink: 0, boxShadow: "0 0 0 3px #22C55E40" }} />
            <div style={{ display: "flex", flexDirection: "column", flex: 1, minWidth: 0, cursor: "pointer" }} onClick={() => setShowVisitLog(v => !v)}>
              <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentVisit.property}</span>
                <span style={{ fontSize: 10, color: C.muted, flexShrink: 0 }}>· {currentVisit.visitType}</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 10, color: C.dim, fontFamily: "JetBrains Mono" }}>{fmtElapsed(elapsed)}</span>
                <span style={{ fontSize: 10, color: C.dim }}>· {currentVisit.log.length} changes</span>
                <span style={{ fontSize: 9, color: C.dim }}>▾</span>
              </div>
            </div>
            <div style={{ flexShrink: 0, fontSize: 11, color: C.dim, fontWeight: 500 }}>
              {selectedPerson?.name ?? ""}
            </div>
            <button onClick={() => setShowCloseVisit(v => !v)}
              style={{ flexShrink: 0, padding: "5px 12px", fontSize: 11, fontWeight: 700, background: "#EF4444", border: "none", borderRadius: 5, cursor: "pointer", color: "#fff", letterSpacing: "0.03em" }}>
              Close visit
            </button>
          </>
        ) : (
          /* NO SESSION strip */
          <>
            <span style={{ fontSize: 11, color: C.dim, fontStyle: "italic" }}>No active visit</span>
            <button onClick={() => setAppView("launch")}
              style={{ marginLeft: "auto", fontSize: 11, padding: "5px 12px", background: C.cyan, border: "none", borderRadius: 5, cursor: "pointer", color: "#fff", fontWeight: 600 }}>
              Start a visit
            </button>
          </>
        )}

        {/* ── VISIT LOG DROPDOWN ── */}
        {showVisitLog && (currentVisit || viewingVisit) && (() => {
          const logVisit = viewingVisit ?? currentVisit!
          return (
            <div style={{ position: "absolute", top: 44, left: 14, width: 440, background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 32px #0008", zIndex: 300, display: "flex", flexDirection: "column", maxHeight: 480, overflow: "hidden" }}>
              <div style={{ padding: "12px 16px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div>
                  <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>{logVisit.property}</div>
                  <div style={{ fontSize: 10, color: C.muted }}>{logVisit.visitType} · {SITE_PERSONS.find(p => p.id === logVisit.personId)?.name ?? "—"}</div>
                </div>
                <button onClick={() => setShowVisitLog(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.muted, padding: 4 }}>✕</button>
              </div>
              <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
                {logVisit.log.slice().reverse().map((entry, i) => {
                  const isNew = i === 0 && visitLogHighlight && logVisit.id === currentVisitId
                  return (
                    <div key={entry.id} style={{ padding: "8px 16px", display: "flex", gap: 10, alignItems: "flex-start", background: isNew ? C.cyan + "18" : "transparent", transition: "background 0.4s" }}>
                      <span style={{ fontSize: 9.5, color: C.dim, fontFamily: "JetBrains Mono", flexShrink: 0, paddingTop: 1 }}>
                        {new Date(entry.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                      </span>
                      <span style={{ fontSize: 11, color: C.text, lineHeight: 1.5 }}>{entry.text}</span>
                    </div>
                  )
                })}
              </div>
              {logVisit.id === currentVisitId && (
                <div style={{ borderTop: `1px solid ${C.border}`, padding: "10px 16px" }}>
                  <button disabled style={{ width: "100%", padding: "8px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.dim, cursor: "not-allowed" }}>
                    Add work performed (coming soon)
                  </button>
                </div>
              )}
            </div>
          )
        })()}

        {/* ── CLOSE VISIT POPOVER ── */}
        {showCloseVisit && currentVisit && (() => {
          // Compute outstanding items
          const activeAssets = assets.filter(a => !a.archived)
          const activePipes = pipes.filter(p => !p.archived)

          type OutstandingItem = { id: string; label: string; issue: string; blocking: boolean }
          const outstanding: OutstandingItem[] = []

          activeAssets.forEach(a => {
            const meta = ASSET_META[a.type]
            if (!a.conditionRating) outstanding.push({ id: a.id, label: a.label, issue: "condition not set", blocking: true })
            if (!a.location) outstanding.push({ id: a.id, label: a.label, issue: "location not set", blocking: true })
            const needsDepth = ["catch-basin","storm-basin","sanitary-basin"].includes(a.type)
            if (needsDepth && !a.depth) outstanding.push({ id: a.id, label: a.label, issue: "depth not set", blocking: true })
            const isCleanout = a.type.startsWith("cleanout")
            const isStack = a.type === "stack"
            if (isCleanout && !a.accessSize) outstanding.push({ id: a.id, label: a.label, issue: "access size not set", blocking: true })
            if (isStack && !a.stackSize) outstanding.push({ id: a.id, label: a.label, issue: "stack size not set", blocking: true })
            // Stacks with no cleanout are not gaps — they are correctly recorded state
            if (isStack && a.hasCleanout === "no") {
              // Skip docs gap; surface as recommendation instead
            }
            const photoCount = (a.photos ?? []).filter(Boolean).length
            if (photoCount === 0) outstanding.push({ id: a.id, label: a.label, issue: "no photos", blocking: false })
          })

          activePipes.forEach(p => {
            if (p.videos.length === 0) outstanding.push({ id: p.id, label: p.label, issue: "no camera inspection", blocking: false })
            else if (p.videos.some(v => v.observations.length > 0 && !v.observationsClosed)) {
              outstanding.push({ id: p.id, label: p.label, issue: "camera inspection not completed", blocking: false })
            }
          })

          const blockingUnresolved = outstanding.filter(o => o.blocking && !closeAccepted[`${o.id}:${o.issue}`])
          const canClose = blockingUnresolved.length === 0

          return (
            <div style={{ position: "absolute", top: 44, right: 14, width: 480, maxHeight: "calc(100vh - 80px)", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 32px #0008", zIndex: 300, display: "flex", flexDirection: "column", overflow: "hidden" }}>
              {/* Header */}
              <div style={{ padding: "14px 18px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between", flexShrink: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: C.text }}>Close visit</div>
                <button onClick={() => setShowCloseVisit(false)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: C.muted, padding: 4 }}>✕</button>
              </div>
              {/* Context */}
              <div style={{ padding: "10px 18px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>{currentVisit.property}</div>
                <div style={{ fontSize: 10, color: C.muted }}>{currentVisit.visitType} · {currentVisit.log.length} log entries</div>
              </div>

              {/* Scrollable middle */}
              <div style={{ flex: 1, overflowY: "auto", minHeight: 0 }}>

                {/* Outstanding items */}
                {outstanding.length > 0 && (
                  <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Outstanding</div>
                    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                      {outstanding.map(o => {
                        const key = `${o.id}:${o.issue}`
                        const accepted = closeAccepted[key]
                        const acceptInput = closeAccepted[`${key}__input`] ?? ""
                        const setAcceptInput = (v: string) => setCloseAccepted(prev => ({ ...prev, [`${key}__input`]: v }))
                        return (
                          <div key={key} style={{ padding: "8px 10px", background: accepted ? C.card : (o.blocking ? "#FEF2F2" : C.card), border: `1px solid ${accepted ? C.border : (o.blocking ? "#FECACA" : C.border)}`, borderRadius: 6 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 9, fontWeight: 700, color: o.blocking ? "#DC2626" : "#D97706" }}>⚠</span>
                              <span style={{ fontSize: 10, fontWeight: 700, color: C.text, fontFamily: "JetBrains Mono" }}>{o.label}</span>
                              <span style={{ fontSize: 10, color: C.muted, flex: 1 }}>{o.issue}</span>
                              <span style={{ fontSize: 9, color: o.blocking ? "#DC2626" : "#D97706", fontWeight: 600, flexShrink: 0 }}>{o.blocking ? "blocks pricing" : "documentation"}</span>
                              {!accepted && (
                                <>
                                  <button onClick={() => { setShowCloseVisit(false); const el = document.getElementById(`field-${o.id}`); el?.scrollIntoView({ behavior: "smooth" }) }}
                                    style={{ fontSize: 9, padding: "2px 6px", background: C.cyan, border: "none", borderRadius: 3, cursor: "pointer", color: "#fff", fontWeight: 700, flexShrink: 0 }}>
                                    Fix now
                                  </button>
                                  <button onClick={() => setCloseAccepted(prev => ({ ...prev, [`${key}__accepting`]: "1" }))}
                                    style={{ fontSize: 9, padding: "2px 6px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 3, cursor: "pointer", color: C.muted, fontWeight: 700, flexShrink: 0 }}>
                                    Accept
                                  </button>
                                </>
                              )}
                              {accepted && <span style={{ fontSize: 9, color: "#22C55E", fontWeight: 700 }}>✓ Accepted</span>}
                            </div>
                            {closeAccepted[`${key}__accepting`] && !accepted && (
                              <div style={{ marginTop: 6, display: "flex", gap: 6 }}>
                                <input autoFocus value={acceptInput} onChange={e => setAcceptInput(e.target.value)} placeholder="Reason for accepting…"
                                  style={{ flex: 1, padding: "4px 8px", fontSize: 10, background: C.bg, border: `1px solid ${C.border}`, borderRadius: 4, color: C.text, outline: "none" }} />
                                <button onClick={() => {
                                    if (!acceptInput.trim()) return
                                    setCloseAccepted(prev => {
                                      const next = { ...prev }
                                      next[key] = acceptInput.trim()
                                      delete next[`${key}__accepting`]
                                      delete next[`${key}__input`]
                                      return next
                                    })
                                  }}
                                  disabled={!acceptInput.trim()}
                                  style={{ fontSize: 9, padding: "4px 8px", background: acceptInput.trim() ? "#D97706" : C.card, border: "none", borderRadius: 4, cursor: acceptInput.trim() ? "pointer" : "not-allowed", color: acceptInput.trim() ? "#fff" : C.dim, fontWeight: 700 }}>
                                  Save
                                </button>
                              </div>
                            )}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Full log */}
                <div style={{ padding: "12px 18px", borderBottom: `1px solid ${C.border}` }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>Log ({currentVisit.log.length})</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
                    {currentVisit.log.slice().reverse().map(entry => (
                      <div key={entry.id} style={{ padding: "5px 0", display: "flex", gap: 10, borderBottom: `1px solid ${C.border}` }}>
                        <span style={{ fontSize: 9, color: C.dim, fontFamily: "JetBrains Mono", flexShrink: 0, paddingTop: 1 }}>
                          {new Date(entry.at).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}
                        </span>
                        <span style={{ fontSize: 10.5, color: C.text, lineHeight: 1.5 }}>{entry.text}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Visit note */}
                <div style={{ padding: "12px 18px" }}>
                  <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 6 }}>Visit note (optional)</div>
                  <textarea value={closeVisitNote} onChange={e => setCloseVisitNote(e.target.value)} rows={3}
                    placeholder="Notes about this visit…"
                    style={{ width: "100%", padding: "8px 10px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, color: C.text, outline: "none", resize: "vertical", boxSizing: "border-box" }} />
                </div>
              </div>

              {/* Footer */}
              <div style={{ padding: "12px 18px", borderTop: `1px solid ${C.border}`, display: "flex", gap: 10, justifyContent: "flex-end", flexShrink: 0 }}>
                {!canClose && (
                  <div style={{ flex: 1, fontSize: 10, color: "#DC2626", alignSelf: "center" }}>
                    {blockingUnresolved.length} blocking item{blockingUnresolved.length !== 1 ? "s" : ""} must be fixed or accepted
                  </div>
                )}
                <button onClick={() => setShowCloseVisit(false)}
                  style={{ padding: "8px 16px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", color: C.muted }}>
                  Cancel
                </button>
                <button onClick={closeVisit} disabled={!canClose}
                  style={{ padding: "8px 16px", fontSize: 11, fontWeight: 700, background: canClose ? "#EF4444" : C.card, border: "none", borderRadius: 5, cursor: canClose ? "pointer" : "not-allowed", color: canClose ? "#fff" : C.dim }}>
                  Close visit
                </button>
              </div>
            </div>
          )
        })()}
      </div>

      {/* ── 3-COLUMN ROW WRAPPER ───────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden", pointerEvents: browseMode ? "none" : "auto" }}>

      {/* ── LEFT PANEL ─────────────────────────────────────────────────────────── */}
      {/* Rail shown when collapsed */}
      {!leftPanelOpen && (
        <div style={{ width: 20, minWidth: 20, background: C.panel, borderRight: `1px solid ${C.border}`, display: "flex", flexDirection: "column", alignItems: "center", paddingTop: 12, pointerEvents: "auto" }}>
          <button onClick={() => setLeftPanelOpen(true)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 11, padding: 4, lineHeight: 1 }}>›</button>
        </div>
      )}
      <div style={{ width: leftPanelOpen ? 252 : 0, minWidth: leftPanelOpen ? 252 : 0, background: C.panel, borderRight: leftPanelOpen ? `1px solid ${C.border}` : "none", display: "flex", flexDirection: "column", overflow: "hidden", transition: "width 0.22s cubic-bezier(0.4,0,0.2,1), min-width 0.22s cubic-bezier(0.4,0,0.2,1)" }}>

        {/* Logo — fixed header */}
        <div style={{ padding: "14px 16px 12px", borderBottom: `1px solid ${C.border}`, flexShrink: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 3, justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
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
          <button onClick={() => setLeftPanelOpen(false)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 11, padding: "2px 4px", lineHeight: 1, flexShrink: 0 }}>‹</button>
          </div>
          <div style={{ fontSize: 9, color: C.blue, fontFamily: "JetBrains Mono", letterSpacing: "0.1em" }}>UNDERGROUND INFRASTRUCTURE</div>
        </div>

        {/* Scrollable sections container */}
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto" }}>

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
            <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Assets &amp; Pipes · {assets.filter(a => !a.archived).length + pipes.filter(p => !p.archived).length}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: leftSectionOpen.assets ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
              <path d="M2 4l4 4 4-4" stroke={C.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {leftSectionOpen.assets && (
            <div style={{ overflowY: "auto", flex: 1, maxHeight: 280, touchAction: "pan-y" }}>
              {/* Assets */}
              {assets.filter(a => !a.archived).length > 0 && (
                <div style={{ padding: "4px 16px 2px", fontSize: 8.5, fontWeight: 700, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase" }}>Assets</div>
              )}
              {assets.filter(a => !a.archived).map(asset => {
                const cnt = pipes.filter(p => p.fromId === asset.id || p.toId === asset.id).length
                const sel = selectedAssetId === asset.id
                const latestObs = assetObservations
                  .filter(o => o.assetId === asset.id)
                  .sort((a2, b) => b.observedAt - a2.observedAt)[0]
                const twelveMonthsAgo = Date.now() - 365 * 24 * 3600 * 1000
                const isStale = latestObs && latestObs.observedAt < twelveMonthsAgo
                const staleMonths = latestObs ? Math.floor((Date.now() - latestObs.observedAt) / (30 * 24 * 3600 * 1000)) : null
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
                      <div style={{ fontSize: 10, color: C.muted }}>{ASSET_META[asset.type].label} · {cnt} pipe{cnt !== 1 ? "s" : ""}</div>
                    </div>
                    {isStale && (
                      <div title="Not observed in over a year." style={{ fontSize: 9.5, color: "#A96B00", flexShrink: 0 }}>⚠ {staleMonths}mo</div>
                    )}
                  </div>
                )
              })}
              {/* Pipes */}
              {pipes.filter(p => !p.archived).length > 0 && (
                <div style={{ padding: "8px 16px 2px", fontSize: 8.5, fontWeight: 700, color: C.dim, letterSpacing: "0.08em", textTransform: "uppercase", borderTop: assets.filter(a => !a.archived).length > 0 ? `1px solid ${C.border}` : undefined, marginTop: assets.filter(a => !a.archived).length > 0 ? 4 : 0 }}>Pipes</div>
              )}
              {pipes.filter(p => !p.archived).map(pipe => {
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
                    {(assets.find(a => a.id === pipe.fromId)?.archived || (pipe.toId && assets.find(a => a.id === pipe.toId)?.archived)) && (
                      <div title="Connects to an archived asset" style={{ flexShrink: 0, fontSize: 9, color: "#D97706", fontWeight: 700 }}>⚠</div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── VISITS section ── */}
        <div style={{ borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0, flex: leftSectionOpen.visits ? "0 0 auto" : undefined, maxHeight: leftSectionOpen.visits ? 260 : undefined }}>
          <button
            onClick={() => setLeftSectionOpen(s => ({ ...s, visits: !s.visits }))}
            style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", flexShrink: 0 }}
          >
            <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Visits · {visits.length}</span>
            <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: leftSectionOpen.visits ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
              <path d="M2 4l4 4 4-4" stroke={C.muted} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
          {leftSectionOpen.visits && (
            <div style={{ overflowY: "auto", flex: 1, maxHeight: 280 }}>
              {currentVisit && (
                <div onClick={() => { setShowVisitLog(v => !v); setViewingVisitId(null) }}
                  style={{ padding: "7px 16px", cursor: "pointer", background: "#22C55E0F", borderLeft: `2px solid #22C55E`, display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s" }}>
                  <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22C55E", flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentVisit.property}</div>
                    <div style={{ fontSize: 9.5, color: C.muted }}>{currentVisit.visitType} · active · {currentVisit.log.length} entries</div>
                  </div>
                </div>
              )}
              {visits.filter(v => v.endedAt !== null).map(v => {
                const person = SITE_PERSONS.find(p => p.id === v.personId)
                const d = new Date(v.startedAt)
                return (
                  <div key={v.id}
                    onClick={() => { setViewingVisitId(v.id); setShowVisitLog(true) }}
                    style={{ padding: "6px 16px", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s" }}
                    onMouseEnter={e => (e.currentTarget.style.background = C.card)}
                    onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 11, fontWeight: 500, color: C.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{v.property}</div>
                      <div style={{ fontSize: 9.5, color: C.muted }}>{d.toLocaleDateString("en-US", { month: "short", day: "numeric" })} · {person?.name ?? "—"}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* ── ARCHIVED section ── */}
        {(assets.some(a => a.archived) || pipes.some(p => p.archived)) && (
          <div style={{ borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", minHeight: 0 }}>
            <button
              onClick={() => setLeftSectionOpen(s => ({ ...s, archived: !s.archived }))}
              style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "8px 16px", background: "none", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", cursor: "pointer", flexShrink: 0 }}
            >
              <span style={{ fontSize: 9, fontWeight: 700, color: "#D97706", letterSpacing: "0.08em", textTransform: "uppercase" }}>
                Archived · {assets.filter(a => a.archived).length + pipes.filter(p => p.archived).length}
              </span>
              <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: leftSectionOpen.archived ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
                <path d="M2 4l4 4 4-4" stroke="#D97706" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
            {leftSectionOpen.archived && (
              <div style={{ overflowY: "auto", maxHeight: 280 }}>
                {assets.filter(a => a.archived).map(a => {
                  const who = SITE_PERSONS.find(p => p.id === a.archivedById)
                  const d = a.archivedOn ? new Date(a.archivedOn).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""
                  return (
                    <div key={a.id}
                      style={{ padding: "7px 16px", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s", cursor: "pointer" }}
                      onClick={() => selectAsset(a.id)}
                      onMouseEnter={e => (e.currentTarget.style.background = C.card)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{a.label} <span style={{ fontWeight: 400, color: C.dim }}>· {a.type}</span></div>
                        <div style={{ fontSize: 9.5, color: C.dim }}>{a.archiveReason?.split(" —")[0] ?? ""}{who ? ` · ${who.name}` : ""}{d ? ` · ${d}` : ""}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); restoreAsset(a.id) }}
                        style={{ flexShrink: 0, padding: "3px 8px", fontSize: 9, fontWeight: 700, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", color: C.muted }}>
                        Restore
                      </button>
                    </div>
                  )
                })}
                {pipes.filter(p => p.archived).map(p => {
                  const fr = assets.find(a => a.id === p.fromId)
                  const to = p.toId ? assets.find(a => a.id === p.toId) : null
                  const who = SITE_PERSONS.find(x => x.id === p.archivedById)
                  const d = p.archivedOn ? new Date(p.archivedOn).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""
                  return (
                    <div key={p.id}
                      style={{ padding: "7px 16px", display: "flex", alignItems: "center", gap: 8, transition: "background 0.1s", cursor: "pointer" }}
                      onClick={() => selectPipe(p.id)}
                      onMouseEnter={e => (e.currentTarget.style.background = C.card)}
                      onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.dim, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.label} <span style={{ fontWeight: 400, color: C.dim }}>· {fr?.label ?? "?"} → {to?.label ?? "free"}</span></div>
                        <div style={{ fontSize: 9.5, color: C.dim }}>{p.archiveReason?.split(" —")[0] ?? ""}{who ? ` · ${who.name}` : ""}{d ? ` · ${d}` : ""}</div>
                      </div>
                      <button onClick={e => { e.stopPropagation(); restorePipe(p.id) }}
                        style={{ flexShrink: 0, padding: "3px 8px", fontSize: 9, fontWeight: 700, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", color: C.muted }}>
                        Restore
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

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
                  <div style={{ fontSize: 9, color: C.dim }}>{assets.filter(a=>!a.archived).length} assets · default</div>
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
        </div>{/* end scrollable sections */}
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
              {mode === "draw-pipe" && (drawFrom || drawFromCoord) && (() => {
                const snapTo = hoverAssetId && hoverAssetId !== drawFrom
                  ? assets.find(a => a.id === hoverAssetId)?.label
                  : null
                const pts = drawPoints.length
                const base = pts > 0 ? `DRAW — ${pts} pt${pts > 1 ? "s" : ""}` : "DRAW — click map to add points"
                const tail = snapTo
                  ? ` · snap to ${snapTo}`
                  : pts > 0
                    ? "  ·  hover point to remove  ·  double-click to finish"
                    : "  ·  click asset to snap  ·  double-click or Complete to finish"
                return base + tail
              })()}
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
              <button onClick={() => { setMode("view"); setDrawFrom(null); setDrawFromCoord(null); setDrawPoints([]); setDrawMouse(null); setDrawHoverPtIdx(null); setHoverAssetId(null); setSelectStart(null); setSelectCurrent(null) }} style={{ padding: "3px 9px", fontSize: 9.5, background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer", fontFamily: "JetBrains Mono", letterSpacing: "0.05em" }}>
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

            {pipes.filter(p => !p.archived).map(pipe => {
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
          {assets.filter(a => !a.archived).map(asset => {
            const assetOutOfView = activeViewIncludedAssets ? !activeViewIncludedAssets.includes(asset.id) : false
            return (
              <AssetNode
                key={asset.id}
                asset={asset}
                selected={selectedAssetId === asset.id}
                scale={iconScaleByType[asset.type] ?? 1}
                onClick={_e => handleAssetClick(asset.id)}
                onMouseDown={e => handleAssetMouseDown(e, asset.id)}
                onTouchStart={e => {
                  if (e.touches.length !== 1) return
                  e.stopPropagation()
                  const { clientX, clientY } = getTouchXY(e)
                  handleAssetMouseDown({ clientX, clientY, stopPropagation: () => {} } as React.MouseEvent, asset.id)
                }}
                onMouseEnter={() => setHoverAssetId(asset.id)}
                onMouseLeave={() => setHoverAssetId(prev => prev === asset.id ? null : prev)}
                drawState={
                  drawFrom === asset.id ? "start"
                  : drawPoints.some(p => p.assetId === asset.id) ? "snapped"
                  : (mode === "draw-pipe" && (drawFrom || drawFromCoord) && hoverAssetId === asset.id) ? "target"
                  : null
                }
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
      <div style={{ width: effectivePanelW, minWidth: effectivePanelW, background: C.panel, borderLeft: (panelOpen && rightPanelOpen) ? `1px solid ${C.border}` : "none", display: "flex", flexDirection: "row", overflow: "hidden", transition: pipeDragRef.current ? "none" : "width 0.25s cubic-bezier(0.4,0,0.2,1), min-width 0.25s cubic-bezier(0.4,0,0.2,1)", position: "relative" }}>
        {/* Drag handle — only when a pipe is open */}
        {selectedPipeId && (
          <div
            onMouseDown={e => {
              pipeDragRef.current = { startX: e.clientX, startW: pipePanelW }
              const onMove = (me: MouseEvent) => {
                if (!pipeDragRef.current) return
                const delta = pipeDragRef.current.startX - me.clientX
                setPipePanelW(Math.max(500, Math.min(1400, pipeDragRef.current.startW + delta)))
              }
              const onUp = () => { pipeDragRef.current = null; window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
              window.addEventListener("mousemove", onMove)
              window.addEventListener("mouseup", onUp)
            }}
            style={{ width: 5, flexShrink: 0, cursor: "col-resize", background: "transparent", borderRight: `1px solid ${C.border}`, transition: "background 0.1s" }}
            onMouseEnter={e => (e.currentTarget.style.background = C.cyan + "33")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          />
        )}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>

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
            {selectedAsset?.archived && (
              <div style={{ margin: "12px 16px 0", padding: "10px 14px", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                  ⚠ Archived — {selectedAsset.archiveReason}
                </div>
                <div style={{ fontSize: 10, color: "#92400E", marginBottom: 6 }}>
                  Archived by {SITE_PERSONS.find(p => p.id === selectedAsset.archivedById)?.name ?? "—"} · {selectedAsset.archivedOn ? new Date(selectedAsset.archivedOn).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </div>
                <button onClick={() => restoreAsset(selectedAsset.id)}
                  style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, background: "#D97706", border: "none", borderRadius: 4, cursor: "pointer", color: "#fff" }}>
                  Restore
                </button>
              </div>
            )}
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
                    <button key={loc} onClick={() => updateAsset(selectedAsset.id, { location: sel ? undefined : loc, locationOther: loc === "Other" && sel ? undefined : selectedAsset.locationOther }, "location — " + (sel ? "cleared" : loc))}
                      style={{ padding: "4px 9px", fontSize: 9.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}`, transition: "all 0.1s" }}
                    >{loc}</button>
                  )
                })}
              </div>
              {selectedAsset.location === "Other" && (
                <input value={selectedAsset.locationOther ?? ""} onChange={e => updateAsset(selectedAsset.id, { locationOther: e.target.value }, "location note — " + e.target.value)}
                  placeholder="Describe location…" style={{ marginTop: 8, width: "100%", padding: "6px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }} />
              )}
            </Section>

            {/* ── Observation system ───────────────────────────────────────── */}
            {(() => {
              const a = selectedAsset
              const myObs = assetObservations
                .filter(o => o.assetId === a.id)
                .sort((x, y) => y.observedAt - x.observedAt)
              const hasObs = myObs.length > 0
              const currentVisit = visits.find(v => v.id === currentVisitId) ?? null

              // Helper: format date
              const fmtDate = (ts: number) => new Date(ts).toLocaleDateString("en-US", { month: "short", day: "numeric" })
              const fmtVisitRef = (obs: AssetObservation) => {
                const v = visits.find(x => x.id === obs.visitId)
                return v ? `${v.visitType} · ${fmtDate(obs.observedAt)}` : fmtDate(obs.observedAt)
              }

              // Latest value + its source obs for each field
              type FieldSource = { value: unknown; obs: AssetObservation }
              const latestByField: Partial<Record<keyof AssetObservation, FieldSource>> = {}
              for (const key of OBS_VERSIONED_KEYS) {
                for (const o of myObs) {
                  const v = o[key as keyof AssetObservation]
                  if (v !== undefined && v !== null) {
                    latestByField[key as keyof AssetObservation] = { value: v, obs: o }
                    break
                  }
                }
              }

              // Field label display helper
              function fmtFieldValue(k: keyof AssetObservation, v: unknown): string {
                if (v === undefined || v === null) return "—"
                if (typeof v === "boolean") return v ? "Yes" : "No"
                if (k === "conditionRating") return typeof v === "number" ? CONDITION_LABELS[v] : String(v)
                if (k === "photos") return Array.isArray(v) ? String((v as string[]).filter(Boolean).length) : "0"
                return String(v)
              }

              // Which fields to show for this asset type
              function relevantFields(type: AssetType): (keyof AssetObservation)[] {
                const isBasin = ["catch-basin","storm-basin","sanitary-basin"].includes(type)
                const isCleanout = type.startsWith("cleanout")
                const isStack = type === "stack"
                const isDrain = ["floor-drain","turf-drain"].includes(type)
                const isPump = ["ejector-pump","sump-pump"].includes(type)
                const isGutter = type === "gutter-hub"
                const fields: (keyof AssetObservation)[] = ["conditionRating"]
                if (isBasin) fields.push("depth")
                if (isCleanout) fields.push("accessSize","accessConfig","undergroundConn","cameraAccessible")
                if (type === "cleanout-overhead") fields.push("verticalPipeSize","horizontalPipeSize")
                if (isStack) fields.push("stackSize","stackMaterial","hasCleanout","cleanoutSize","cleanoutFitting","cameraAccessible")
                if (isDrain) fields.push("flowTestDone","flowTestResult")
                if (isPump) fields.push("installDate","dischargeTestDone","dischargeFunctioning")
                if (isGutter) fields.push("cameraAccessible")
                fields.push("photos")
                return fields
              }

              const FIELD_LABELS: Partial<Record<keyof AssetObservation, string>> = {
                conditionRating: "Condition", depth: "Depth",
                accessSize: "Access size", accessConfig: "Access config",
                undergroundConn: "Underground conn", cameraAccessible: "Camera accessible",
                verticalPipeSize: "Vertical pipe size", horizontalPipeSize: "Horizontal pipe size",
                stackSize: "Stack size", stackMaterial: "Stack material",
                hasCleanout: "Has clean-out", cleanoutSize: "Clean-out size", cleanoutFitting: "Fitting",
                flowTestDone: "Flow test", flowTestResult: "Flow result",
                installDate: "Install date", dischargeTestDone: "Discharge test", dischargeFunctioning: "Functioning",
                photos: "Photos",
              }

              // Helper: save observation
              function saveObservation(patch: Partial<AssetObservation>, reason: AssetObservation["changeReason"]) {
                const visitId = currentVisitId ?? "sv1"
                const person = currentVisit?.personId ?? "p-dino"
                const obs: AssetObservation = {
                  id: `obs-${Date.now()}`,
                  assetId: a.id,
                  visitId,
                  observedAt: Date.now(),
                  observedById: person,
                  jobNumber: currentVisit?.jobId ? SAMPLE_JOBS.find(j => j.id === currentVisit.jobId)?.number : undefined,
                  ...patch,
                  changeReason: reason,
                }
                setAssetObservations(prev => [...prev, obs])
                // Project into asset
                const projected = projectAsset(a, [...assetObservations, obs])
                setAssets(prev => prev.map(x => x.id === a.id ? { ...x, ...projected } : x))
                setObsMode("view")
                setObsDraft({})
              }

              function doConfirmAll() {
                const all: Partial<AssetObservation> = {}
                for (const k of OBS_VERSIONED_KEYS) {
                  const s = latestByField[k as keyof AssetObservation]
                  if (s) (all as Record<string, unknown>)[k] = s.value
                }
                const n = Object.keys(all).length
                saveObservation(all, "unchanged")
                appendLog(`${a.label} verified — ${n} field${n !== 1 ? "s" : ""} unchanged`)
              }

              function doSaveObs() {
                // Find diffs from projection
                const patch: Partial<AssetObservation> = {}
                for (const k of OBS_VERSIONED_KEYS) {
                  const draftVal = (obsDraft as Record<string, unknown>)[k]
                  if (draftVal !== undefined) {
                    const latestVal = latestByField[k as keyof AssetObservation]?.value
                    if (draftVal !== latestVal) {
                      (patch as Record<string, unknown>)[k] = draftVal
                    }
                  }
                }
                // Check if any WORK_FIELDS changed
                const workChanges = WORK_FIELDS
                  .filter(k => patch[k as keyof AssetObservation] !== undefined)
                  .map(k => ({
                    field: k as keyof AssetObservation,
                    from: latestByField[k as keyof AssetObservation]?.value,
                    to: patch[k as keyof AssetObservation],
                  }))
                const depthChanged = patch.depth !== undefined
                if (workChanges.length > 0) {
                  setObsChangeDialog({
                    changes: workChanges,
                    depthOnly: workChanges.length === 0 && depthChanged,
                    onResolve: (reason) => {
                      saveObservation(patch, reason)
                      const desc = workChanges.map(c => `${FIELD_LABELS[c.field] ?? c.field} ${c.from} → ${c.to}`).join(" · ")
                      if (reason === "correction") appendLog(`${a.label} corrected — ${desc}`)
                      else appendLog(`${a.label} updated — ${desc} · ${reason === "work-by-us" ? "work performed by us" : "work by another party"}`)
                      setObsChangeDialog(null)
                    },
                  })
                } else if (depthChanged) {
                  setObsChangeDialog({
                    changes: [{ field: "depth", from: latestByField.depth?.value, to: patch.depth }],
                    depthOnly: true,
                    onResolve: (reason) => {
                      saveObservation(patch, reason)
                      appendLog(`${a.label} corrected — depth ${latestByField.depth?.value} → ${patch.depth}`)
                      setObsChangeDialog(null)
                    },
                  })
                } else {
                  const desc = Object.keys(patch).map(k => `${FIELD_LABELS[k as keyof AssetObservation] ?? k}`).join(", ")
                  saveObservation(patch, "unchanged")
                  appendLog(`${a.label} updated — ${desc}`)
                }
              }

              const nothingChanged = OBS_VERSIONED_KEYS.every(k => {
                const d = (obsDraft as Record<string, unknown>)[k]
                if (d === undefined) return true
                return d === latestByField[k as keyof AssetObservation]?.value
              })

              // ── Latest state view ─────────────────────────────────────────
              if (hasObs && obsMode !== "new-obs") {
                const firstObs = myObs[myObs.length - 1]
                const lastObs = myObs[0]
                const createdPerson = SITE_PERSONS.find(p => p.id === firstObs.observedById)
                const fields = relevantFields(a.type)
                return (
                  <>
                    {/* Provenance */}
                    <Section>
                      <div style={{ fontSize: 10, color: C.muted, lineHeight: 1.6 }}>
                        Added by {createdPerson?.name ?? "—"} · {fmtVisitRef(firstObs)}
                      </div>
                    </Section>

                    {/* Latest state */}
                    <Section>
                      <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>LATEST STATE</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
                        {fields.map(fk => {
                          const src = latestByField[fk]
                          const displayVal = src ? fmtFieldValue(fk, src.value) : "—"
                          const ref = src ? fmtVisitRef(src.obs) : "not recorded"
                          return (
                            <div key={String(fk)} onClick={() => setObsFieldHistoryField(fk as keyof AssetObservation)}
                              style={{ display: "flex", alignItems: "baseline", gap: 6, padding: "5px 8px", borderRadius: 4, cursor: "pointer", transition: "background 0.1s" }}
                              onMouseEnter={e => (e.currentTarget.style.background = C.card)}
                              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
                            >
                              <span style={{ fontSize: 10.5, color: C.muted, flex: "0 0 120px" }}>{FIELD_LABELS[fk] ?? String(fk)}</span>
                              <span style={{ fontSize: 11, fontFamily: "JetBrains Mono", color: src ? C.text : C.dim, fontWeight: src ? 600 : 400 }}>{displayVal}</span>
                              <span style={{ fontSize: 9.5, color: C.dim, marginLeft: "auto", flexShrink: 0 }}>{ref}</span>
                            </div>
                          )
                        })}
                      </div>
                    </Section>

                    {/* + New Observation button */}
                    <div style={{ padding: "0 16px 8px" }}>
                      <button
                        onClick={() => { setObsMode("new-obs"); setObsDraft({}) }}
                        style={{ width: "100%", padding: "9px", fontSize: 10.5, fontWeight: 700, background: C.cyan, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", letterSpacing: "0.04em" }}
                      >+ NEW OBSERVATION</button>
                    </div>

                    {/* Observation history */}
                    <Section>
                      <button
                        onClick={() => setObsHistoryOpen(o => !o)}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%", background: "none", border: "none", cursor: "pointer", padding: 0 }}
                      >
                        <span style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase" }}>OBSERVATION HISTORY · {myObs.length}</span>
                        <svg width="11" height="11" viewBox="0 0 12 12" fill="none" style={{ transform: obsHistoryOpen ? "rotate(0deg)" : "rotate(-90deg)", transition: "transform 0.15s" }}>
                          <path d="M2 4l4 4 4-4" stroke={C.muted} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      </button>
                      {obsHistoryOpen && (
                        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 6 }}>
                          {myObs.map(obs => {
                            const person = SITE_PERSONS.find(p => p.id === obs.observedById)
                            const v = visits.find(x => x.id === obs.visitId)
                            const fieldSummary = obsFieldNames(obs)
                            const cnt = obsFieldCount(obs)
                            return (
                              <div key={obs.id}
                                onClick={() => setObsViewingId(obs.id === obsViewingId ? null : obs.id)}
                                style={{ padding: "9px 12px", borderRadius: 6, background: obsViewingId === obs.id ? "#E0F0FA" : C.card, border: `1px solid ${obsViewingId === obs.id ? C.cyan : C.border}`, cursor: "pointer" }}
                              >
                                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                  <span style={{ fontSize: 10.5, fontFamily: "JetBrains Mono", color: C.muted, flexShrink: 0 }}>{fmtDate(obs.observedAt)}</span>
                                  <span style={{ fontSize: 10.5, color: C.text, fontWeight: 500 }}>{v?.visitType ?? "—"}</span>
                                  <span style={{ fontSize: 10.5, color: C.muted }}>{person?.name ?? "—"}</span>
                                  <span style={{ fontSize: 10, color: C.dim, marginLeft: "auto", fontFamily: "JetBrains Mono" }}>{obs.jobNumber ?? "—"}</span>
                                </div>
                                <div style={{ fontSize: 10, color: C.dim, marginTop: 3 }}>
                                  {cnt > 0 ? (cnt === 1 ? fieldSummary : `${cnt} fields recorded`) : "No fields"}
                                </div>
                                {obsViewingId === obs.id && (
                                  <div style={{ marginTop: 8, borderTop: `1px solid ${C.border}`, paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                                    {OBS_VERSIONED_KEYS.filter(k => obs[k as keyof AssetObservation] !== undefined).map(k => (
                                      <div key={String(k)} style={{ display: "flex", gap: 8, fontSize: 10 }}>
                                        <span style={{ color: C.muted, flex: "0 0 110px" }}>{FIELD_LABELS[k as keyof AssetObservation] ?? String(k)}</span>
                                        <span style={{ fontFamily: "JetBrains Mono", color: C.text }}>{fmtFieldValue(k as keyof AssetObservation, obs[k as keyof AssetObservation])}</span>
                                      </div>
                                    ))}
                                    {obs.changeReason && obs.changeReason !== "unchanged" && (
                                      <div style={{ marginTop: 4, fontSize: 10, color: obs.changeReason === "work-by-us" ? "#00803E" : obs.changeReason === "work-by-others" ? C.blue : C.muted, fontWeight: 600 }}>
                                        {obs.changeReason === "work-by-us" ? "Work performed by us" : obs.changeReason === "work-by-others" ? "Work by another party" : "Earlier reading corrected"}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )
                          })}
                        </div>
                      )}
                    </Section>
                  </>
                )
              }

              // ── New Observation form ──────────────────────────────────────
              if (hasObs && obsMode === "new-obs") {
                const fields = relevantFields(a.type)
                const visitLabel = currentVisit
                  ? `${currentVisit.visitType} · ${new Date(currentVisit.startedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })} · ${SITE_PERSONS.find(p => p.id === currentVisit.personId)?.name ?? "—"}${currentVisit.jobId ? " · job " + (SAMPLE_JOBS.find(j => j.id === currentVisit.jobId)?.number ?? "") : ""}`
                  : "No active visit — observation will be stamped to the last visit"

                return (
                  <Section>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.cyan, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 6 }}>NEW OBSERVATION · {a.label}</div>
                    <div style={{ fontSize: 10, color: C.muted, marginBottom: 12, lineHeight: 1.5 }}>{visitLabel}</div>

                    {/* Confirm all */}
                    <button
                      onClick={doConfirmAll}
                      style={{ width: "100%", padding: "10px", fontSize: 11, fontWeight: 700, background: "#00803E", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", marginBottom: 14, letterSpacing: "0.03em" }}
                    >NOTHING CHANGED — CONFIRM ALL {Object.keys(latestByField).length} FIELDS</button>

                    <div style={{ fontSize: 9.5, color: C.dim, marginBottom: 10, textAlign: "center" }}>— or update what's different —</div>

                    {/* Field rows */}
                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                      {fields.filter(fk => fk !== "photos").map(fk => {
                        const src = latestByField[fk]
                        const currentDraftVal = (obsDraft as Record<string, unknown>)[fk]
                        const displayVal = currentDraftVal !== undefined ? currentDraftVal : src?.value
                        const ref = src ? fmtVisitRef(src.obs) : "not recorded"
                        const changed = currentDraftVal !== undefined && currentDraftVal !== src?.value

                        // Render appropriate control based on field
                        let control: React.ReactNode
                        if (fk === "conditionRating") {
                          control = (
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                              {([1,2,3,4,5,"unable"] as (1|2|3|4|5|"unable")[]).map(r => {
                                const isNum = typeof r === "number"
                                const lbl = isNum ? CONDITION_LABELS[r] : "Unable"
                                const sel = displayVal === r
                                return <button key={String(r)} onClick={() => setObsDraft(d => ({ ...d, conditionRating: r }))}
                                  style={{ padding: "4px 8px", fontSize: 9.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer",
                                    background: sel ? (isNum ? CONDITION_COLORS[r] : CONDITION_UNABLE_COLOR) : C.card,
                                    color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? (isNum ? CONDITION_COLORS[r] : CONDITION_UNABLE_COLOR) : C.border}` }}>
                                  {lbl}
                                </button>
                              })}
                            </div>
                          )
                        } else if (fk === "cameraAccessible") {
                          control = (
                            <div style={{ display: "flex", gap: 5 }}>
                              {[true, false].map(v => {
                                const sel = displayVal === v
                                return <button key={String(v)} onClick={() => setObsDraft(d => ({ ...d, cameraAccessible: v }))}
                                  style={{ flex: 1, padding: "5px", fontSize: 10.5, fontWeight: 700, borderRadius: 4, cursor: "pointer",
                                    background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>
                                  {v ? "YES" : "NO"}
                                </button>
                              })}
                            </div>
                          )
                        } else if (["accessSize","stackSize","cleanoutSize","verticalPipeSize","horizontalPipeSize"].includes(fk as string)) {
                          const opts = ['2"','3"','4"','6"','8"','10"','12"']
                          control = (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {opts.map(o => {
                                const sel = displayVal === o
                                return <button key={o} onClick={() => setObsDraft(d => ({ ...d, [fk]: o }))}
                                  style={{ padding: "4px 8px", fontSize: 10, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer",
                                    background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>
                                  {o}
                                </button>
                              })}
                            </div>
                          )
                        } else if (fk === "accessConfig") {
                          const opts = ["One-Way","Two-Way"]
                          control = (
                            <div style={{ display: "flex", gap: 5 }}>
                              {opts.map(o => {
                                const sel = displayVal === o
                                return <button key={o} onClick={() => setObsDraft(d => ({ ...d, accessConfig: o }))}
                                  style={{ flex: 1, padding: "5px", fontSize: 10, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer",
                                    background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>
                                  {o}
                                </button>
                              })}
                            </div>
                          )
                        } else if (fk === "undergroundConn") {
                          control = (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {CONN_OPTIONS.map(o => {
                                const sel = displayVal === o
                                return <button key={o} onClick={() => setObsDraft(d => ({ ...d, undergroundConn: o }))}
                                  style={{ padding: "4px 8px", fontSize: 9.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer",
                                    background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>
                                  {o}
                                </button>
                              })}
                            </div>
                          )
                        } else if (fk === "hasCleanout") {
                          const opts: ["no"|"pre-existing"|"installed-by-us", string][] = [["no","No"],["pre-existing","Yes — pre-existing"],["installed-by-us","Yes — installed by us"]]
                          control = (
                            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                              {opts.map(([v, lbl]) => {
                                const sel = displayVal === v
                                return <button key={v} onClick={() => setObsDraft(d => ({ ...d, hasCleanout: v }))}
                                  style={{ padding: "6px 10px", fontSize: 10.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", textAlign: "left",
                                    background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>
                                  {lbl}
                                </button>
                              })}
                            </div>
                          )
                        } else if (fk === "stackMaterial" || fk === "cleanoutFitting") {
                          const opts = fk === "stackMaterial"
                            ? ["Cast Iron","Clay","PVC","ABS","Copper","Galvanised","Unknown"]
                            : ["Wye","Tee","Sanitary tee","Combo","Unknown"]
                          control = (
                            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                              {opts.map(o => {
                                const sel = displayVal === o
                                return <button key={o} onClick={() => setObsDraft(d => ({ ...d, [fk]: o }))}
                                  style={{ padding: "4px 8px", fontSize: 9.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer",
                                    background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>
                                  {o}
                                </button>
                              })}
                            </div>
                          )
                        } else if (fk === "depth" || fk === "installDate") {
                          control = (
                            <input value={String(displayVal ?? "")} onChange={e => setObsDraft(d => ({ ...d, [fk]: e.target.value }))}
                              placeholder={fk === "depth" ? "4.5 ft" : "YYYY-MM-DD"}
                              style={{ padding: "6px 8px", fontSize: 11, border: `1px solid ${changed ? C.cyan : C.border}`, borderRadius: 4, outline: "none", fontFamily: "JetBrains Mono", width: 120 }} />
                          )
                        } else {
                          control = null
                        }

                        return (
                          <div key={String(fk)} style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 10, fontWeight: 600, color: changed ? C.cyan : C.muted }}>{FIELD_LABELS[fk] ?? String(fk)}</span>
                              <span style={{ fontSize: 9, color: C.dim }}>{ref}</span>
                            </div>
                            {control}
                          </div>
                        )
                      })}
                    </div>

                    {/* Photos in new-obs */}
                    <div style={{ marginBottom: 14 }}>
                      <div style={{ fontSize: 10, fontWeight: 600, color: C.muted, marginBottom: 6 }}>Photos</div>
                      {(() => {
                        const src = latestByField.photos
                        const currentPhotos = (src?.value as string[] | undefined) ?? []
                        const isBasin = ["catch-basin","storm-basin","sanitary-basin"].includes(a.type)
                        const isStackInstall = a.type === "stack" && a.hasCleanout === "installed-by-us"
                        const photoLabels = isBasin ? ["Wider Area View","Close-Up","Inside — Lid Open"]
                          : isStackInstall ? ["Wider Area View","Close-Up","After Clean-out Installation"]
                          : ["Wider Area View","Close-Up"]
                        const draftPhotos = (obsDraft.photos ?? [...currentPhotos]) as string[]
                        return photoLabels.map((lbl, idx) => {
                          const existing = currentPhotos[idx]
                          const draft = draftPhotos[idx]
                          const pickRetake = () => {
                            const inp = document.createElement("input")
                            inp.type = "file"; inp.accept = "image/*"
                            inp.onchange = () => {
                              const file = inp.files?.[0]; if (!file) return
                              const reader = new FileReader()
                              reader.onload = ev => {
                                const src2 = ev.target?.result as string
                                const next = [...draftPhotos]; next[idx] = src2
                                setObsDraft(d => ({ ...d, photos: next }))
                              }
                              reader.readAsDataURL(file)
                            }
                            inp.click()
                          }
                          return (
                            <div key={lbl} style={{ marginBottom: 8, padding: "8px 10px", borderRadius: 6, background: C.card, border: `1px solid ${C.border}` }}>
                              <div style={{ fontSize: 9.5, fontWeight: 700, color: C.muted, letterSpacing: "0.06em", marginBottom: 6, textTransform: "uppercase" }}>{lbl}</div>
                              {existing ? (
                                <div>
                                  <img src={draft || existing} alt={lbl} style={{ width: "100%", height: 70, objectFit: "cover", borderRadius: 4, display: "block" }} />
                                  <div style={{ fontSize: 9.5, color: C.dim, marginTop: 4 }}>
                                    Current — {SITE_PERSONS.find(p => p.id === src?.obs.observedById)?.name ?? "—"} · {src ? fmtVisitRef(src.obs) : ""}
                                  </div>
                                  <button onClick={pickRetake} style={{ marginTop: 4, fontSize: 9.5, color: C.cyan, background: "none", border: "none", cursor: "pointer", padding: 0, fontWeight: 700 }}>Retake</button>
                                </div>
                              ) : (
                                <button onClick={pickRetake} style={{ width: "100%", padding: "8px", fontSize: 10, background: C.panel, border: `1px dashed ${C.border}`, borderRadius: 4, cursor: "pointer", color: C.muted }}>+ Add photo</button>
                              )}
                            </div>
                          )
                        })
                      })()}
                    </div>

                    {/* Actions */}
                    {nothingChanged && (
                      <div style={{ fontSize: 10, color: C.dim, textAlign: "center", marginBottom: 8 }}>Use "Confirm all" when nothing has changed.</div>
                    )}
                    <div style={{ display: "flex", gap: 6 }}>
                      <button
                        onClick={doSaveObs}
                        disabled={nothingChanged}
                        style={{ flex: 1, padding: "9px", fontSize: 10.5, fontWeight: 700, background: nothingChanged ? C.card : C.cyan, color: nothingChanged ? C.dim : "#fff", border: `1px solid ${nothingChanged ? C.border : C.cyan}`, borderRadius: 6, cursor: nothingChanged ? "default" : "pointer" }}
                      >Save observation</button>
                      <button
                        onClick={() => { setObsMode("view"); setObsDraft({}) }}
                        style={{ padding: "9px 14px", fontSize: 10.5, fontWeight: 600, background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer" }}
                      >Cancel</button>
                    </div>
                  </Section>
                )
              }

              return null
            })()}

            {/* ── Photos (all types) ───────────────────────────────────────── */}
            {(!assetObservations.filter(o => o.assetId === selectedAsset.id).length || obsMode === null) && (() => {
              const a = selectedAsset
              const isBasin = ["catch-basin","storm-basin","sanitary-basin"].includes(a.type)
              const isStackWithInstall = a.type === "stack" && a.hasCleanout === "installed-by-us"
              const photoLabels = isBasin
                ? ["Wider Area View","Close-Up","Inside — Lid Open"]
                : isStackWithInstall
                  ? ["Wider Area View","Close-Up","After Clean-out Installation"]
                  : ["Wider Area View","Close-Up"]
              const photos = a.photos ?? []
              const pickPhoto = (idx: number) => {
                const inp = document.createElement("input")
                inp.type = "file"; inp.accept = "image/*"
                inp.onchange = () => {
                  const file = inp.files?.[0]; if (!file) return
                  const reader = new FileReader()
                  reader.onload = ev => {
                    const src = ev.target?.result as string
                    const next = [...photos]; next[idx] = src
                    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, photos: next } : x))
                    appendLog(`${a.label} photo added — ${photoLabels[idx]}`)
                  }
                  reader.readAsDataURL(file)
                }
                inp.click()
              }
              const removePhoto = (idx: number) => {
                setConfirmDialog({
                  title: "Remove Photo",
                  message: `Remove "${photoLabels[idx]}"?`,
                  onConfirm: () => {
                    const next = [...photos]; next[idx] = ""
                    setAssets(prev => prev.map(x => x.id === a.id ? { ...x, photos: next } : x))
                    appendLog(`${a.label} photo removed — ${photoLabels[idx]}`)
                  },
                })
              }
              return (
                <Section>
                  <Label>Photos</Label>
                  <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                    {photoLabels.map((lbl, idx) => {
                      const src = photos[idx]
                      const prevFilled = idx === 0 || !!photos[idx - 1]
                      const disabled = !prevFilled
                      if (src) {
                        return (
                          <div key={lbl} style={{ borderRadius: 6, border: `1px solid ${C.border}`, overflow: "hidden", background: C.card }}>
                            <img src={src} alt={lbl}
                              style={{ width: "100%", height: 100, objectFit: "cover", display: "block", cursor: "zoom-in" }}
                              onDoubleClick={() => {
                                const filledSrcs = photos.map((s, i) => ({ s, i })).filter(x => x.s)
                                setLightbox({ srcs: filledSrcs.map(x => x.s), labels: filledSrcs.map(x => photoLabels[x.i]), idx: filledSrcs.findIndex(x => x.i === idx) })
                              }} />
                            <div style={{ padding: "6px 10px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                              <span style={{ fontSize: 10, color: C.muted, fontWeight: 600 }}>{lbl}</span>
                              <button onClick={() => removePhoto(idx)} style={{ fontSize: 9, color: "#EF4444", background: "none", border: "none", cursor: "pointer", fontWeight: 700 }}>Remove</button>
                            </div>
                          </div>
                        )
                      }
                      return (
                        <div key={lbl} onClick={disabled ? undefined : () => pickPhoto(idx)}
                          style={{ padding: "10px 12px", borderRadius: 6, border: `1px dashed ${disabled ? C.border : C.cyan}`, background: C.card, display: "flex", alignItems: "center", gap: 10, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.45 : 1 }}>
                          <svg width="18" height="18" viewBox="0 0 18 18" fill="none"><rect x="1" y="3" width="16" height="12" rx="2" stroke={disabled ? C.muted : C.cyan} strokeWidth="1.2" /><circle cx="9" cy="9" r="3" stroke={disabled ? C.muted : C.cyan} strokeWidth="1" /><path d="M6 3l1-2h4l1 2" stroke={disabled ? C.muted : C.cyan} strokeWidth="1" /></svg>
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: 10.5, fontWeight: 600, color: disabled ? C.dim : C.muted }}>{lbl}</div>
                            <div style={{ fontSize: 9.5, color: C.dim }}>{disabled ? "Fill slot above first" : "Tap to capture or upload"}</div>
                          </div>
                          {!disabled && <div style={{ fontSize: 9, color: C.cyan, fontFamily: "JetBrains Mono", fontWeight: 700 }}>+ ADD</div>}
                        </div>
                      )
                    })}
                  </div>
                </Section>
              )
            })()}

            {/* ── Type-specific fields (only when no obs yet, or in edit-only mode) */}
            {(!assetObservations.filter(o => o.assetId === selectedAsset.id).length || obsMode === null) && <>

            {/* ── Basin-specific ───────────────────────────────────────────── */}
            {["catch-basin","storm-basin","sanitary-basin"].includes(selectedAsset.type) && (
              <Section>
                <Label>Depth</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" value={selectedAsset.depth ?? ""} onChange={e => updateAsset(selectedAsset.id, { depth: e.target.value }, "depth — " + e.target.value + " ft")}
                    placeholder="0" style={{ width: 70, padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono", border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: C.muted }}>ft</span>
                </div>
              </Section>
            )}

            {/* ── Condition Rating — all asset types ───────────────────────── */}
            <Section>
              <Label>Condition Rating</Label>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {([1,2,3,4,5] as const).map(r => {
                  const sel = selectedAsset.conditionRating === r
                  const col = CONDITION_COLORS[r]
                  return (
                    <button key={r} onClick={() => updateAsset(selectedAsset.id, { conditionRating: r, conditionBlocker: undefined }, "condition — " + CONDITION_LABELS[r])}
                      style={{ display: "flex", alignItems: "flex-start", gap: 0, padding: 0, background: sel ? col + "12" : C.card, border: `1.5px solid ${sel ? col : C.border}`, borderRadius: 7, cursor: "pointer", textAlign: "left", overflow: "hidden" }}>
                      <div style={{ width: 4, alignSelf: "stretch", background: col, flexShrink: 0 }} />
                      <div style={{ padding: "9px 11px" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: sel ? col : C.text }}>{CONDITION_LABELS[r]}</span>
                          <span style={{ fontSize: 9, fontFamily: "JetBrains Mono", color: sel ? col : C.muted, fontWeight: 700 }}>{r}</span>
                        </div>
                        <div style={{ fontSize: 9.5, color: sel ? "#38424E" : C.dim, lineHeight: 1.45 }}>{CONDITION_DESCS[r]}</div>
                      </div>
                    </button>
                  )
                })}
                {/* Divider + Unable option */}
                <div style={{ height: 1, background: C.border, margin: "4px 0" }} />
                {(() => {
                  const sel = selectedAsset.conditionRating === "unable"
                  return (
                    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                      <button onClick={() => updateAsset(selectedAsset.id, { conditionRating: "unable" }, "condition — unable to evaluate")}
                        style={{ display: "flex", alignItems: "flex-start", gap: 0, padding: 0, background: sel ? CONDITION_UNABLE_COLOR + "12" : C.card, border: `1.5px solid ${sel ? CONDITION_UNABLE_COLOR : C.border}`, borderRadius: 7, cursor: "pointer", textAlign: "left", overflow: "hidden" }}>
                        <div style={{ width: 4, alignSelf: "stretch", background: CONDITION_UNABLE_COLOR, flexShrink: 0 }} />
                        <div style={{ padding: "9px 11px" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 3 }}>
                            <span style={{ fontSize: 11, fontWeight: 700, color: sel ? CONDITION_UNABLE_COLOR : C.text }}>Unable to fully evaluate</span>
                            <span style={{ fontSize: 9, fontFamily: "JetBrains Mono", color: C.muted, fontWeight: 700 }}>—</span>
                          </div>
                          <div style={{ fontSize: 9.5, color: sel ? "#38424E" : C.dim, lineHeight: 1.45 }}>Condition could not be completely determined due to standing water, debris, grease, access limitations, or another obstruction. Cleaning, pumping, or additional investigation is recommended before assigning a final condition.</div>
                        </div>
                      </button>
                      {sel && (
                        <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: CONDITION_UNABLE_COLOR + "0D", border: `1px solid ${CONDITION_UNABLE_COLOR}33`, borderRadius: 6 }}>
                          <div>
                            <FieldLabel text="WHAT PREVENTED ASSESSMENT *" />
                            <select value={selectedAsset.conditionBlocker ?? ""} onChange={e => updateAsset(selectedAsset.id, { conditionBlocker: e.target.value }, "condition blocker — " + e.target.value)}
                              style={{ ...inputSt, paddingRight: 8 }}>
                              <option value="">— select —</option>
                              {CONDITION_BLOCKER_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          {selectedAsset.conditionBlocker && (
                            <div style={{ padding: "10px 12px", borderRadius: 5, background: C.card, border: `1px solid ${C.border}` }}>
                              <div style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.5, fontStyle: "italic", marginBottom: 8 }}>This asset could not be assessed. Add a recommendation to clear it?</div>
                              <button
                                onClick={() => {
                                  const rec = conditionBlockerRec(selectedAsset.conditionBlocker ?? "")
                                  alert(`Recommendation pre-filled:\n\nAction: ${rec}\nPriority: Immediate\nRationale: Condition could not be assessed — ${selectedAsset.conditionBlocker}. Clearing required before a grade can be assigned.`)
                                }}
                                style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, background: CONDITION_UNABLE_COLOR, color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: "pointer" }}>
                                Add recommendation
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            </Section>

            {/* ── Cleanout-specific (floor, foundation, overhead) ──────────── */}
            {["cleanout-floor","cleanout-foundation","cleanout-overhead"].includes(selectedAsset.type) && (
              <Section>
                <Label>Clean-out Access Size</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" value={selectedAsset.accessSize ?? ""} onChange={e => updateAsset(selectedAsset.id, { accessSize: e.target.value }, "access size — " + e.target.value)}
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
                    return <button key={opt} onClick={() => updateAsset(selectedAsset.id, { accessConfig: sel ? undefined : opt }, "access config — " + (sel ? "cleared" : opt))} style={{ flex: 1, padding: "7px", fontSize: 10.5, fontWeight: sel ? 700 : 500, borderRadius: 5, cursor: "pointer", background: sel ? C.cyan : "#fff", color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                  })}
                </div>
              </Section>
            )}
            {selectedAsset.type === "cleanout-floor" && (
              <Section>
                <Label>Underground Connection</Label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {CONN_OPTIONS.map(opt => {
                    const sel = selectedAsset.undergroundConn === opt
                    return <button key={opt} onClick={() => updateAsset(selectedAsset.id, { undergroundConn: sel ? undefined : opt }, "underground connection — " + (sel ? "cleared" : opt))} style={{ padding: "4px 9px", fontSize: 9.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                  })}
                </div>
                {selectedAsset.undergroundConn === "Other" && (
                  <input value={selectedAsset.undergroundConnOther ?? ""} onChange={e => updateAsset(selectedAsset.id, { undergroundConnOther: e.target.value }, "underground connection — " + e.target.value)}
                    placeholder="Describe connection…" style={{ marginTop: 8, width: "100%", padding: "6px 8px", fontSize: 11, border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", fontFamily: "'DM Sans', sans-serif", boxSizing: "border-box" }} />
                )}
              </Section>
            )}
            {selectedAsset.type === "cleanout-overhead" && (
              <Section>
                <Label>Vertical Pipe Size</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" value={selectedAsset.verticalPipeSize ?? ""} onChange={e => updateAsset(selectedAsset.id, { verticalPipeSize: e.target.value }, "vertical pipe size — " + e.target.value)}
                    placeholder="4" style={{ width: 70, padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono", border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: C.muted }}>in</span>
                </div>
              </Section>
            )}
            {selectedAsset.type === "cleanout-overhead" && (
              <Section>
                <Label>Above-Ground / Horizontal Pipe Size</Label>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input type="number" value={selectedAsset.horizontalPipeSize ?? ""} onChange={e => updateAsset(selectedAsset.id, { horizontalPipeSize: e.target.value }, "horizontal pipe size — " + e.target.value)}
                    placeholder="4" style={{ width: 70, padding: "6px 8px", fontSize: 12, fontFamily: "JetBrains Mono", border: `1px solid ${C.border}`, borderRadius: 4, outline: "none", textAlign: "center" }} />
                  <span style={{ fontSize: 12, color: C.muted }}>in</span>
                </div>
              </Section>
            )}

            {/* ── Stack ────────────────────────────────────────────────────── */}
            {selectedAsset.type === "stack" && (() => {
              const a = selectedAsset
              const hasAccess = a.hasCleanout === "pre-existing" || a.hasCleanout === "installed-by-us"
              const sizeOpts = ['2"','3"','4"','6"','8"','10"','12"']
              const materialOpts = ["Cast Iron","Clay","PVC","ABS","Copper","Galvanised","Unknown"]
              const coSizeOpts = ['2"','3"','4"','6"','8"']
              const fittingOpts = ["Wye","Tee","Sanitary tee","Combo","Unknown"]
              return (
                <>
                  {/* Stack size */}
                  <Section>
                    <Label>Stack Size</Label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {sizeOpts.map(opt => {
                        const sel = a.stackSize === opt
                        return <button key={opt} onClick={() => updateAsset(a.id, { stackSize: sel ? undefined : opt }, "stack size — " + opt)} style={{ padding: "5px 9px", fontSize: 10.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                      })}
                    </div>
                  </Section>
                  {/* Stack material */}
                  <Section>
                    <Label>Stack Material</Label>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                      {materialOpts.map(opt => {
                        const sel = a.stackMaterial === opt
                        return <button key={opt} onClick={() => updateAsset(a.id, { stackMaterial: sel ? undefined : opt }, "stack material — " + opt)} style={{ padding: "5px 9px", fontSize: 10.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                      })}
                    </div>
                  </Section>
                  {/* Has clean-out */}
                  <Section>
                    <Label>Has a Clean-out</Label>
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {([["no","No","#DC2626"],["pre-existing","Yes — pre-existing","#00803E"],["installed-by-us","Yes — installed by us","#00803E"]] as [string,string,string][]).map(([val, label, col]) => {
                        const sel = a.hasCleanout === val
                        const prevVal = a.hasCleanout
                        return (
                          <button key={val} onClick={() => {
                            if (sel) return
                            updateAsset(a.id, { hasCleanout: val as "no"|"pre-existing"|"installed-by-us" }, `clean-out — ${label.toLowerCase()}`)
                            if (val === "installed-by-us" && prevVal === "no") {
                              // Log the installation event explicitly
                              const sizeStr = a.cleanoutSize ? a.cleanoutSize : ""
                              const fitStr = a.cleanoutFitting ? a.cleanoutFitting : ""
                              appendLog(`${a.label} clean-out installed${sizeStr || fitStr ? " — " + [sizeStr, fitStr].filter(Boolean).join(" ") : ""}`)
                            }
                          }}
                            style={{ padding: "8px 12px", fontSize: 11, fontWeight: sel ? 700 : 500, borderRadius: 5, cursor: sel ? "default" : "pointer", background: sel ? col : C.card, color: sel ? "#fff" : C.muted, border: `1.5px solid ${sel ? col : C.border}`, textAlign: "left" }}>
                            {label}
                          </button>
                        )
                      })}
                    </div>
                    {a.hasCleanout === "no" && (
                      <div style={{ marginTop: 8, padding: "10px 12px", background: "#FEF2F2", border: "1px solid #FECACA", borderRadius: 6 }}>
                        <div style={{ fontSize: 10.5, fontWeight: 700, color: "#DC2626", marginBottom: 3 }}>No access on this stack.</div>
                        <div style={{ fontSize: 10, color: "#7F1D1D", lineHeight: 1.5 }}>A clean-out must be cut in — wye by default — before this line can be cameraed.</div>
                      </div>
                    )}
                  </Section>
                  {/* Clean-out details — only when has access */}
                  {hasAccess && (
                    <>
                      <Section>
                        <Label>Clean-out Size</Label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {coSizeOpts.map(opt => {
                            const sel = a.cleanoutSize === opt
                            return <button key={opt} onClick={() => updateAsset(a.id, { cleanoutSize: sel ? undefined : opt }, "cleanout size — " + opt)} style={{ padding: "5px 9px", fontSize: 10.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                          })}
                        </div>
                      </Section>
                      <Section>
                        <Label>Fitting</Label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {fittingOpts.map(opt => {
                            const sel = a.cleanoutFitting === opt
                            return <button key={opt} onClick={() => updateAsset(a.id, { cleanoutFitting: sel ? undefined : opt }, "cleanout fitting — " + opt)} style={{ padding: "5px 9px", fontSize: 10.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                          })}
                        </div>
                      </Section>
                      <Section>
                        <Label>Underground Connection</Label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {CONN_OPTIONS.map(opt => {
                            const sel = a.undergroundConn === opt
                            return <button key={opt} onClick={() => updateAsset(a.id, { undergroundConn: sel ? undefined : opt }, "underground connection — " + opt)} style={{ padding: "4px 9px", fontSize: 9.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                          })}
                        </div>
                      </Section>
                      <Section>
                        <Label>Vertical Pipe Size</Label>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                          {sizeOpts.map(opt => {
                            const sel = a.verticalPipeSize === opt
                            return <button key={opt} onClick={() => updateAsset(a.id, { verticalPipeSize: sel ? undefined : opt }, "vertical pipe size — " + opt)} style={{ padding: "5px 9px", fontSize: 10.5, fontWeight: sel ? 700 : 500, borderRadius: 4, cursor: "pointer", background: sel ? C.cyan : C.card, color: sel ? "#fff" : C.muted, border: `1px solid ${sel ? C.cyan : C.border}` }}>{opt}</button>
                          })}
                        </div>
                      </Section>
                    </>
                  )}
                </>
              )
            })()}

            {/* ── Stack camera inspection gate ─────────────────────────────── */}
            {selectedAsset.type === "stack" && selectedAsset.hasCleanout === "no" && (
              <Section>
                <div style={{ padding: "10px 12px", background: "#FEF9EC", border: "1px solid #FDE68A", borderRadius: 6 }}>
                  <div style={{ fontSize: 10.5, fontWeight: 700, color: "#92400E", marginBottom: 2 }}>+ Camera Inspection disabled</div>
                  <div style={{ fontSize: 10, color: "#78350F", lineHeight: 1.5 }}>No access on this stack. Cut in a clean-out first.</div>
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
                          return <button key={String(v)} onClick={() => updateAsset(selectedAsset.id, { flowTestResult: v }, "flow test result — " + (v ? "pass" : "fail"))} style={{ flex: 1, padding: "8px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: sel ? (v ? "#00803E" : "#DC2626") : "#fff", color: sel ? "#fff" : C.muted, border: `1.5px solid ${sel ? (v ? "#00803E" : "#DC2626") : C.border}` }}>{v ? "YES" : "NO"}</button>
                        })}
                      </div>
                      <button onClick={() => updateAsset(selectedAsset.id, { flowTestDone: true }, "flow test — done")} disabled={selectedAsset.flowTestResult === undefined} style={{ width: "100%", padding: "8px", fontSize: 10.5, fontWeight: 700, background: selectedAsset.flowTestResult !== undefined ? C.cyan : C.card, color: selectedAsset.flowTestResult !== undefined ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: selectedAsset.flowTestResult !== undefined ? "pointer" : "default" }}>Save Test</button>
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
                  <input type="date" value={selectedAsset.installDate ?? ""} onChange={e => updateAsset(selectedAsset.id, { installDate: e.target.value }, "install date — " + e.target.value)}
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
                            return <button key={String(v)} onClick={() => updateAsset(selectedAsset.id, { dischargeFunctioning: v }, "discharge functioning — " + (v ? "yes" : "no"))} style={{ padding: "8px", fontSize: 10.5, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: sel ? (v ? "#00803E" : "#DC2626") : "#fff", color: sel ? "#fff" : C.muted, border: `1.5px solid ${sel ? (v ? "#00803E" : "#DC2626") : C.border}`, textAlign: "left" }}>{v ? "YES — Functioning Properly" : "NO — Not Functioning Properly"}</button>
                          })}
                        </div>
                        <button onClick={() => updateAsset(selectedAsset.id, { dischargeTestDone: true }, "discharge test — done")} disabled={selectedAsset.dischargeFunctioning === undefined} style={{ width: "100%", padding: "8px", fontSize: 10.5, fontWeight: 700, background: selectedAsset.dischargeFunctioning !== undefined ? C.cyan : C.card, color: selectedAsset.dischargeFunctioning !== undefined ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: selectedAsset.dischargeFunctioning !== undefined ? "pointer" : "default" }}>Save Test</button>
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
                      return <button key={String(v)} onClick={() => updateAsset(selectedAsset.id, { cameraAccessible: sel ? undefined : v }, "camera accessible — " + (sel ? "cleared" : (v ? "yes" : "no")))} style={{ flex: 1, padding: "8px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: sel ? C.cyan : "#fff", color: sel ? "#fff" : C.muted, border: `1.5px solid ${sel ? C.cyan : C.border}` }}>{v ? "YES" : "NO"}</button>
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

            </>}

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
            {selectedPipe?.archived && (
              <div style={{ margin: "12px 16px 0", padding: "10px 14px", background: "#FEF3C7", border: "1px solid #FCD34D", borderRadius: 6 }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: "#92400E", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 4 }}>
                  ⚠ Archived — {selectedPipe.archiveReason}
                </div>
                <div style={{ fontSize: 10, color: "#92400E", marginBottom: 6 }}>
                  Archived by {SITE_PERSONS.find(p => p.id === selectedPipe.archivedById)?.name ?? "—"} · {selectedPipe.archivedOn ? new Date(selectedPipe.archivedOn).toLocaleDateString("en-US", { month: "short", day: "numeric" }) : ""}
                </div>
                <button onClick={() => restorePipe(selectedPipe.id)}
                  style={{ padding: "5px 12px", fontSize: 11, fontWeight: 700, background: "#D97706", border: "none", borderRadius: 4, cursor: "pointer", color: "#fff" }}>
                  Restore
                </button>
              </div>
            )}

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

            {/* Pipe Overview */}
            {(() => {
              const pipe = selectedPipe

              // Source video: most recent complete (inspStep>=8), else most recent with characteristics
              const completeVids = pipe.videos.filter(v => (v.inspStep || 1) >= 8)
              const sourceVideo = completeVids.length > 0
                ? completeVids[completeVids.length - 1]
                : pipe.videos.slice().reverse().find(v => v.characteristics && v.characteristics.length >= 2)
              const newerIncomplete = completeVids.length > 0 && pipe.videos.some(v =>
                (v.inspStep || 1) < 8 && pipe.videos.indexOf(v) > pipe.videos.indexOf(completeVids[completeVids.length - 1])
              )

              // Keep legacy auto-fill logic (best video with runStart+runEnd)
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
                    <Label>Pipe Overview</Label>
                    {!editingPipe && (
                      <button
                        onClick={() => {
                          if (sourceVideo) {
                            setSelectedVideoId(sourceVideo.id)
                            setEditingStep(7)
                          } else {
                            setEditingPipe(true)
                            setPipeForm({ start: pipe.start ?? { type: "", diameter: "", depth: "" }, end: pipe.end ?? { type: "", diameter: "", depth: "" }, length: pipe.length, slope: pipe.slope, transitions: pipe.transitions ?? [] })
                          }
                        }}
                        style={{ padding: "3px 9px", fontSize: 9.5, fontWeight: 700, background: C.card, color: C.cyan, border: `1px solid ${C.cyan}44`, borderRadius: 4, cursor: "pointer", letterSpacing: "0.04em" }}
                      >Edit</button>
                    )}
                  </div>

                  {/* Source attribution + profile graphic */}
                  {sourceVideo && !editingPipe && (() => {
                    const sv = sourceVideo
                    const completenessLine = (() => {
                      if (sv.fullyInspected === "Yes") {
                        return <span style={{ color: "#00803E" }}>Fully inspected{sv.whyStopped ? ` · ${sv.whyStopped.toLowerCase()}` : ""}</span>
                      }
                      if (sv.fullyInspected === "Partially") {
                        const aft = sv.assessableFootage ? `${sv.assessableFootage} of ${sv.stopFootage || "?"} ft assessable` : ""
                        return <span style={{ color: "#A96B00" }}>Partially inspected{sv.notFullyReason ? ` — ${sv.notFullyReason.toLowerCase()}` : ""}{aft ? ` · ${aft}` : ""}</span>
                      }
                      if (sv.fullyInspected === "No") {
                        return <span style={{ color: "#A96B00" }}>Not fully inspected{sv.notFullyReason ? ` — ${sv.notFullyReason.toLowerCase()}` : ""}</span>
                      }
                      return <span style={{ color: C.dim, fontStyle: "italic" }}>Inspection in progress</span>
                    })()
                    return (
                      <div style={{ marginBottom: 10 }}>
                        <div style={{ fontSize: 9.5, color: C.muted, marginBottom: 2 }}>
                          <span
                            onClick={() => setSelectedVideoId(sv.id)}
                            style={{ color: C.cyan, cursor: "pointer", fontWeight: 600 }}
                          >{sv.name}</span>
                          {sv.date ? ` · ${sv.date}` : ""}
                          {sv.operator ? ` · ${sv.operator}` : ""}
                        </div>
                        <div style={{ fontSize: 9.5, marginBottom: newerIncomplete ? 4 : 0 }}>{completenessLine}</div>
                        {newerIncomplete && (
                          <div style={{ fontSize: 9.5, color: C.muted, fontStyle: "italic" }}>A newer inspection is still in progress.</div>
                        )}
                        {/* Profile graphic */}
                        <div style={{ marginTop: 10, border: `1px solid ${C.border}`, borderRadius: 6, overflow: "hidden", background: "#fff" }}>
                          <PipeProfileSVG video={sv} pipe={pipe} onClickObs={id => {
                            setSelectedVideoId(sv.id)
                            const obsIdx = sv.observations.findIndex(o => o.id === id)
                            if (obsIdx !== -1) setEditingStep(5)
                          }} />
                        </div>
                      </div>
                    )
                  })()}

                  {!sourceVideo && !editingPipe && (
                    <div style={{ padding: "14px 12px", marginBottom: 10, borderRadius: 6, background: C.card, border: `1px solid ${C.border}`, fontSize: 10, color: C.dim, fontStyle: "italic", textAlign: "center" }}>
                      No camera inspection yet. This fills in once one is completed.
                    </div>
                  )}

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
                  onClick={() => addVideo("Camera Run " + (selectedPipe.videos.length + 1))}
                  style={{ padding: "3px 9px", fontSize: 9.5, background: "#00803E18", color: "#00803E", border: "1px solid #00803E44", borderRadius: 4, cursor: "pointer", fontWeight: 700, letterSpacing: "0.04em" }}
                >
                  + CAMERA INSPECTION
                </button>
              </div>
              {showVideoForm && (
                <div style={{ display: "none" }}>
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
                const completeVids2 = selectedPipe.videos.filter(v => (v.inspStep || 1) >= 8)
                const isActiveSource = completeVids2.length > 0 && completeVids2[completeVids2.length - 1].id === video.id
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
                        <div style={{ display: "flex", alignItems: "center", gap: 5, overflow: "hidden" }}>
                          <div style={{ fontSize: 11, fontWeight: 600, color: isOpen ? "#0369A1" : C.text, fontFamily: "JetBrains Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                            {video.name}
                          </div>
                          {isActiveSource && <span style={{ flexShrink: 0, fontSize: 8, fontWeight: 700, letterSpacing: "0.06em", padding: "1px 5px", borderRadius: 3, background: "#E8F4EF", color: "#00803E", border: "1px solid #00803E33" }}>OVERVIEW</span>}
                        </div>
                        <div style={{ fontSize: 9.5, color: C.muted, marginTop: 1 }}>{video.date} · {video.observations.length} obs. · {(video.inspStep || 1) >= 8 ? <span style={{ color: "#00803E", fontWeight: 700 }}>Complete</span> : `Step ${Math.min(video.inspStep || 1, 7)} of 7`}</div>
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

            {/* ── Video inspection — 7-step stepper ────────────────────────── */}
            {selectedVideo && (() => {
              const sv = selectedVideo
              const step = sv.inspStep || 1
              const isDone = (n: number) => step > n && editingStep !== n
              const isActive = (n: number) => step === n || editingStep === n
              const isLocked = (n: number) => step < n

              const stepCircle = (n: number) => (
                <div style={{ width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9.5, fontWeight: 700, background: isDone(n) ? "#00803E" : isActive(n) ? "#16202A" : "transparent", color: isDone(n) || isActive(n) ? "#fff" : C.dim, border: isLocked(n) ? `1.5px solid ${C.border}` : isDone(n) ? "none" : isActive(n) ? "none" : "none" }}>
                  {isDone(n) ? "✓" : n}
                </div>
              )

              const stepHdr = (n: number, summary?: string) => (
                <div style={{ padding: "10px 16px", display: "flex", alignItems: "center", gap: 10 }}>
                  {stepCircle(n)}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 10.5, fontWeight: isDone(n) || isActive(n) ? 700 : 500, color: isLocked(n) ? C.dim : C.text }}>{STEP_TITLES[n]}</div>
                    {isDone(n) && !isActive(n) && summary && <div style={{ fontSize: 9, color: C.muted, marginTop: 1 }}>{summary}</div>}
                  </div>
                  {isDone(n) && !isActive(n) && (
                    <button onClick={() => setEditingStep(n === editingStep ? null : n)} style={{ padding: "2px 8px", fontSize: 9, fontWeight: 700, color: C.muted, background: C.card, border: `1px solid ${C.border}`, borderRadius: 4, cursor: "pointer" }}>Change</button>
                  )}
                </div>
              )

              // CIPP concern logic (used in step 5 forms)
              const cippSection = (isDefect = false) => {
                const isCollapse = isDefect && captureForm.defectSubtype === "Complete collapse"
                const autoYes = isDefect && (
                  isCollapse ||
                  ["Broken pipe","Missing bottom"].includes(String(captureForm.defectSubtype ?? "")) ||
                  (["Offset","Hole"].includes(String(captureForm.defectSubtype ?? "")) && Number(captureForm.severity) >= 4)
                )
                const explicitVal = captureForm.cippConcern as boolean | undefined
                const concern: boolean = isCollapse ? true : (explicitVal !== undefined ? explicitVal : autoYes)
                return (
                  <div style={{ borderTop: `1px solid ${C.border}`, paddingTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.09em", textTransform: "uppercase" }}>CIPP INSTALLATION CONCERN?</div>
                    {isCollapse
                      ? <div style={{ fontSize: 9.5, color: "#CE1A74", fontStyle: "italic" }}>Set automatically — a complete collapse always rules out lining.</div>
                      : <div style={{ display: "flex", gap: 6 }}>
                          {([false, true] as const).map(v => (
                            <button key={String(v)} onClick={() => setCaptureForm(f => ({ ...f, cippConcern: v }))} style={{ flex: 1, padding: "7px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: concern === v ? (v ? "#FFF0F5" : "#E8F4EF") : C.card, color: concern === v ? (v ? "#CE1A74" : "#00803E") : C.muted, border: `1.5px solid ${concern === v ? (v ? "#CE1A74" : "#00803E") : C.border}` }}>
                              {v ? "Yes" : "No"}
                            </button>
                          ))}
                        </div>
                    }
                    {concern && (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "10px 12px", background: "#FFF8FA", borderRadius: 6, border: "1px solid #CE1A7422" }}>
                        <div>
                          <FieldLabel text="DEPTH (ft) *" />
                          <input type="number" value={String(captureForm.cippDepth ?? "")} onChange={e => setCaptureForm(f => ({ ...f, cippDepth: e.target.value }))} style={inputSt} placeholder="ft" />
                        </div>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                          {[{k:"cippLocateClose",label:"UP-CLOSE LOCATE IMAGE *"},{k:"cippLocateWide",label:"WIDE AREA LOCATE IMAGE *"}].map(({k,label}) => (
                            <div key={k}>
                              <FieldLabel text={label} />
                              {captureForm[k] ? (
                                <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                                  <div style={{ padding: "5px 8px", borderRadius: 4, background: "#E8F4EF", color: "#00803E", fontSize: 9.5, fontWeight: 700 }}>✓ Captured</div>
                                  <button onClick={() => setCaptureForm(f => ({ ...f, [k]: false }))} style={{ fontSize: 9, color: "#DC2626", background: "none", border: "none", cursor: "pointer" }}>✕</button>
                                </div>
                              ) : (
                                <button onClick={() => setCaptureForm(f => ({ ...f, [k]: true }))} style={{ width: "100%", padding: "7px", fontSize: 9.5, background: C.card, color: C.muted, border: `1.5px dashed ${C.border}`, borderRadius: 5, cursor: "pointer" }}>+ Capture</button>
                              )}
                            </div>
                          ))}
                        </div>
                        <div>
                          <FieldLabel text="WHAT'S ABOVE AT THIS POINT" />
                          <select value={String(captureForm.cippAboveGround ?? "")} onChange={e => setCaptureForm(f => ({ ...f, cippAboveGround: e.target.value }))} style={{ ...inputSt, paddingRight: 8 }}>
                            <option value="">— select —</option>
                            {ABOVE_GROUND_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                          {MUNICIPAL_SURFACES.includes(String(captureForm.cippAboveGround ?? "")) && (
                            <div style={{ marginTop: 4, padding: "5px 8px", borderRadius: 4, background: "#FFFBF0", border: "1px solid #F59E0B44", fontSize: 9.5, color: "#A96B00", lineHeight: 1.4 }}>⚠ Under municipal property — permit, traffic control and municipal restoration required.</div>
                          )}
                        </div>
                        <div>
                          <FieldLabel text="NOTES FOR THE ESTIMATOR" />
                          <textarea value={String(captureForm.cippNotes ?? "")} onChange={e => setCaptureForm(f => ({ ...f, cippNotes: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              }

              const cippCount = sv.observations.filter(o => o.cippConcern).length
              const cippMissing = sv.observations.filter(o => o.cippConcern && (!o.cippDepth || !o.cippLocateClose || !o.cippLocateWide)).length
              const step5Complete = sv.observationsClosed && cippMissing === 0

              return (
              <div style={{ borderTop: `2px solid ${C.border}` }}>

                {/* Stepper header */}
                <div style={{ padding: "10px 16px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", gap: 10 }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 2 }}>CAMERA INSPECTION · STEP {Math.min(step, 7)} OF 7</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: "#16202A", fontFamily: "JetBrains Mono", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sv.name}</div>
                  </div>
                  <button onClick={() => setInspectionFullscreen(true)} title="Full screen" style={{ flexShrink: 0, padding: "5px 10px", fontSize: 9.5, fontWeight: 700, letterSpacing: "0.05em", background: "#16202A", color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: "pointer", display: "flex", alignItems: "center", gap: 5 }}>
                    <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                      <path d="M1 4V1h3M7 1h3v3M10 7v3H7M4 10H1V7" stroke="white" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                    Full Screen
                  </button>
                </div>

                {/* ── Step 1 — Set up ───────────────────────────────────────── */}
                <div style={{ borderBottom: `1px solid ${C.border}`, opacity: isLocked(1) ? 0.45 : 1 }}>
                  {stepHdr(1, [sv.purpose, sv.direction, sv.entryPipeSize, sv.entryPipeType, sv.entryDepth ? `${fmtFtIn(sv.entryDepth)} deep` : ""].filter(Boolean).join(" · "))}
                  {isActive(1) && (
                    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <FieldLabel text="PURPOSE *" />
                        <select value={step1Form.purpose} onChange={e => setStep1Form(f => ({ ...f, purpose: e.target.value }))} style={{ ...inputSt, paddingRight: 8 }}>
                          <option value="">— select —</option>
                          {PURPOSE_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <FieldLabel text="LAUNCHED FROM *" />
                        <input value={step1Form.launchedFrom} onChange={e => setStep1Form(f => ({ ...f, launchedFrom: e.target.value }))} placeholder="e.g. CF-01" style={inputSt} />
                      </div>
                      <div>
                        <FieldLabel text="DIRECTION *" />
                        <div style={{ display: "flex", gap: 6 }}>
                          {(["downstream","upstream"] as const).map(d => (
                            <button key={d} onClick={() => setStep1Form(f => ({ ...f, direction: d }))} style={{ flex: 1, padding: "7px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: step1Form.direction === d ? C.cyan : C.card, color: step1Form.direction === d ? "#fff" : C.muted, border: `1.5px solid ${step1Form.direction === d ? C.cyan : C.border}`, textTransform: "capitalize" }}>{d}</button>
                          ))}
                        </div>
                      </div>
                      <div>
                        <FieldLabel text="ZERO REFERENCE *" />
                        <select value={step1Form.zeroRef} onChange={e => setStep1Form(f => ({ ...f, zeroRef: e.target.value }))} style={{ ...inputSt, paddingRight: 8 }}>
                          {ZERO_REF_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                        <div style={{ marginTop: 4, fontSize: 9, color: C.muted, lineHeight: 1.4 }}>Footage measured along the pipe, not from the floor. Keep this consistent between inspections of the same run or their footages won't line up.</div>
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <FieldLabel text="PIPE SIZE AT ENTRY *" />
                          <select value={step1Form.entryPipeSize} onChange={e => setStep1Form(f => ({ ...f, entryPipeSize: e.target.value }))} style={{ ...inputSt, paddingRight: 4 }}>
                            <option value="">—</option>
                            {PIPE_SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <FieldLabel text="PIPE TYPE AT ENTRY *" />
                          <select value={step1Form.entryPipeType} onChange={e => setStep1Form(f => ({ ...f, entryPipeType: e.target.value }))} style={{ ...inputSt, paddingRight: 4 }}>
                            <option value="">—</option>
                            {PIPE_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <FieldLabel text="DEPTH AT ENTRY (ft) *" />
                        <input type="number" value={step1Form.entryDepth} onChange={e => setStep1Form(f => ({ ...f, entryDepth: e.target.value }))} style={inputSt} placeholder="ft" />
                      </div>
                      <button
                        disabled={!step1Form.purpose || !step1Form.launchedFrom || !step1Form.direction || !step1Form.zeroRef || !step1Form.entryPipeSize || !step1Form.entryPipeType || !step1Form.entryDepth}
                        onClick={() => { updateVideo({ purpose: step1Form.purpose, launchedFrom: step1Form.launchedFrom, direction: step1Form.direction, zeroRef: step1Form.zeroRef, entryPipeSize: step1Form.entryPipeSize, entryPipeType: step1Form.entryPipeType, entryDepth: step1Form.entryDepth, inspStep: Math.max(step, 2) }); setEditingStep(null) }}
                        style={{ width: "100%", padding: "9px", fontSize: 10.5, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: (step1Form.purpose && step1Form.launchedFrom && step1Form.entryPipeSize && step1Form.entryPipeType && step1Form.entryDepth) ? "#16202A" : C.card, color: (step1Form.purpose && step1Form.launchedFrom && step1Form.entryPipeSize && step1Form.entryPipeType && step1Form.entryDepth) ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" }}
                      >
                        {editingStep === 1 ? "Save Changes" : "Next →"}
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Step 2 — Push ─────────────────────────────────────────── */}
                <div style={{ borderBottom: `1px solid ${C.border}`, opacity: isLocked(2) ? 0.45 : 1 }}>
                  {stepHdr(2, "Push complete")}
                  {isActive(2) && (
                    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                      <div style={{ padding: "12px 14px", borderRadius: 7, background: "#F8FAFC", border: `1px solid ${C.border}`, fontSize: 10.5, color: C.text, lineHeight: 1.6 }}>
                        Push at a steady pace. Stop briefly at <strong>every connection</strong> and at <strong>any observation more severe than moderate</strong>, until the end is reached or the camera won't go further.<br /><br />Nothing to enter here — that comes next.
                      </div>
                      <button onClick={() => { updateVideo({ inspStep: Math.max(step, 3) }); setEditingStep(null) }} style={{ width: "100%", padding: "9px", fontSize: 10.5, fontWeight: 700, background: "#CE1A74", color: "#fff", borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none", borderRadius: 5, cursor: "pointer" }}>
                        Camera Stopped →
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Step 3 — Why the camera stopped ───────────────────────── */}
                <div style={{ borderBottom: `1px solid ${C.border}`, opacity: isLocked(3) ? 0.45 : 1 }}>
                  {stepHdr(3, [sv.whyStopped, sv.stopFootage ? `stopped at ${fmtFtIn(sv.stopFootage)}` : ""].filter(Boolean).join(" · "))}
                  {isActive(3) && (
                    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div>
                        <FieldLabel text="WHY THE CAMERA STOPPED *" />
                        <select value={step3Form.whyStopped} onChange={e => setStep3Form(f => ({ ...f, whyStopped: e.target.value }))} style={{ ...inputSt, paddingRight: 8 }}>
                          <option value="">— select —</option>
                          {WHY_STOPPED_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                        </select>
                      </div>
                      <div>
                        <FieldLabel text="STOP FOOTAGE *" />
                        <FootageRow footage={step3Form.stopFootage} onChange={v => setStep3Form(f => ({ ...f, stopFootage: v }))} />
                      </div>
                      <div>
                        <FieldLabel text="NOTES" />
                        <textarea value={step3Form.stopNotes} onChange={e => setStep3Form(f => ({ ...f, stopNotes: e.target.value }))} rows={2} style={{ ...inputSt, resize: "vertical", fontFamily: "'DM Sans', sans-serif" }} placeholder="Any detail about what stopped the camera…" />
                      </div>
                      <button
                        disabled={!step3Form.whyStopped || !step3Form.stopFootage}
                        onClick={() => { updateVideo({ whyStopped: step3Form.whyStopped, stopFootage: step3Form.stopFootage, stopNotes: step3Form.stopNotes, inspStep: Math.max(step, 4) }); setEditingStep(null) }}
                        style={{ width: "100%", padding: "9px", fontSize: 10.5, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: step3Form.whyStopped && step3Form.stopFootage ? "#16202A" : C.card, color: step3Form.whyStopped && step3Form.stopFootage ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" }}
                      >
                        {editingStep === 3 ? "Save Changes" : "Next →"}
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Step 4 — Upload the recording ─────────────────────────── */}
                <div style={{ borderBottom: `1px solid ${C.border}`, opacity: isLocked(4) ? 0.45 : 1 }}>
                  {stepHdr(4, sv.name ? `Recording: ${sv.name}` : undefined)}
                  {isActive(4) && (
                    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 10, color: C.muted, fontStyle: "italic" }}>Download from the reel, then upload here. Analysis happens next.</div>
                      <div onDragOver={e => { e.preventDefault(); setVideoDragOver(true) }} onDragLeave={() => setVideoDragOver(false)} onDrop={e => { e.preventDefault(); setVideoDragOver(false); const f = e.dataTransfer.files[0]; if (f) { updateVideo({ name: f.name, inspStep: Math.max(step, 5) }) } }} style={{ borderRadius: 7, border: `2px dashed ${videoDragOver ? C.cyan : C.border}`, background: videoDragOver ? "#E8F4EF" : C.card, padding: "18px 14px", display: "flex", flexDirection: "column", alignItems: "center", gap: 10, transition: "all 0.15s" }}>
                        <svg width="28" height="28" viewBox="0 0 32 32" fill="none"><rect x="4" y="6" width="24" height="20" rx="3" stroke={C.muted} strokeWidth="1.5"/><polygon points="13,11 23,16 13,21" fill={C.muted}/></svg>
                        <div style={{ fontSize: 11, fontWeight: 600, color: C.text }}>Drop video here</div>
                        <label style={{ cursor: "pointer" }}>
                          <input type="file" accept="video/*" style={{ display: "none" }} onChange={e => { const f = e.target.files?.[0]; if (f) { updateVideo({ name: f.name, inspStep: Math.max(step, 5) }) } }} />
                          <div style={{ padding: "7px 16px", background: C.cyan, color: "#fff", borderRadius: 5, fontSize: 10.5, fontWeight: 700 }}>CHOOSE FILE</div>
                        </label>
                      </div>
                      <button onClick={() => { updateVideo({ inspStep: Math.max(step, 5) }); setEditingStep(null) }} style={{ width: "100%", padding: "7px", fontSize: 10, color: C.muted, background: "none", border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer" }}>
                        Skip — no recording yet
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Step 5 — Sewer camera analysis ────────────────────────── */}
                <div style={{ borderBottom: `1px solid ${C.border}`, opacity: isLocked(5) ? 0.45 : 1 }}>
                  {stepHdr(5, `${sv.observations.length} obs.${cippCount ? ` · ${cippCount} CIPP concern${cippCount !== 1 ? "s" : ""}` : ""}`)}
                  {isActive(5) && (
                    <div>
                      <div style={{ padding: "10px 16px 8px", fontSize: 9.5, color: C.muted, lineHeight: 1.5, borderBottom: `1px solid ${C.border}` }}>Work through the recording and log what you see. Footage opens at the last observation — the camera only moves forward. Anything that affects lining is located here, while the camera is still at that footage.</div>

                      {/* Video player */}
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
                        {cippSection()}
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
                        {cippSection(true)}
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
                        {cippSection()}
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
                        {cippSection()}
                        <FormActions onSave={saveObservation} onCancel={() => setCaptureStep("none")} disabled={!captureForm.pipeType || !captureForm.pipeSize} />
                      </div>
                    )}
                  </div>
                )}

                {/* Observation log */}
                <div style={{ padding: "0 16px 12px" }}>
                  <div style={{ fontSize: 9, fontWeight: 600, color: C.muted, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>LOGGED ON THIS RUN
                    {cippMissing > 0 && <span style={{ marginLeft: 8, padding: "1px 6px", background: "#FEF2F2", color: "#DC2626", borderRadius: 3, fontSize: 8.5, fontWeight: 700 }}>{cippMissing} CIPP concern{cippMissing !== 1 ? "s" : ""} still need a locate</span>}
                  </div>
                  {sv.observations.length === 0 ? (
                    <div style={{ fontSize: 11, color: C.dim, fontStyle: "italic" }}>Nothing logged yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                      {[...sv.observations].sort((a, b) => parseFloat(a.footage || "0") - parseFloat(b.footage || "0")).map(obs => {
                        const col = OBS_COLOR[obs.type]
                        const chips: string[] = []
                        if (obs.type === "tie-in") { if (obs.tieSubtype) chips.push(obs.tieSubtype); if (obs.tieSize) chips.push(obs.tieSize) }
                        else if (obs.type === "defect") { if (obs.defectSubtype) chips.push(obs.defectSubtype); if (obs.severity) chips.push(SEV_LABEL[obs.severity]) }
                        else if (obs.type === "excavation") { if (obs.depthBand) chips.push(obs.depthBand + " deep"); if (obs.surface) chips.push(obs.surface) }
                        else if (obs.type === "direction-change") { if (obs.directionWhich) chips.push(obs.directionWhich); if (obs.directionFitting) chips.push(obs.directionFitting) }
                        else if (obs.type === "pipe-transition") { if (obs.pipeSize) chips.push(obs.pipeSize); if (obs.pipeType) chips.push(obs.pipeType) }
                        const cippBad = obs.cippConcern && (!obs.cippDepth || !obs.cippLocateClose || !obs.cippLocateWide)
                        return (
                          <div key={obs.id} style={{ display: "flex", alignItems: "flex-start", gap: 8, padding: "8px 10px", borderRadius: 6, background: C.card, borderTop: `1px solid ${col}18`, borderRight: `1px solid ${col}18`, borderBottom: `1px solid ${col}18`, borderLeft: `3px solid ${col}` }}>
                            <div style={{ flexShrink: 0, minWidth: 34, textAlign: "right" }}>
                              <div style={{ fontSize: 11, fontFamily: "JetBrains Mono", fontWeight: 700, color: col }}>{fmtFtIn(obs.footage ?? "0")}</div>
                              {obs.footageTo && <div style={{ fontSize: 8.5, color: C.dim }}>–{fmtFtIn(obs.footageTo)}</div>}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 5, flexWrap: "wrap", marginBottom: 4 }}>
                                <span style={{ fontSize: 8.5, fontWeight: 700, color: col, letterSpacing: "0.08em", textTransform: "uppercase" }}>{OBS_LABEL[obs.type]}</span>
                                {obs.type === "defect" && obs.severity && <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 700, background: SEV_COLOR[obs.severity] + "22", color: SEV_COLOR[obs.severity] }}>{SEV_LABEL[obs.severity]}</span>}
                                {obs.cippConcern && <span style={{ padding: "1px 5px", borderRadius: 3, fontSize: 8, fontWeight: 700, background: cippBad ? "#FEF2F2" : "#FFF0F5", color: cippBad ? "#DC2626" : "#CE1A74" }}>{cippBad ? "⚠ CIPP — incomplete" : "CIPP concern"}</span>}
                              </div>
                              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                {chips.map((chip, i) => <span key={i} style={{ fontSize: 9, padding: "1px 6px", borderRadius: 3, background: col + "12", color: col, fontFamily: "JetBrains Mono" }}>{chip}</span>)}
                              </div>
                              {obs.notes && <div style={{ fontSize: 10, color: C.muted, marginTop: 4, lineHeight: 1.4 }}>{obs.notes}</div>}
                            </div>
                            <button onClick={() => deleteObservation(obs.id)} style={{ flexShrink: 0, padding: "2px 6px", fontSize: 9, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 3, cursor: "pointer", marginTop: 1 }}>✕</button>
                          </div>
                        )
                      })}
                    </div>
                  )}
                </div>

                {/* Step 5 footer */}
                <div style={{ padding: "10px 16px 16px", borderTop: `1px solid ${C.border}`, display: "flex", flexDirection: "column", gap: 7 }}>
                  <button onClick={() => setObsClosed(!sv.observationsClosed)} style={{ width: "100%", padding: "9px", fontSize: 10.5, fontWeight: 700, letterSpacing: "0.05em", textTransform: "uppercase", borderRadius: 5, cursor: "pointer", background: sv.observationsClosed ? "transparent" : "#16202A", color: sv.observationsClosed ? C.muted : "#fff", border: sv.observationsClosed ? `1px solid ${C.border}` : "none" }}>
                    {sv.observationsClosed ? "Back to observations" : "Done adding observations"}
                  </button>
                  {cippMissing > 0 && sv.observationsClosed && (
                    <div style={{ padding: "7px 10px", borderRadius: 5, background: "#FEF2F2", border: "1px solid #FECACA", fontSize: 9.5, color: "#DC2626" }}>
                      {cippMissing} CIPP concern{cippMissing !== 1 ? "s" : ""} still need a depth and both locate images before you can continue.
                    </div>
                  )}
                  <button disabled={!step5Complete} onClick={() => { if (step5Complete) { updateVideo({ inspStep: Math.max(step, 6) }); setEditingStep(null) } }} style={{ width: "100%", padding: "10px", fontSize: 11, fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase", borderRadius: 6, cursor: step5Complete ? "pointer" : "default", background: step5Complete ? "#00803E" : C.card, color: step5Complete ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" }}>
                    Continue to Step 6 →
                  </button>
                </div>
            </div>
          )}
        </div>

                {/* ── Step 6 — Was the pipe fully inspected? ─────────────────── */}
                <div style={{ borderBottom: `1px solid ${C.border}`, opacity: isLocked(6) ? 0.45 : 1 }}>
                  {stepHdr(6, sv.fullyInspected ? [sv.fullyInspected, sv.notFullyReason].filter(Boolean).join(" — ") : undefined)}
                  {isActive(6) && (
                    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 9.5, color: C.muted, fontStyle: "italic", lineHeight: 1.4 }}>A separate judgement from why the camera stopped. A camera can reach the city main and still show nothing useable for forty feet because the line was full of grease.</div>
                      <div>
                        <FieldLabel text="WAS THE PIPE FULLY INSPECTED? *" />
                        <div style={{ display: "flex", gap: 6 }}>
                          {(["Yes","Partially","No"] as const).map(v => (
                            <button key={v} onClick={() => setStep6Form(f => ({ ...f, fullyInspected: v }))} style={{ flex: 1, padding: "7px", fontSize: 11, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: step6Form.fullyInspected === v ? (v === "Yes" ? "#E8F4EF" : v === "No" ? "#FEF2F2" : "#FFFBF0") : C.card, color: step6Form.fullyInspected === v ? (v === "Yes" ? "#00803E" : v === "No" ? "#DC2626" : "#A96B00") : C.muted, border: `1.5px solid ${step6Form.fullyInspected === v ? (v === "Yes" ? "#00803E" : v === "No" ? "#DC2626" : "#A96B00") : C.border}` }}>{v}</button>
                          ))}
                        </div>
                      </div>
                      {step6Form.fullyInspected && step6Form.fullyInspected !== "Yes" && (
                        <>
                          <div>
                            <FieldLabel text="WHY NOT FULLY INSPECTED *" />
                            <select value={step6Form.notFullyReason} onChange={e => setStep6Form(f => ({ ...f, notFullyReason: e.target.value }))} style={{ ...inputSt, paddingRight: 8 }}>
                              <option value="">— select —</option>
                              {NOT_FULLY_REASON_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          </div>
                          <div>
                            <FieldLabel text="FOOTAGE ACTUALLY ASSESSABLE" />
                            <FootageRow footage={step6Form.assessableFootage} onChange={v => setStep6Form(f => ({ ...f, assessableFootage: v }))} />
                          </div>
                        </>
                      )}
                      <button
                        disabled={!step6Form.fullyInspected || (step6Form.fullyInspected !== "Yes" && !step6Form.notFullyReason)}
                        onClick={() => { updateVideo({ fullyInspected: step6Form.fullyInspected as "Yes"|"Partially"|"No", notFullyReason: step6Form.notFullyReason, assessableFootage: step6Form.assessableFootage, inspStep: Math.max(step, 7) }); setEditingStep(null) }}
                        style={{ width: "100%", padding: "9px", fontSize: 10.5, fontWeight: 700, borderRadius: 5, cursor: "pointer", background: (step6Form.fullyInspected && (step6Form.fullyInspected === "Yes" || step6Form.notFullyReason)) ? "#16202A" : C.card, color: (step6Form.fullyInspected && (step6Form.fullyInspected === "Yes" || step6Form.notFullyReason)) ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" }}
                      >
                        {editingStep === 6 ? "Save Changes" : "Next →"}
                      </button>
                    </div>
                  )}
                </div>

                {/* ── Step 7 — Characteristics ──────────────────────────────── */}
                <div style={{ opacity: isLocked(7) ? 0.45 : 1 }}>
                  {stepHdr(7, sv.characteristics ? `${sv.characteristics.length} change point${sv.characteristics.length !== 1 ? "s" : ""}` : undefined)}
                  {isActive(7) && (
                    <div style={{ padding: "0 16px 16px", display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 9.5, color: C.muted, lineHeight: 1.4 }}>A row is a change point. Add one whenever depth or what's above the ground changes — a new row copies the one above it, so you edit only what moved. Pipe material and size changes are logged as observations in step 5.</div>
                      {/* Characteristics table */}
                      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                        {/* Header */}
                        <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 1fr 1fr", gap: 6, padding: "4px 8px", fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>
                          <div />
                          <div>LENGTH</div>
                          <div>DEPTH</div>
                          <div>ABOVE GROUND</div>
                        </div>
                        {step7Rows.map((row, idx) => {
                          const isMunicipal = MUNICIPAL_SURFACES.includes(row.aboveGround)
                          const imgs = row.images ?? []
                          return (
                            <div key={row.id} style={{ borderRadius: 5, background: C.card, border: `1px solid ${isMunicipal ? "#F59E0B44" : C.border}`, overflow: "hidden" }}>
                              {/* Fields row */}
                              <div style={{ display: "grid", gridTemplateColumns: "56px 1fr 1fr 1fr", gap: 6, alignItems: "center", padding: "6px 8px", position: "relative" }}>
                                <div style={{ fontSize: 9, fontWeight: 700, color: C.muted }}>
                                  {row.isStart ? "START" : row.isEnd ? "END" : `${idx}`}
                                  {isMunicipal && <span style={{ marginLeft: 4, color: "#A96B00" }}>⚠</span>}
                                </div>
                                <div>
                                  {row.isStart
                                    ? <span style={{ fontSize: 11, fontFamily: "JetBrains Mono", fontWeight: 700, color: C.dim }}>0 ft</span>
                                    : <input type="number" value={row.length} onChange={e => setStep7Rows(rs => rs.map(r => r.id === row.id ? { ...r, length: e.target.value } : r))} style={{ ...inputSt, padding: "4px 6px", fontSize: 10 }} placeholder="ft" />
                                  }
                                </div>
                                <input type="number" value={row.depth} onChange={e => setStep7Rows(rs => rs.map(r => r.id === row.id ? { ...r, depth: e.target.value } : r))} style={{ ...inputSt, padding: "4px 6px", fontSize: 10 }} placeholder="ft" />
                                <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                                  <select value={row.aboveGround} onChange={e => { const ag = e.target.value; setStep7Rows(rs => rs.map(r => r.id === row.id ? { ...r, aboveGround: ag, ownership: ownershipFor(ag) } : r)) }} style={{ ...inputSt, padding: "4px 4px", fontSize: 9 }}>
                                    <option value="">—</option>
                                    {ABOVE_GROUND_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                                  </select>
                                  {row.aboveGround === "Living Space(s)" && (
                                    <input value={row.unitNumbers ?? ""} onChange={e => setStep7Rows(rs => rs.map(r => r.id === row.id ? { ...r, unitNumbers: e.target.value } : r))} style={{ ...inputSt, padding: "3px 5px", fontSize: 9 }} placeholder="e.g. 3B, 3C" />
                                  )}
                                </div>
                                {!row.isStart && !row.isEnd && (
                                  <button onClick={() => setStep7Rows(rs => rs.filter(r => r.id !== row.id))} style={{ position: "absolute", top: 4, right: 6, fontSize: 9, color: "#DC2626", background: "none", border: "none", cursor: "pointer", lineHeight: 1 }}>✕</button>
                                )}
                              </div>
                              {/* Image upload section */}
                              <div style={{ borderTop: `1px solid ${C.border}`, padding: "6px 8px 8px", display: "flex", flexDirection: "column", gap: 5 }}>
                                <div style={{ fontSize: 8, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase" }}>Area Photos</div>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: 5, alignItems: "center" }}>
                                  {imgs.map((name, i) => (
                                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 7px 3px 8px", borderRadius: 4, background: "#E8F4EF", border: "1px solid #00803E33" }}>
                                      <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><rect x="0.5" y="0.5" width="9" height="9" rx="1.5" stroke="#00803E" strokeWidth="1"/><path d="M1 7l2-2 1.5 1.5 2-2.5 2.5 3" stroke="#00803E" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round"/></svg>
                                      <span style={{ fontSize: 8.5, color: "#00803E", fontWeight: 600, maxWidth: 80, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{name}</span>
                                      <button onClick={() => setStep7Rows(rs => rs.map(r => r.id === row.id ? { ...r, images: r.images?.filter((_, j) => j !== i) } : r))} style={{ fontSize: 9, color: "#DC2626", background: "none", border: "none", cursor: "pointer", padding: 0, lineHeight: 1 }}>✕</button>
                                    </div>
                                  ))}
                                  <label style={{ display: "flex", alignItems: "center", gap: 4, padding: "3px 8px", borderRadius: 4, background: C.panel, border: `1.5px dashed ${C.border}`, cursor: "pointer", fontSize: 8.5, color: C.muted, fontWeight: 600 }}>
                                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none"><circle cx="5" cy="5" r="4.5" stroke="currentColor" strokeWidth="1"/><path d="M5 2.5v5M2.5 5h5" stroke="currentColor" strokeWidth="1" strokeLinecap="round"/></svg>
                                    Add Photo
                                    <input type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => {
                                      const files = Array.from(e.target.files ?? []).map(f => f.name)
                                      if (files.length) setStep7Rows(rs => rs.map(r => r.id === row.id ? { ...r, images: [...(r.images ?? []), ...files] } : r))
                                      e.target.value = ""
                                    }} />
                                  </label>
                                </div>
                              </div>
                            </div>
                          )
                        })}
                      </div>
                      <button onClick={() => {
                        const above = step7Rows[step7Rows.length - 2] // last before END
                        const endIdx = step7Rows.findIndex(r => r.isEnd)
                        const newRow: CharRow = { id: `chr${Date.now()}`, length: "", depth: above?.depth ?? "", aboveGround: above?.aboveGround ?? "", ownership: above ? ownershipFor(above.aboveGround) : "Association" }
                        setStep7Rows(rs => { const c = [...rs]; c.splice(endIdx, 0, newRow); return c })
                      }} style={{ padding: "7px", fontSize: 10, fontWeight: 700, background: C.card, color: C.cyan, border: `1.5px solid ${C.cyan}44`, borderRadius: 5, cursor: "pointer" }}>+ Add change</button>
                      <button
                        disabled={step7Rows.some(r => !r.length || !r.depth || !r.aboveGround)}
                        onClick={() => {
                          updateVideo({ characteristics: step7Rows, inspStep: 8 })
                          setEditingStep(null)
                        }}
                        style={{ width: "100%", padding: "10px", fontSize: 11, fontWeight: 700, borderRadius: 6, cursor: step7Rows.every(r => r.length || r.isStart) && step7Rows.every(r => r.depth) && step7Rows.every(r => r.aboveGround) ? "pointer" : "default", background: step7Rows.every(r => r.length || r.isStart) && step7Rows.every(r => r.depth) && step7Rows.every(r => r.aboveGround) ? "#00803E" : C.card, color: step7Rows.every(r => r.length || r.isStart) && step7Rows.every(r => r.depth) && step7Rows.every(r => r.aboveGround) ? "#fff" : C.dim, borderTop: "none", borderRight: "none", borderBottom: "none", borderLeft: "none" }}
                      >
                        Finish Inspection ✓
                      </button>
                    </div>
                  )}
                  {step >= 8 && !isActive(7) && (
                    <div style={{ padding: "10px 16px 14px", textAlign: "center" }}>
                      <div style={{ padding: "10px 14px", borderRadius: 7, background: "#E8F4EF", border: "1px solid #00803E44", fontSize: 11, fontWeight: 700, color: "#00803E" }}>✓ Inspection complete</div>
                    </div>
                  )}
                </div>

              </div>
              )
            })()}
          {/* Delete pipe at bottom */}
          <div style={{ marginTop: "auto", padding: "12px 16px 16px", borderTop: `1px solid ${C.border}`, flexShrink: 0 }}>
            <button onClick={() => deletePipe(selectedPipe.id)} style={{ width: "100%", padding: "8px", fontSize: 10.5, fontWeight: 700, background: "#FEF2F2", color: "#DC2626", border: "1px solid #FECACA", borderRadius: 5, cursor: "pointer", letterSpacing: "0.04em" }}>
              Delete Pipe Segment
            </button>
          </div>
        </div>
        )}
        </div>{/* end inner panel wrapper */}
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
                            {pipes.filter(p => !p.archived).map(pipe => {
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
                          {assets.filter(a => !a.archived).map(a => {
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

      {/* ── FIELD HISTORY OVERLAY ────────────────────────────────────────────────── */}
      {obsFieldHistoryField && selectedAsset && (() => {
        const fk = obsFieldHistoryField
        const myObs = assetObservations
          .filter(o => o.assetId === selectedAsset.id && o[fk] !== undefined)
          .sort((a, b) => b.observedAt - a.observedAt)
        const FIELD_LABELS_OVL: Partial<Record<keyof AssetObservation, string>> = {
          conditionRating: "Condition", depth: "Depth",
          accessSize: "Access size", accessConfig: "Access config",
          undergroundConn: "Underground conn", cameraAccessible: "Camera accessible",
          verticalPipeSize: "Vertical pipe size", horizontalPipeSize: "Horizontal pipe size",
          stackSize: "Stack size", stackMaterial: "Stack material",
          hasCleanout: "Has clean-out", cleanoutSize: "Clean-out size", cleanoutFitting: "Fitting",
          photos: "Photos",
        }
        function fmtFieldValue2(k: keyof AssetObservation, v: unknown): string {
          if (v === undefined || v === null) return "—"
          if (typeof v === "boolean") return v ? "Yes" : "No"
          if (k === "conditionRating") return typeof v === "number" ? CONDITION_LABELS[v] : String(v)
          if (k === "photos") return Array.isArray(v) ? String((v as string[]).filter(Boolean).length) + " photos" : "0"
          return String(v)
        }
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,25,35,0.45)", backdropFilter: "blur(2px)" }} onClick={() => setObsFieldHistoryField(null)} />
            <div style={{ position: "relative", background: C.panel, borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.22)", width: 380, maxWidth: "90vw", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.border}`, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <div style={{ fontSize: 10, fontWeight: 700, color: C.text, letterSpacing: "0.1em", textTransform: "uppercase" }}>{FIELD_LABELS_OVL[fk] ?? String(fk)}</div>
                <button onClick={() => setObsFieldHistoryField(null)} style={{ background: "none", border: "none", cursor: "pointer", color: C.muted, fontSize: 18, lineHeight: 1, padding: 0 }}>×</button>
              </div>
              <div style={{ padding: "12px 18px", maxHeight: 400, overflowY: "auto" }}>
                {myObs.length === 0
                  ? <div style={{ fontSize: 11, color: C.dim }}>No history for this field.</div>
                  : myObs.map((obs, i) => {
                    const v = visits.find(x => x.id === obs.visitId)
                    const person = SITE_PERSONS.find(p => p.id === obs.observedById)
                    const val = fmtFieldValue2(fk, obs[fk])
                    const isLatest = i === 0
                    return (
                      <div key={obs.id} style={{ paddingBottom: 12, marginBottom: 12, borderBottom: i < myObs.length - 1 ? `1px solid ${C.border}` : "none" }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 4 }}>
                          <span style={{ fontSize: 16, fontFamily: "JetBrains Mono", fontWeight: 700, color: isLatest ? C.cyan : C.text }}>{val}</span>
                          {isLatest && <span style={{ fontSize: 9, fontWeight: 700, color: C.cyan, letterSpacing: "0.08em" }}>CURRENT</span>}
                        </div>
                        <div style={{ fontSize: 10, color: C.muted }}>
                          {v?.visitType ?? "—"} · {new Date(obs.observedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })} · {person?.name ?? "—"} · {obs.jobNumber ?? "—"}
                        </div>
                        {obs.changeReason && obs.changeReason !== "unchanged" && (
                          <div style={{ fontSize: 9.5, color: obs.changeReason === "work-by-us" ? "#00803E" : obs.changeReason === "correction" ? C.muted : C.blue, marginTop: 3 }}>
                            {obs.changeReason === "work-by-us" ? "changed — work performed by us"
                              : obs.changeReason === "work-by-others" ? "changed — work by another party"
                              : "corrected — earlier reading was wrong"}
                          </div>
                        )}
                      </div>
                    )
                  })}
              </div>
            </div>
          </div>
        )
      })()}

      {/* ── OBSERVATION CHANGE DIALOG ─────────────────────────────────────────────── */}
      {obsChangeDialog && (() => {
        const { changes, depthOnly, onResolve } = obsChangeDialog
        const sinceObs = assetObservations
          .filter(o => selectedAsset && o.assetId === selectedAsset.id)
          .sort((a, b) => a.observedAt - b.observedAt)
          .slice(-1)[0]
        const sinceVisit = sinceObs ? visits.find(v => v.id === sinceObs.visitId) : null
        const sinceLabel = sinceVisit
          ? `${sinceVisit.visitType} · ${new Date(sinceObs!.observedAt).toLocaleDateString("en-US", { month: "long", day: "numeric" })}`
          : "the previous observation"
        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 300, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,25,35,0.45)", backdropFilter: "blur(2px)" }} />
            <div style={{ position: "relative", background: C.panel, borderRadius: 10, boxShadow: "0 8px 32px rgba(0,0,0,0.22)", width: 400, maxWidth: "90vw", overflow: "hidden" }}>
              <div style={{ padding: "14px 18px 10px", borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: C.text, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>Something Changed</div>
                <div style={{ fontSize: 10, color: C.muted }}>Since {sinceLabel}</div>
              </div>
              <div style={{ padding: "12px 18px" }}>
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 14 }}>
                  {changes.map(c => (
                    <div key={String(c.field)} style={{ display: "flex", gap: 8, fontSize: 11 }}>
                      <span style={{ flex: "0 0 130px", color: C.muted }}>
                        {({ conditionRating: "Condition", depth: "Depth", accessSize: "Access size", accessConfig: "Access config",
                          undergroundConn: "Underground conn", verticalPipeSize: "Vertical pipe size",
                          horizontalPipeSize: "Horizontal pipe size", stackSize: "Stack size",
                          stackMaterial: "Stack material", hasCleanout: "Has clean-out",
                          cleanoutSize: "Clean-out size", cleanoutFitting: "Fitting",
                          installDate: "Install date", cameraAccessible: "Camera accessible" } as Record<string, string>)[String(c.field)] ?? String(c.field)}
                      </span>
                      <span style={{ fontFamily: "JetBrains Mono", color: C.dim }}>{String(c.from ?? "—")}</span>
                      <span style={{ color: C.dim }}>→</span>
                      <span style={{ fontFamily: "JetBrains Mono", color: C.text, fontWeight: 700 }}>{String(c.to ?? "—")}</span>
                    </div>
                  ))}
                </div>
                <div style={{ fontSize: 11, fontWeight: 600, color: C.text, marginBottom: 10 }}>
                  {depthOnly ? "Was this a mismeasurement?" : "Was work performed on this asset?"}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {!depthOnly && (
                    <>
                      <button onClick={() => onResolve("work-by-us")} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, background: "#00803E", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left" }}>Yes — by us</button>
                      <button onClick={() => onResolve("work-by-others")} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 700, background: C.blue, color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", textAlign: "left" }}>Yes — by someone else</button>
                    </>
                  )}
                  <button onClick={() => onResolve("correction")} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", textAlign: "left" }}>No — the earlier reading was wrong</button>
                  {depthOnly && (
                    <button onClick={() => onResolve("unchanged")} style={{ padding: "10px 14px", fontSize: 11, fontWeight: 600, background: C.card, color: C.muted, border: `1px solid ${C.border}`, borderRadius: 6, cursor: "pointer", textAlign: "left" }}>Keep both readings</button>
                  )}
                </div>
              </div>
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
      {/* ── ARCHIVE DIALOG ─────────────────────────────────────────────────────── */}
      {archiveDialog && (() => {
        const rec = archiveDialog.type === "asset"
          ? assets.find(x => x.id === archiveDialog.id)
          : pipes.find(x => x.id === archiveDialog.id)
        if (!rec) return null
        const isAsset = archiveDialog.type === "asset"
        const connectedPipes = isAsset ? pipes.filter(p => !p.archived && (p.fromId === archiveDialog.id || p.toId === archiveDialog.id)) : []
        const assetRec = isAsset ? assets.find(x => x.id === archiveDialog.id) : null
        const pipeRec = !isAsset ? (rec as Pipe) : null
        const photoCount = assetRec ? (assetRec.photos ?? []).filter(Boolean).length : 0
        const assetVideoCount = (assetRec?.videos ?? []).length
        const assetObsCount = (assetRec?.videos ?? []).reduce((s, v) => s + v.observations.length, 0)
        const pipeVideoCount = pipeRec ? pipeRec.videos.length : 0
        const pipeObsCount = pipeRec ? pipeRec.videos.reduce((s, v) => s + v.observations.length, 0) : 0
        const hasCondition = assetRec?.conditionRating !== undefined
        const hasVideos = pipeRec ? pipeRec.videos.length > 0 : assetVideoCount > 0
        const tier = archiveDialog.tier

        return (
          <div style={{ position: "fixed", inset: 0, zIndex: 400, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <div style={{ position: "absolute", inset: 0, background: "rgba(15,25,35,0.45)", backdropFilter: "blur(2px)" }} onClick={() => setArchiveDialog(null)} />
            <div style={{ position: "relative", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 10, padding: 24, width: 460, boxShadow: "0 20px 60px rgba(0,0,0,0.2)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: tier === "archive" ? "#D97706" : "#DC2626", letterSpacing: "0.06em", textTransform: "uppercase", marginBottom: 14 }}>
                {tier === "archive" ? `Archive ${rec.label}?` : `Delete ${rec.label}?`}
              </div>

              {tier === "archive" ? (
                <>
                  {/* Context: type and location */}
                  <div style={{ marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.text }}>
                      {isAsset ? ASSET_META[assetRec!.type]?.label : "Pipe"}
                      {assetRec?.location ? ` · ${assetRec.location}` : ""}
                      {pipeRec ? ` · ${assets.find(a => a.id === pipeRec.fromId)?.label ?? "?"} → ${pipeRec.toId ? (assets.find(a => a.id === pipeRec.toId)?.label ?? "free") : "free"}` : ""}
                    </div>
                  </div>
                  {/* What's attached */}
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 12, padding: "10px 12px", background: C.card, border: `1px solid ${C.border}`, borderRadius: 6 }}>
                    <div style={{ fontWeight: 600, color: C.muted, marginBottom: 6 }}>This has history attached and will be archived, not deleted:</div>
                    {hasCondition && <div style={{ marginTop: 4, color: C.muted }}>• Condition rated {assetRec!.conditionRating}</div>}
                    {photoCount > 0 && <div style={{ marginTop: 4, color: C.muted }}>• {photoCount} photo{photoCount !== 1 ? "s" : ""}</div>}
                    {assetObsCount > 0 && <div style={{ marginTop: 4, color: C.muted }}>• {assetObsCount} observation{assetObsCount !== 1 ? "s" : ""} across {assetVideoCount} inspection{assetVideoCount !== 1 ? "s" : ""}</div>}
                    {pipeVideoCount > 0 && <div style={{ marginTop: 4, color: C.muted }}>• {pipeVideoCount} camera inspection{pipeVideoCount !== 1 ? "s" : ""} with {pipeObsCount} observation{pipeObsCount !== 1 ? "s" : ""}</div>}
                    {connectedPipes.length > 0 && <div style={{ marginTop: 4, color: C.muted }}>• {connectedPipes.length} connected pipe{connectedPipes.length !== 1 ? "s" : ""} — {connectedPipes.map(p => p.label).join(", ")}</div>}
                  </div>

                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 9, fontWeight: 700, color: C.muted, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>Reason *</div>
                    <select value={archiveDialog.archiveReason}
                      onChange={e => setArchiveDialog(prev => prev ? { ...prev, archiveReason: e.target.value } : null)}
                      style={{ width: "100%", padding: "8px 10px", fontSize: 11, background: C.card, border: `1px solid ${archiveDialog.archiveReason ? C.border : "#EF4444"}`, borderRadius: 5, color: archiveDialog.archiveReason ? C.text : C.muted, outline: "none" }}>
                      <option value="">Select…</option>
                      {ARCHIVE_REASONS.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </div>

                  {isAsset && connectedPipes.length > 0 && (
                    <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: C.muted, marginBottom: 14, cursor: "pointer" }}>
                      <input type="checkbox" checked={archiveDialog.alsoArchivePipes}
                        onChange={e => setArchiveDialog(prev => prev ? { ...prev, alsoArchivePipes: e.target.checked } : null)} />
                      Also archive the {connectedPipes.length} connected pipe{connectedPipes.length !== 1 ? "s" : ""}
                    </label>
                  )}

                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => setArchiveDialog(null)}
                      style={{ padding: "8px 18px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", color: C.muted }}>
                      Cancel
                    </button>
                    <button onClick={() => {
                        if (!archiveDialog.archiveReason) return
                        if (isAsset) commitArchiveAsset(archiveDialog.id, archiveDialog.archiveReason, archiveDialog.alsoArchivePipes)
                        else commitArchivePipe(archiveDialog.id, archiveDialog.archiveReason)
                      }}
                      disabled={!archiveDialog.archiveReason}
                      style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, background: archiveDialog.archiveReason ? "#D97706" : C.card, border: "none", borderRadius: 5, cursor: archiveDialog.archiveReason ? "pointer" : "not-allowed", color: archiveDialog.archiveReason ? "#fff" : C.dim }}>
                      Archive
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div style={{ fontSize: 11, color: C.dim, marginBottom: 14, lineHeight: 1.6 }}>
                    Added during this visit with nothing attached — no observations, photos or pipes.<br />
                    This will be removed completely.
                  </div>
                  <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
                    <button onClick={() => setArchiveDialog(null)}
                      style={{ padding: "8px 18px", fontSize: 11, background: C.card, border: `1px solid ${C.border}`, borderRadius: 5, cursor: "pointer", color: C.muted }}>
                      Cancel
                    </button>
                    <button onClick={() => {
                        if (isAsset) commitDeleteAsset(archiveDialog.id)
                        else commitDeletePipe(archiveDialog.id)
                      }}
                      style={{ padding: "8px 18px", fontSize: 11, fontWeight: 700, background: "#DC2626", border: "none", borderRadius: 5, cursor: "pointer", color: "#fff" }}>
                      Delete
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        )
      })()}

      {/* ── PHOTO LIGHTBOX ─────────────────────────────────────────────────────── */}
      {lightbox && (() => {
        const { srcs, labels, idx } = lightbox
        const prev = () => setLightbox(lb => lb ? { ...lb, idx: (lb.idx - 1 + lb.srcs.length) % lb.srcs.length } : null)
        const next = () => setLightbox(lb => lb ? { ...lb, idx: (lb.idx + 1) % lb.srcs.length } : null)
        const close = () => setLightbox(null)
        return (
          <div
            style={{ position: "fixed", inset: 0, zIndex: 600, background: "rgba(15,23,42,0.88)", display: "flex", alignItems: "center", justifyContent: "center" }}
            onClick={close}
            onKeyDown={e => { if (e.key === "Escape") close(); if (e.key === "ArrowLeft") prev(); if (e.key === "ArrowRight") next() }}
            tabIndex={-1}
            ref={el => el?.focus()}
          >
            {/* Counter top-left */}
            <div style={{ position: "absolute", top: 20, left: 24, fontSize: 11, color: "rgba(255,255,255,0.6)", fontFamily: "JetBrains Mono" }}>
              {idx + 1} of {srcs.length}
            </div>
            {/* Close top-right */}
            <button onClick={e => { e.stopPropagation(); close() }}
              style={{ position: "absolute", top: 16, right: 20, background: "none", border: "none", cursor: "pointer", color: "rgba(255,255,255,0.7)", fontSize: 22, lineHeight: 1, padding: 6 }}>✕</button>
            {/* Left arrow */}
            {srcs.length > 1 && (
              <button onClick={e => { e.stopPropagation(); prev() }}
                style={{ position: "absolute", left: 20, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, cursor: "pointer", color: "#fff", fontSize: 20, padding: "10px 14px" }}>‹</button>
            )}
            {/* Image */}
            <div onClick={e => e.stopPropagation()} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, maxWidth: "90vw", maxHeight: "90vh" }}>
              <img src={srcs[idx]} alt={labels[idx]}
                style={{ maxWidth: "100%", maxHeight: "80vh", objectFit: "contain", borderRadius: 6, boxShadow: "0 20px 80px #000a" }} />
              <div style={{ textAlign: "center" }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: "rgba(255,255,255,0.85)" }}>{labels[idx]}</div>
              </div>
            </div>
            {/* Right arrow */}
            {srcs.length > 1 && (
              <button onClick={e => { e.stopPropagation(); next() }}
                style={{ position: "absolute", right: 20, background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 8, cursor: "pointer", color: "#fff", fontSize: 20, padding: "10px 14px" }}>›</button>
            )}
          </div>
        )
      })()}

      {/* ── UNDO TOAST ─────────────────────────────────────────────────────────── */}
      {undoToast && (
        <div style={{ position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)", zIndex: 500, display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", background: C.panel, border: `1px solid ${C.border}`, borderRadius: 8, boxShadow: "0 8px 32px #0006", minWidth: 280 }}>
          <span style={{ fontSize: 12, color: C.text, flex: 1 }}>{undoToast.label}</span>
          <button onClick={() => { undoToast.onUndo(); clearTimeout(undoToast.timer); setUndoToast(null) }}
            style={{ padding: "4px 12px", fontSize: 11, fontWeight: 700, background: C.cyan, border: "none", borderRadius: 4, cursor: "pointer", color: "#fff" }}>
            Undo
          </button>
          <button onClick={() => { clearTimeout(undoToast.timer); setUndoToast(null) }}
            style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: C.muted, padding: "2px 4px" }}>✕</button>
        </div>
      )}

      </div>{/* end 3-col row wrapper */}
    </div>
  )
}
