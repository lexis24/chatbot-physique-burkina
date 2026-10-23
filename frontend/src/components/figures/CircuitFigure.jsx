import React from "react"
import { asArray, boundsOf, makeProjector, stripKind, toPoint } from "../../lib/figureSpec"
import { Arrow, ArrowHead, FigureFrame, Label, STROKE, VIEW_HEIGHT, VIEW_WIDTH } from "./svg"

const PADDING = { top: 34, right: 40, bottom: 34, left: 40 }
const HALF = 14 // demi-longueur d'un symbole de composant, en pixels
const METER_LETTERS = { amperemetre: "A", voltmetre: "V", ohmmetre: "Ω", galvanometre: "G", moteur: "M" }

/** Symbole normalisé dessiné à plat, centré sur l'origine, entre x = -HALF et x = +HALF (les
 * fils d'arrivée sont tracés à part). `upright(text)` place un texte non tourné au centre. */
function Symbol({ kind, upright }) {
  const s = STROKE
  switch (kind) {
    case "pile":
    case "generateur":
    case "batterie":
      // Borne + = grande plaque fine (côté « vers »), borne - = petite plaque épaisse (côté « de »).
      return (
        <g>
          <line x1={-HALF} y1={0} x2={-4} y2={0} stroke="currentColor" strokeWidth={s} />
          <line x1={4} y1={0} x2={HALF} y2={0} stroke="currentColor" strokeWidth={s} />
          <line x1={-4} y1={-6} x2={-4} y2={6} stroke="currentColor" strokeWidth={3.2} />
          <line x1={4} y1={-12} x2={4} y2={12} stroke="currentColor" strokeWidth={s} />
        </g>
      )
    case "lampe":
      return (
        <g>
          <circle r={11} fill="none" stroke="currentColor" strokeWidth={s} />
          <line x1={-7.8} y1={-7.8} x2={7.8} y2={7.8} stroke="currentColor" strokeWidth={s} />
          <line x1={-7.8} y1={7.8} x2={7.8} y2={-7.8} stroke="currentColor" strokeWidth={s} />
        </g>
      )
    case "resistance":
    case "conducteur_ohmique":
    case "resistor":
    case "dipole":
      return <rect x={-HALF} y={-6} width={HALF * 2} height={12} className="fill-base-100" stroke="currentColor" strokeWidth={s} />
    case "fusible":
      return (
        <g>
          <rect x={-12} y={-5} width={24} height={10} className="fill-base-100" stroke="currentColor" strokeWidth={s} />
          <line x1={-HALF} y1={0} x2={HALF} y2={0} stroke="currentColor" strokeWidth={1.2} />
        </g>
      )
    case "interrupteur_ouvert":
    case "interrupteur":
      return (
        <g>
          <circle cx={-HALF} r={2.2} fill="currentColor" />
          <circle cx={HALF} r={2.2} fill="currentColor" />
          <line x1={-HALF} y1={0} x2={10} y2={-11} stroke="currentColor" strokeWidth={s} />
        </g>
      )
    case "interrupteur_ferme":
      return (
        <g>
          <circle cx={-HALF} r={2.2} fill="currentColor" />
          <circle cx={HALF} r={2.2} fill="currentColor" />
          <line x1={-HALF} y1={0} x2={HALF} y2={-1.5} stroke="currentColor" strokeWidth={s} />
        </g>
      )
    case "amperemetre":
    case "voltmetre":
    case "ohmmetre":
    case "galvanometre":
    case "moteur":
      return (
        <g>
          <circle r={11} className="fill-base-100" stroke="currentColor" strokeWidth={s} />
          {upright(METER_LETTERS[kind])}
        </g>
      )
    case "generateur_alternatif":
    case "gbf":
      return (
        <g>
          <circle r={11} className="fill-base-100" stroke="currentColor" strokeWidth={s} />
          <path d="M -6 0 C -4 -6, -1 -6, 0 0 S 4 6, 6 0" fill="none" stroke="currentColor" strokeWidth={1.4} />
        </g>
      )
    case "diode":
    case "del":
      // Sens passant de « de » vers « vers » (triangle pointé vers la cathode).
      return (
        <g>
          <line x1={-HALF} y1={0} x2={HALF} y2={0} stroke="currentColor" strokeWidth={s} />
          <polygon points="-7,-8 -7,8 6,0" className="fill-base-100" stroke="currentColor" strokeWidth={s} />
          <line x1={6} y1={-8} x2={6} y2={8} stroke="currentColor" strokeWidth={s} />
          {kind === "del" && (
            <g>
              <Arrow x1={0} y1={-10} x2={7} y2={-19} width={1.1} size={4} />
              <Arrow x1={5} y1={-8} x2={12} y2={-17} width={1.1} size={4} />
            </g>
          )}
        </g>
      )
    case "condensateur":
      return (
        <g>
          <line x1={-HALF} y1={0} x2={-3} y2={0} stroke="currentColor" strokeWidth={s} />
          <line x1={3} y1={0} x2={HALF} y2={0} stroke="currentColor" strokeWidth={s} />
          <line x1={-3} y1={-11} x2={-3} y2={11} stroke="currentColor" strokeWidth={2.4} />
          <line x1={3} y1={-11} x2={3} y2={11} stroke="currentColor" strokeWidth={2.4} />
        </g>
      )
    case "bobine":
      return (
        <path
          d={`M ${-HALF} 0 a 3.5 3.5 0 0 1 7 0 a 3.5 3.5 0 0 1 7 0 a 3.5 3.5 0 0 1 7 0 a 3.5 3.5 0 0 1 7 0`}
          fill="none" stroke="currentColor" strokeWidth={s}
        />
      )
    default:
      return <rect x={-HALF} y={-6} width={HALF * 2} height={12} className="fill-base-100" stroke="currentColor" strokeWidth={s} />
  }
}

