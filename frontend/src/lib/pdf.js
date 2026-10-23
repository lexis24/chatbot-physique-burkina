const UNSUPPORTED_COLOR_FN = /(oklch|oklab|lch|lab|color)\(/i
// Toutes les propriétés de couleur que html2canvas essaie de parser pour CHAQUE élément
// (cf. son CSSParsedDeclaration) — une seule oubliée suffit à faire planter toute la capture.
const COLOR_PROPERTIES = [
  "color",
  "backgroundColor",
  "borderTopColor",
  "borderRightColor",
  "borderBottomColor",
  "borderLeftColor",
  "outlineColor",
  "textDecorationColor",
  "webkitTextStrokeColor",
  "fill",
  "stroke",
  "stopColor",
  "floodColor",
  "lightingColor",
  "caretColor",
  "columnRuleColor",
]
const SHADOW_PROPERTIES = ["boxShadow", "textShadow"]

/**
 * html2canvas (1.x) ne sait pas parser les fonctions de couleur modernes (oklch/oklab/lch/color()),
 * or DaisyUI 4 + Tailwind les utilisent pour toutes ses couleurs de thème — y compris sur les
 * ancêtres du nœud exporté (<body>, <main>...), que html2canvas parcourt aussi pour composer les
 * fonds. Résultat : la capture plantait silencieusement et le bouton "Télécharger la session" ne
 * produisait jamais de PDF.
 *
 * On neutralise le problème en normalisant ces couleurs en rgb() via le canvas 2D (qui sait, lui,
 * résoudre n'importe quelle syntaxe CSS valide), directement sur le document cloné par html2canvas
 * (déjà stylé, donc getComputedStyle y est fiable) — sur TOUT le document, pas seulement le nœud
 * exporté, puisque des ancêtres hors de ce nœud sont aussi consultés lors du rendu.
 */
function normalizeUnsupportedColors(clonedDoc) {
  const view = clonedDoc.defaultView || window

  // Lire `ctx.fillStyle` après affectation ne suffit plus : les Chromium récents renvoient la
  // couleur dans sa notation d'origine (oklch(...)) au lieu de la normaliser. On force donc une
  // conversion en sRGB 8 bits fiable en peignant 1 pixel puis en relisant ses octets bruts.
  const probeCanvas = document.createElement("canvas")
  probeCanvas.width = 1
  probeCanvas.height = 1
  const probe = probeCanvas.getContext("2d", { willReadFrequently: true })

  function toSafeColor(value) {
    if (!value || !UNSUPPORTED_COLOR_FN.test(value)) return null
    try {
      probe.clearRect(0, 0, 1, 1)
      probe.fillStyle = value
      probe.fillRect(0, 0, 1, 1)
      const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
      return a === 255 ? `rgb(${r}, ${g}, ${b})` : `rgba(${r}, ${g}, ${b}, ${(a / 255).toFixed(3)})`
    } catch {
      return "#000000"
    }
  }

  function toKebabCase(prop) {
    const kebab = prop.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase())
    return prop.startsWith("webkit") ? "-" + kebab : kebab
  }

  // Convertit chaque fonction de couleur non supportée TROUVÉE À L'INTÉRIEUR d'une valeur
  // composite (ex: les arrêts de couleur d'un `linear-gradient(...)`) — contrairement à
  // toSafeColor, qui ne sait traiter qu'une valeur de couleur seule en entrée.
  function replaceUnsupportedColorsInside(value) {
    return value.replace(/(?:oklch|oklab|lch|lab|color)\([^()]*\)/gi, (match) => toSafeColor(match) || match)
  }

  clonedDoc.querySelectorAll("*").forEach((el) => {
    if (!el.style) return
    const computed = view.getComputedStyle(el)

    for (const prop of COLOR_PROPERTIES) {
      const safe = toSafeColor(computed[prop])
      if (safe) el.style.setProperty(toKebabCase(prop), safe, "important")
    }

    for (const prop of SHADOW_PROPERTIES) {
      const value = computed[prop]
      if (value && value !== "none" && UNSUPPORTED_COLOR_FN.test(value)) {
        el.style.setProperty(toKebabCase(prop), "none", "important")
      }
    }

    // Convertir les arrêts de couleur plutôt que supprimer tout le dégradé (ancien comportement) :
    // les bulles de message "élève" (fond dégradé bg-gradient-to-br, texte clair par-dessus)
    // devenaient invisibles — texte clair sur fond blanc par défaut — une fois le dégradé annulé,
    // symptôme "la question n'apparaît pas" observé dans les PDF exportés.
    const backgroundImage = computed.backgroundImage
    if (backgroundImage && backgroundImage !== "none" && UNSUPPORTED_COLOR_FN.test(backgroundImage)) {
      el.style.setProperty("background-image", replaceUnsupportedColorsInside(backgroundImage), "important")
    }
  })
}

