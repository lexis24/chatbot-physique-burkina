import React, { useEffect, useState } from "react"
import { ShieldCheck, ChevronDown } from "lucide-react"
import BottomSheet from "./ui/BottomSheet.jsx"
import Modal from "./ui/Modal.jsx"
import MathContent from "./MathContent.jsx"
import { ONBOARDING_STEPS } from "../lib/onboardingSteps.js"
import { getConsent } from "../api.js"
import { useIsMobile } from "../lib/useMediaQuery.js"

/** Relit le texte de consentement (GET /api/consent, public) à la demande — en lecture seule,
 * sans case à cocher (contrairement à ConsentNotice.jsx, qui sert à le FAIRE accepter à
 * l'inscription/reconnexion) : ici l'élève est déjà dans l'appli, il veut juste vérifier ce qui
 * est collecté. Repliée par défaut pour ne pas alourdir le panneau au premier coup d'œil. */
function ConsentReminder() {
  const [open, setOpen] = useState(false)
  const [consent, setConsent] = useState(null)
  const [error, setError] = useState(false)

  useEffect(() => {
    if (!open || consent || error) return
    let cancelled = false
    getConsent()
      .then((data) => {
        if (!cancelled) setConsent(data)
      })
      .catch(() => {
        if (!cancelled) setError(true)
      })
    return () => {
      cancelled = true
    }
  }, [open, consent, error])

  return (
    <div className="rounded-xl border border-base-300/50 bg-base-100/70 p-3.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-base-content"
      >
        <span className="flex items-center gap-2">
          <ShieldCheck size={16} className="text-primary" />
          Ce que je collecte sur toi
        </span>
        <ChevronDown size={15} className={`text-base-content/40 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="mt-2.5 max-h-56 overflow-y-auto scrollbar-thin rounded-lg bg-base-200/40 p-3 text-sm">
          {error && <p className="text-error">Impossible de charger le texte pour le moment. Réessaie.</p>}
          {!error && !consent && <p className="text-base-content/50">Chargement…</p>}
          {consent && <MathContent>{consent.text}</MathContent>}
        </div>
      )}
    </div>
  )
}

function AboutContent() {
  return (
    <div className="flex flex-col gap-4">
      <div className="overflow-hidden rounded-xl bg-black">
        <video
          src="/demo/comment-ca-marche.webm"
          className="block w-full"
          autoPlay
          muted
          loop
          controls
          playsInline
          preload="metadata"
        />
      </div>

      <div>
        <p className="font-heading mb-1 text-sm font-semibold text-base-content">Le projet</p>
        <p className="text-sm leading-relaxed text-base-content/70">
          Prof Amira t'aide à réviser les maths du programme officiel du Burkina Faso, de la 6ème à
          la Terminale, à partir des manuels de la Collection Hakili Lab. Pose une question à tout
          moment, génère un exercice sur mesure, ou reprends le cours d'un chapitre — un produit
          Hakili Lab.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {ONBOARDING_STEPS.map((step, i) => (
          <div key={i} className="rounded-xl border border-base-300/50 bg-base-100/70 p-3.5">
            <div className={`mb-2 inline-flex h-8 w-8 items-center justify-center rounded-lg ${step.color}`}>
              <step.icon size={16} />
            </div>
            <p className="font-heading text-base font-semibold">{step.title}</p>
            <p className="mt-0.5 text-sm leading-relaxed text-base-content/60">{step.text}</p>
          </div>
        ))}
      </div>

      <ConsentReminder />
    </div>
  )
}

/**
 * Section "Comment ça marche ?" — regroupe ce qui était auparavant éparpillé (bandeau vidéo
 * toujours visible, 3 cartes explicatives dans WelcomeCard, phrase d'intro) en un seul endroit
 * consulté à la demande plutôt qu'affiché en permanence à chaque ouverture : vidéo de
 * démonstration (contrôles natifs, pas d'en-tête ni de bouton propre — le seul bouton de
 * fermeture est celui de la modale/feuille), les 3 cartes "comment ça marche", une courte
 * présentation du projet, et un rappel du texte de consentement.
 * Ouverte depuis le lien sous le champ de saisie (accueil, voir App.jsx). Rendue en feuille
 * modale sur mobile, en fenêtre centrée sur bureau — même contenu dans les deux cas.
 */
export default function AboutPanel({ open, onClose }) {
  const isMobile = useIsMobile()
  const Container = isMobile ? BottomSheet : Modal
  return (
    <Container open={open} onClose={onClose} title="Comment ça marche ?">
      <AboutContent />
    </Container>
  )
}
