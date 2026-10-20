import React, { useEffect, useState } from "react"
import { UserRound, History, AlertCircle, X, AlertTriangle } from "lucide-react"
import Card from "./ui/Card"
import Button from "./ui/Button"
import { updateProfile } from "../api.js"
import { getToken } from "../lib/auth.js"

function timeAgo(timestamp) {
  const diffMin = Math.round((Date.now() - timestamp) / 60000)
  if (diffMin < 1) return "à l'instant"
  if (diffMin < 60) return `il y a ${diffMin} min`
  const diffH = Math.round(diffMin / 60)
  if (diffH < 24) return `il y a ${diffH} h`
  const diffJ = Math.round(diffH / 24)
  return `il y a ${diffJ} j`
}

/**
 * Changement de classe d'un compte connecté (voir RAPPORT_MIGRATION.md : la classe est fixée au
 * compte, PATCH /api/profile est désormais le seul moyen de la modifier). N'affiche rien tant que
 * `classEditOpen` est faux : le rappel en lecture seule de la classe vit déjà dans Sidebar.jsx (la
 * carte « Ma classe » en bureau, la ligne dédiée en mobile) — ce composant n'apparaît que pour le
 * flux d'édition lui-même, ouvert via le lien « Changer » qui vit à côté de ce rappel. Deux temps
 * une fois ouvert : sélection de la nouvelle classe -> confirmation explicite avant l'envoi (une
 * classe différente change les cours/exercices proposés, pas anodin).
 */
function ClassSection({ user, classes, classCode, classEditOpen, onCloseClassEdit, onClassChanged }) {
  const [pendingCode, setPendingCode] = useState(classCode || "")
  const [confirming, setConfirming] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (classEditOpen) {
      setPendingCode(classCode || "")
      setConfirming(false)
      setError("")
    }
  }, [classEditOpen, classCode])

  if (!user || !classEditOpen) return null

  async function handleConfirm() {
    setSaving(true)
    setError("")
    try {
      await updateProfile(getToken(), { class_code: pendingCode })
      onClassChanged(pendingCode)
    } catch (err) {
      setError(err.message || "Erreur lors du changement de classe.")
      setSaving(false)
    }
  }

  if (confirming) {
    return (
      <div className="mb-3 rounded-lg border border-warning/40 bg-warning/5 p-3 text-sm">
        <p className="mb-2 flex items-start gap-1.5 text-base-content/80">
          <AlertTriangle size={14} className="mt-0.5 shrink-0 text-warning" />
          Tu vas changer de classe, les cours proposés changeront. Continuer ?
        </p>
        {error && <p className="mb-2 text-error">{error}</p>}
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => setConfirming(false)} disabled={saving}>
            Annuler
          </Button>
          <Button variant="primary" size="sm" onClick={handleConfirm} disabled={saving}>
            {saving ? "Un instant..." : "Oui, changer"}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="mb-3 rounded-lg border border-base-300/60 bg-base-100 p-3 text-sm">
      <p className="mb-1.5 text-xs font-medium text-base-content/50">Nouvelle classe</p>
      <select
        className="select select-bordered select-sm w-full rounded-lg bg-base-100"
        value={pendingCode}
        onChange={(e) => setPendingCode(e.target.value)}
      >
        {classes.map((c) => (
          <option key={c.code} value={c.code}>
            {c.name}
          </option>
        ))}
      </select>
      {error && <p className="mt-2 text-error">{error}</p>}
      <div className="mt-2 flex justify-end gap-3">
        <button type="button" className="text-xs font-medium text-base-content/50 hover:underline" onClick={onCloseClassEdit}>
          Annuler
        </button>
        <button
          type="button"
          className="text-xs font-semibold text-primary hover:underline disabled:pointer-events-none disabled:opacity-40"
          disabled={!pendingCode || pendingCode === classCode}
          onClick={() => setConfirming(true)}
        >
          Valider
        </button>
      </div>
    </div>
  )
}

export default function ProfilePanel({
  user, classes = [], classCode, classEditOpen, onCloseClassEdit, onClassChanged,
  profile, onResumeTopic, onReviewStruggle, onDismissStruggle,
}) {
  const { topics = [], struggles = [] } = profile || {}

  // Rien à afficher : ni sujet/notion, ni changement de classe en cours (voir ClassSection,
  // seul cas où ce composant a quelque chose à montrer indépendamment de topics/struggles).
  if (!classEditOpen && topics.length === 0 && struggles.length === 0) return null

  return (
    <Card className="p-4">
      <label className="font-heading mb-2 flex items-center gap-2 text-sm font-semibold text-base-content/80">
        <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-primary/15 text-primary">
          <UserRound size={13} />
        </span>
        Ton profil
      </label>

      <ClassSection
        user={user}
        classes={classes}
        classCode={classCode}
        classEditOpen={classEditOpen}
        onCloseClassEdit={onCloseClassEdit}
        onClassChanged={onClassChanged}
      />

      {topics.length > 0 && (
        <div className="mb-3">
          <p className="mb-1.5 flex items-center gap-1 text-sm font-medium text-base-content/60">
            <History size={12} /> Reprendre où tu en étais
          </p>
          <div className="flex flex-col gap-1.5">
            {topics.slice(0, 4).map((t) => (
              <button
                key={t.key}
                onClick={() => onResumeTopic(t)}
                className="rounded-lg border border-base-300/60 bg-base-100 px-3 py-2 text-left text-sm transition-colors hover:border-primary/50 hover:bg-primary/5"
                // database.get_recent_topics (Postgres) ne fournit plus de compteur de visites
                // (contrairement à l'ancien schéma SQLite) : on n'affiche que la fraîcheur.
                title={`Dernière visite ${timeAgo(t.lastVisited)}`}
              >
                <span className="font-medium">{t.classeNom || t.classCode || "Classe libre"}</span>
                {t.chapitre && <span className="text-base-content/60"> · {t.chapitre}</span>}
              </button>
            ))}
          </div>
        </div>
      )}

      {struggles.length > 0 && (
        <div>
          <p className="mb-1.5 flex items-center gap-1 text-sm font-medium text-base-content/60">
            <AlertCircle size={12} /> Notions à revoir
          </p>
          <div className="flex flex-col gap-1.5">
            {struggles.slice(0, 5).map((s, i) => (
              <div
                key={`${s.timestamp}-${i}`}
                className="flex items-start gap-1.5 rounded-lg border border-warning/30 bg-warning/5 px-3 py-2 text-sm"
              >
                <button
                  onClick={() => onReviewStruggle(s)}
                  className="flex-1 text-left leading-snug hover:underline"
                  title="Reposer cette question"
                >
                  {s.chapitre && <span className="font-medium">{s.chapitre} : </span>}
                  {s.question}
                </button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="!p-1"
                  title="Retiré de la liste"
                  onClick={() => onDismissStruggle(i)}
                >
                  <X size={12} />
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}
    </Card>
  )
}
