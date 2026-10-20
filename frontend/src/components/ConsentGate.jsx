import React, { useState } from "react"
import { motion } from "framer-motion"
import { ShieldCheck, AlertCircle } from "lucide-react"
import Button from "./ui/Button.jsx"
import Card from "./ui/Card.jsx"
import ConsentNotice from "./ConsentNotice.jsx"
import { acceptConsent } from "../api.js"

/**
 * Écran bloquant affiché à la reconnexion d'un compte dont le consentement n'est pas à jour :
 * comptes migrés depuis SQLite (consent_version = NULL, voir migrate_sqlite_to_pg.py) ou inscrits
 * sous un texte de consentement antérieur si celui-ci a changé depuis. Déclenché par App.jsx dès
 * qu'un login ou un appel API renvoie consent_ok=false / un 428 "consent_required" (voir
 * auth.require_consent). Un nouveau compte, lui, a déjà consenti à l'inscription et ne voit
 * jamais cet écran (voir AuthGate.jsx, étape 2).
 */
export default function ConsentGate({ token, onAccepted }) {
  const [checked, setChecked] = useState(false)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")

  async function handleSubmit(e) {
    e.preventDefault()
    if (!checked) {
      setError("Coche la case pour continuer.")
      return
    }
    setError("")
    setLoading(true)
    try {
      await acceptConsent(token)
      onAccepted()
    } catch (err) {
      setError(err.message || "Une erreur est survenue.")
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
              <ShieldCheck size={20} />
            </span>
            <div>
              <h1 className="font-heading text-lg font-bold text-base-content">Avant de continuer</h1>
              <p className="text-sm text-base-content/60">Nos conditions ont été mises à jour.</p>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <ConsentNotice checked={checked} onCheckedChange={setChecked} />

            {error && (
              <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error">
                <AlertCircle size={16} className="mt-0.5 shrink-0" />
                {error}
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
