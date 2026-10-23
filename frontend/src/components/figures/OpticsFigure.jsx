import React from "react"
import { asArray, boundsOf, makeProjector, splitSegmentName, stripKind, toNum, toPoint } from "../../lib/figureSpec"
import { Arrow, ArrowHead, FigureFrame, HatchedLine, Label, STROKE, VIEW_HEIGHT, VIEW_WIDTH } from "./svg"

const PADDING = { top: 30, right: 30, bottom: 30, left: 30 }

/**
 * Schéma d'optique : axe optique horizontal (y = 0), lentilles minces, miroirs plans, écrans et
 * obstacles, source ponctuelle, foyers, objets et images (flèches perpendiculaires à l'axe),
 * rayons lumineux (lignes brisées fléchées, pointillées si virtuelles).
 */
export default function OpticsFigure({ spec }) {
  const elements = asArray(spec.elements).map((e) => ({ ...e, kind: stripKind(e?.type) }))
  const objets = asArray(spec.objets).map((o) => ({ ...o, x: toNum(o?.x, NaN), h: toNum(o?.hauteur, NaN) })).filter((o) => Number.isFinite(o.x) && Number.isFinite(o.h))
  const images = asArray(spec.images).map((o) => ({ ...o, x: toNum(o?.x, NaN), h: toNum(o?.hauteur, NaN) })).filter((o) => Number.isFinite(o.x) && Number.isFinite(o.h))
  const rayons = asArray(spec.rayons).map((r) => ({ ...r, pts: asArray(r?.points).map(toPoint).filter(Boolean) })).filter((r) => r.pts.length >= 2)
  const foyers = asArray(spec.foyers).map((f) => ({ ...f, x: toNum(f?.x, NaN) })).filter((f) => Number.isFinite(f.x))
  if (elements.length === 0 && rayons.length === 0) return null

  const extent = [[0, 0]]
  for (const e of elements) {
    const x = toNum(e.x, 0)
    const h = toNum(e.hauteur, 0)
    if (e.kind === "source") extent.push(toPoint(e.position))
    else if (toPoint(e.de) && toPoint(e.vers)) extent.push(toPoint(e.de), toPoint(e.vers))
    else if (e.bas != null || e.haut != null) extent.push([x, toNum(e.bas, 0)], [x, toNum(e.haut, 0)])
    else extent.push([x, h / 2], [x, -h / 2])
  }
  for (const o of [...objets, ...images]) extent.push([o.x, 0], [o.x, o.h])
  for (const f of foyers) extent.push([f.x, 0])
  for (const r of rayons) extent.push(...r.pts)
  const bounds = boundsOf(extent.filter(Boolean), 0.05)
  const { project } = makeProjector(bounds, { width: VIEW_WIDTH, height: VIEW_HEIGHT, padding: PADDING })

  const showAxis = spec.axe !== false
  const [axL, axY] = project([bounds.minX, 0])
  const [axR] = project([bounds.maxX, 0])

  const elementEls = elements.map((e, i) => {
    const x = toNum(e.x, 0)
    if (e.kind === "source") {
      const p = toPoint(e.position)
      if (!p) return null
      const [sx, sy] = project(p)
      return (
        <g key={`e-${i}`} className="text-accent">
          <circle cx={sx} cy={sy} r={4.5} fill="currentColor" />
          {[0, 60, 120, 180, 240, 300].map((a) => (
            <line key={a} x1={sx + 7 * Math.cos((a * Math.PI) / 180)} y1={sy + 7 * Math.sin((a * Math.PI) / 180)}
              x2={sx + 11 * Math.cos((a * Math.PI) / 180)} y2={sy + 11 * Math.sin((a * Math.PI) / 180)} stroke="currentColor" strokeWidth={1.3} />
          ))}
          {e.nom && <Label x={sx - 12} y={sy - 10} text={e.nom} anchor="end" />}
        </g>
      )
    }
    // Segment vertical par défaut (lentille, écran, obstacle, miroir) ; « de »/« vers » pour un
    // miroir incliné.
    let a = toPoint(e.de)
    let b = toPoint(e.vers)
    if (!a || !b) {
      const h = toNum(e.hauteur, 0)
      const bas = e.bas != null ? toNum(e.bas, 0) : -h / 2
      const haut = e.haut != null ? toNum(e.haut, 0) : h / 2
      a = [x, bas]
      b = [x, haut]
    }
    const [x1, y1] = project(a)
    const [x2, y2] = project(b)
    const nameEl = e.nom ? <Label x={x2 + 4} y={y2 - 8} text={e.nom} /> : null
    if (e.kind === "lentille_convergente" || e.kind === "lentille_divergente") {
      const conv = e.kind === "lentille_convergente"
      // Convergente : pointes vers l'extérieur ; divergente : pointes vers l'intérieur.
      const head = (tipX, tipY, fromX, fromY) => <ArrowHead x1={fromX} y1={fromY} x2={tipX} y2={tipY} size={9} />
      return (
        <g key={`e-${i}`} className="text-primary">
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={2.2} />
          {conv ? head(x2, y2, x2, y2 + 10) : head(x2, y2 + 8, x2, y2)}
          {conv ? head(x1, y1, x1, y1 - 10) : head(x1, y1 - 8, x1, y1)}
          {nameEl}
        </g>
      )
    }
    if (e.kind === "miroir_plan" || e.kind === "miroir") {
      return (
        <g key={`e-${i}`} className="text-primary">
          <HatchedLine x1={x1} y1={y1} x2={x2} y2={y2} side={e.cote === -1 ? -1 : 1} />
          {nameEl}
        </g>
      )
    }
    const thick = e.kind === "obstacle" || e.kind === "objet_opaque" ? 5 : 2.4
    return (
      <g key={`e-${i}`}>
        <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth={thick} />
        {nameEl}
      </g>
    )
  })

  const arrowObject = (o, i, isImage) => {
    const [x1, y1] = project([o.x, 0])
    const [x2, y2] = project([o.x, o.h])
    const names = splitSegmentName(o.nom)
    const virtual = isImage && o.virtuelle
    return (
      <g key={`${isImage ? "img" : "obj"}-${i}`} className={isImage ? "text-secondary" : "text-accent"}>
        <Arrow x1={x1} y1={y1} x2={x2} y2={y2} width={2.2} size={9} dashed={virtual} />
        {names ? (
          <>
            <Label x={x1} y={o.h >= 0 ? y1 + 16 : y1 - 8} text={names[0]} />
            <Label x={x2} y={o.h >= 0 ? y2 - 8 : y2 + 18} text={names[1]} />
          </>
        ) : (
          o.nom && <Label x={x2 + 12} y={y2} text={o.nom} anchor="start" />
        )}
      </g>
    )
  }

  const rayEls = rayons.map((r, i) => {
    const pts = r.pts.map(project)
    return (
      <g key={`r-${i}`} className="text-warning">
        <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke="currentColor" strokeWidth={1.4}
          strokeDasharray={r.virtuel ? "5 4" : undefined} />
        {!r.virtuel && pts.slice(1).map((p, k) => {
          const q = pts[k]
          const mx = (p[0] + q[0]) / 2
          const my = (p[1] + q[1]) / 2
          const len = Math.hypot(p[0] - q[0], p[1] - q[1]) || 1
          if (len < 24) return null
          return <ArrowHead key={k} x1={mx - ((p[0] - q[0]) / len) * 6} y1={my - ((p[1] - q[1]) / len) * 6} x2={mx + ((p[0] - q[0]) / len) * 4} y2={my + ((p[1] - q[1]) / len) * 4} size={7} />
        })}
      </g>
    )
  })

  const focusEls = foyers.map((f, i) => {
    const [x, y] = project([f.x, 0])
    return (
      <g key={`f-${i}`}>
        <line x1={x} y1={y - 5} x2={x} y2={y + 5} stroke="currentColor" strokeWidth={STROKE} />
        {f.nom && <Label x={x} y={y + 18} text={f.nom} fontSize={11} />}
      </g>
    )
  })

  const pointEls = asArray(spec.points).map((p, i) => {
    const pos = toPoint(p?.position)
    if (!pos || !p?.id) return null
    const [x, y] = project(pos)
    return (
      <g key={`p-${i}`}>
        <circle cx={x} cy={y} r={2.6} fill="currentColor" />
        <Label x={x - 7} y={y + 16} text={p.id} fontSize={11} />
      </g>
    )
  })

  const labelEls = asArray(spec.labels).map((l, i) => {
    const pos = toPoint(l?.position)
    if (!pos || l?.texte == null) return null
    const [x, y] = project(pos)
    return <Label key={`l-${i}`} x={x} y={y} text={l.texte} fontWeight={500} fontSize={11} />
  })

  return (
    <FigureFrame title={spec.titre} ariaLabel="Schéma d'optique">
      {showAxis && <line x1={axL} y1={axY} x2={axR} y2={axY} stroke="currentColor" strokeWidth={1} strokeDasharray="8 3 2 3" strokeOpacity={0.7} />}
      {rayEls}
      {elementEls}
      {objets.map((o, i) => arrowObject(o, i, false))}
      {images.map((o, i) => arrowObject(o, i, true))}
      {focusEls}
      {pointEls}
      {labelEls}
    </FigureFrame>
  )
}
