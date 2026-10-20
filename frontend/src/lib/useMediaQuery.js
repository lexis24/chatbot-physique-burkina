import { useEffect, useState } from "react"

/** S'abonne à une media query CSS et renvoie son état courant, mis à jour en direct (rotation
 * d'écran, redimensionnement de fenêtre...). SSR-safe : renvoie `false` tant que `window`
 * n'existe pas. */
export function useMediaQuery(query) {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false
  )

  useEffect(() => {
    const mql = window.matchMedia(query)
    const handler = (e) => setMatches(e.matches)
    setMatches(mql.matches)
    mql.addEventListener("change", handler)
    return () => mql.removeEventListener("change", handler)
  }, [query])

  return matches
}

// Correctifs d'affichage mobile (voir RAPPORT_MOBILE.md) : "mobile" = sous le breakpoint Tailwind
// `md` (768px), cohérent avec le reste du projet (`md:`/`lg:` déjà utilisés ailleurs).
export const MOBILE_QUERY = "(max-width: 767px)"

export function useIsMobile() {
  return useMediaQuery(MOBILE_QUERY)
}
