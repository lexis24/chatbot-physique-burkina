import React, { useEffect, useState } from "react"
import { ShieldCheck } from "lucide-react"
import { getConsent } from "../api.js"
import MathContent from "./MathContent.jsx"

/**
 * Texte de consentement + case à cocher. Réutilisé à l'inscription (AuthGate, étape 2) et à la
 * reconnexion d'un compte migré dont le consentement n'est pas à jour (voir App.jsx, gate 428
 * "consent_required"). Charge le texte lui-même (GET /api/consent, public) plutôt que de le
 * recevoir en prop : un seul point de vérité, jamais désynchronisé de CONSENT_VERSION serveur.
 */
export default function ConsentNotice({ checked, onCheckedChange, error }) {
  const [consent, setConsent] = useState(null)
  const [loadError, setLoadError] = useState(false)

  useEffect(() => {
    let cancelled = false
    getConsent()
      .then((data) => {
        if (!cancelled) setConsent(data)
      })
      .catch(() => {
        if (!cancelled) setLoadError(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2 text-sm font-semibold text-base-content">
        <ShieldCheck size={16} className="text-primary" />
        Confidentialité de tes données
      </div>

      <div className="max-h-56 overflow-y-auto scrollbar-thin rounded-xl border border-base-300 bg-base-200/40 p-3.5 text-sm">
        {loadError && (
          <p className="text-error">Impossible de charger le texte de consentement pour le moment. Réessaie.</p>
        )}
        {!loadError && !consent && <p className="text-base-content/50">Chargement…</p>}
        {consent && <MathContent>{consent.text}</MathContent>}
      </div>

      <label className="flex cursor-pointer items-start gap-2.5 text-sm">
        <input
          type="checkbox"
          className="checkbox checkbox-sm checkbox-primary mt-0.5"
          checked={checked}
          onChange={(e) => onCheckedChange(e.target.checked)}
        />
        <span className="font-medium text-base-content">
          J'ai lu et j'accepte ces conditions.
        </span>
      </label>
      {error && <p className="text-sm font-medium text-error">{error}</p>}
    </div>
  )
}
