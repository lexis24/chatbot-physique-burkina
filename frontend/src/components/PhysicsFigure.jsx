import React from "react"
import { detectFigureType } from "../lib/figureSpec"
import GeometryFigure from "./GeometryFigure"
import CircuitFigure from "./figures/CircuitFigure"
import ForcesFigure from "./figures/ForcesFigure"
import OpticsFigure from "./figures/OpticsFigure"
import GraphFigure from "./figures/GraphFigure"

const RENDERERS = {
  circuit: CircuitFigure,
  forces: ForcesFigure,
  optique: OpticsFigure,
  graphique: GraphFigure,
  geometrie: GeometryFigure,
}

/** Un schéma mal formé (JSON valide mais incohérent) ne doit jamais faire tomber tout le message
 * ou l'exercice qui le contient : il disparaît simplement, le texte reste lisible. */
class FigureBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { failed: false }
  }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  componentDidCatch(error) {
    console.warn("[PhysicsFigure] schéma ignoré :", error)
  }

  render() {
    return this.state.failed ? null : this.props.children
  }
}

/**
 * Schéma de physique décrit en JSON par le backend (blocs ```figure``` du chat, champ `figure`
 * des exercices) : circuit électrique, forces, optique, graphique ou figure géométrique. Le type
 * est lu dans `spec.type` (voir lib/figureSpec.js et FIGURE_SCHEMAS côté rag_system.py).
 */
export default function PhysicsFigure({ spec }) {
  const Renderer = RENDERERS[detectFigureType(spec)]
  if (!Renderer) return null
  return (
    <FigureBoundary>
      <Renderer spec={spec} />
    </FigureBoundary>
  )
}
