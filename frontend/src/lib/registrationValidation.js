/**
 * Validation de la fiche d'inscription (classe/genre/date de naissance/candidat libre/
 * établissement), partagée entre AuthGate.jsx (étape 3 de l'inscription) et
 * ProfileCompletionGate.jsx (comptes migrés qui doivent la compléter à la reconnexion) — pour ne
 * pas dupliquer les règles à deux endroits. Miroir des règles serveur (main.py::RegisterRequest),
 * ce qui permet de désactiver le bouton "Terminer" avant même d'appeler l'API.
 */
// Plausibilité en âge (pas en année fixe) : un élève de 6 à 80 ans, cohérent avec le programme
// couvert (6ème à Terminale) tout en laissant de la marge pour un candidat libre plus âgé — voir
// backend/main.py::MIN_AGE_YEARS/MAX_AGE_YEARS.
const MIN_AGE_YEARS = 6
const MAX_AGE_YEARS = 80
// Deux valeurs seulement, choix obligatoire (pas d'option "préfère ne pas répondre") — voir
// backend/main.py::VALID_GENDERS et backend/migrations/003_gender_two_values.sql.
const VALID_GENDERS = ["F", "M"]

export function emptyProfileFields() {
  return {
    classCode: "",
    gender: "",
    birthDate: "", // "YYYY-MM-DD", ou "" tant que la sélection jour/mois/année est incomplète
    isCandidatLibre: null, // null = pas encore choisi, distinct de false ("choix explicite")
    schoolName: "",
  }
}

/** `birthDate` est un texte "YYYY-MM-DD" (voir RegistrationDetails.jsx, sélecteur jour/mois/année) —
 * jamais un objet Date construit ailleurs, pour éviter tout décalage de fuseau horaire entre la
 * saisie et la validation. */
function parseBirthDate(value) {
  if (!value) return null
  const date = new Date(`${value}T00:00:00`)
  return Number.isNaN(date.getTime()) ? null : date
}

function ageInYears(birthDate, today) {
  let age = today.getFullYear() - birthDate.getFullYear()
  const hasHadBirthdayThisYear =
    today.getMonth() > birthDate.getMonth() ||
    (today.getMonth() === birthDate.getMonth() && today.getDate() >= birthDate.getDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age
}

export function validateProfileFields(values) {
  const errors = {}

  if (!values.classCode) errors.classCode = "Choisis ta classe."
  if (!values.gender || !VALID_GENDERS.includes(values.gender)) errors.gender = "Choisis une option."

  const birthDate = parseBirthDate(values.birthDate)
  if (!birthDate) {
    errors.birthDate = "Indique ta date de naissance."
  } else {
    const today = new Date()
    const age = ageInYears(birthDate, today)
    if (birthDate > today || age < MIN_AGE_YEARS || age > MAX_AGE_YEARS) {
      errors.birthDate = `Indique une date de naissance plausible (entre ${MIN_AGE_YEARS} et ${MAX_AGE_YEARS} ans).`
    }
  }

  if (values.isCandidatLibre === null || values.isCandidatLibre === undefined) {
    errors.isCandidatLibre = "Précise si tu es candidat libre."
  } else if (!values.isCandidatLibre && !(values.schoolName && values.schoolName.trim())) {
    errors.schoolName = "Indique ton établissement, ou coche « candidat libre »."
  }

  return errors
}

export function isProfileFormComplete(values) {
  return Object.keys(validateProfileFields(values)).length === 0
}
