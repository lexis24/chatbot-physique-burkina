import React, { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

/**
 * Fenêtre modale centrée (bureau) — pendant de BottomSheet.jsx (mobile) : même contrat
 * (open/onClose/title/children), même comportement (Échap ferme, clic sur le fond ferme,
 * défilement de la page verrouillé pendant l'ouverture), mais ancrée au centre de l'écran plutôt
 * que remontant du bas. Utilisée par AboutPanel.jsx.
 *
 * Centrage en flexbox (fond plein écran + `items-center justify-center`), PAS en
 * `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2` : ces classes Tailwind positionnent via
 * `transform`, propriété que framer-motion écrase entièrement par son propre `style.transform`
 * dès qu'on anime `scale`/`x`/`y` sur le même élément (le style inline gagne toujours sur les
 * classes CSS) — la boîte se retrouvait alors collée à son coin haut-gauche au centre de l'écran
 * au lieu d'être centrée. Le flexbox ne touche pas à `transform`, donc pas de conflit.
 */
export default function Modal({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    // Mémorisé à l'ouverture pour lui rendre le focus à la fermeture (accessibilité clavier) :
    // sans ça, le focus retombe sur <body> et un utilisateur au clavier perd sa position.
    const triggerEl = document.activeElement
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = "hidden"
    return () => {
      document.removeEventListener("keydown", handleKeyDown)
      document.body.style.overflow = previousOverflow
      triggerEl?.focus?.()
    }
  }, [open, onClose])

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-40 flex items-center justify-center bg-black/40 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={onClose}
          aria-hidden="true"
        >
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            // Empêche un clic à l'intérieur de la boîte de remonter jusqu'au fond (qui fermerait
            // la modale) — le fond et la boîte partagent maintenant le même conteneur flex.
            onClick={(e) => e.stopPropagation()}
            className="z-50 flex max-h-[85vh] w-full max-w-[720px] flex-col overflow-hidden rounded-2xl bg-base-100 shadow-2xl"
            initial={{ opacity: 0, scale: 0.96, y: 8 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 8 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 px-5 py-3.5">
              <span className="font-heading text-base font-semibold text-base-content">{title}</span>
              <button
                type="button"
                onClick={onClose}
                title="Fermer"
                className="flex h-9 w-9 items-center justify-center rounded-full text-base-content/60 hover:bg-base-200"
              >
                <X size={18} />
              </button>
            </div>
            <div className="scrollbar-thin overflow-y-auto p-5">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
