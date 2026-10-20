import { describe, it, expect } from "vitest"
import { isSameDay, formatMessageTime, formatDaySeparator } from "./dateFormat.js"

describe("isSameDay", () => {
  it("is true for two timestamps on the same calendar day", () => {
    expect(isSameDay("2026-08-12T08:00:00+00:00", "2026-08-12T23:00:00+00:00")).toBe(true)
  })

  it("is false for timestamps on different calendar days", () => {
    expect(isSameDay("2026-08-12T23:59:00+00:00", "2026-08-13T00:01:00+00:00")).toBe(false)
  })
})

describe("formatMessageTime", () => {
  it("formats an ISO timestamp as HH:MM", () => {
    expect(formatMessageTime("2026-08-12T14:32:00+00:00")).toMatch(/^\d{2}:\d{2}$/)
  })

  it("returns an empty string for missing or invalid input", () => {
    expect(formatMessageTime(null)).toBe("")
    expect(formatMessageTime("")).toBe("")
    expect(formatMessageTime("not-a-date")).toBe("")
  })
})

describe("formatDaySeparator", () => {
  it("labels today's date as \"Aujourd'hui\"", () => {
    const now = new Date().toISOString()
    expect(formatDaySeparator(now)).toBe("Aujourd'hui")
  })

  it("labels yesterday's date as \"Hier\"", () => {
    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    expect(formatDaySeparator(yesterday.toISOString())).toBe("Hier")
  })

  it("labels an older date as \"day month\" (no year)", () => {
    const older = new Date()
    older.setDate(older.getDate() - 10)
    const label = formatDaySeparator(older.toISOString())
    expect(label).not.toBe("Aujourd'hui")
    expect(label).not.toBe("Hier")
    expect(label).toMatch(/^\d{1,2} [a-zéûî]+$/)
  })

  it("returns an empty string for missing or invalid input", () => {
    expect(formatDaySeparator(null)).toBe("")
    expect(formatDaySeparator("not-a-date")).toBe("")
  })
})
