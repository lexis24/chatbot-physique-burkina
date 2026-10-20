import React, { useEffect, useRef, useState } from "react"
import {
  SendHorizontal, Square, PencilRuler, BookOpen, ListChecks, ClipboardCheck, Camera, ImageOff,
  MoreHorizontal, FileDown, FileText, Mic, X, ArrowUp, Layers,
} from "lucide-react"
import Button from "./ui/Button"
import ExportMenu from "./ExportMenu"
import BottomSheet from "./ui/BottomSheet"
import { useIsMobile } from "../lib/useMediaQuery"
import { useSpeechRecognition } from "../lib/useSpeechRecognition"
import { useMicLevels } from "../lib/useMicLevels"
import { cn } from "../lib/utils"

/** Bandeau plein écran affiché pendant la dictée (X annule, la forme d'onde reflète le niveau
 * sonore réel du micro — voir useMicLevels.js — le carré arrête et garde le texte transcrit, la
 * flèche arrête ET envoie directement). Remplace toute la ligne de saisie normale pendant l'écoute,
 * comme dans Claude/ChatGPT : on ne veut pas distraire l'élève avec d'autres boutons pendant qu'il
 * dicte. */
function RecordingBar({ levels, onCancel, onStop, onSend }) {
  return (
    <div className="flex h-11 flex-1 items-center gap-2 rounded-full border border-base-300 bg-base-100 pl-1.5 pr-1.5">
      <button
        type="button"
        onClick={onCancel}
        title="Annuler la dictée"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-base-content/60 transition-colors hover:bg-base-200"
      >
        <X size={18} />
      </button>

      <div className="flex h-full flex-1 items-center justify-center gap-[3px] overflow-hidden" aria-hidden="true">
        {levels.map((level, i) => (
          <span
            key={i}
            className="w-[3px] shrink-0 rounded-full bg-base-content/35 transition-[height] duration-75"
            style={{ height: `${4 + level * 22}px` }}
          />
        ))}
      </div>

      <button
        type="button"
        onClick={onStop}
        title="Arrêter la dictée (garder le texte)"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-base-300 text-base-content transition-colors hover:bg-base-200"
      >
        <Square size={13} className="fill-current" />
      </button>

      <button
        type="button"
        onClick={onSend}
        title="Arrêter et envoyer"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-content transition-colors hover:brightness-110"
      >
        <ArrowUp size={18} />
      </button>
    </div>
  )
}

// Hauteur automatique du textarea : une ligne au repos, jusqu'à 4 lignes maximum, pas de barre
// de défilement visible avant cette limite (voir RAPPORT_MOBILE.md §6).
const TEXTAREA_MAX_LINES = 4

function useAutoResizeTextarea(value) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = "auto"
    const styles = getComputedStyle(el)
    const lineHeight = parseFloat(styles.lineHeight) || 24
    const verticalPadding = parseFloat(styles.paddingTop) + parseFloat(styles.paddingBottom) || 0
    const verticalBorder = parseFloat(styles.borderTopWidth) + parseFloat(styles.borderBottomWidth) || 0
    const maxHeight = lineHeight * TEXTAREA_MAX_LINES + verticalPadding + verticalBorder
    const next = Math.min(el.scrollHeight, maxHeight)
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden"
  }, [value])
  return ref
}

/** Une entrée de la feuille "⋯" (mobile) : cible large (min 44px), icône + libellé + description
 * facultative, désactivée avec la même logique que le bouton bureau équivalent. */
function SheetAction({ icon: Icon, label, hint, onClick, disabled }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={hint}
      className="flex min-h-[44px] w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-medium text-base-content transition-colors hover:bg-base-200 disabled:opacity-40"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block">{label}</span>
        {hint && <span className="block truncate text-xs font-normal text-base-content/50">{hint}</span>}
      </span>
    </button>
  )
}

