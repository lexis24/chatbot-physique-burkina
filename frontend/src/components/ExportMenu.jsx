import React, { useState } from "react"
import { FileDown, FileText, ChevronDown, History } from "lucide-react"
import Button from "./ui/Button"

/**
 * Bouton "Télécharger" avec un petit menu pour choisir le format (PDF ou Word). `onExportHistory`
 * est facultatif : quand fourni (élève connecté, voir App.jsx::handleDownloadFullHistory), une
 * troisième entrée "Tout mon historique (Word)" apparaît, distincte de l'export de la SEULE
 * session à l'écran (onExport).
 * Se ferme automatiquement quand le focus quitte le composant (clic ailleurs, Échap+Tab...).
 *
 * `openUpward` : le menu s'ouvre par défaut vers le bas (`top-full`), pertinent pour l'usage en
 * haut du panneau de chat (App.jsx) où la place ne manque pas en dessous. Mais ChatInput.jsx
 * utilise ce même composant tout en bas de l'écran (barre d'outils au-dessus du champ de saisie) :
 * un menu qui s'ouvre encore vers le bas y sort alors de la fenêtre ou se retrouve caché derrière
 * le pied de page, rendant "PDF"/"Word" impossibles à cliquer — symptôme "le bouton Télécharger ne
 * marche pas" côté élève. `openUpward` bascule l'ancrage vers `bottom-full` pour cet usage-là.
 */
export default function ExportMenu({ onExport, onExportHistory, exporting, label = "Télécharger", align = "right", openUpward = false }) {
  const [open, setOpen] = useState(false)

  return (
    <div
      className="relative"
      tabIndex={-1}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false)
      }}
    >
      <Button
        variant="soft"
        size="sm"
        onClick={() => setOpen((o) => !o)}
        disabled={exporting}
        title="Télécharger toute la conversation (PDF ou Word)"
      >
        <FileDown size={14} className={exporting ? "animate-pulse" : ""} />
        {exporting ? "Génération…" : label}
        <ChevronDown size={12} className={`transition-transform ${open ? "rotate-180" : ""}`} />
      </Button>
      {open && (
        <div
          className={`absolute z-20 w-44 overflow-hidden rounded-xl border border-base-300 bg-base-100 shadow-lg ${
            align === "right" ? "right-0" : "left-0"
          } ${openUpward ? "bottom-full mb-1" : "top-full mt-1"}`}
        >
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200"
            onClick={() => {
              setOpen(false)
              onExport("pdf")
            }}
          >
            <FileDown size={14} /> PDF
          </button>
          <button
            type="button"
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-base-200"
            onClick={() => {
              setOpen(false)
              onExport("docx")
            }}
          >
            <FileText size={14} /> Word (.docx)
          </button>
          {onExportHistory && (
            <button
              type="button"
              className="flex w-full items-center gap-2 border-t border-base-300/60 px-3 py-2 text-left text-sm hover:bg-base-200"
              onClick={() => {
                setOpen(false)
                onExportHistory()
              }}
            >
              <History size={14} /> Tout mon historique (Word)
            </button>
          )}
        </div>
      )}
    </div>
  )
}