/** Côté (+1 ou -1 le long de la normale nx, ny) le plus éloigné des autres composants : évite de
 * poser une étiquette ou une flèche de tension sur un dipôle voisin (ex: voltmètre en dérivation). */
function clearerSide(x, y, nx, ny, dist, obstacles) {
  const clearance = (side) => Math.min(Infinity, ...obstacles.map(([ox, oy]) => Math.hypot(x + nx * dist * side - ox, y + ny * dist * side - oy)))
  return clearance(-1) > clearance(1) + 4 ? -1 : 1
}

/** Position et ancrage d'une étiquette posée à `dist` pixels du point (x, y) le long de la
 * normale : à côté d'un dipôle vertical, le texte s'étend vers l'extérieur au lieu d'être centré
 * (il recouvrirait sinon le symbole). */
function labelPlacement(x, y, nx, ny, dist) {
  if (Math.abs(nx) > Math.abs(ny)) {
    return { x: x + nx * (dist - 8), y: y + 4, anchor: nx < 0 ? "end" : "start" }
  }
  return { x: x + nx * dist, y: y + ny * dist + 4, anchor: "middle" }
}

/**
 * Schéma électrique : composants posés entre deux nœuds d'une grille, fils, nœuds de dérivation,
 * flèches de courant et de tension. Coordonnées en unités de grille, y vers le haut.
 */
