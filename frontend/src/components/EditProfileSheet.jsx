import React, { useEffect, useState } from "react"
import { AlertCircle, Check } from "lucide-react"
import Button from "./ui/Button.jsx"
import BottomSheet from "./ui/BottomSheet.jsx"
import RegistrationDetails from "./RegistrationDetails.jsx"
import { getProfileFields, updateProfile } from "../api.js"
import { emptyProfileFields, validateProfileFields } from "../lib/registrationValidation.js"

/**
 * Feuille "Modifier mon profil", ouverte depuis le badge nom d'utilisateur du Header (et depuis la
 * sidebar). Réutilise RegistrationDetails (même formulaire qu'à l'inscription/ProfileCompletionGate),
 * mais pré-remplie avec les valeurs actuelles (GET /api/profile/fields) — contrairement à
 * ProfileCompletionGate, qui part toujours d'une fiche vide. Distinct du lien « Changer » de
 * ProfilePanel (qui ne modifie que la classe) : ici l'élève peut corriger toute sa fiche.
 */
// `onSaved` prévient App.jsx d'une classe éventuellement changée (voir ClassSection dans
// ProfilePanel.jsx pour le même besoin) : sans lui, la classe restait mise à jour côté serveur
// mais figée côté React tant que la page n'était pas rechargée (chapitres, en-tête, questions
// suivantes continuaient de partir sous l'ancienne classe).
export default function EditProfileSheet({ open, onClose, token, onSaved }) {
  const [values, setValues] = useState(emptyProfileFields())
  const [errors, setErrors] = useState({})
  const [loadError, setLoadError] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState("")
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!open) return
    setSaved(false)
    setSaveError("")
    setLoadError("")
    setLoading(true)
    getProfileFields(token)
      .then((f) => {
        setValues({
          classCode: f.class_code || "",
          gender: f.gender || "",
          birthDate: f.birth_date || "",
          isCandidatLibre: f.is_candidat_libre ?? null,
          schoolName: f.school_raw || "",
        })
      })
      .catch((err) => setLoadError(err.message || "Impossible de charger ton profil."))
      .finally(() => setLoading(false))
  }, [open, token])

  function handleChange(patch) {
    setValues((v) => ({ ...v, ...patch }))
    setSaved(false)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const fieldErrors = validateProfileFields(values)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSaveError("")
    setSaving(true)
    try {
      await updateProfile(token, {
        class_code: values.classCode,
        gender: values.gender,
        birth_date: values.birthDate,
        is_candidat_libre: values.isCandidatLibre,
        school_name: values.isCandidatLibre ? null : values.schoolName,
      })
      onSaved?.(values.classCode)
      setSaved(true)
      // Bref aperçu du message de confirmation avant de refermer la feuille — pas de fermeture
      // instantanée, sinon l'élève n'a pas le temps de voir que l'enregistrement a réussi.
      setTimeout(onClose, 700)
    } catch (err) {
      setSaveError(err.message || "Une erreur est survenue.")
    } finally {
      setSaving(false)
    }
  }

  return (
    <BottomSheet open={open} onClose={onClose} title="Modifier mon profil">
      {loading ? (
        <p className="py-6 text-center text-sm text-base-content/50">Chargement...</p>
      ) : loadError ? (
        <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          {loadError}
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <RegistrationDetails values={values} onChange={handleChange} errors={errors} />

          {saveError && (
            <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error">
              <AlertCircle size={16} className="mt-0.5 shrink-0" />
              {saveError}
            </div>
          )}

          {saved && (
            <div className="flex items-center gap-2 rounded-xl border border-success/30 bg-success/10 px-3.5 py-2.5 text-sm font-medium text-success">
              <Check size={16} className="shrink-0" />
              Profil mis à jour.
            </div>
          )}

          <Button type="submit" variant="primary" size="lg" disabled={saving} className="w-full font-bold">
            {saving ? "Un instant..." : "Enregistrer"}
          </Button>
        </form>
      )}
    </BottomSheet>
  )
}
