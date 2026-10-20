import React, { useEffect, useState } from "react"
import { GraduationCap, CalendarDays } from "lucide-react"
import { getClasses } from "../api.js"
import SchoolAutocomplete from "./SchoolAutocomplete.jsx"
import { cn } from "../lib/utils"

// Deux valeurs, choix obligatoire — pas d'option "préfère ne pas répondre" (voir
// backend/main.py::VALID_GENDERS et backend/migrations/003_gender_two_values.sql).
const GENDER_OPTIONS = [
  { value: "F", label: "Féminin" },
  { value: "M", label: "Masculin" },
]

// Plausibilité en âge, pas en année fixe — voir backend/main.py::MIN_AGE_YEARS/MAX_AGE_YEARS et
// lib/registrationValidation.js (même bornes, dupliquées faute d'un module partagé backend/frontend).
const MIN_AGE_YEARS = 6
const MAX_AGE_YEARS = 80
const CURRENT_YEAR = new Date().getFullYear()

const MONTH_OPTIONS = [
  { value: "01", label: "Janvier" }, { value: "02", label: "Février" }, { value: "03", label: "Mars" },
  { value: "04", label: "Avril" }, { value: "05", label: "Mai" }, { value: "06", label: "Juin" },
  { value: "07", label: "Juillet" }, { value: "08", label: "Août" }, { value: "09", label: "Septembre" },
  { value: "10", label: "Octobre" }, { value: "11", label: "Novembre" }, { value: "12", label: "Décembre" },
]
const DAY_OPTIONS = Array.from({ length: 31 }, (_, i) => String(i + 1).padStart(2, "0"))
// Année la plus probable (âge médian d'un élève) en premier plutôt qu'un ordre chronologique brut,
// pour éviter à un élève de 12-15 ans de défiler jusqu'en bas de la liste.
const YEAR_OPTIONS = Array.from(
  { length: MAX_AGE_YEARS - MIN_AGE_YEARS + 1 },
  (_, i) => String(CURRENT_YEAR - MIN_AGE_YEARS - i)
)

const fieldWrapClass = (hasError) =>
  cn(
    "flex items-center gap-2.5 rounded-xl border bg-base-100 px-3.5 py-3 transition-colors focus-within:ring-2 focus-within:ring-primary/15",
    hasError ? "border-error focus-within:border-error" : "border-base-300 focus-within:border-primary"
  )

/** Sélecteur de date de naissance en 3 listes déroulantes (jour/mois/année) — pas un champ texte
 * libre, pour éliminer toute ambiguïté de format (JJ/MM/AAAA vs MM/JJ/AAAA) et empêcher une saisie
 * absurde (mois 13, jour 45...). Maintient un état local par segment (plutôt que de tout dériver de
 * `values.birthDate`) pour ne jamais perdre un segment déjà choisi tant que les deux autres ne sont
 * pas encore renseignés : dériver uniquement de la chaîne complète la remettrait à "" à chaque
 * segment intermédiaire, et donc réinitialiserait visuellement les select déjà remplis. */
