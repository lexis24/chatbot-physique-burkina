import React, { useEffect } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { X } from "lucide-react"

/**
 * Feuille modale remontant du bas de l'écran (pas un menu déroulant) : cibles plus grandes,
 * geste attendu près du pouce sur mobile — voir RAPPORT_MOBILE.md. Utilisée par le lien « Comment
 * ça marche ? » sous le champ de saisie, le bouton « ⋯ » de ChatInput, et d'autres feuilles
 * (Réglages/Historique, profil).
 */
export default function BottomSheet({ open, onClose, title, children }) {
  useEffect(() => {
    if (!open) return
    // Mémorisé à l'ouverture pour lui rendre le focus à la fermeture (accessibilité clavier) :
    // sans ça, le focus retombe sur <body> et un utilisateur au clavier perd sa position.
    const triggerEl = document.activeElement
    function handleKeyDown(e) {
      if (e.key === "Escape") onClose()
    }
    document.addEventListener("keydown", handleKeyDown)
    // Empêche le corps de la page de défiler derrière la feuille ouverte.
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
        <>
          <motion.div
            className="fixed inset-0 z-40 bg-black/40"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-label={title}
            className="fixed inset-x-0 bottom-0 z-50 flex max-h-[90vh] flex-col overflow-hidden rounded-t-2xl bg-base-100 shadow-2xl"
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 32, stiffness: 320 }}
          >
            <div className="flex shrink-0 items-center justify-between border-b border-base-300/60 px-4 py-3">
              <span className="font-heading text-base font-semibold text-base-content">{title}</span>
              <button
                type="button"
                onClick={onClose}
                title="Fermer"
                className="flex h-11 w-11 items-center justify-center rounded-full text-base-content/60 hover:bg-base-200"
              >
                <X size={20} />
              </button>
            </div>
            <div className="scrollbar-thin overflow-y-auto p-4">{children}</div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
