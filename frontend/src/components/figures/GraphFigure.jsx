import React from "react"
import { asArray, formatNumber, makeProjector, niceTicks, stripKind, toNum, toPoint } from "../../lib/figureSpec"
import { Arrow, FigureFrame, Label, SERIES_COLORS, VIEW_HEIGHT, VIEW_WIDTH } from "./svg"

const PADDING = { top: 30, right: 62, bottom: 40, left: 52 }

/** Légende d'axe « grandeur (unité) », ex. « U (V) », « t (s) ». */
function axisTitle(axis, fallback) {
  const g = axis?.grandeur || fallback
  return axis?.unite ? `${g} (${axis.unite})` : g
}

function axisRange(axis, values) {
  let min = toNum(axis?.min, NaN)
  let max = toNum(axis?.max, NaN)
  if (!Number.isFinite(min)) min = Math.min(0, ...values)
  if (!Number.isFinite(max)) max = Math.max(...values, min + 1)
  if (max - min < 1e-9) max = min + 1
  return [min, max]
}

/**
 * Graphique de physique : axes gradués portant grandeur ET unité, séries de points de mesure
 * et/ou courbes (points échantillonnés reliés), repères (asymptote, période, valeur lue) et
 * annotations. Échelles indépendantes sur x et y, contrairement aux schémas.
 */
export default function GraphFigure({ spec }) {
  const series = asArray(spec.series)
    .map((s) => ({ ...s, pts: asArray(s?.points).map(toPoint).filter(Boolean), style: stripKind(s?.style || "points") }))
    .filter((s) => s.pts.length > 0)
  if (series.length === 0) return null

  const xs = series.flatMap((s) => s.pts.map((p) => p[0]))
  const ys = series.flatMap((s) => s.pts.map((p) => p[1]))
  const [xMin, xMax] = axisRange(spec.x, xs)
  const [yMin, yMax] = axisRange(spec.y, ys)
  const bounds = { minX: xMin, maxX: xMax, minY: yMin, maxY: yMax }
  const { project } = makeProjector(bounds, { width: VIEW_WIDTH, height: VIEW_HEIGHT, padding: PADDING, equal: false })

  // Les axes passent par zéro quand zéro est dans la plage, sinon par le bord du graphique.
  const x0 = xMin <= 0 && xMax >= 0 ? 0 : xMin
  const y0 = yMin <= 0 && yMax >= 0 ? 0 : yMin
  const [left, bottom] = project([xMin, yMin])
  const [right, top] = project([xMax, yMax])
  const [, axisY] = project([xMin, y0])
  const [axisX] = project([x0, yMin])

  const xTicks = niceTicks(xMin, xMax, spec.x?.pas)
  const yTicks = niceTicks(yMin, yMax, spec.y?.pas)

  const grid = (
    <g stroke="currentColor" strokeOpacity={0.12} strokeWidth={1}>
      {xTicks.map((t) => { const [x] = project([t, yMin]); return <line key={`gx-${t}`} x1={x} y1={top} x2={x} y2={bottom} /> })}
      {yTicks.map((t) => { const [, y] = project([xMin, t]); return <line key={`gy-${t}`} x1={left} y1={y} x2={right} y2={y} /> })}
    </g>
  )

  const tickLabels = (
    <g fontSize={10} fill="currentColor" fillOpacity={0.75}>
      {xTicks.map((t) => {
        const [x] = project([t, yMin])
        return t === x0 && y0 === 0 && x0 === 0 ? null : <text key={`tx-${t}`} x={x} y={axisY + 13} textAnchor="middle">{formatNumber(t)}</text>
      })}
      {yTicks.map((t) => {
        const [, y] = project([xMin, t])
        return <text key={`ty-${t}`} x={axisX - 5} y={y + 3.5} textAnchor="end">{formatNumber(t)}</text>
      })}
    </g>
  )

  const seriesEls = series.map((s, i) => {
    const pts = s.pts.map(project)
    const showLine = s.style.includes("ligne") || s.style.includes("courbe")
    const showPoints = s.style.includes("point") || !showLine
    return (
      <g key={`s-${i}`} className={SERIES_COLORS[i % SERIES_COLORS.length]}>
        {showLine && <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth={2} />}
        {showPoints && pts.map(([x, y], k) => (
          // Points de mesure en croix, comme sur une feuille de TP.
          <g key={k} stroke="currentColor" strokeWidth={1.6}>
            <line x1={x - 3.5} y1={y - 3.5} x2={x + 3.5} y2={y + 3.5} />
            <line x1={x - 3.5} y1={y + 3.5} x2={x + 3.5} y2={y - 3.5} />
          </g>
        ))}
      </g>
    )
  })

  const reperes = asArray(spec.reperes).map((r, i) => {
    const v = toNum(r?.valeur, NaN)
    if (!Number.isFinite(v)) return null
    if (r.axe === "y") {
      const [, y] = project([xMin, v])
      return (
        <g key={`r-${i}`}>
          <line x1={left} y1={y} x2={right} y2={y} stroke="currentColor" strokeDasharray="5 4" strokeWidth={1.1} />
          {r.label && <Label x={right + 4} y={y + 4} text={r.label} anchor="start" fontSize={11} />}
        </g>
      )
    }
    const [x] = project([v, yMin])
    // Étiquette juste à droite du trait, en haut du cadre : au-dessus, elle chevaucherait le
    // titre de l'axe vertical dès que le repère est proche de l'origine.
    return (
      <g key={`r-${i}`}>
        <line x1={x} y1={top} x2={x} y2={bottom} stroke="currentColor" strokeDasharray="5 4" strokeWidth={1.1} />
        {r.label && <Label x={x + 4} y={top + 12} text={r.label} anchor="start" fontSize={11} />}
      </g>
    )
  })

  const legend = series.filter((s) => s.nom).length > 1 && (
    <g fontSize={10}>
      {series.map((s, i) => s.nom && (
        <g key={`lg-${i}`} className={SERIES_COLORS[i % SERIES_COLORS.length]}>
          <line x1={left + 6} y1={top + 8 + i * 14} x2={left + 20} y2={top + 8 + i * 14} stroke="currentColor" strokeWidth={2} />
          <Label x={left + 24} y={top + 12 + i * 14} text={s.nom} anchor="start" fontSize={10} fontWeight={500} />
        </g>
      ))}
    </g>
  )

  const annotations = asArray(spec.annotations).map((a, i) => {
    const pos = toPoint(a?.position)
    if (!pos || a?.texte == null) return null
    const [x, y] = project(pos)
    return <Label key={`an-${i}`} x={x} y={y} text={a.texte} fontSize={11} fontWeight={500} />
  })

  return (
    <FigureFrame title={spec.titre} ariaLabel="Graphique">
      {grid}
      <g className="text-base-content">
        <Arrow x1={left - 4} y1={axisY} x2={right + 14} y2={axisY} width={1.3} size={7} />
        <Arrow x1={axisX} y1={bottom + 4} x2={axisX} y2={top - 14} width={1.3} size={7} />
        <Label x={right + 16} y={axisY - 9} text={axisTitle(spec.x, "x")} anchor="end" fontSize={11} />
        <Label x={axisX + 6} y={top - 16} text={axisTitle(spec.y, "y")} anchor="start" fontSize={11} />
      </g>
      {tickLabels}
      {reperes}
      {seriesEls}
      {annotations}
      {legend}
    </FigureFrame>
  )
}
