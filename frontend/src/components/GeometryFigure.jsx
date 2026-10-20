import React from "react"

const VIEW_PADDING = 32
const VIEW_WIDTH = 320
const VIEW_HEIGHT = 240
const POINT_RADIUS = 3.5
const RIGHT_ANGLE_SIZE = 14
const ARC_RADIUS = 20

function toNum(value, fallback = 0) {
  const n = Number(value)
  return Number.isFinite(n) ? n : fallback
}

function normalize(x, y) {
  const len = Math.hypot(x, y) || 1
  return [x / len, y / len]
}

function buildPointMap(points) {
  const map = new Map()
  for (const p of points || []) {
    if (!p || typeof p.id !== "string") continue
    map.set(p.id, { id: p.id, x: toNum(p.x), y: toNum(p.y), label: p.label ?? p.id })
  }
  return map
}

function computeBounds(pointMap, circles, labels) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of pointMap.values()) {
    minX = Math.min(minX, p.x)
    maxX = Math.max(maxX, p.x)
    minY = Math.min(minY, p.y)
    maxY = Math.max(maxY, p.y)
  }
  for (const c of circles || []) {
    const center = pointMap.get(c?.center)
    const r = toNum(c?.radius, 0)
    if (center && r > 0) {
      minX = Math.min(minX, center.x - r)
      maxX = Math.max(maxX, center.x + r)
      minY = Math.min(minY, center.y - r)
      maxY = Math.max(maxY, center.y + r)
    }
  }
  // Les étiquettes libres (longueurs, unités...) ont leurs propres coordonnées, potentiellement
  // en dehors du polygone/cercle : sans ça, un label placé un peu à l'écart des points serait
  // mis à l'échelle comme s'il n'existait pas et se retrouverait hors du cadre visible.
  for (const l of labels || []) {
    if (!l || l.text == null) continue
    minX = Math.min(minX, toNum(l.x))
    maxX = Math.max(maxX, toNum(l.x))
    minY = Math.min(minY, toNum(l.y))
    maxY = Math.max(maxY, toNum(l.y))
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  if (maxX - minX < 1e-6) {
    minX -= 1
    maxX += 1
  }
  if (maxY - minY < 1e-6) {
    minY -= 1
    maxY += 1
  }
  return { minX, maxX, minY, maxY }
}

/** Étiquette avec un léger fond opaque derrière le texte : reste lisible même posée sur un
 * trait, un remplissage de polygone ou une autre étiquette. */
function LabelText({ x, y, anchor = "middle", fontSize = 11, fontWeight, children }) {
  const text = String(children)
  const boxW = Math.max(text.length * fontSize * 0.62, fontSize) + 4
  const boxH = fontSize * 1.3
  const boxX = anchor === "middle" ? x - boxW / 2 : anchor === "end" ? x - boxW : x
  return (
    <g>
      <rect x={boxX} y={y - fontSize * 0.9} width={boxW} height={boxH} rx={3} className="fill-base-100" fillOpacity={0.82} />
      <text x={x} y={y} fontSize={fontSize} fontWeight={fontWeight} textAnchor={anchor} fill="currentColor">
        {text}
      </text>
    </g>
  )
}

/**
 * Rendu SVG d'une figure géométrique simple décrite en JSON (points, segments, angles,
 * polygones, cercles, étiquettes libres). Format produit par le backend via les blocs
 * ```figure ...``` ou le champ `figure` des exercices.
 */
