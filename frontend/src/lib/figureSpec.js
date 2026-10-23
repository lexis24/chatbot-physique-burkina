/**
 * Logique pure (sans React) des schémas de physique décrits en JSON par le backend — blocs
 * ```figure``` du chat et champ `figure` des exercices (voir FIGURE_SCHEMAS côté rag_system.py).
 * Séparée des composants de rendu (components/figures/) pour être testable sans DOM.
 */

export const FIGURE_TYPES = ["circuit", "forces", "optique", "graphique", "geometrie"]

const TYPE_ALIASES = {
  circuit: "circuit", circuits: "circuit", electrique: "circuit",
  forces: "forces", force: "forces", mecanique: "forces",
  optique: "optique", optics: "optique",
  graphique: "graphique", graph: "graphique", courbe: "graphique",
  geometrie: "geometrie", geometry: "geometrie",
}

function stripAccents(value) {
  return String(value).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim()
}

/** Type de schéma reconnu, ou null si la spec est inexploitable. Une spec sans `type` mais avec
 * des `points` est une figure géométrique (format historique, toujours accepté). */
export function detectFigureType(spec) {
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) return null
  if (spec.type != null) return TYPE_ALIASES[stripAccents(spec.type)] || null
  return Array.isArray(spec.points) && spec.points.length > 0 ? "geometrie" : null
}

/** Nom de composant/élément normalisé (« Ampèremètre » -> "amperemetre", « conducteur ohmique »
 * -> "conducteur_ohmique") : le modèle n'écrit pas toujours exactement l'identifiant attendu. */
export function stripKind(value) {
  return stripAccents(value ?? "").replace(/[\s'-]+/g, "_")
}

export function toNum(value, fallback = 0) {
  const n = typeof value === "string" ? Number(value.replace(",", ".")) : Number(value)
  return Number.isFinite(n) ? n : fallback
}

/** Point [x, y] ou {x, y} -> [x, y] numérique, ou null. */
export function toPoint(value) {
  if (Array.isArray(value) && value.length >= 2) {
    const x = toNum(value[0], NaN)
    const y = toNum(value[1], NaN)
    return Number.isFinite(x) && Number.isFinite(y) ? [x, y] : null
  }
  if (value && typeof value === "object" && "x" in value && "y" in value) return toPoint([value.x, value.y])
  return null
}

export function asArray(value) {
  return Array.isArray(value) ? value : []
}

/** Boîte englobante d'une liste de points [x, y], élargie si dégénérée (point unique, ligne). */
export function boundsOf(points, margin = 0) {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const p of points) {
    if (!p) continue
    minX = Math.min(minX, p[0]); maxX = Math.max(maxX, p[0])
    minY = Math.min(minY, p[1]); maxY = Math.max(maxY, p[1])
  }
  if (!Number.isFinite(minX)) return { minX: 0, maxX: 1, minY: 0, maxY: 1 }
  if (maxX - minX < 1e-6) { minX -= 1; maxX += 1 }
  if (maxY - minY < 1e-6) { minY -= 1; maxY += 1 }
  const mx = (maxX - minX) * margin
  const my = (maxY - minY) * margin
  return { minX: minX - mx, maxX: maxX + mx, minY: minY - my, maxY: maxY + my }
}

/** Projection des coordonnées du schéma (y vers le haut) vers l'écran SVG (y vers le bas).
 * `equal` : même échelle sur les deux axes (schémas), sinon échelles indépendantes (graphiques). */
export function makeProjector(bounds, { width, height, padding, equal = true }) {
  const availW = width - padding.left - padding.right
  const availH = height - padding.top - padding.bottom
  let sx = availW / (bounds.maxX - bounds.minX)
  let sy = availH / (bounds.maxY - bounds.minY)
  let offX = padding.left
  let offY = padding.top
  if (equal) {
    const s = Math.min(sx, sy)
    offX += (availW - (bounds.maxX - bounds.minX) * s) / 2
    offY += (availH - (bounds.maxY - bounds.minY) * s) / 2
    sx = s
    sy = s
  }
  const project = ([x, y]) => [offX + (x - bounds.minX) * sx, height - offY - (y - bounds.minY) * sy]
  return { project, scaleX: sx, scaleY: sy }
}

// ============================================================================
// Étiquettes : LaTeX léger -> morceaux de texte SVG (indices, exposants, vecteur)
// ============================================================================

const GREEK = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", theta: "θ", lambda: "λ",
  mu: "μ", nu: "ν", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", phi: "φ", varphi: "φ", omega: "ω",
  Delta: "Δ", Theta: "Θ", Lambda: "Λ", Pi: "Π", Sigma: "Σ", Phi: "Φ", Omega: "Ω",
}

