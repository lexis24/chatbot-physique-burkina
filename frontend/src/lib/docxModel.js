/**
 * Modèle intermédiaire, pur (aucune dépendance à la librairie `docx`), entre le texte Markdown/
 * les données de l'application et les primitives Word. Séparé de `docx.js` exprès : la librairie
 * `docx` construit des arbres XML internes non introspectables simplement (voir `TextRun`), donc
 * toute la logique de découpage/interprétation vit ici, testable sans avoir à générer un vrai
 * document Word.
 */

export function stripFigureBlocks(text) {
  return (text || "").replace(/```figure[\s\S]*?```/g, "\n[Figure géométrique — voir dans l'application]\n")
}

// ============================================================================
// LaTeX -> texte lisible (Word n'a pas d'équivalent natif au rendu KaTeX de l'écran :
// voir docx.js. On convertit donc les commandes LaTeX les plus courantes en Unicode/texte
// plutôt que de laisser apparaître le code source "$...$" tel quel dans le document.)
// ============================================================================

const GREEK_LETTERS = {
  alpha: "α", beta: "β", gamma: "γ", delta: "δ", epsilon: "ε", varepsilon: "ε", zeta: "ζ",
  eta: "η", theta: "θ", vartheta: "θ", iota: "ι", kappa: "κ", lambda: "λ", mu: "μ", nu: "ν",
  xi: "ξ", omicron: "ο", pi: "π", rho: "ρ", sigma: "σ", tau: "τ", upsilon: "υ", phi: "φ",
  varphi: "φ", chi: "χ", psi: "ψ", omega: "ω",
  Gamma: "Γ", Delta: "Δ", Theta: "Θ", Lambda: "Λ", Xi: "Ξ", Pi: "Π", Sigma: "Σ",
  Upsilon: "Υ", Phi: "Φ", Psi: "Ψ", Omega: "Ω",
}

const BLACKBOARD_LETTERS = { R: "ℝ", Z: "ℤ", N: "ℕ", Q: "ℚ", C: "ℂ", D: "𝔻" }

const SUPERSCRIPT_CHARS = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹", "+": "⁺", "-": "⁻", n: "ⁿ", i: "ⁱ" }
const SUBSCRIPT_CHARS = { 0: "₀", 1: "₁", 2: "₂", 3: "₃", 4: "₄", 5: "₅", 6: "₆", 7: "₇", 8: "₈", 9: "₉", "+": "₊", "-": "₋" }

// Commandes remplacées par un symbole Unicode fixe, sans argument entre accolades.
const LATEX_SYMBOLS = [
  [/\\Longrightarrow/g, "⟹"], [/\\Rightarrow/g, "⇒"], [/\\Leftrightarrow/g, "⇔"], [/\\Leftarrow/g, "⇐"],
  [/\\longrightarrow/g, "⟶"], [/\\to/g, "→"],
  [/\\leqslant/g, "≤"], [/\\leq/g, "≤"], [/\\geqslant/g, "≥"], [/\\geq/g, "≥"],
  [/\\neq/g, "≠"], [/\\approx/g, "≈"], [/\\equiv/g, "≡"], [/\\sim/g, "∼"], [/\\propto/g, "∝"],
  [/\\notin/g, "∉"], [/\\in/g, "∈"], [/\\subseteq/g, "⊆"], [/\\subset/g, "⊂"],
  [/\\cup/g, "∪"], [/\\cap/g, "∩"], [/\\setminus/g, "∖"],
  [/\\times/g, "×"], [/\\cdot/g, "·"], [/\\div/g, "÷"], [/\\pm/g, "±"], [/\\mp/g, "∓"],
  [/\\infty/g, "∞"], [/\\forall/g, "∀"], [/\\exists/g, "∃"], [/\\emptyset/g, "∅"], [/\\varnothing/g, "∅"],
  [/\\checkmark/g, "✓"], [/\\nabla/g, "∇"], [/\\partial/g, "∂"], [/\\perp/g, "⊥"], [/\\parallel/g, "∥"],
  [/\\angle/g, "∠"], [/\\degree/g, "°"],
  [/\\ldots/g, "…"], [/\\cdots/g, "⋯"], [/\\dots/g, "…"],
  [/\\%/g, "%"], [/\\&/g, "&"], [/\\_/g, "_"],
]

