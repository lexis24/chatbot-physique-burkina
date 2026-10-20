import React, { useEffect, useRef, useState } from "react"
import { motion } from "framer-motion"
import MathContent from "./MathContent"
import { buildSuggestions } from "../lib/suggestions"

function SuggestionButtons({ suggestions, onSuggestionClick }) {
  if (suggestions.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      {suggestions.map((q, i) => (
        <motion.button
          key={q}
          initial={{ opacity: 0, x: -8 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.25, delay: i * 0.05, ease: "easeOut" }}
          onClick={() => onSuggestionClick(q)}
          className="rounded-lg border border-base-300/60 bg-base-100 px-3 py-2.5 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
        >
          {q}
        </motion.button>
      ))}
    </div>
  )
}

/** Message d'accueil personnalisé (compte avec historique) : coupé à 3 lignes visibles pour ne
 * pas repousser les suggestions et le champ de saisie hors de l'écran sur mobile (voir
 * RAPPORT_MOBILE.md). Le "Voir plus" ne s'affiche que si le texte dépasse vraiment ces 3 lignes. */
function PersonalizedMessage({ text }) {
  const [expanded, setExpanded] = useState(false)
  const [truncatable, setTruncatable] = useState(false)
  const contentRef = useRef(null)

  useEffect(() => {
    const el = contentRef.current
    if (!el) return
    setTruncatable(el.scrollHeight > el.clientHeight + 1)
  }, [text])

  return (
    <div className="w-full max-w-[440px] text-left">
      <div ref={contentRef} className={`prose-chat max-w-none text-sm ${expanded ? "" : "line-clamp-3"}`}>
        <MathContent>{text}</MathContent>
      </div>
      {truncatable && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="mt-1 text-xs font-semibold text-primary hover:underline"
        >
          {expanded ? "Voir moins" : "Voir plus"}
        </button>
      )}
    </div>
  )
}

/** Écran d'accueil centré affiché tant qu'aucun message n'existe (voir App.jsx, qui centre
 * verticalement ce composant dans la zone de chat). Trois profils distincts :
 * - invité : "Bonjour" seul, classe seulement si choisie dans le sélecteur, pas de message
 *   personnalisé (l'API l'exige, voir App.jsx qui ne passe personalizedMessage que si `username`).
 * - compte neuf : "Bonjour <nom>" + classe/chapitre du compte, pas de message personnalisé
 *   (aucun historique pour l'alimenter).
 * - compte avec historique : pareil, plus le message personnalisé ci-dessus. */
export default function WelcomeCard({ username, classeNom, chapitre, personalizedMessage, onSuggestionClick }) {
  const suggestions = buildSuggestions(chapitre)
  const contextLine = classeNom ? `${classeNom}${chapitre ? " · " + chapitre : ""}` : ""

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex flex-col items-center px-2 text-center"
    >
      <img
        src="/logo-hakili-lab.png"
        srcSet="/logo-hakili-lab.png 1x, /logo-hakili-lab@2x.png 2x"
        width={72}
        height={72}
        alt="Hakili Lab"
        className="h-14 w-14 md:h-[72px] md:w-[72px]"
      />

      <p className="font-heading mt-3 text-xl font-extrabold">{username ? `Bonjour ${username}` : "Bonjour"}</p>

      {contextLine && <p className="mt-1 text-sm text-base-content/50">{contextLine}</p>}

      {personalizedMessage && (
        <div className="mt-4">
          <PersonalizedMessage text={personalizedMessage} />
        </div>
      )}

      {suggestions.length > 0 && (
        <div className="mt-5 w-full max-w-[440px]">
          <SuggestionButtons suggestions={suggestions} onSuggestionClick={onSuggestionClick} />
        </div>
      )}
    </motion.div>
  )
}