function BirthDateField({ value, onChange, error }) {
  const initial = value ? value.split("-") : ["", "", ""]
  const [year, setYear] = useState(initial[0] || "")
  const [month, setMonth] = useState(initial[1] || "")
  const [day, setDay] = useState(initial[2] || "")

  // Resynchronise si la valeur externe change vers une date complète différente (ex: fiche
  // pré-remplie programmatiquement) — pas déclenché par nos propres mises à jour partielles
  // ci-dessous, qui ne renvoient une chaîne non vide que lorsque les 3 segments sont déjà réunis.
  useEffect(() => {
    if (!value) return
    const [y, m, d] = value.split("-")
    if (y !== year) setYear(y || "")
    if (m !== month) setMonth(m || "")
    if (d !== day) setDay(d || "")
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value])

  function commit(nextYear, nextMonth, nextDay) {
    onChange(nextYear && nextMonth && nextDay ? `${nextYear}-${nextMonth}-${nextDay}` : "")
  }

  return (
    <label className="flex flex-col gap-1.5">
      <span className="text-sm font-semibold text-base-content">Date de naissance</span>
      <div className={fieldWrapClass(error)}>
        <CalendarDays size={17} className="shrink-0 text-base-content/40" />
        <div className="grid w-full grid-cols-3 gap-2">
          <select
            aria-label="Jour de naissance"
            className="w-full bg-transparent text-base font-medium text-base-content outline-none"
            value={day}
            onChange={(e) => {
              setDay(e.target.value)
              commit(year, month, e.target.value)
            }}
          >
            <option value="" disabled>Jour</option>
            {DAY_OPTIONS.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            aria-label="Mois de naissance"
            className="w-full bg-transparent text-base font-medium text-base-content outline-none"
            value={month}
            onChange={(e) => {
              setMonth(e.target.value)
              commit(year, e.target.value, day)
            }}
          >
            <option value="" disabled>Mois</option>
            {MONTH_OPTIONS.map((m) => (
              <option key={m.value} value={m.value}>{m.label}</option>
            ))}
          </select>
          <select
            aria-label="Année de naissance"
            className="w-full bg-transparent text-base font-medium text-base-content outline-none"
            value={year}
            onChange={(e) => {
              setYear(e.target.value)
              commit(e.target.value, month, day)
            }}
          >
            <option value="" disabled>Année</option>
            {YEAR_OPTIONS.map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
        </div>
      </div>
      {error && <span className="text-sm font-medium text-error">{error}</span>}
    </label>
  )
}

/**
 * Fiche d'inscription : classe, genre, date de naissance, statut candidat libre, établissement
 * (masqué si candidat libre). Tous obligatoires sauf établissement pour un candidat libre (voir
 * main.py::RegisterRequest). Composant purement contrôlé : `values`/`onChange` portent l'état,
 * `errors` les messages par champ (affichés SOUS le champ concerné, pas groupés en haut) —
 * réutilisé tel quel par AuthGate (étape 3 de l'inscription) et par ProfileCompletionGate
 * (comptes migrés).
 */
export default function RegistrationDetails({ values, onChange, errors = {} }) {
  const [classes, setClasses] = useState([])

  useEffect(() => {
    let cancelled = false
    getClasses()
      .then((list) => {
        if (!cancelled) setClasses(list)
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [])

  function set(field, value) {
    onChange({ [field]: value })
  }

  function setCandidatLibre(isCandidatLibre) {
    // "Si l'utilisateur avait saisi une école puis coche candidat libre, la saisie est effacée
    // de l'état, pas conservée en arrière-plan" — on vide explicitement schoolName ici plutôt
    // que de simplement masquer le champ.
    onChange({ isCandidatLibre, schoolName: isCandidatLibre ? "" : values.schoolName })
  }

  return (
    <div className="flex flex-col gap-4">
      <label className="flex flex-col gap-1.5">
        <span className="text-sm font-semibold text-base-content">Classe</span>
        <div className={fieldWrapClass(errors.classCode)}>
          <GraduationCap size={17} className="shrink-0 text-base-content/40" />
          <select
            className="w-full bg-transparent text-base font-medium text-base-content outline-none"
            value={values.classCode}
            onChange={(e) => set("classCode", e.target.value)}
          >
            <option value="" disabled>
              Choisis ta classe
            </option>
            {classes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        {errors.classCode && <span className="text-sm font-medium text-error">{errors.classCode}</span>}
      </label>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-base-content">Genre</legend>
        <div className="grid grid-cols-2 gap-2">
          {GENDER_OPTIONS.map((g) => (
            <label
              key={g.value}
              className={cn(
                "flex cursor-pointer items-center justify-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors",
                values.gender === g.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-base-300 text-base-content/70 hover:bg-base-200"
              )}
            >
              <input
                type="radio"
                name="gender"
                className="radio radio-sm radio-primary"
                checked={values.gender === g.value}
                onChange={() => set("gender", g.value)}
              />
              {g.label}
            </label>
          ))}
        </div>
        {errors.gender && <span className="text-sm font-medium text-error">{errors.gender}</span>}
      </fieldset>

      <BirthDateField value={values.birthDate} onChange={(v) => set("birthDate", v)} error={errors.birthDate} />

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-base-content">Es-tu candidat libre ?</legend>
        <div className="grid grid-cols-2 gap-2">
          {[
            { value: false, label: "Non, inscrit(e) dans un établissement" },
            { value: true, label: "Oui, candidat libre" },
          ].map((opt) => (
            <label
              key={String(opt.value)}
              className={cn(
                "flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors",
                values.isCandidatLibre === opt.value
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-base-300 text-base-content/70 hover:bg-base-200"
              )}
            >
              <input
                type="radio"
                name="isCandidatLibre"
                className="radio radio-sm radio-primary"
                checked={values.isCandidatLibre === opt.value}
                onChange={() => setCandidatLibre(opt.value)}
              />
              {opt.label}
            </label>
          ))}
        </div>
        {errors.isCandidatLibre && <span className="text-sm font-medium text-error">{errors.isCandidatLibre}</span>}
      </fieldset>

      {!values.isCandidatLibre && (
        <SchoolAutocomplete
          value={values.schoolName}
          onChange={(v) => set("schoolName", v)}
          error={errors.schoolName}
        />
      )}
    </div>
  )
}
