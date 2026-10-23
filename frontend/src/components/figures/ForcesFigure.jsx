import React from "react"
import { asArray, boundsOf, makeProjector, stripKind, toNum, toPoint } from "../../lib/figureSpec"
import { Arrow, FigureFrame, HatchedLine, Label, SERIES_COLORS, STROKE, VIEW_HEIGHT, VIEW_WIDTH } from "./svg"

const PADDING = { top: 30, right: 36, bottom: 30, left: 36 }

function rotate([x, y], [cx, cy], deg) {
  const r = (deg * Math.PI) / 180
  const dx = x - cx
  const dy = y - cy
  return [cx + dx * Math.cos(r) - dy * Math.sin(r), cy + dx * Math.sin(r) + dy * Math.cos(r)]
}

/** Contour d'un solide en coordonnées du schéma : rectangle (éventuellement incliné), cercle ou
 * polygone libre. */
function solidShape(s) {
  const forme = stripKind(s?.forme)
  if (forme === "cercle" || forme === "sphere" || forme === "poulie") {
    const c = toPoint(s.centre)
    const r = toNum(s.rayon, 0)
    return c && r > 0 ? { kind: "circle", c, r, extent: [[c[0] - r, c[1] - r], [c[0] + r, c[1] + r]] } : null
  }
  if (forme === "polygone") {
    const pts = asArray(s.points).map(toPoint).filter(Boolean)
    return pts.length >= 3 ? { kind: "polygon", pts, extent: pts } : null
  }
  const c = toPoint(s?.centre)
  const w = toNum(s?.largeur, 0)
  const h = toNum(s?.hauteur, 0)
  if (!c || w <= 0 || h <= 0) return null
  const angle = toNum(s.angle, 0)
  const corners = [[-w / 2, -h / 2], [w / 2, -h / 2], [w / 2, h / 2], [-w / 2, h / 2]]
    .map(([dx, dy]) => rotate([c[0] + dx, c[1] + dy], c, angle))
  return { kind: "polygon", pts: corners, extent: corners }
}

/**
 * Schéma de mécanique : solides, supports hachurés (sol, mur, plafond, plan incliné), fils,
 * vecteurs force nommés, points, angles et axes. Coordonnées libres, y vers le haut ; les
 * vecteurs sont dessinés à l'échelle de leurs coordonnées (à choisir proportionnelles aux
 * intensités quand elles sont connues).
 */
