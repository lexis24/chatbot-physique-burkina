import { describe, it, expect } from "vitest"
import { buildHistoryUpTo, MAX_HISTORY_MESSAGES } from "./history.js"

describe("buildHistoryUpTo", () => {
  it("maps user/bot messages to role/content pairs", () => {
    const messages = [
      { type: "user", text: "Comment factoriser x²-4 ?" },
      { type: "bot", text: "On reconnaît une identité remarquable..." },
    ]
    expect(buildHistoryUpTo(messages)).toEqual([
      { role: "user", content: "Comment factoriser x²-4 ?" },
      { role: "assistant", content: "On reconnaît une identité remarquable..." },
    ])
  })

  it("ignores exercise/prerequis messages (no role/content shape)", () => {
    const messages = [
      { type: "user", text: "Génère un exercice" },
      { type: "exercise", data: { enonce: "..." } },
      { type: "bot", text: "Voici la suite" },
    ]
    expect(buildHistoryUpTo(messages)).toEqual([
      { role: "user", content: "Génère un exercice" },
      { role: "assistant", content: "Voici la suite" },
    ])
  })

  it("never produces an empty-content turn for a photo message without accompanying text", () => {
    // Régression : une photo d'exercice envoyée sans consigne tapée doit toujours avoir un texte
    // de repli (voir App.jsx::handlePhotoExercise) — sinon ce tour devient invisible pour Claude
    // dans les échanges suivants, qui perd alors le fil de la conversation.
    const messages = [
      { type: "user", text: "[Photo d'exercice envoyée]", imageUrl: "blob:fake" },
      { type: "bot", text: "Voici l'exercice : ..." },
    ]
    const history = buildHistoryUpTo(messages)
    expect(history.every((turn) => turn.content.length > 0)).toBe(true)
  })

  it("falls back to an empty string only if a message truly has no text", () => {
    const history = buildHistoryUpTo([{ type: "user" }])
    expect(history).toEqual([{ role: "user", content: "" }])
  })

  it("keeps only the last MAX_HISTORY_MESSAGES turns", () => {
    const messages = Array.from({ length: 20 }, (_, i) => ({
      type: i % 2 === 0 ? "user" : "bot",
      text: `message ${i}`,
    }))
    const history = buildHistoryUpTo(messages)
    expect(history).toHaveLength(MAX_HISTORY_MESSAGES)
    expect(history[0].content).toBe(`message ${20 - MAX_HISTORY_MESSAGES}`)
    expect(history[history.length - 1].content).toBe("message 19")
  })
})
