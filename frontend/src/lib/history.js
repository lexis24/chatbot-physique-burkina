// Nombre de tours conservés pour la mémoire de conversation envoyée au backend (6 échanges
// élève/assistant = 12 messages) : au-delà, le contexte grossit sans réel bénéfice pédagogique
// et ralentit inutilement les réponses (plus de tokens à traiter par Claude à chaque appel).
export const MAX_HISTORY_MESSAGES = 12

/**
 * Convertit les messages du chat (type "user"/"bot"/"exercise"/"prerequis"...) en historique
 * `[{role, content}]` envoyé au backend pour la mémoire de conversation.
 *
 * Important : un message dont le texte est vide (ex: une photo d'exercice envoyée sans consigne
 * tapée) ne doit JAMAIS produire un tour avec `content: ""` — un tel "trou" dans l'historique fait
 * perdre à Claude toute trace qu'un échange a eu lieu à cet endroit (voir le bug corrigé où une
 * photo sans texte laissait un tour élève fantôme, et Claude perdait le fil dès le message
 * suivant). C'est pourquoi les appelants (voir App.jsx::handlePhotoExercise) donnent toujours un
 * texte de repli non vide au message avant de l'ajouter à `messages`.
 */
export function buildHistoryUpTo(list) {
  return list
    .filter((m) => m.type === "user" || m.type === "bot")
    .slice(-MAX_HISTORY_MESSAGES)
    .map((m) => ({ role: m.type === "user" ? "user" : "assistant", content: m.text || "" }))
}