export default function CircuitFigure({ spec }) {
  const components = asArray(spec.composants)
    .map((c) => ({ ...c, a: toPoint(c?.de), b: toPoint(c?.vers), kind: stripKind(c?.type) }))
    .filter((c) => c.a && c.b)
  const wires = asArray(spec.fils).map((w) => asArray(w).map(toPoint).filter(Boolean)).filter((w) => w.length >= 2)
  if (components.length === 0) return null

  const all = [
    ...components.flatMap((c) => [c.a, c.b]),
    ...wires.flat(),
    ...asArray(spec.points).map((p) => toPoint(p?.position)),
  ]
  const { project } = makeProjector(boundsOf(all), { width: VIEW_WIDTH, height: VIEW_HEIGHT, padding: PADDING })

  const wireEls = wires.map((w, i) => (
    <polyline key={`w-${i}`} points={w.map((p) => project(p).join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth={STROKE} />
  ))

  // Centres des composants à l'écran : obstacles à éviter pour les étiquettes et les tensions.
  const centers = components.map((c) => {
    const [x1, y1] = project(c.a)
    const [x2, y2] = project(c.b)
    return [(x1 + x2) / 2, (y1 + y2) / 2]
  })

  // Positions des étiquettes de composants, remplies ci-dessous : les flèches de tension les
  // évitent aussi (sinon « U_L » se pose contre l'étiquette « L » de la lampe mesurée).
  const labelSpots = []

  const compEls = components.map((c, i) => {
    const [x1, y1] = project(c.a)
    const [x2, y2] = project(c.b)
    const cx = (x1 + x2) / 2
    const cy = (y1 + y2) / 2
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    const deg = (Math.atan2(uy, ux) * 180) / Math.PI
    // Normale « à gauche » du sens de/vers à l'écran (au-dessus pour un composant horizontal),
    // retournée si l'autre côté est plus dégagé — sauf choix explicite du modèle (cote_label).
    const others = centers.filter((_, k) => k !== i)
    const side = c.cote_label === -1 || c.cote_label === 1 ? c.cote_label : clearerSide(cx, cy, uy, -ux, 27, others)
    const nx = uy * side
    const ny = -ux * side
    const place = labelPlacement(cx, cy, nx, ny, 27)
    if (c.label) labelSpots.push([cx + nx * 27, cy + ny * 27])
    const upright = (text) => (
      <text x={0} y={4.5} fontSize={12} fontWeight={700} textAnchor="middle" fill="currentColor" transform={`rotate(${-deg})`}>
        {text}
      </text>
    )
    const isSource = ["pile", "generateur", "batterie"].includes(c.kind)
    return (
      <g key={`c-${i}`}>
        <line x1={x1} y1={y1} x2={cx - ux * HALF} y2={cy - uy * HALF} stroke="currentColor" strokeWidth={STROKE} />
        <line x1={cx + ux * HALF} y1={cy + uy * HALF} x2={x2} y2={y2} stroke="currentColor" strokeWidth={STROKE} />
        <g transform={`translate(${cx},${cy}) rotate(${deg})`}>
          <Symbol kind={c.kind} upright={upright} />
        </g>
        {isSource && (
          // Signe + du côté opposé à l'étiquette, près de la grande plaque.
          <text x={cx + ux * 9 - nx * 15} y={cy + uy * 9 - ny * 15 + 4} fontSize={12} fontWeight={700} textAnchor="middle" fill="currentColor">+</text>
        )}
        {c.label && <Label x={place.x} y={place.y} text={c.label} anchor={place.anchor} />}
      </g>
    )
  })

  const nodeEls = asArray(spec.noeuds).map(toPoint).filter(Boolean).map((p, i) => {
    const [x, y] = project(p)
    return <circle key={`n-${i}`} cx={x} cy={y} r={3.2} fill="currentColor" />
  })

  const currentEls = asArray(spec.courants).map((c, i) => {
    const a = toPoint(c?.de)
    const b = toPoint(c?.vers)
    if (!a || !b) return null
    const [x1, y1] = project(a)
    const [x2, y2] = project(b)
    // Flèche au milieu du segment, sauf si un composant l'occupe déjà (le modèle pose souvent le
    // courant sur le segment même du dipôle) : elle passe alors entre le symbole et l'extrémité.
    const sameSegment = (p, q) => (p[0] === a[0] && p[1] === a[1] && q[0] === b[0] && q[1] === b[1])
    const onComponent = components.some((c) => sameSegment(c.a, c.b) || sameSegment(c.b, c.a))
    const t = onComponent ? 0.84 : 0.5
    const mx = x1 + (x2 - x1) * t
    const my = y1 + (y2 - y1) * t
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    return (
      <g key={`i-${i}`} className="text-primary">
        <ArrowHead x1={mx - ux * 10} y1={my - uy * 10} x2={mx + ux * 5} y2={my + uy * 5} size={9} />
        {c.label && <Label x={mx + uy * 13} y={my - ux * 13 + 4} text={c.label} />}
      </g>
    )
  })

  // Flèche de tension parallèle au dipôle, décalée sur le côté (convention française : la
  // flèche de U_AB pointe vers A — c'est le modèle qui choisit « de »/« vers » en conséquence).
  const voltageEls = asArray(spec.tensions).map((t, i) => {
    const a = toPoint(t?.de)
    const b = toPoint(t?.vers)
    if (!a || !b) return null
    const [x1, y1] = project(a)
    const [x2, y2] = project(b)
    const len = Math.hypot(x2 - x1, y2 - y1) || 1
    const ux = (x2 - x1) / len
    const uy = (y2 - y1) / len
    const off = 20
    const mx = (x1 + x2) / 2
    const my = (y1 + y2) / 2
    // Côté le plus dégagé, en ignorant le dipôle mesuré lui-même (centre au milieu de la flèche).
    const others = [...centers.filter(([ox, oy]) => Math.hypot(ox - mx, oy - my) > 4), ...labelSpots]
    const side = t.cote === -1 || t.cote === 1 ? t.cote : clearerSide(mx, my, -uy, ux, off + 13, others)
    const nx = -uy * side
    const ny = ux * side
    const shrink = Math.min(10, len / 4)
    const place = labelPlacement(mx, my, nx, ny, off + 13)
    return (
      <g key={`u-${i}`} className="text-secondary">
        <Arrow
          x1={x1 + nx * off + ux * shrink} y1={y1 + ny * off + uy * shrink}
          x2={x2 + nx * off - ux * shrink} y2={y2 + ny * off - uy * shrink}
          width={1.4} size={7}
        />
        {t.label && <Label x={place.x} y={place.y} text={t.label} anchor={place.anchor} />}
      </g>
    )
  })

  const pointEls = asArray(spec.points).map((p, i) => {
    const pos = toPoint(p?.position)
    if (!pos || !p?.id) return null
    const [x, y] = project(pos)
    return <Label key={`p-${i}`} x={x - 9} y={y - 8} text={p.id} anchor="end" />
  })

  return (
    <FigureFrame title={spec.titre} ariaLabel="Schéma électrique">
      {wireEls}
      {compEls}
      {nodeEls}
      {currentEls}
      {voltageEls}
      {pointEls}
    </FigureFrame>
  )
}