export default function ChatInput({
  question,
  setQuestion,
  onSend,
  onStop,
  onExercise,
  onCourse,
  onRemediation,
  onSummary,
  onFlashcards,
  onDownloadSession,
  onPhotoSelected,
  activePhoto,
  onClearActivePhoto,
  onVoiceError,
  canExercise,
  canChapterFeatures,
  loading,
  exportingSession,
  photoLoading,
}) {
  const photoInputRef = useRef(null)
  const isMobile = useIsMobile()
  const [sheetOpen, setSheetOpen] = useState(false)
  const textareaRef = useAutoResizeTextarea(question)

  // Dictée vocale (Web Speech API, navigateur uniquement — voir useSpeechRecognition.js) : pas
  // d'appel serveur, le texte transcrit atterrit dans le champ exactement comme s'il avait été
  // tapé, donc rien à changer côté RAG/Claude. Absente de Firefox : `voiceSupported` masque le
  // bouton plutôt que d'afficher un micro qui ne ferait rien.
  const { supported: voiceSupported, listening, start: startListening, stop: stopListening } = useSpeechRecognition({
    onResult: setQuestion,
    onError: (err) => {
      if (err === "no-speech" || err === "aborted") return
      if (err === "not-allowed" || err === "service-not-allowed") {
        onVoiceError?.("Autorise l'accès au micro dans les réglages de ton navigateur pour dicter ta question.")
      } else {
        onVoiceError?.("La dictée vocale a rencontré un problème. Réessaie, ou tape ta question.")
      }
    },
  })
  const micLevels = useMicLevels(listening)
  const textBeforeRecordingRef = useRef("")

  function handleStartRecording() {
    textBeforeRecordingRef.current = question
    startListening(question)
  }

  function handleCancelRecording() {
    stopListening()
    setQuestion(textBeforeRecordingRef.current)
  }

  function handleSendWhileRecording() {
    stopListening()
    // `stop()` finalise l'audio déjà capté de façon asynchrone : un dernier `onresult` (le mot en
    // cours) peut encore arriver juste après. Un court délai laisse le temps à ce dernier morceau
    // d'atterrir dans `question` avant l'envoi, plutôt que de couper la phrase.
    setTimeout(() => onSend(), 250)
  }

  function handleKeyDown(e) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      onSend()
    }
  }

  function handlePhotoChange(e) {
    const file = e.target.files?.[0]
    e.target.value = "" // permet de reprendre la même photo une deuxième fois
    if (file) onPhotoSelected(file)
  }

  function runFromSheet(action) {
    setSheetOpen(false)
    action()
  }

  return (
    <div
      className={cn(
        "border-t border-base-300/60 bg-base-100/80 backdrop-blur-md",
        // Padding horizontal resserré sur mobile (voir RAPPORT_MOBILE.md §2) : avec 3 cibles
        // tactiles de 44px (⋯, caméra, envoi) à côté du champ, le padding par défaut (p-3)
        // laissait le champ de saisie sous les 60% de largeur visés à 360px.
        isMobile ? "px-0.5 py-3" : "p-4"
      )}
    >
      {activePhoto && (
        <div className="mb-2 flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-1.5 text-xs font-medium text-primary">
          <Camera size={13} />
          Photo active : tes prochains messages continuent sur cet exercice.
          <button
            type="button"
            onClick={onClearActivePhoto}
            className="ml-auto flex items-center gap-1 rounded-md px-1.5 py-0.5 text-primary/80 hover:bg-primary/15 hover:text-primary"
            title="Ne plus tenir compte de cette photo pour la suite"
          >
            <ImageOff size={13} /> Changer de sujet
          </button>
        </div>
      )}

      <div className={cn("flex items-end", isMobile ? "gap-px" : "gap-2")}>
        {listening ? (
          <RecordingBar
            levels={micLevels}
            onCancel={handleCancelRecording}
            onStop={stopListening}
            onSend={handleSendWhileRecording}
          />
        ) : (
          <>
            {isMobile && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setSheetOpen(true)}
                title="Plus d'actions"
                className="min-h-[44px] min-w-[44px] shrink-0"
              >
                <MoreHorizontal size={20} />
              </Button>
            )}

            <input
              ref={photoInputRef}
              type="file"
              accept="image/*,application/pdf"
              className="hidden"
              onChange={handlePhotoChange}
            />
            {/* Bouton photo/fichier : visible en permanence à côté du champ sur mobile (voir
                RAPPORT_MOBILE.md §5) ; sur bureau il reste dans la barre d'outils inchangée
                ci-dessous, avec son libellé texte. */}
            {isMobile && (
              <Button
                variant="outline"
                size="icon"
                onClick={() => photoInputRef.current?.click()}
                disabled={loading || photoLoading}
                title="Prends en photo un exercice (ou choisis une photo/un fichier existant). Astuce : tape une consigne dans le champ ci-dessus avant de cliquer pour l'envoyer avec la photo."
                className="min-h-[44px] min-w-[44px] shrink-0"
              >
                <Camera size={20} className={photoLoading ? "animate-pulse" : ""} />
              </Button>
            )}

            <textarea
              ref={textareaRef}
              className="textarea textarea-bordered w-full flex-1 resize-none rounded-xl bg-base-100 text-base leading-6"
              rows={1}
              placeholder="Pose ta question"
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={loading}
            />
            {voiceSupported && (
              <Button
                variant="outline"
                size={isMobile ? "icon" : "lg"}
                onClick={handleStartRecording}
                disabled={loading}
                title="Dicter ta question à voix haute"
                className="min-h-[44px] min-w-[44px] shrink-0"
              >
                <Mic size={18} />
              </Button>
            )}
            {/* Pendant une génération en cours (chat, exercice, prérequis, résumé — voir `loading`
                dans App.jsx), ce même bouton devient "stop" plutôt que de rester un envoi désactivé :
                l'élève n'a plus besoin d'attendre la fin d'une réponse longue pour passer à autre
                chose (voir handleStop dans App.jsx, AbortController côté api.js). */}
            <Button
              variant={loading ? "outline" : "primary"}
              // size="lg" (bureau) ajoute px-5 (20px de chaque côté) qui, cumulé avec min-w-[44px] ci-
              // dessous, poussait ce bouton bien au-delà de 44px sur mobile (voir RAPPORT_MOBILE.md
              // §2) : size="icon" y donne exactement 44×44 (padding p-2 + le min-w/min-h explicite).
              size={isMobile ? "icon" : "lg"}
              onClick={() => (loading ? onStop?.() : onSend())}
              disabled={!loading && !question.trim()}
              title={loading ? "Arrêter la génération" : "Envoyer"}
              className="min-h-[44px] min-w-[44px] shrink-0"
            >
              {loading ? <Square size={16} className="fill-current" /> : <SendHorizontal size={18} />}
            </Button>
          </>
        )}
      </div>

      {/* Bureau (>=768px) : barre d'outils inline inchangée, hors "Simplifie" (déplacé sous
          chaque réponse, voir MessageBubble.jsx). Mobile : ces actions vivent dans la feuille
          "⋯" ouverte ci-dessus, voir plus bas. Masquée pendant la dictée (voir RecordingBar) pour
          ne pas distraire l'élève avec d'autres actions pendant qu'il parle. */}
      <div className={cn("mt-2 flex-wrap items-center gap-2", listening ? "hidden" : "hidden md:flex")}>
        <Button
          variant="outline"
          size="sm"
          onClick={onCourse}
          disabled={!canChapterFeatures || loading}
          title={!canChapterFeatures ? "Choisis une classe et un chapitre pour voir le cours" : "Ouvrir le document de cours de ce chapitre"}
        >
          <BookOpen size={14} /> Voir le cours
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onSummary}
          disabled={!canChapterFeatures || loading}
          title={!canChapterFeatures ? "Choisis une classe et un chapitre pour le résumé" : "Résumé prérédigé des points essentiels de ce chapitre (PDF téléchargeable)"}
        >
          <ListChecks size={14} /> Résumé
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onFlashcards}
          disabled={!canChapterFeatures || loading}
          title={!canChapterFeatures ? "Choisis une classe et un chapitre pour les flashcards" : "Cartes de révision recto/verso sur ce chapitre"}
        >
          <Layers size={14} /> Flashcards
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onExercise}
          disabled={!canExercise || loading}
          title={!canExercise ? "Choisis une classe pour générer un exercice" : "Chapitre non choisi ? Un chapitre adapté sera proposé automatiquement."}
        >
          <PencilRuler size={14} />
          Exercice
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={onRemediation}
          disabled={!canChapterFeatures || loading}
          title={!canChapterFeatures ? "Choisis une classe et un chapitre pour les prérequis" : "QCM diagnostique sur les prérequis de ce chapitre"}
        >
          <ClipboardCheck size={14} /> Prérequis
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => photoInputRef.current?.click()}
          disabled={loading || photoLoading}
          title="Prends en photo un exercice (ou choisis une photo/un fichier existant). Astuce : tape une consigne dans le champ ci-dessus avant de cliquer pour l'envoyer avec la photo."
        >
          <Camera size={14} className={photoLoading ? "animate-pulse" : ""} />
          {photoLoading ? "Analyse en cours…" : "Photo / fichier d'exercice"}
        </Button>
        <ExportMenu onExport={onDownloadSession} exporting={exportingSession} label="PDF / Word" align="left" openUpward />
      </div>

      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)} title="Plus d'actions">
        <div className="flex flex-col gap-1">
          <SheetAction
            icon={PencilRuler}
            label="Un exercice"
            hint={!canExercise ? "Choisis une classe pour générer un exercice" : "Chapitre non choisi ? Un chapitre adapté sera proposé automatiquement."}
            onClick={() => runFromSheet(onExercise)}
            disabled={!canExercise || loading}
          />
          <SheetAction
            icon={ClipboardCheck}
            label="Test de prérequis"
            hint={!canChapterFeatures ? "Choisis une classe et un chapitre" : "QCM diagnostique sur les prérequis de ce chapitre"}
            onClick={() => runFromSheet(onRemediation)}
            disabled={!canChapterFeatures || loading}
          />
          <SheetAction
            icon={BookOpen}
            label="Voir le cours"
            hint={!canChapterFeatures ? "Choisis une classe et un chapitre" : "Ouvrir le document de cours de ce chapitre"}
            onClick={() => runFromSheet(onCourse)}
            disabled={!canChapterFeatures || loading}
          />
          <SheetAction
            icon={ListChecks}
            label="Résumé du chapitre"
            hint={!canChapterFeatures ? "Choisis une classe et un chapitre" : "PDF téléchargeable des points essentiels"}
            onClick={() => runFromSheet(onSummary)}
            disabled={!canChapterFeatures || loading}
          />
          <SheetAction
            icon={Layers}
            label="Flashcards"
            hint={!canChapterFeatures ? "Choisis une classe et un chapitre" : "Cartes de révision recto/verso"}
            onClick={() => runFromSheet(onFlashcards)}
            disabled={!canChapterFeatures || loading}
          />

          <div className="my-2 border-t border-base-300/60" />

          <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-base-content/40">Télécharger</p>
          <SheetAction
            icon={FileDown}
            label="PDF"
            onClick={() => runFromSheet(() => onDownloadSession("pdf"))}
            disabled={exportingSession}
          />
          <SheetAction
            icon={FileText}
            label="Word (.docx)"
            onClick={() => runFromSheet(() => onDownloadSession("docx"))}
            disabled={exportingSession}
          />
        </div>
      </BottomSheet>
    </div>
  )
}