// Espacements/sauts de ligne LaTeX sans équivalent visuel utile en texte brut : remplacés par
// un simple espace pour ne pas coller deux morceaux de formule l'un à l'autre.
const LATEX_SPACING = /\\(?:quad|qquad|,|;|!|:|\s)|\\\\/g

/** Remplace récursivement les commandes à argument(s) entre accolades ({...}), en traitant les
 * groupes les plus internes en premier (regex sans accolades imbriquées, répétée jusqu'à
 * stabilisation) — suffisant pour les formules d'élève typiques (peu ou pas de nesting profond),
 * sans avoir à écrire un vrai analyseur LaTeX. */
function reduceLatexGroups(input) {
  let text = input
  let previous
  do {
    previous = text
    text = text
      .replace(/\\d?frac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `(${a})/(${b})`)
      .replace(/\\tfrac\{([^{}]*)\}\{([^{}]*)\}/g, (_, a, b) => `(${a})/(${b})`)
      .replace(/\\sqrt\[([^[\]]*)\]\{([^{}]*)\}/g, (_, n, a) => `${n}√(${a})`)
      .replace(/\\sqrt\{([^{}]*)\}/g, (_, a) => `√(${a})`)
      .replace(/\\mathbb\{([A-Z])\}/g, (_, l) => BLACKBOARD_LETTERS[l] || l)
      .replace(/\\(?:mathrm|mathit|mathbf|textbf|textit|text)\{([^{}]*)\}/g, (_, a) => a)
      .replace(/\\overrightarrow\{([^{}]*)\}/g, (_, a) => `${a}⃗`)
      .replace(/\\vec\{([^{}]*)\}/g, (_, a) => `${a}⃗`)
      .replace(/\\boxed\{([^{}]*)\}/g, (_, a) => `[${a}]`)
      .replace(/\\left([([|.])/g, (_, b) => (b === "." ? "" : b))
      .replace(/\\right([)\]|.])/g, (_, b) => (b === "." ? "" : b))
  } while (text !== previous)
  return text
}

function toScriptChars(content, map) {
  const chars = Array.from(content)
  if (chars.length > 0 && chars.every((ch) => map[ch])) return chars.map((ch) => map[ch]).join("")
  return null // pas convertible caractère par caractère (lettre non standard, etc.)
}

/** `x^{2}`/`x^2` -> `x²`, `u_{n}`/`u_n` -> `uₙ` quand chaque caractère a un équivalent Unicode ;
 * repli sur `^(...)`/`_(...)` sinon (ex: exposant contenant lui-même une fraction convertie). */
function convertScripts(text) {
  return text
    .replace(/\^\{([^{}]*)\}/g, (_, c) => toScriptChars(c, SUPERSCRIPT_CHARS) ?? `^(${c})`)
    .replace(/\^([0-9a-zA-Z+-])/g, (_, c) => toScriptChars(c, SUPERSCRIPT_CHARS) ?? `^${c}`)
    .replace(/_\{([^{}]*)\}/g, (_, c) => toScriptChars(c, SUBSCRIPT_CHARS) ?? `_(${c})`)
    .replace(/_([0-9+-])/g, (_, c) => toScriptChars(c, SUBSCRIPT_CHARS) ?? `_${c}`)
}

/** Convertit le CONTENU d'une formule LaTeX (sans les délimiteurs $/$$) en texte lisible. */
function convertLatexSpan(latex) {
  let text = latex.trim()
  text = reduceLatexGroups(text)
  text = convertScripts(text)
  for (const [pattern, replacement] of LATEX_SYMBOLS) text = text.replace(pattern, replacement)
  text = text.replace(
    /\\(alpha|beta|gamma|Gamma|delta|Delta|epsilon|varepsilon|zeta|eta|theta|vartheta|Theta|iota|kappa|lambda|Lambda|mu|nu|xi|Xi|omicron|pi|Pi|rho|sigma|Sigma|tau|upsilon|Upsilon|phi|varphi|Phi|chi|psi|Psi|omega|Omega)\b/g,
    (_, name) => GREEK_LETTERS[name] || name
  )
  // Fonctions usuelles : juste retirer le backslash, le nom seul reste lisible tel quel.
  text = text.replace(/\\(sin|cos|tan|arcsin|arccos|arctan|ln|log|exp|lim|det|min|max|sup|inf|gcd|pgcd)\b/g, "$1")
  text = text.replace(LATEX_SPACING, " ")
  text = text.replace(/[{}]/g, "") // accolades de regroupement restantes (ex: {ABC} après \vec)
  text = text.replace(/\\([a-zA-Z]+)/g, "$1") // repli générique : commande inconnue -> son nom sans le \
  return text.replace(/\s+/g, " ").trim()
}

