/**
 * Exporte la conversation en document Word (.docx), à partir des données des messages
 * (pas d'une capture d'écran comme pour le PDF) : un fichier Word attend du texte réel,
 * sélectionnable et modifiable, pas une image.
 *
 * Limite connue : les formules LaTeX ($...$) et les figures géométriques (blocs ```figure```)
 * ne sont pas des images natives dans Word — le LaTeX apparaît en texte source, et une figure
 * est remplacée par une mention indiquant de la consulter dans l'application.
 *
 * docx est chargé à la demande (dynamic import) pour ne pas alourdir le bundle principal. La
 * logique de découpage Markdown/QCM vit dans docxModel.js (pure, testable sans la librairie docx
 * — voir docxModel.test.js) ; ce fichier se contente de traduire ce modèle en primitives Word.
 */
import { parseMarkdownLines, qcmToLines, prerequisToLines, splitBoldSegments } from "./docxModel.js"
import { formatMessageTime } from "./dateFormat.js"

function segmentsToRuns(TextRun, segments, extraProps = {}) {
  return segments.map(({ text, bold }) => new TextRun({ text, bold, ...extraProps }))
}

/** Date absolue ("12 août 2026"), pas relative ("Aujourd'hui"/"Hier" — voir dateFormat.js) : un
 * document Word exporté aujourd'hui doit rester lisible tel quel des mois plus tard, contrairement
 * à l'affichage à l'écran qui se met à jour à chaque ouverture. */
function formatExportDate(iso) {
  if (!iso) return ""
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ""
  return date.toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" })
}

/** En-tête "Élève"/"Prof Amira" d'un message, suivi de son heure si connue ("Élève · 14:32") —
 * partagé entre exportMessagesToDocx (session courante) et historyMessageToParagraphs (historique
 * serveur), dont les champs d'horodatage diffèrent (createdAt côté client, created_at côté serveur —
 * voir l'appelant de chaque fonction). */
function speakerLabelParagraph(docxLib, label, color, iso, spacing) {
  const { Paragraph, TextRun } = docxLib
  const runs = [new TextRun({ text: label, bold: true, color })]
  const time = formatMessageTime(iso)
  if (time) runs.push(new TextRun({ text: `  ·  ${time}`, color: "94A3B8", size: 18 }))
  return new Paragraph({ children: runs, spacing })
}

function linesToParagraphs(docxLib, lines) {
  const { Paragraph, HeadingLevel, TextRun } = docxLib
  return lines.map((line) => {
    switch (line.type) {
      case "blank":
        return new Paragraph({ text: "" })
      case "heading2":
        return new Paragraph({ children: segmentsToRuns(TextRun, line.segments), heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 100 } })
      case "heading3":
        return new Paragraph({ children: segmentsToRuns(TextRun, line.segments), heading: HeadingLevel.HEADING_3, spacing: { before: 150, after: 80 } })
      case "bullet":
        return new Paragraph({ children: segmentsToRuns(TextRun, line.segments), bullet: { level: 0 } })
      default:
        return new Paragraph({ children: segmentsToRuns(TextRun, line.segments), spacing: { after: 120 } })
    }
  })
}

function markdownToParagraphs(docxLib, rawText) {
  return linesToParagraphs(docxLib, parseMarkdownLines(rawText))
}

function qcmLinesToParagraphs(docxLib, lines) {
  const { Paragraph, HeadingLevel, TextRun } = docxLib
  return lines.map((line) => {
    if (line.type === "choice") {
      return new Paragraph({
        children: [new TextRun({ text: `${line.correct ? "✓ " : "– "}${line.text}`, bold: line.correct })],
        indent: { left: 300 },
      })
    }
    if (line.type === "explication") {
      return new Paragraph({
        children: [new TextRun({ text: "Explication : ", italics: true }), ...segmentsToRuns(TextRun, line.segments)],
        spacing: { after: 100 },
      })
    }
    if (line.type === "heading3") {
      return new Paragraph({ children: segmentsToRuns(TextRun, line.segments), heading: HeadingLevel.HEADING_3, spacing: { before: 200, after: 60 } })
    }
    if (line.type === "text") {
      return new Paragraph({ children: segmentsToRuns(TextRun, line.segments), spacing: { after: 100 } })
    }
    // "question"
    return new Paragraph({ children: segmentsToRuns(TextRun, line.segments), spacing: { before: 140 } })
  })
}

function qcmParagraphs(docxLib, questions) {
  return qcmLinesToParagraphs(docxLib, qcmToLines(questions))
}

/** Rappel de cours + exercices par notion (voir generate_prerequis côté backend) — distinct de
 * qcmParagraphs (liste plate de questions, utilisée par generate_exercise) : ici chaque notion a
 * son propre rappel affiché avant ses 1-2 exercices, voir prerequisToLines. */
function prerequisParagraphs(docxLib, notions) {
  return qcmLinesToParagraphs(docxLib, prerequisToLines(notions))
}