// ============================================================================
// Polices web intégrées à la capture (mode foreignObject)
// ============================================================================

const normalizeFamily = (f) => String(f || "").replace(/["']/g, "").trim().toLowerCase()
const normalizeWeight = (w) => ({ normal: "400", bold: "700" }[String(w || "400").trim()] || String(w).trim())
// Plages Unicode comparées numériquement : Chrome expose « U+0-FF, U+131 » (FontFace.unicodeRange)
// là où la feuille Google Fonts écrit « U+0000-00FF, U+0131 ».
const normalizeRange = (r) => String(r || "")
  .split(",")
  .map((token) => {
    const m = /U\+([0-9A-F?]+)(?:-([0-9A-F]+))?/i.exec(token.trim())
    if (!m) return ""
    const lo = parseInt(m[1].replace(/\?/g, "0"), 16)
    const hi = m[2] ? parseInt(m[2], 16) : m[1].includes("?") ? parseInt(m[1].replace(/\?/g, "F"), 16) : lo
    return `${lo}-${hi}`
  })
  .filter(Boolean)
  .join(",")

/** Blocs @font-face de toutes les feuilles de style de la page, avec leur URL de base. Les
 * feuilles d'une autre origine (Google Fonts) ne sont pas lisibles via cssRules : on télécharge
 * alors leur texte (CORS autorisé par Google Fonts). */
async function collectFontFaceBlocks() {
  const blocks = []
  for (const sheet of Array.from(document.styleSheets)) {
    const base = sheet.href || document.baseURI
    try {
      for (const rule of Array.from(sheet.cssRules)) {
        if (rule.type === CSSRule.FONT_FACE_RULE) blocks.push({ text: rule.cssText, base })
      }
    } catch {
      if (!sheet.href) continue
      try {
        const css = await fetch(sheet.href).then((r) => r.text())
        for (const m of css.matchAll(/@font-face\s*\{[^}]*\}/g)) blocks.push({ text: m[0], base })
      } catch { /* feuille illisible : ses polices ne seront simplement pas intégrées */ }
    }
  }
  return blocks
}

function parseFontFace({ text, base }) {
  const prop = (name) => new RegExp(`${name}\\s*:\\s*([^;}]+)`, "i").exec(text)?.[1]?.trim()
  const urls = [...text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1])
  const url = urls.find((u) => /\.woff2(\?|$)/i.test(u)) || urls[0]
  if (!url) return null
  return {
    family: normalizeFamily(prop("font-family")),
    weight: normalizeWeight(prop("font-weight")),
    style: (prop("font-style") || "normal").toLowerCase(),
    range: normalizeRange(prop("unicode-range")),
    rawRange: prop("unicode-range"),
    url: new URL(url, base).href,
  }
}

function toBase64(buffer) {
  const bytes = new Uint8Array(buffer)
  let binary = ""
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(binary)
}

let embeddedFontCssPromise = null

/**
 * CSS @font-face des polices RÉELLEMENT chargées par la page (document.fonts), sources remplacées
 * par des data: URL. Indispensable en foreignObject : l'image SVG ne peut charger aucune ressource
 * externe, et sans ces polices le texte est redessiné avec des polices de remplacement plus larges
 * qui débordent des hauteurs de blocs calculées à l'écran (lignes qui se chevauchent dans le PDF).
 * Calculé une seule fois par session.
 */
