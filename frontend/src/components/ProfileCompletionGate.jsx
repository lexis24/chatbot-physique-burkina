import React, { useState } from "react"
import { motion } from "framer-motion"
import { ClipboardList, AlertCircle } from "lucide-react"
import Button from "./ui/Button.jsx"
import Card from "./ui/Card.jsx"
import RegistrationDetails from "./RegistrationDetails.jsx"
import { updateProfile } from "../api.js"
import { emptyProfileFields, validateProfileFields } from "../lib/registrationValidation.js"

/**
 * Écran bloquant affiché à un compte migré depuis l'ancienne base SQLite (voir
 * migrate_sqlite_to_pg.py) dont la fiche (classe/genre/année de naissance/candidat libre/
 * établissement) n'est pas encore complète — ces champs sont devenus obligatoires après coup, ce
 * compte existait avant. Utilisé par App.jsx dès qu'un login ou un appel API renvoie
 * profile_complete=false / un 428 "profile_incomplete" (voir auth.require_complete_profile).
 * Contrairement à l'inscription, il n'y a ici ni identifiants ni consentement à ressaisir :
 * uniquement la fiche, envoyée via PATCH /api/profile.
 */
export default function ProfileCompletionGate({ token, onComplete }) {
  const [values, setValues] = useState(emptyProfileFields())
  const [errors, setErrors] = useState({})
  const [loading, setLoading] = useState(false)
  const [submitError, setSubmitError] = useState("")

  function handleChange(patch) {
    setValues((v) => ({ ...v, ...patch }))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    const fieldErrors = validateProfileFields(values)
    setErrors(fieldErrors)
    if (Object.keys(fieldErrors).length > 0) return

    setSubmitError("")
    setLoading(true)
    try {
      await updateProfile(token, {
        class_code: values.classCode,
        gender: values.gender,
        birth_date: values.birthDate,
        is_candidat_libre: values.isCandidatLibre,
        school_name: values.isCandidatLibre ? null : values.schoolName,
      })
      onComplete(values.classCode)
    } catch (err) {
      setSubmitError(err.message || "Une erreur est survenue.")
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-base-200 px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: "easeOut" }}
        className="w-full max-w-md"
      >
        <Card className="p-6 sm:p-8">
          <div className="mb-5 flex items-center gap-3">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardList size={20} />
            </span>
            <div>
              <h1 className="font-heading text-lg font-bold text-base-content">Complète ta fiche</h1>
              <p className="text-sm text-base-content/60">Quelques informations te sont maintenant demandées.</p>
            </div>
          </div>

          <p className="mb-5 text-sm text-base-content/70">
            Ton compte a été créé avant que ces informations soient demandées à l'inscription.
            Elles nous permettent de mieux adapter l'application à ton niveau — complète-les pour continuer.
          </p>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <RegistrationDetails values={values} onChange={handleChange} errors={errors} />

            {submitError && (
              <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {submitError}
              </div>
            )}

            <Button type="submit" variant="primary" size="lg" disabled={loading} className="mt-1 w-full font-bold">
              {loading ? "Un instant..." : "Continuer"}
            </Button>
          </form>
        </Card>
      </motion.div>
    </div>
  )
}
