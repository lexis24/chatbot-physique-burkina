import { describe, it, expect } from "vitest"
import { mapServerMessagesToClient } from "./serverMessages.js"

describe("mapServerMessagesToClient", () => {
  it("maps a user row to a client user message", () => {
    const rows = [{ role: "user", kind: "chat", content: "Combien font 1/2 + 1/3 ?", created_at: "2026-08-12T10:00:00+00:00" }]
    expect(mapServerMessagesToClient(rows)).toEqual([
      { type: "user", text: "Combien font 1/2 + 1/3 ?", sources: [], imageUrl: null, createdAt: "2026-08-12T10:00:00+00:00" },
    ])
  })

  it("maps a chat assistant row to a client bot message with kind 'chat'", () => {
    const rows = [{ role: "assistant", kind: "chat", content: "Voici la réponse.", created_at: "2026-08-12T10:00:05+00:00" }]
    expect(mapServerMessagesToClient(rows)).toEqual([
      { type: "bot", text: "Voici la réponse.", sources: [], kind: "chat", createdAt: "2026-08-12T10:00:05+00:00" },
    ])
  })

  it("keeps summary/simplify kinds so MessageBubble shows the right badge", () => {
    const rows = [
      { role: "assistant", kind: "summary", content: "Résumé...", created_at: "t1" },
      { role: "assistant", kind: "simplify", content: "Version simple...", created_at: "t2" },
    ]
    const mapped = mapServerMessagesToClient(rows)
    expect(mapped[0].kind).toBe("summary")
    expect(mapped[1].kind).toBe("simplify")
  })

  it("falls back photo/course assistant kinds to 'chat' (matches live-session behavior)", () => {
    const rows = [{ role: "assistant", kind: "photo", content: "Explication de la photo...", created_at: "t1" }]
    expect(mapServerMessagesToClient(rows)[0].kind).toBe("chat")
  })

  it("maps an exercise row to a client exercise message using its payload as data", () => {
    const payload = { enonce: "Résous x²=4", indices: [], solution: "x=2 ou x=-2", chapter: "Équations", class_level: "3ème", difficulty: 2 }
    const rows = [{ role: "assistant", kind: "exercise", content: "Exercice — Équations", payload, created_at: "t1" }]
    expect(mapServerMessagesToClient(rows)).toEqual([{ type: "exercise", data: payload, createdAt: "t1" }])
  })

  it("maps a prerequis row to a client prerequis message using its payload as data", () => {
    const payload = { chapter: "Les fractions", class_level: "6ème", questions: [{ question: "..." }] }
    const rows = [{ role: "assistant", kind: "prerequis", content: "QCM de prérequis", payload, created_at: "t1" }]
    expect(mapServerMessagesToClient(rows)).toEqual([{ type: "prerequis", data: payload, createdAt: "t1" }])
  })

  it("maps a legacy remediation row (old DB rows) to a client prerequis message", () => {
    const payload = { chapter: "Les fractions", class_level: "6ème", questions: [{ question: "..." }] }
    const rows = [{ role: "assistant", kind: "remediation", content: "QCM de remédiation", payload, created_at: "t1" }]
    expect(mapServerMessagesToClient(rows)).toEqual([{ type: "prerequis", data: payload, createdAt: "t1" }])
  })

  it("returns an empty array for empty/undefined input", () => {
    expect(mapServerMessagesToClient([])).toEqual([])
    expect(mapServerMessagesToClient(undefined)).toEqual([])
  })
})
