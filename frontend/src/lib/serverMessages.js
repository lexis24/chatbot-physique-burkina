/**
 * Convertit les messages tels que renvoyés par GET /api/conversations/{id} (lignes serveur —
 * role/kind/content/payload/created_at, voir backend/database.py::get_messages) vers la forme
 * attendue par l'interface (type/text/data/sources/kind/createdAt — voir MessageBubble.jsx,
 * ExerciseCard.jsx, RemediationQuiz.jsx, App.jsx::deriveLastExchange/buildHistoryUpTo).
 *
 * Bug corrigé ici (voir RAPPORT_MIGRATION.md) : les deux formes ont toujours divergé sans jamais
 * être reconciliées — App.jsx::openConversation faisait `setMessages(conv.messages)` directement
 * avec les lignes serveur telles quelles. Conséquence concrète : rouvrir une conversation
 * affichait des bulles vides (MessageBubble lit `.text`, pas `.content`), un exercice/QCM de
 * remédiation historique ne réaffichait plus sa carte (`.type` valait undefined, jamais
 * "exercise"/"remediation"), et "Simplifie" perdait le contexte de la dernière question/réponse
 * (deriveLastExchange, lui aussi bâti sur `.type`/`.text`).
 */
export function mapServerMessagesToClient(rows) {
  return (rows || []).map((row) => {
    if (row.role === "user") {
      return { type: "user", text: row.content || "", sources: [], imageUrl: null, createdAt: row.created_at }
    }
    if (row.kind === "exercise") {
      return { type: "exercise", data: row.payload || {}, createdAt: row.created_at }
    }
    if (row.kind === "prerequis") {
      return { type: "prerequis", data: row.payload || {}, createdAt: row.created_at }
    }
    if (row.kind === "remediation") {
      return { type: "prerequis", data: row.payload || {}, createdAt: row.created_at }
    }
    // Un message assistant "photo"/"course" est affiché comme un échange de chat normal côté
    // client (voir App.jsx::handlePhotoExercise, qui pousse toujours kind="chat" en direct) —
    // seuls "summary"/"simplify" ont un badge et un comportement dédiés (voir MessageBubble.jsx).
    const kind = row.kind === "summary" || row.kind === "simplify" ? row.kind : "chat"
    return { type: "bot", text: row.content || "", sources: [], kind, createdAt: row.created_at }
  })
}
