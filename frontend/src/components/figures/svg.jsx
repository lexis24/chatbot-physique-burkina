import React from "react"
import { parseLabel, labelLength } from "../../lib/figureSpec"

export const VIEW_WIDTH = 360
export const VIEW_HEIGHT = 260
export const STROKE = 1.75

/** Couleurs des vecteurs/séries successifs : classes de thème (clair/sombre) appliquées via
 * `currentColor`, comme le reste du schéma — c'est ce que l'export PDF (html2canvas) reproduit. */
export const SERIES_COLORS = ["text-primary", "text-secondary", "text-accent", "text-error", "text-success"]

// Style en ligne plutôt qu'une classe utilitaire : il l'emporte toujours sur ce que le <pre>
// parent impose (police à chasse fixe, white-space: pre), quel que soit l'ordre des feuilles CSS.
const FIGURE_TEXT_STYLE = { fontFamily: '"Source Sans 3", system-ui, -apple-system, "Segoe UI", sans-serif', whiteSpace: "normal" }

/** Cadre SVG commun : viewBox fixe, largeur fluide jusqu'à sa taille de conception (comme
 * GeometryFigure, voir RAPPORT_MOBILE.md §8), légende facultative sous le schéma. Police et
 * espacements forcés : un schéma du chat est rendu à l'intérieur du <pre> du bloc ```figure```,
 * dont il hériterait sinon la police à chasse fixe. */
export function FigureFrame({ title, ariaLabel, children, width = VIEW_WIDTH, height = VIEW_HEIGHT }) {
  return (
    <figure className="my-2 flex flex-col items-center" style={FIGURE_TEXT_STYLE}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="h-auto w-full overflow-visible text-base-content/80"
        style={{ maxWidth: width }}
        role="img"
        aria-label={title || ariaLabel}
      >
        {children}
      </svg>
      {title && <figcaption className="mt-1 text-center text-xs text-base-content/60">{title}</figcaption>}
    </figure>
  )
}

/** Pointe de flèche pleine en (x2, y2), orientée de (x1, y1) vers (x2, y2). Polygone explicite
 * plutôt qu'un <marker> SVG : les markers sont mal reproduits par html2canvas (export PDF). */
export function ArrowHead({ x1, y1, x2, y2, size = 8, className }) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const bx = x2 - ux * size
  const by = y2 - uy * size
  const w = size * 0.45
  const pts = [[x2, y2], [bx - uy * w, by + ux * w], [bx + uy * w, by - ux * w]]
  return <polygon points={pts.map((p) => p.join(",")).join(" ")} fill="currentColor" className={className} />
}

export function Arrow({ x1, y1, x2, y2, width = STROKE, size = 8, dashed = false, className }) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  // Le trait s'arrête à la base de la pointe : sinon son extrémité dépasse sous la pointe.
  const ex = x2 - ((x2 - x1) / len) * size * 0.8
  const ey = y2 - ((y2 - y1) / len) * size * 0.8
  return (
    <g className={className}>
      <line x1={x1} y1={y1} x2={ex} y2={ey} stroke="currentColor" strokeWidth={width} strokeDasharray={dashed ? "5 4" : undefined} />
      <ArrowHead x1={x1} y1={y1} x2={x2} y2={y2} size={size} />
    </g>
  )
}

/**
 * Étiquette avec fond légèrement opaque (lisible posée sur un trait), indices/exposants en
 * <tspan> décalés et petite flèche au-dessus pour un vecteur (voir parseLabel).
 */
export function Label({ x, y, text, anchor = "middle", fontSize = 12, fontWeight = 600, className, vector = false }) {
  const parsed = parseLabel(text)
  // `vector` force la flèche (noms de forces écrits en texte simple, « P », « F_1 »).
  if (vector) parsed.vector = true
  if (parsed.parts.length === 0) return null
  const width = Math.max(labelLength(parsed) * fontSize * 0.6, fontSize * 0.7) + 6
  const boxX = anchor === "middle" ? x - width / 2 : anchor === "end" ? x - width : x
  const top = y - fontSize * (parsed.vector ? 1.45 : 1.0)
  const height = y + fontSize * 0.45 - top
  const arrowY = y - fontSize * 1.05
  let shift = 0
  return (
    <g className={className}>
      <rect x={boxX} y={top} width={width} height={height} rx={3} className="fill-base-100" fillOpacity={0.85} />
      <text x={x} y={y} fontSize={fontSize} fontWeight={fontWeight} textAnchor={anchor} fill="currentColor">
        {parsed.parts.map((p, i) => {
          const target = p.kind === "sub" ? 0.3 : p.kind === "sup" ? -0.4 : 0
          const dy = (target - shift) * fontSize
          shift = target
          return (
            <tspan key={i} dy={dy || undefined} fontSize={p.kind === "normal" ? undefined : fontSize * 0.72}>
              {p.text}
            </tspan>
          )
        })}
      </text>
      {parsed.vector && (
        <Arrow x1={boxX + 4} y1={arrowY} x2={boxX + width - 3} y2={arrowY} width={1.1} size={4.5} />
      )}
    </g>
  )
}

/** Surface hachurée (sol, mur, plafond, plan incliné, miroir) : trait plein + hachures d'un côté.
 * `side` = 1 ou -1 choisit le côté des hachures (perpendiculaire au trait). */
export function HatchedLine({ x1, y1, x2, y2, side = 1, spacing = 9, length = 7 }) {
  const len = Math.hypot(x2 - x1, y2 - y1) || 1
  const ux = (x2 - x1) / len
  const uy = (y2 - y1) / len
  const nx = uy * side
  const ny = -ux * side
  const hatches = []
  for (let d = spacing / 2; d < len; d += spacing) {
    const px = x1 + ux * d
    const py = y1 + uy * d
    hatches.push(
      <line key={d} x1={px} y1={py} x2={px + (nx - ux) * length * 0.7} y2={py + (ny - uy) * length * 0.7}
        stroke="currentColor" strokeWidth={1} strokeOpacity={0.6} />
    )
  }
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={STROKE} />
      {hatches}
    </g>
  )
}
