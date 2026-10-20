/**
 * Formatage des horodatages affichés sous chaque message (voir MessageBubble.jsx) et des
 * séparateurs de jour dans le fil de discussion (voir App.jsx). `created_at` (messages serveur) et
 * les horodatages posés côté client à l'envoi (voir App.jsx::pushUserMessage etc.) sont tous les
 * deux des chaînes ISO 8601, que `Date` parse nativement — pas de reconstruction de fuseau
 * horaire à la main (voir ConversationList.jsx::formatDate, même principe).
 */

export function isSameDay(isoA, isoB) {
  const a = new Date(isoA)
  const b = new Date(isoB)
  return a.toDateString() === b.toDateString()
}

/** Heure courte ("14:32") sous un message. */
export function formatMessageTime(iso) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })
}

/** Étiquette du séparateur de jour ("Aujourd'hui", "Hier", ou "12 août"). */
export function formatDaySeparator(iso) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""

  const today = new Date()
  if (date.toDateString() === today.toDateString()) return "Aujourd'hui"

  const yesterday = new Date(today)
  yesterday.setDate(today.getDate() - 1)
  if (date.toDateString() === yesterday.toDateString()) return "Hier"

  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long" })
}