function embeddedFontCss() {
  embeddedFontCssPromise ||= (async () => {
    await document.fonts.ready
    const loaded = Array.from(document.fonts).filter((f) => f.status === "loaded").map((f) => ({
      family: normalizeFamily(f.family), weight: normalizeWeight(f.weight), style: f.style, range: normalizeRange(f.unicodeRange),
    }))
    const faces = (await collectFontFaceBlocks()).map(parseFontFace).filter(Boolean).filter((face) =>
      loaded.some((l) => l.family === face.family && l.weight === face.weight && l.style === face.style &&
        (!face.range || l.range === face.range || l.range === "0-1114111")),
    )
    const css = await Promise.all(faces.map(async (face) => {
      try {
        const data = toBase64(await fetch(face.url).then((r) => r.arrayBuffer()))
        return `@font-face{font-family:"${face.family}";font-weight:${face.weight};font-style:${face.style};font-display:block;` +
          `${face.rawRange ? `unicode-range:${face.rawRange};` : ""}src:url(data:font/woff2;base64,${data}) format("woff2")}`
      } catch {
        return ""
      }
    }))
    return css.join("\n")
  })().catch(() => "")
  return embeddedFontCssPromise
}

/** Position (en pixels du canvas capturé) de chaque bloc de premier niveau — un message, un
 * exercice, une figure... — pour ne jamais couper une page pile au milieu de l'un d'eux (un
 * schéma tronqué en haut de la page suivante, par exemple). */
function measureBlocks(root, canvas) {
  const rootRect = root.getBoundingClientRect()
  const canvasScale = rootRect.width > 0 ? canvas.width / rootRect.width : 2
  return Array.from(root.children).filter((el) => !el.hasAttribute("data-pdf-fonts")).map((el) => {
    const r = el.getBoundingClientRect()
    return {
      top: Math.round((r.top - rootRect.top) * canvasScale),
      bottom: Math.round((r.bottom - rootRect.top) * canvasScale),
    }
  })
}

/**
 * Capture le noeud en image. Rendu html2canvas classique : il redessine lui-même le texte et place
 * mal tout ce que KaTeX positionne en hauteur (numérateurs barrés par leur trait de fraction,
 * racines, flèches de vecteur, \boxed décalé) — inacceptable pour des formules de physique.
 * D'où, en priorité, le mode `foreignObjectRendering` : c'est le navigateur qui dessine, donc
 * KaTeX et les schémas SVG sortent exactement comme à l'écran. Ce mode décale l'image de la
 * position du noeud dans la page (défaut connu de html2canvas, x/y ignorés) : on capture donc une
 * COPIE posée en position fixe tout en haut à gauche de la fenêtre, derrière l'application.
 * Repli sur le rendu classique si ce mode échoue (ex: Safari refuse parfois d'exporter un canvas
 * dessiné via foreignObject).
 */
/** Vrai si le canvas ne contient (quasiment) que du blanc : une capture ratée, jamais un vrai
 * contenu (il y a toujours au moins du texte sombre dans une session). Échantillonnage sur une
 * réduction 64×64 plutôt que sur tous les pixels d'une capture de plusieurs mégapixels. */
function isBlankCanvas(canvas) {
  const probe = document.createElement("canvas")
  probe.width = 64
  probe.height = 64
  const ctx = probe.getContext("2d", { willReadFrequently: true })
  ctx.drawImage(canvas, 0, 0, 64, 64)
  const { data } = ctx.getImageData(0, 0, 64, 64)
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] < 235 || data[i + 1] < 235 || data[i + 2] < 235) return false
  }
  return true
}

async function captureNode(html2canvas, node) {
  // Le rendu foreignObject décale l'image de la position de défilement de la fenêtre : page
  // défilée = capture qui tombe à côté du contenu (PDF entièrement blanc). On remonte en haut
  // le temps de la capture, puis on rend à l'élève sa position de lecture.
  const scrollX = window.scrollX
  const scrollY = window.scrollY
  window.scrollTo(0, 0)
  try {
    return await captureNodeAtTop(html2canvas, node)
  } finally {
    window.scrollTo(scrollX, scrollY)
  }
}

