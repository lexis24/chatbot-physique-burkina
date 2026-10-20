import React, { useEffect, useRef, useState } from "react"
import * as pdfjsLib from "pdfjs-dist"
import pdfjsWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url"
import { ChevronLeft, ChevronRight, Loader2, AlertTriangle } from "lucide-react"
import Modal from "./ui/Modal.jsx"
import BottomSheet from "./ui/BottomSheet.jsx"
import { getCourseFileUrl } from "../api.js"
import { useIsMobile } from "../lib/useMediaQuery.js"

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorkerUrl

/** Détruit un PDFDocumentProxy (ou un RenderTask via .cancel) sans jamais planter l'app si
 * l'objet n'a plus la méthode attendue : observé en réel (mobile ET desktop, prod ET dev),
 * "pdfRef.current?.destroy is not a function" plantait tout l'arbre de rendu via ErrorBoundary
 * — l'effacement d'une ref optionnelle (`?.`) protège contre null/undefined, mais pas contre un
 * objet bien présent qui n'a simplement plus cette méthode (piste probable : un second chargement
 * du même document, déclenché par un changement rapide de chapitre/fermeture-réouverture, qui
 * fait courir deux instances de pdf.js en parallèle sur le même ref). Un nettoyage de ressource
 * ne doit JAMAIS pouvoir faire planter le rendu — au pire, une ressource pdf.js reste non libérée
 * un instant, jamais une page blanche pour l'élève. */
function safeCleanup(obj, method) {
  try {
    obj?.[method]?.()
  } catch (e) {
    console.warn(`[CourseViewer] Échec silencieux de ${method}() :`, e)
  }
}

/**
 * Visualiseur de cours "lecture seule" : rend chaque page du PDF sur un <canvas> via pdf.js,
 * plutôt que d'ouvrir le fichier dans le lecteur PDF natif du navigateur (voir handleCourse dans
 * App.jsx, avant ce composant : un simple `window.open` sur l'URL du fichier). Un PDF ouvert
 * directement expose systématiquement les boutons "Télécharger"/"Imprimer" du lecteur natif —
 * impossibles à retirer depuis la page (ce sont des contrôles du navigateur, pas du DOM) : ici il
 * n'y a plus de lecteur PDF natif du tout, juste une image par page, donc plus ces deux actions.
 * Comme pour n'importe quel contenu affiché dans un navigateur, un élève déterminé garde toujours
 * un moyen de capturer l'écran — l'objectif ici est de retirer l'affordance évidente
 * ("Télécharger"), pas de rendre la capture techniquement impossible.
 */
export default function CourseViewer({ open, onClose, classCode, chapter }) {
  const isMobile = useIsMobile()
  const Container = isMobile ? BottomSheet : Modal
  const canvasRef = useRef(null)
  const pdfRef = useRef(null)
  const renderTaskRef = useRef(null)
  const [pageNum, setPageNum] = useState(1)
  const [numPages, setNumPages] = useState(0)
  const [status, setStatus] = useState("loading") // "loading" | "ready" | "error"

  // Charge le document à l'ouverture (et à chaque changement de chapitre) — pas avant, pour ne
  // pas télécharger un PDF que l'élève ne consulte peut-être jamais.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    setStatus("loading")
    setPageNum(1)

    async function load() {
      try {
        const res = await fetch(getCourseFileUrl(classCode, chapter))
        if (!res.ok) throw new Error("fichier indisponible")
        const buffer = await res.arrayBuffer()
        if (cancelled) return
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise
        if (cancelled) {
          safeCleanup(pdf, "destroy")
          return
        }
        pdfRef.current = pdf
        setNumPages(pdf.numPages)
        setStatus("ready")
      } catch {
        if (!cancelled) setStatus("error")
      }
    }
    load()

    return () => {
      cancelled = true
      safeCleanup(pdfRef.current, "destroy")
      pdfRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, classCode, chapter])

  // Rend la page courante à chaque changement de page (ou une fois le document chargé).
  useEffect(() => {
    if (status !== "ready" || !pdfRef.current || !canvasRef.current) return
    let cancelled = false

    async function renderPage() {
      const page = await pdfRef.current.getPage(pageNum)
      if (cancelled) return
      // Échelle visant ~1000px de large : net sur un écran retina sans générer une image
      // démesurément lourde (voir aussi la largeur max du conteneur, w-full sur le canvas).
      const baseViewport = page.getViewport({ scale: 1 })
      const scale = Math.min(2.5, 1000 / baseViewport.width)
      const viewport = page.getViewport({ scale })

      const canvas = canvasRef.current
      const ctx = canvas.getContext("2d")
      canvas.width = viewport.width
      canvas.height = viewport.height

      safeCleanup(renderTaskRef.current, "cancel")
      const task = page.render({ canvasContext: ctx, viewport })
      renderTaskRef.current = task
      try {
        await task.promise
      } catch (err) {
        if (err?.name !== "RenderingCancelledException") throw err
      }
    }
    renderPage()

    return () => {
      cancelled = true
      safeCleanup(renderTaskRef.current, "cancel")
    }
  }, [status, pageNum])

  return (
    <Container open={open} onClose={onClose} title={`Cours : ${chapter}`}>
      <div
        className="flex flex-col items-center gap-3 select-none"
        onContextMenu={(e) => e.preventDefault()}
      >
        {status === "loading" && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-base-content/50">
            <Loader2 size={22} className="animate-spin" />
            Chargement du cours…
          </div>
        )}

        {status === "error" && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-error">
            <AlertTriangle size={22} />
            Impossible de charger ce cours pour le moment. Réessaie plus tard.
          </div>
        )}

        {status === "ready" && (
          <>
            <canvas ref={canvasRef} className="max-w-full rounded-lg border border-base-300/50 shadow-sm" />
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setPageNum((p) => Math.max(1, p - 1))}
                disabled={pageNum <= 1}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-base-300/60 text-base-content/70 hover:bg-base-200 disabled:pointer-events-none disabled:opacity-30"
                title="Page précédente"
              >
                <ChevronLeft size={18} />
              </button>
              <span className="min-w-[72px] text-center text-sm text-base-content/60">
                Page {pageNum} / {numPages}
              </span>
              <button
                type="button"
                onClick={() => setPageNum((p) => Math.min(numPages, p + 1))}
                disabled={pageNum >= numPages}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-base-300/60 text-base-content/70 hover:bg-base-200 disabled:pointer-events-none disabled:opacity-30"
                title="Page suivante"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </>
        )}
      </div>
    </Container>
  )
}
