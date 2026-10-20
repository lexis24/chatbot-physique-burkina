/**
 * Profil de progression de l'élève, persisté dans localStorage indépendamment de la session
 * de chat en cours : sert d'"assistant personnel" léger (sujets déjà travaillés, notions à revoir).
 */
const PROFILE_KEY = "chatmaths-profile-v1"
const MAX_TOPICS = 8
const MAX_STRUGGLES = 10

function emptyProfile() {
  return { topics: [], struggles: [] }
}

function loadProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_KEY)
    if (!raw) return emptyProfile()
    const parsed = JSON.parse(raw)
    return {
      topics: Array.isArray(parsed.topics) ? parsed.topics : [],
      struggles: Array.isArray(parsed.struggles) ? parsed.struggles : [],
    }
  } catch {
    return emptyProfile()
  }
}

function saveProfile(profile) {
  try {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(profile))
  } catch {
    /* stockage plein ou indisponible, tant pis */
  }
}

export function getProfile() {
  return loadProfile()
}

/** Enregistre qu'une question a été posée sur cette classe/ce chapitre (pour "Reprendre où tu en étais"). */
export function recordTopicVisit(classCode, chapitre, classeNom) {
  if (!classCode && !chapitre) return loadProfile()

  const profile = loadProfile()
  const key = `${classCode}||${chapitre}`
  const now = Date.now()
  const existing = profile.topics.find((t) => t.key === key)

  if (existing) {
    existing.count += 1
    existing.lastVisited = now
    existing.classeNom = classeNom || existing.classeNom
  } else {
    profile.topics.push({ key, classCode, chapitre, classeNom, count: 1, lastVisited: now })
  }

  profile.topics.sort((a, b) => b.lastVisited - a.lastVisited)
  profile.topics = profile.topics.slice(0, MAX_TOPICS)

  saveProfile(profile)
  return profile
}

/** Enregistre une notion sur laquelle l'élève a eu besoin d'une explication simplifiée. */
export function recordStruggle(classCode, chapitre, question, classeNom) {
  if (!question) return loadProfile()

  const profile = loadProfile()
  profile.struggles = profile.struggles.filter(
    (s) => !(s.classCode === classCode && s.chapitre === chapitre && s.question === question)
  )
  profile.struggles.unshift({ classCode, chapitre, question, classeNom, timestamp: Date.now() })
  profile.struggles = profile.struggles.slice(0, MAX_STRUGGLES)

  saveProfile(profile)
  return profile
}

export function dismissStruggle(index) {
  const profile = loadProfile()
  profile.struggles.splice(index, 1)
  saveProfile(profile)
  return profile
}

export function clearProfile() {
  const profile = emptyProfile()
  saveProfile(profile)
  return profile
}