function cleanLatex(raw) {
  return String(raw)
    .replace(/\$/g, "")
    .replace(/\\(?:text|mathrm|textrm|mathit)\{([^{}]*)\}/g, "$1")
    .replace(/\{,\}/g, ",")
    .replace(/\^\{?\\circ\}?/g, "°")
    .replace(/\\circ/g, "°")
    .replace(/\\[,;:! ]/g, " ")
    .replace(/\\times/g, "×")
    .replace(/\\cdot/g, "·")
    .replace(/\\approx/g, "≈")
    .replace(/\\(?:d|t)?frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2")
    // Commande inconnue (\vec au milieu d'une étiquette, \overline...) : on garde son argument,
    // jamais le nom de la commande lui-même.
    .replace(/\\([A-Za-z]+)/g, (m, name) => GREEK[name] ?? "")
}

/**
 * Découpe une étiquette (« $\vec{F}_{1}$ », « U_{AB} », « 12\,\text{V} », « 30^{\circ} »...) en
 * `{ vector, parts: [{ text, kind: "normal" | "sub" | "sup" }] }`. `vector` vaut true si toute
 * l'étiquette est un vecteur (\vec ou \overrightarrow) : le rendu trace alors une flèche au-dessus.
 */
export function parseLabel(raw) {
  if (raw == null) return { vector: false, parts: [] }
  let text = String(raw).trim()
  let vector = false
  const vec = /^\$?\s*\\(?:vec|overrightarrow)\{([^{}]*)\}(.*?)\s*\$?$/.exec(text)
  if (vec) {
    vector = true
    text = vec[1] + vec[2]
  }
  text = cleanLatex(text)
  const parts = []
  // Indice/exposant entre accolades, ou sinon toute la suite alphanumérique qui suit (« U_AB »,
  // « E_pp », « 10^-3 ») : en texte simple, le modèle n'écrit pas toujours les accolades.
  const re = /([_^])(?:\{([^{}]*)\}|(-?[A-Za-z0-9′']+))/g
  let last = 0
  let m
  while ((m = re.exec(text))) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), kind: "normal" })
    parts.push({ text: m[2] ?? m[3], kind: m[1] === "_" ? "sub" : "sup" })
    last = re.lastIndex
  }
  if (last < text.length) parts.push({ text: text.slice(last), kind: "normal" })
  return { vector, parts: parts.filter((p) => p.text !== "").map((p) => ({ ...p, text: p.text.replace(/[{}]/g, "") })) }
}

/** Longueur approximative (en caractères) d'une étiquette analysée, pour dimensionner son fond. */
export function labelLength(parsed) {
  return parsed.parts.reduce((n, p) => n + p.text.length * (p.kind === "normal" ? 1 : 0.75), 0)
}

/** Graduations « rondes » entre min et max (pas de 1, 2 ou 5 × 10^n), ~5 à 8 graduations. */
export function niceTicks(min, max, step) {
  let pas = toNum(step, 0)
  if (!(pas > 0)) {
    const raw = (max - min) / 6
    const pow = 10 ** Math.floor(Math.log10(raw))
    const unit = raw / pow
    pas = (unit < 1.5 ? 1 : unit < 3.5 ? 2 : unit < 7.5 ? 5 : 10) * pow
  }
  const ticks = []
  const start = Math.ceil(min / pas - 1e-9) * pas
  for (let v = start; v <= max + pas * 1e-9 && ticks.length < 40; v += pas) ticks.push(Number(v.toPrecision(12)))
  return ticks
}

/** Nombre au format français (virgule décimale), sans zéros superflus. */
export function formatNumber(value) {
  const rounded = Number(Number(value).toPrecision(6))
  return String(rounded).replace(".", ",")
}

/** Sépare un nom d'objet/image optique (« AB », « A'B' ») en ses deux extrémités, ou null. */
export function splitSegmentName(name) {
  const m = /^\s*([A-Z][′']*)([A-Z][′']*)\s*$/.exec(String(name || ""))
  return m ? [m[1], m[2]] : null
}
