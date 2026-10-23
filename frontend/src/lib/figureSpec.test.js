import { describe, it, expect } from "vitest"
import {
  detectFigureType, toPoint, stripKind, parseLabel, niceTicks, formatNumber, splitSegmentName, makeProjector, boundsOf,
} from "./figureSpec"

describe("detectFigureType", () => {
  it("reads the explicit type, accents and aliases included", () => {
    expect(detectFigureType({ type: "circuit" })).toBe("circuit")
    expect(detectFigureType({ type: "Géométrie" })).toBe("geometrie")
    expect(detectFigureType({ type: "graph" })).toBe("graphique")
  })

  it("treats a typeless spec with points as a geometry figure (historical format)", () => {
    expect(detectFigureType({ points: [{ id: "A", x: 0, y: 0 }] })).toBe("geometrie")
  })

  it("rejects unknown types and unusable values", () => {
    expect(detectFigureType({ type: "chimie" })).toBeNull()
    expect(detectFigureType({})).toBeNull()
    expect(detectFigureType(null)).toBeNull()
    expect(detectFigureType([1, 2])).toBeNull()
  })
})

describe("toPoint / stripKind", () => {
  it("accepts [x, y], {x, y} and French decimal strings", () => {
    expect(toPoint([1, 2])).toEqual([1, 2])
    expect(toPoint({ x: "1,5", y: 0 })).toEqual([1.5, 0])
    expect(toPoint(["a", 2])).toBeNull()
    expect(toPoint(undefined)).toBeNull()
  })

  it("normalizes component names written loosely by the model", () => {
    expect(stripKind("Ampèremètre")).toBe("amperemetre")
    expect(stripKind("conducteur ohmique")).toBe("conducteur_ohmique")
    expect(stripKind("interrupteur-ouvert")).toBe("interrupteur_ouvert")
  })
})

describe("parseLabel", () => {
  it("marks a whole-label vector and keeps its name", () => {
    expect(parseLabel("$\\vec{F}$")).toEqual({ vector: true, parts: [{ text: "F", kind: "normal" }] })
  })

  it("splits subscripts and superscripts", () => {
    expect(parseLabel("U_{AB}").parts).toEqual([{ text: "U", kind: "normal" }, { text: "AB", kind: "sub" }])
    expect(parseLabel("$\\vec{F}_1$")).toEqual({ vector: true, parts: [{ text: "F", kind: "normal" }, { text: "1", kind: "sub" }] })
    expect(parseLabel("m/s^2").parts).toEqual([{ text: "m/s", kind: "normal" }, { text: "2", kind: "sup" }])
    expect(parseLabel("U_AB = 6 V").parts).toEqual([
      { text: "U", kind: "normal" }, { text: "AB", kind: "sub" }, { text: " = 6 V", kind: "normal" },
    ])
    expect(parseLabel("10^-3").parts).toEqual([{ text: "10", kind: "normal" }, { text: "-3", kind: "sup" }])
  })

  it("renders units, decimal commas, degrees and Greek letters", () => {
    const text = (raw) => parseLabel(raw).parts.map((p) => p.text).join("")
    expect(text("$9{,}8\\,\\text{m/s}$")).toBe("9,8 m/s")
    expect(text("$R = 1{,}5\\,\\text{k}\\Omega$")).toBe("R = 1,5 kΩ")
    expect(text("$\\alpha = 30^{\\circ}$")).toBe("α = 30°")
  })

  it("never leaks an unknown command name", () => {
    const text = parseLabel("$2\\vec{F}$").parts.map((p) => p.text).join("")
    expect(text).toBe("2F")
  })
})

describe("graph helpers", () => {
  it("builds round ticks, honouring an explicit step", () => {
    expect(niceTicks(0, 50, 10)).toEqual([0, 10, 20, 30, 40, 50])
    expect(niceTicks(0, 6)).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(niceTicks(0, 0.5)).toEqual([0, 0.1, 0.2, 0.3, 0.4, 0.5])
  })

  it("formats numbers with a French decimal comma", () => {
    expect(formatNumber(0.30000000000000004)).toBe("0,3")
    expect(formatNumber(12)).toBe("12")
  })
})

describe("splitSegmentName", () => {
  it("splits optics object/image names into their two endpoints", () => {
    expect(splitSegmentName("AB")).toEqual(["A", "B"])
    expect(splitSegmentName("A'B'")).toEqual(["A'", "B'"])
    expect(splitSegmentName("objet")).toBeNull()
  })
})

describe("makeProjector", () => {
  it("maps y-up figure coordinates to y-down screen coordinates", () => {
    const { project } = makeProjector(boundsOf([[0, 0], [10, 10]]), {
      width: 100, height: 100, padding: { top: 0, right: 0, bottom: 0, left: 0 },
    })
    expect(project([0, 0])).toEqual([0, 100])
    expect(project([10, 10])).toEqual([100, 0])
  })
})