export async function exportMessagesToDocx(messages, { filename = "chatmaths.docx", title = "", subtitle = "" } = {}) {
  const docxLib = await import("docx")
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docxLib

  const children = []
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }))
  if (subtitle) children.push(new Paragraph({ children: [new TextRun({ text: subtitle, color: "64748B" })], spacing: { after: 300 } }))

  for (const msg of messages) {
    if (msg.type === "user") {
      children.push(speakerLabelParagraph(docxLib, "Élève", "0D9488", msg.createdAt, { before: 240, after: 60 }))
      children.push(...markdownToParagraphs(docxLib, msg.text))
    } else if (msg.type === "bot") {
      children.push(speakerLabelParagraph(docxLib, "Prof Amira", "9333EA", msg.createdAt, { before: 120, after: 60 }))
      children.push(...markdownToParagraphs(docxLib, msg.text))
    } else if (msg.type === "exercise") {
      const ex = msg.data || {}
      children.push(
        new Paragraph({ text: `Exercice : ${ex.chapter || ""}`, heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 } })
      )
      children.push(...markdownToParagraphs(docxLib, ex.enonce))
      if (Array.isArray(ex.qcm) && ex.qcm.length > 0) {
        children.push(...qcmParagraphs(docxLib, ex.qcm))
      } else {
        if (ex.indices?.length > 0) {
          children.push(new Paragraph({ children: [new TextRun({ text: "Indice", bold: true })], spacing: { before: 100 } }))
          children.push(...markdownToParagraphs(docxLib, ex.indices[0]))
        }
        children.push(new Paragraph({ children: [new TextRun({ text: "Solution", bold: true })], spacing: { before: 100 } }))
        children.push(...markdownToParagraphs(docxLib, ex.solution))
        if (ex.reponse_finale) {
          children.push(
            new Paragraph({
              children: [new TextRun({ text: "Réponse finale : ", bold: true }), ...segmentsToRuns(TextRun, splitBoldSegments(ex.reponse_finale))],
              spacing: { before: 80 },
            })
          )
        }
      }
    } else if (msg.type === "prerequis") {
      // Le champ JSON s'appelle "questions" côté API (nom conservé pour compatibilité, voir
      // PrerequisResponse) même si chaque élément est maintenant un groupe {notion, rappel,
      // exercices} — voir RemediationQuiz.jsx::isNotionGroup pour la même distinction.
      children.push(new Paragraph({ text: "Diagnostic de prérequis", heading: HeadingLevel.HEADING_2, spacing: { before: 240, after: 100 } }))
      children.push(...prerequisParagraphs(docxLib, msg.data?.questions || []))
    }
  }

  const doc = new Document({
    title: title || "Session ChatMaths Burkina",
    description: "Export de conversation ChatMaths Burkina",
    sections: [{ children }],
  })

  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, filename)
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}

/** Convertit un message serveur ({role, kind, content, payload} — voir database.py) en
 * paragraphes Word. Distinct de exportMessagesToDocx ci-dessus, qui part des objets `messages`
 * du frontend ({type, text, data}) : la forme des messages diffère entre les deux (voir
 * GET /api/export/history côté API). */
function historyMessageToParagraphs(docxLib, msg) {
  const { Paragraph, TextRun } = docxLib
  const label = msg.role === "user" ? "Élève" : "Prof Amira"
  const color = msg.role === "user" ? "0D9488" : "9333EA"
  const out = [speakerLabelParagraph(docxLib, label, color, msg.created_at, { before: 160, after: 60 })]

  const payload = msg.payload || {}
  if (msg.kind === "exercise") {
    out.push(...markdownToParagraphs(docxLib, payload.enonce || msg.content))
    if (Array.isArray(payload.qcm) && payload.qcm.length > 0) {
      out.push(...qcmParagraphs(docxLib, payload.qcm))
    } else if (payload.solution) {
      out.push(new Paragraph({ children: [new TextRun({ text: "Solution", bold: true })], spacing: { before: 100 } }))
      out.push(...markdownToParagraphs(docxLib, payload.solution))
    }
  } else if ((msg.kind === "prerequis" || msg.kind === "remediation") && Array.isArray(payload.questions)) {
    // Le champ JSON s'appelle "questions" dans les DEUX formats (nom conservé côté API pour la
    // compatibilité, voir PrerequisResponse) : on distingue l'ancienne forme plate {notion,
    // question, choix...} de la nouvelle {notion, rappel, exercices} par la FORME du premier
    // élément, comme RemediationQuiz.jsx::isNotionGroup côté affichage.
    const isNotionGroup = payload.questions.length > 0 && Array.isArray(payload.questions[0]?.exercices)
    out.push(...(isNotionGroup ? prerequisParagraphs(docxLib, payload.questions) : qcmParagraphs(docxLib, payload.questions)))
  } else {
    out.push(...markdownToParagraphs(docxLib, msg.content || ""))
  }
  return out
}

/**
 * Exporte TOUT l'historique d'un élève (toutes conversations, voir GET /api/export/history) en
 * un seul document Word — un titre de niveau 1 par conversation. Distinct de
 * exportMessagesToDocx (une seule session, objets frontend) : ici la source est directement la
 * réponse serveur (voir api.js::exportHistory), pas l'état React `messages`.
 */
export async function exportHistoryToDocx(conversations, { filename = "chatmaths-historique.docx", title = "" } = {}) {
  const docxLib = await import("docx")
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = docxLib

  const children = []
  if (title) children.push(new Paragraph({ text: title, heading: HeadingLevel.TITLE }))

  for (const conv of conversations) {
    const subtitle = [conv.class_code, conv.chapter, formatExportDate(conv.created_at)].filter(Boolean).join(" · ")
    children.push(
      new Paragraph({ text: conv.title || "Conversation", heading: HeadingLevel.HEADING_1, spacing: { before: 360, after: 80 } })
    )
    if (subtitle) {
      children.push(new Paragraph({ children: [new TextRun({ text: subtitle, color: "64748B" })], spacing: { after: 200 } }))
    }
    for (const msg of conv.messages || []) {
      children.push(...historyMessageToParagraphs(docxLib, msg))
    }
  }

  const doc = new Document({
    title: title || "Historique ChatMaths Burkina",
    description: "Export complet de l'historique ChatMaths Burkina",
    sections: [{ children }],
  })

  const blob = await Packer.toBlob(doc)
  triggerDownload(blob, filename)
}