async function captureNodeAtTop(html2canvas, node) {
  const rect = node.getBoundingClientRect()
  const inherited = window.getComputedStyle(node.parentElement || node)
  const wrapper = document.createElement("div")
  wrapper.setAttribute("aria-hidden", "true")
  wrapper.style.cssText =
    `position:fixed;left:0;top:0;width:${rect.width}px;z-index:-1;pointer-events:none;` +
    `font-family:${inherited.fontFamily};font-size:${inherited.fontSize};line-height:${inherited.lineHeight};` +
    `color:${inherited.color}`
  const copy = node.cloneNode(true)
  wrapper.appendChild(copy)
  document.body.appendChild(wrapper)
  try {
    const fontCss = await embeddedFontCss()
    if (fontCss) {
      // Dans la copie elle-même (seul le sous-arbre capturé est sérialisé dans l'image), et dans
      // un <svg> : en foreignObject, html2canvas supprime les <style> HTML du clone (test
      // `tagName === "STYLE"`), mais pas le <style> d'un SVG (tagName "style", en minuscules).
      const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg")
      svg.setAttribute("width", "0")
      svg.setAttribute("height", "0")
      svg.setAttribute("data-pdf-fonts", "")
      svg.style.cssText = "position:absolute;width:0;height:0;overflow:hidden"
      const style = document.createElementNS("http://www.w3.org/2000/svg", "style")
      style.textContent = fontCss
      svg.appendChild(style)
      copy.prepend(svg)
    }
    const canvas = await html2canvas(copy, {
      scale: 2,
      backgroundColor: "#ffffff",
      useCORS: true,
      foreignObjectRendering: true,
      onclone: (clonedDoc) => {
        // Même en foreignObject, html2canvas analyse fonds et bordures : couleurs oklch à normaliser.
        normalizeUnsupportedColors(clonedDoc)
      },
    })
    // Un canvas illisible (sécurité) lève ici plutôt qu'au moment de l'ajout au PDF, et une
    // capture blanche (rendu raté, sans erreur levée) part aussi vers le rendu classique.
    if (isBlankCanvas(canvas)) throw new Error("capture foreignObject vide")
    return { canvas, blockBoundaries: measureBlocks(copy, canvas) }
  } catch (e) {
    console.warn("[pdf] rendu foreignObject impossible, repli sur le rendu classique :", e)
  } finally {
    wrapper.remove()
  }

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    onclone: (clonedDoc) => {
      normalizeUnsupportedColors(clonedDoc)
    },
  })
  return { canvas, blockBoundaries: measureBlocks(node, canvas) }
}

/**
 * Exporte le contenu visuel d'un noeud DOM (rendu Markdown + KaTeX inclus) en PDF,
 * en le découpant automatiquement sur plusieurs pages si nécessaire.
 *
 * jsPDF/html2canvas sont chargés à la demande (dynamic import) pour ne pas alourdir
 * le bundle principal : ces libs ne servent qu'au clic sur "Télécharger en PDF".
 */