/** Remplace tous les segments `$$...$$` puis `$...$` d'un texte par leur équivalent lisible —
 * voir convertLatexSpan. Un texte sans LaTeX ressort strictement inchangé. */
export function convertLatexToPlainText(text) {
  if (!text) return text || ""
  return text
    .replace(/\$\$([\s\S]+?)\$\$/g, (_, inner) => convertLatexSpan(inner))
    .replace(/\$([^$\n]+?)\$/g, (_, inner) => convertLatexSpan(inner))
}

/** Découpe une ligne en segments {text, bold}, sur la syntaxe Markdown **gras** — les formules
 * LaTeX ($...$/$$...$$) sont converties en texte lisible avant ce découpage. */
export function splitBoldSegments(line) {
  return convertLatexToPlainText(line)
    .split(/(\*\*[^*]+\*\*)/g)
    .filter((part) => part.length > 0)
    .map((part) => {
      const isBold = part.startsWith("**") && part.endsWith("**")
      return { text: isBold ? part.slice(2, -2) : part, bold: isBold }
    })
}

/**
 * Convertit un texte Markdown en une liste de lignes typées : {type: "blank"|"heading2"|
 * "heading3"|"bullet"|"text", segments: [{text, bold}, ...]}. Les blocs ```figure``` sont
 * remplacés par une mention textuelle (pas d'équivalent image natif dans Word).
 */
export function parseMarkdownLines(rawText) {
  const lines = stripFigureBlocks(rawText).split("\n")
  return lines.map((rawLine) => {
    const line = rawLine.trimEnd()
    if (!line.trim()) return { type: "blank", segments: [] }

    const h2 = line.match(/^##\s+(.*)/)
    if (h2) return { type: "heading2", segments: splitBoldSegments(h2[1]) }

    const h3 = line.match(/^###\s+(.*)/)
    if (h3) return { type: "heading3", segments: splitBoldSegments(h3[1]) }

    const bullet = line.match(/^[-*]\s+(.*)/)
    if (bullet) return { type: "bullet", segments: splitBoldSegments(bullet[1]) }

    return { type: "text", segments: splitBoldSegments(line) }
  })
}

/**
 * Convertit une liste de questions QCM (voir generate_exercise côté backend :
 * {question, choix[], reponse_correcte_index, explication}) en lignes typées pour l'export Word.
 */
export function qcmToLines(questions) {
  const lines = []
  ;(questions || []).forEach((q, i) => {
    lines.push({ type: "question", segments: splitBoldSegments(`${i + 1}. ${q.question || ""}`) })
    ;(q.choix || []).forEach((choice, ci) => {
      lines.push({ type: "choice", correct: ci === q.reponse_correcte_index, text: convertLatexToPlainText(choice) })
    })
    if (q.explication) {
      lines.push({ type: "explication", segments: splitBoldSegments(q.explication) })
    }
  })
  return lines
}

/**
 * Convertit les groupes {notion, rappel, exercices} du diagnostic de prérequis (voir
 * generate_prerequis côté backend) en lignes typées pour l'export Word : un rappel de cours par
 * notion, suivi de ses 1-2 exercices — numérotation continue sur tout le diagnostic.
 */
export function prerequisToLines(notions) {
  const lines = []
  let counter = 0
  ;(notions || []).forEach((n) => {
    lines.push({ type: "heading3", segments: splitBoldSegments(n.notion || "") })
    if (n.rappel) lines.push({ type: "text", segments: splitBoldSegments(n.rappel) })
    ;(n.exercices || []).forEach((ex) => {
      counter += 1
      lines.push({ type: "question", segments: splitBoldSegments(`${counter}. ${ex.question || ""}`) })
      ;(ex.choix || []).forEach((choice, ci) => {
        lines.push({ type: "choice", correct: ci === ex.reponse_correcte_index, text: convertLatexToPlainText(choice) })
      })
      if (ex.explication) {
        lines.push({ type: "explication", segments: splitBoldSegments(ex.explication) })
      }
    })
  })
  return lines
}
