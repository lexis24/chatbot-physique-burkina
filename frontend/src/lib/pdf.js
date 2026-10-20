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

/**
 * Exporte le contenu visuel d'un noeud DOM (rendu Markdown + KaTeX inclus) en PDF,
 * en le découpant automatiquement sur plusieurs pages si nécessaire.
 *
 * jsPDF/html2canvas sont chargés à la demande (dynamic import) pour ne pas alourdir
 * le bundle principal : ces libs ne servent qu'au clic sur "Télécharger en PDF".
 */
export async function exportNodeToPDF(node, { filename = "chatmaths.pdf", title = "", subtitle = "" } = {}) {
  if (!node) return

  const [{ default: jsPDF }, { default: html2canvas }] = await Promise.all([
    import("jspdf"),
    import("html2canvas"),
  ])

  const canvas = await html2canvas(node, {
    scale: 2,
    backgroundColor: "#ffffff",
    useCORS: true,
    onclone: (clonedDoc) => {
      normalizeUnsupportedColors(clonedDoc)
    },
  })

  // Position (en pixels du canvas capturé) de chaque bloc de premier niveau — un message, un
  // exercice, une figure... — pour ne jamais couper une page pile au milieu de l'un d'eux (un
  // schéma géométrique tronché en haut de la page suivante, par exemple).
  const nodeRect = node.getBoundingClientRect()
  const canvasScale = nodeRect.width > 0 ? canvas.width / nodeRect.width : 2
  const blockBoundaries = Array.from(node.children).map((el) => {
    const r = el.getBoundingClientRect()
    return {
      top: Math.round((r.top - nodeRect.top) * canvasScale),
      bottom: Math.round((r.bottom - nodeRect.top) * canvasScale),
    }
  })

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
      `Prof Amira, page ${i}/${pageCount}`,
      margin,
      pageHeight - 16
    )
  }

  pdf.save(filename)
}