export default function GeometryFigure({ spec }) {
  if (!spec || typeof spec !== "object") return null
  const pointMap = buildPointMap(spec.points)
  if (pointMap.size === 0) return null

  const { minX, maxX, minY, maxY } = computeBounds(pointMap, spec.circles, spec.labels)
  const rangeX = maxX - minX
  const rangeY = maxY - minY
  const availableW = VIEW_WIDTH - VIEW_PADDING * 2
  const availableH = VIEW_HEIGHT - VIEW_PADDING * 2
  const scale = Math.min(availableW / rangeX, availableH / rangeY)

  function project(x, y) {
    const sx = VIEW_PADDING + (x - minX) * scale
    const sy = VIEW_HEIGHT - (VIEW_PADDING + (y - minY) * scale)
    return [sx, sy]
  }

  const segments = (spec.segments || [])
    .map((s, i) => {
      const a = pointMap.get(s?.from)
      const b = pointMap.get(s?.to)
      if (!a || !b) return null
      const [x1, y1] = project(a.x, a.y)
      const [x2, y2] = project(b.x, b.y)
      return <line key={`seg-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1.75" />
    })
    .filter(Boolean)

  const polygons = (spec.polygons || [])
    .map((poly, i) => {
      const pts = (poly?.points || []).map((id) => pointMap.get(id)).filter(Boolean)
      if (pts.length < 3) return null
      const coords = pts.map((p) => project(p.x, p.y).join(",")).join(" ")
      return (
        <polygon
          key={`poly-${i}`}
          points={coords}
          fill={poly.fill ? "currentColor" : "none"}
          fillOpacity={poly.fill ? 0.08 : 0}
          stroke="currentColor"
          strokeWidth="1.75"
        />
      )
    })
    .filter(Boolean)

  const circles = (spec.circles || [])
    .map((c, i) => {
      const center = pointMap.get(c?.center)
      const r = toNum(c?.radius, 0)
      if (!center || r <= 0) return null
      const [cx, cy] = project(center.x, center.y)
      return <circle key={`circ-${i}`} cx={cx} cy={cy} r={r * scale} fill="none" stroke="currentColor" strokeWidth="1.75" />
    })
    .filter(Boolean)

  const angles = (spec.angles || [])
    .map((a, i) => {
      const vertex = pointMap.get(a?.vertex)
      const from = pointMap.get(a?.from)
      const to = pointMap.get(a?.to)
      if (!vertex || !from || !to) return null
      const [vx, vy] = project(vertex.x, vertex.y)
      const [fx, fy] = project(from.x, from.y)
      const [tx, ty] = project(to.x, to.y)
      const u1 = normalize(fx - vx, fy - vy)
      const u2 = normalize(tx - vx, ty - vy)

      if (a.right) {
        const p1 = [vx + u1[0] * RIGHT_ANGLE_SIZE, vy + u1[1] * RIGHT_ANGLE_SIZE]
        const p3 = [vx + u2[0] * RIGHT_ANGLE_SIZE, vy + u2[1] * RIGHT_ANGLE_SIZE]
        const p2 = [p1[0] + u2[0] * RIGHT_ANGLE_SIZE, p1[1] + u2[1] * RIGHT_ANGLE_SIZE]
        return (
          <polyline
            key={`ang-${i}`}
            points={[p1, p2, p3].map((p) => p.join(",")).join(" ")}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
          />
        )
      }

      const startAngle = Math.atan2(u1[1], u1[0])
      const rawEnd = Math.atan2(u2[1], u2[0])
      let delta = rawEnd - startAngle
      while (delta <= -Math.PI) delta += Math.PI * 2
      while (delta > Math.PI) delta -= Math.PI * 2
      const sweep = delta > 0 ? 1 : 0
      const sx = vx + Math.cos(startAngle) * ARC_RADIUS
      const sy = vy + Math.sin(startAngle) * ARC_RADIUS
      const ex = vx + Math.cos(startAngle + delta) * ARC_RADIUS
      const ey = vy + Math.sin(startAngle + delta) * ARC_RADIUS
      const path = `M ${sx} ${sy} A ${ARC_RADIUS} ${ARC_RADIUS} 0 0 ${sweep} ${ex} ${ey}`
      const midAngle = startAngle + delta / 2
      const labelX = vx + Math.cos(midAngle) * (ARC_RADIUS + 12)
      const labelY = vy + Math.sin(midAngle) * (ARC_RADIUS + 12)

      return (
        <g key={`ang-${i}`}>
          <path d={path} fill="none" stroke="currentColor" strokeWidth="1.5" />
          {a.label && <LabelText x={labelX} y={labelY}>{a.label}</LabelText>}
        </g>
      )
    })
    .filter(Boolean)

  const points = Array.from(pointMap.values()).map((p) => {
    const [x, y] = project(p.x, p.y)
    return (
      <g key={`pt-${p.id}`}>
        <circle cx={x} cy={y} r={POINT_RADIUS} fill="currentColor" />
        <LabelText x={x + 7} y={y - 7} anchor="start" fontSize={12} fontWeight={600}>
          {p.label}
        </LabelText>
      </g>
    )
  })

const pointScreenPositions = Array.from(pointMap.values()).map((p) => ({
    label: String(p.label).trim(),
    pos: project(p.x, p.y),
  }))

  // Le modèle répète parfois le nom d'un point ("A", "B"...) dans `labels` en plus de son
  // étiquette automatique : on ignore ces doublons pour éviter un texte dessiné deux fois.
  const labels = (spec.labels || [])
    .map((l, i) => {
      if (!l || l.text == null) return null
      const text = String(l.text).trim()
      const [x, y] = project(toNum(l.x), toNum(l.y))
      const duplicatesPoint = pointScreenPositions.some(
        (p) => p.label === text && Math.hypot(p.pos[0] - x, p.pos[1] - y) < 22
      )
      if (duplicatesPoint) return null
      return (
        <LabelText key={`lbl-${i}`} x={x} y={y}>
          {text}
        </LabelText>
      )
    })
    .filter(Boolean)

  return (
    <div className="my-2 flex justify-center">
      {/* SVG responsive : viewBox fixe (320x240, le tracé ne change pas) mais largeur fluide
          jusqu'à sa taille de conception — s'adapte aux petits écrans sans jamais s'agrandir
          au-delà sur un conteneur large (voir RAPPORT_MOBILE.md §8). */}
      <svg
        viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full max-w-[320px] overflow-visible text-base-content/80"
        role="img"
        aria-label={spec.title || "Figure géométrique"}
      >
        {polygons}
        {circles}
        {segments}
        {angles}
        {points}
        {labels}
      </svg>
    </div>
  )
}