export async function exportNodeToPDF(node, { filename = "chatphysique.pdf", title = "", subtitle = "" } = {}) {
  if (!node) return

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ])

  const { canvas, blockBoundaries } = await captureNode(html2canvas, node)

  const pdf = new jsPDF({ unit: "pt", format: "a4" })
  const pageWidth = pdf.internal.pageSize.getWidth()
  const pageHeight = pdf.internal.pageSize.getHeight()
  const margin = 36
  const contentWidth = pageWidth - margin * 2

  let cursorY = margin

  pdf.setFont("helvetica", "bold")
  pdf.setFontSize(16)
  pdf.setTextColor(30, 41, 59)
  if (title) {
    pdf.text(title, margin, cursorY)
    cursorY += 20
  }
  if (subtitle) {
    pdf.setFont("helvetica", "normal")
    pdf.setFontSize(10)
    pdf.setTextColor(100, 116, 139)
    pdf.text(subtitle, margin, cursorY)
    cursorY += 16
  }
  cursorY += 6

  const imgWidth = contentWidth
  const scaleFactor = canvas.width / imgWidth
  // Capacité d'une page PLEINE (sans le titre/sous-titre, qui ne réduisent que la 1ère page) :
  // sert à décider si reculer la coupure avant un bloc est utile (voir straddling ci-dessous) —
  // sans cette borne, un bloc plus haut qu'une page entière (une longue réponse) faisait reculer
  // la coupure jusqu'à tout juste après le séparateur de date, laissant la quasi-totalité de la
  // 1ère page vide : reculer ne sert à rien si le bloc ne tiendrait de toute façon sur AUCUNE page.
  const fullPageCapacityPx = Math.floor((pageHeight - margin * 2) * scaleFactor)

  // Boucle en pixels entiers (espace du canvas), pas en points PDF flottants : une dérive
  // d'arrondi sur `remainingHeight` pouvait faire passer la dernière tranche en dessous de 0,
  // ce qui transformait `sliceCanvas.height` (un unsigned long) en valeur énorme et produisait
  // un PNG corrompu — exactement l'erreur "Incomplete or corrupt PNG file" vue sur les longues sessions.
  let sourceY = 0
  let firstPage = true
  while (sourceY < canvas.height) {
    if (!firstPage) {
      pdf.addPage()
      cursorY = margin
    }
    const availableHeight = pageHeight - cursorY - margin
    let sliceHeightPx = Math.max(1, Math.min(Math.floor(availableHeight * scaleFactor), canvas.height - sourceY))

    // Si la coupure naturelle tombe au milieu d'un bloc qui tiendrait sur une page pleine, on
    // recule la fin de page jusqu'à juste avant ce bloc plutôt que de le couper — mais seulement
    // dans ce cas : un bloc plus grand qu'une page entière sera de toute façon coupé tôt ou tard,
    // autant que ce soit ici plutôt que de gâcher toute la page courante à l'éviter en vain.
    const candidateCut = sourceY + sliceHeightPx
    const straddling = blockBoundaries.find(
      (b) => b.top > sourceY && b.top < candidateCut && b.bottom > candidateCut && b.bottom - b.top <= fullPageCapacityPx
    )
    if (straddling) {
      sliceHeightPx = Math.max(1, straddling.top - sourceY)
    }

    const sliceCanvas = document.createElement("canvas")
    sliceCanvas.width = canvas.width
    sliceCanvas.height = sliceHeightPx
    const ctx = sliceCanvas.getContext("2d")
    ctx.drawImage(canvas, 0, sourceY, canvas.width, sliceHeightPx, 0, 0, canvas.width, sliceHeightPx)

    // JPEG plutôt que PNG : jsPDF réembarque nos tranches en bitmap non compressé quand on lui
    // donne du PNG (une tranche pleine page pesait ~12 Mo, un export de 3 pages ~25 Mo au total).
    // Fond opaque garanti par html2canvas (backgroundColor: "#ffffff" ci-dessus) : la transparence
    // du PNG n'est jamais utilisée, JPEG (sans canal alpha) ne perd donc rien d'utile.
    const sliceData = sliceCanvas.toDataURL("image/jpeg", 0.92)
    const sliceHeightPt = sliceHeightPx / scaleFactor
    pdf.addImage(sliceData, "JPEG", margin, cursorY, imgWidth, sliceHeightPt)

    sourceY += sliceHeightPx
    firstPage = false
  }

  pdf.setFontSize(8)
  pdf.setTextColor(148, 163, 184)
  const pageCount = pdf.internal.getNumberOfPages()
  for (let i = 1; i <= pageCount; i++) {
    pdf.setPage(i)
    pdf.text(
      `Prof Aïcha, page ${i}/${pageCount}`,
      margin,
      pageHeight - 16
    )
  }

  pdf.save(filename)
}
