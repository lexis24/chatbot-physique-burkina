import React from "react"
import { useIsMobile } from "../lib/useMediaQuery"

/**
 * Fond décoratif : quelques formes floues et colorées, fixes derrière le contenu.
 * Purement visuel (pointer-events-none), s'adapte au thème clair/sombre via les couleurs daisyUI.
 * Ne se monte pas sous 768px : animation continue invisible pour l'utilisateur mais coûteuse en
 * batterie/GPU sur de l'Android bas de gamme (voir RAPPORT_MOBILE.md §9).
 */
export default function BackgroundBlobs() {
  const isMobile = useIsMobile()
  if (isMobile) return null
  return (
    <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div
        className="absolute inset-0 opacity-[0.35] dark:opacity-[0.2]"
        style={{
          backgroundImage: "radial-gradient(circle, rgba(100,116,139,0.6) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="absolute -top-24 -left-20 h-72 w-72 rounded-full bg-primary/25 blur-3xl animate-float-slow" />
      <div className="absolute top-1/3 -right-24 h-96 w-96 rounded-full bg-secondary/20 blur-3xl animate-float-slower" />
      <div className="absolute bottom-0 left-1/4 h-80 w-80 rounded-full bg-accent/15 blur-3xl animate-float-slow" />
      <div className="absolute bottom-10 right-1/3 h-64 w-64 rounded-full bg-secondary/15 blur-3xl animate-float-slower" />
    </div>
  )
}