export default function ForcesFigure({ spec }) {
  const solids = asArray(spec.solides).map(solidShape).filter(Boolean)
  const forces = asArray(spec.forces)
    .map((f) => {
      const o = toPoint(f?.origine)
      const v = toPoint(f?.vecteur)
      return o && v ? { ...f, o, tip: [o[0] + v[0], o[1] + v[1]] } : null
    })
    .filter(Boolean)
  const supports = asArray(spec.supports).map((s) => ({ ...s, a: toPoint(s?.de), b: toPoint(s?.vers) })).filter((s) => s.a && s.b)
  const fils = asArray(spec.fils).map((f) => [toPoint(f?.de), toPoint(f?.vers)]).filter(([a, b]) => a && b)
  const points = asArray(spec.points).map((p) => ({ ...p, pos: toPoint(p?.position) })).filter((p) => p.pos && p.id)
  const axes = spec.axes && toPoint(spec.axes.origine) ? spec.axes : null
  if (solids.length === 0 && forces.length === 0) return null

  const all = [
    ...solids.flatMap((s) => s.extent),
    ...forces.flatMap((f) => [f.o, f.tip]),
    ...supports.flatMap((s) => [s.a, s.b]),
    ...fils.flat(),
    ...points.map((p) => p.pos),
    ...(axes ? [toPoint(axes.origine)] : []),
  ]
  const { project, scaleX } = makeProjector(boundsOf(all, 0.06), { width: VIEW_WIDTH, height: VIEW_HEIGHT, padding: PADDING })

  // Hachures du côté opposé aux solides (sous un sol, derrière un mur...) sauf choix explicite.
  const centroid = solids.length
    ? project(solids.flatMap((s) => s.extent).reduce((acc, p, _, arr) => [acc[0] + p[0] / arr.length, acc[1] + p[1] / arr.length], [0, 0]))
    : null

  const supportEls = supports.map((s, i) => {
    const [x1, y1] = project(s.a)
    const [x2, y2] = project(s.b)
    let side = s.cote === 1 || s.cote === -1 ? s.cote : 1
    if (!(s.cote === 1 || s.cote === -1) && centroid) {
      const len = Math.hypot(x2 - x1, y2 - y1) || 1
      const nx = (y2 - y1) / len
      const ny = -(x2 - x1) / len
      const towardSolids = (centroid[0] - x1) * nx + (centroid[1] - y1) * ny
      side = towardSolids > 0 ? -1 : 1
    }
    return <HatchedLine key={`s-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} side={side} />
  })

  const solidEls = solids.map((s, i) => {
    if (s.kind === "circle") {
      const [cx, cy] = project(s.c)
      return <circle key={`o-${i}`} cx={cx} cy={cy} r={s.r * scaleX} fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={STROKE} />
    }
    return (
      <polygon key={`o-${i}`} points={s.pts.map((p) => project(p).join(",")).join(" ")}
        fill="currentColor" fillOpacity={0.08} stroke="currentColor" strokeWidth={STROKE} />
    )
  })

  const filEls = fils.map(([a, b], i) => {
    const [x1, y1] = project(a)
    const [x2, y2] = project(b)
    return <line key={`f-${i}`} x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={1.3} />
  })

  const angleEls = asArray(spec.angles).map((a, i) => {
    const c = toPoint(a?.sommet)
    if (!c) return null
    const [cx, cy] = project(c)
    const start = toNum(a.debut, 0)
    const end = toNum(a.fin, 0)
    const r = 26
    // Angles en degrés, sens trigonométrique, mesurés dans le repère du schéma (y vers le haut).
    const pt = (deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy - r * Math.sin((deg * Math.PI) / 180)]
    const [sx, sy] = pt(start)
    const [ex, ey] = pt(end)
    const large = Math.abs(end - start) > 180 ? 1 : 0
    const sweep = end > start ? 0 : 1
    const [lx, ly] = [cx + (r + 14) * Math.cos((((start + end) / 2) * Math.PI) / 180), cy - (r + 14) * Math.sin((((start + end) / 2) * Math.PI) / 180)]
    return (
      <g key={`a-${i}`}>
        <path d={`M ${sx} ${sy} A ${r} ${r} 0 ${large} ${sweep} ${ex} ${ey}`} fill="none" stroke="currentColor" strokeWidth={1.3} />
        {a.label && <Label x={lx} y={ly + 4} text={a.label} fontSize={11} />}
      </g>
    )
  })

  const axisEls = axes ? (() => {
    const [ox, oy] = project(toPoint(axes.origine))
    return (
      <g className="text-base-content/50">
        <Arrow x1={ox} y1={oy} x2={ox + 46} y2={oy} width={1.1} size={6} />
        <Arrow x1={ox} y1={oy} x2={ox} y2={oy - 46} width={1.1} size={6} />
        <Label x={ox + 54} y={oy + 4} text={axes.x || "x"} fontSize={11} />
        <Label x={ox} y={oy - 52} text={axes.y || "y"} fontSize={11} />
      </g>
    )
  })() : null

  const forceEls = forces.map((f, i) => {
    const [x1, y1] = project(f.o)
    const [x2, y2] = project(f.tip)
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    // Nom posé au-delà de la pointe, légèrement décalé sur le côté pour ne pas chevaucher le trait.
    const lx = x2 + ux * 14 - uy * 10
    const ly = y2 + uy * 14 + ux * 10 + 4
    return (
      <g key={`F-${i}`} className={SERIES_COLORS[i % SERIES_COLORS.length]}>
        <Arrow x1={x1} y1={y1} x2={x2} y2={y2} width={2.2} size={10} />
        <circle cx={x1} cy={y1} r={2.6} fill="currentColor" />
        {f.nom && <Label x={lx} y={ly} text={f.nom} vector />}
      </g>
    )
  })

  const pointEls = points.map((p, i) => {
    const [x, y] = project(p.pos)
    return (
      <g key={`p-${i}`}>
        <circle cx={x} cy={y} r={2.8} fill="currentColor" />
        <Label x={x - 8} y={y - 7} text={p.id} anchor="end" />
      </g>
    )
  })

  const labelEls = asArray(spec.labels).map((l, i) => {
    const pos = toPoint(l?.position)
    if (!pos || l?.texte == null) return null
    const [x, y] = project(pos)
    return <Label key={`l-${i}`} x={x} y={y} text={l.texte} fontWeight={500} />
  })

  return (
    <FigureFrame title={spec.titre} ariaLabel="Schéma des forces">
      {supportEls}
      {solidEls}
      {filEls}
      {angleEls}
      {axisEls}
      {forceEls}
      {pointEls}
      {labelEls}
    </FigureFrame>
  )
}
