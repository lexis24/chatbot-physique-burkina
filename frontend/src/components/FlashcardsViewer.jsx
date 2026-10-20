import React, { useEffect, useState } from "react"
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertTriangle,
  RotateCw,
  HelpCircle,
  CheckCircle2,
  Shuffle,
  ListChecks,
  Check,
  X,
  PartyPopper,
} from "lucide-react"
import Modal from "./ui/Modal.jsx"
import BottomSheet from "./ui/BottomSheet.jsx"
import Badge from "./ui/Badge.jsx"
import Button from "./ui/Button.jsx"
import MathContent from "./MathContent.jsx"
import { getFlashcards, getChapters, reviewFlashcard } from "../api.js"
import { useIsMobile } from "../lib/useMediaQuery.js"

function shuffleArray(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Jeu de flashcards "recto/verso" façon Quizlet : une carte à la fois, clic (ou touche Espace)
 * pour la retourner et voir la réponse, flèches pour naviguer. Voir get_flashcards côté backend
 * pour le format JSON attendu (un fichier par chapitre, déposé par l'équipe pédagogique).
 *
 * Avant de charger les cartes, une étape "picking" permet de choisir un ou plusieurs chapitres —
 * volontairement indépendante du chapitre sélectionné dans la barre latérale (App.jsx) : l'élève
 * peut réviser plusieurs chapitres à la fois sans changer sa sélection principale. Les jeux de
 * chaque chapitre choisi sont simplement concaténés (un chapitre sans fichier de flashcards est
 * ignoré silencieusement, sauf si AUCUN des chapitres choisis n'en a).
 *
 * Répétition espacée (élève connecté, `token` fourni) : après avoir vu la réponse, l'élève
 * s'auto-évalue ("Je savais" / "À revoir") plutôt que de simplement naviguer — voir
 * handleSelfAssess, qui enregistre le résultat côté serveur (POST /api/flashcards/review,
 * voir database.upsert_flashcard_review) ET fait revenir la carte ratée plus tard dans CETTE
 * session (façon Leitner) avant même d'envisager un espacement inter-session, qui dépend lui de
 * l'ordre déjà renvoyé par GET /api/flashcards (cartes dues en premier, voir api.js). Sans
 * token (invité), l'auto-évaluation reste utile pour le réordonnancement en session, mais rien
 * n'est mémorisé d'une session à l'autre faute de compte.
 */
export default function FlashcardsViewer({ open, onClose, classCode, chapter, token = null }) {
  const isMobile = useIsMobile()
  const Container = isMobile ? BottomSheet : Modal
  const [cards, setCards] = useState([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [status, setStatus] = useState("picking") // "picking" | "loading" | "ready" | "error" | "unavailable"
  const [allChapters, setAllChapters] = useState([])
  const [selectedChapters, setSelectedChapters] = useState([])
  const [sessionStats, setSessionStats] = useState({ correct: 0, total: 0 })

  useEffect(() => {
    if (!open) return
    setStatus("picking")
    setSelectedChapters(chapter ? [chapter] : [])
    setIndex(0)
    setFlipped(false)
    getChapters(classCode)
      .then((list) => setAllChapters(list || []))
      .catch(() => setAllChapters(chapter ? [chapter] : []))
  }, [open, classCode, chapter])

  function toggleChapter(ch) {
    setSelectedChapters((prev) =>
      prev.includes(ch) ? prev.filter((c) => c !== ch) : [...prev, ch]
    )
  }

  function loadSelectedChapters() {
    if (selectedChapters.length === 0) return
    setStatus("loading")
    Promise.allSettled(
      selectedChapters.map((ch) =>
        getFlashcards(classCode, ch, token).then((cardsForChapter) =>
          (cardsForChapter || []).map((c) => ({ ...c, chapterLabel: ch }))
        )
      )
    ).then((results) => {
      let merged = results
        .filter((r) => r.status === "fulfilled")
        .flatMap((r) => r.value)
      if (merged.length === 0) {
        setStatus("unavailable")
        return
      }
      // Cartes dues (ou jamais vues) en premier quel que soit le chapitre d'origine : chaque
      // chapitre est déjà trié individuellement par l'API (voir get_flashcards côté backend),
      // mais une simple concaténation ferait passer les cartes déjà maîtrisées du chapitre A
      // avant les cartes dues du chapitre B.
      if (selectedChapters.length > 1) {
        merged = [...merged.filter((c) => c.due), ...merged.filter((c) => !c.due)]
      }
      setCards(merged)
      setIndex(0)
      setFlipped(false)
      setSessionStats({ correct: 0, total: 0 })
      setStatus("ready")
    })
  }

  function handleShuffle() {
    setCards((prev) => shuffleArray(prev))
    setIndex(0)
    setFlipped(false)
  }

  function goTo(next) {
    setFlipped(false)
    setIndex(next)
  }

  function handleSelfAssess(correct) {
    const reviewedCard = cards[index]
    const cardChapter = reviewedCard.chapterLabel || selectedChapters[0] || chapter
    // Best-effort : ne bloque jamais la révision en cours si l'enregistrement échoue (réseau,
    // invité sans compte...) — voir reviewFlashcard côté api.js.
    reviewFlashcard(classCode, cardChapter, reviewedCard.id, correct, token).catch(() => {})
    setSessionStats((s) => ({ correct: s.correct + (correct ? 1 : 0), total: s.total + 1 }))
    setCards((prev) => (correct ? prev : [...prev, reviewedCard]))
    setFlipped(false)
    setIndex((i) => i + 1)
  }

  function handleKeyDown(e) {
    if (e.key === " " || e.key === "Enter") {
      e.preventDefault()
      setFlipped((f) => !f)
    } else if (e.key === "ArrowRight" && index < cards.length - 1) {
      goTo(index + 1)
    } else if (e.key === "ArrowLeft" && index > 0) {
      goTo(index - 1)
    }
  }

  const card = cards[index]
  const title =
    status === "picking"
      ? "Flashcards"
      : selectedChapters.length > 1
        ? `Flashcards (${selectedChapters.length} chapitres)`
        : `Flashcards : ${selectedChapters[0] || chapter}`

  return (
    <Container open={open} onClose={onClose} title={title}>
      <div className="flex flex-col items-center gap-4" onKeyDown={handleKeyDown} tabIndex={-1}>
        {status === "picking" && (
          <div className="flex w-full max-w-md flex-col gap-3">
            <p className="text-sm text-base-content/60">
              Choisis un ou plusieurs chapitres à réviser (indépendamment du chapitre sélectionné dans le menu principal).
            </p>
            <div className="scrollbar-thin flex max-h-[45vh] flex-col gap-1 overflow-y-auto rounded-xl border border-base-300/60 p-2">
              {allChapters.length === 0 && (
                <div className="flex items-center justify-center gap-2 py-6 text-base-content/50">
                  <Loader2 size={16} className="animate-spin" /> Chargement des chapitres…
                </div>
              )}
              {allChapters.map((ch) => (
                <label
                  key={ch}
                  className="flex cursor-pointer items-start gap-2.5 rounded-lg px-2 py-1.5 text-sm hover:bg-base-200"
                >
                  <input
                    type="checkbox"
                    className="checkbox checkbox-sm checkbox-primary mt-0.5"
                    checked={selectedChapters.includes(ch)}
                    onChange={() => toggleChapter(ch)}
                  />
                  <span className="text-base-content">{ch}</span>
                </label>
              ))}
            </div>
            <Button
              variant="primary"
              size="md"
              className="w-full"
              disabled={selectedChapters.length === 0}
              onClick={loadSelectedChapters}
            >
              <ListChecks size={16} />
              {selectedChapters.length > 1
                ? `Réviser ${selectedChapters.length} chapitres`
                : "Réviser ce chapitre"}
            </Button>
          </div>
        )}

        {status === "loading" && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-base-content/50">
            <Loader2 size={22} className="animate-spin" />
            Chargement des flashcards…
          </div>
        )}

        {status === "unavailable" && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 text-center text-base-content/60">
            <AlertTriangle size={22} />
            {selectedChapters.length > 1
              ? "Pas encore de flashcards disponibles pour ces chapitres."
              : "Pas encore de flashcards disponibles pour ce chapitre."}
            <Button variant="outline" size="sm" onClick={() => setStatus("picking")}>
              Choisir d'autres chapitres
            </Button>
          </div>
        )}

        {status === "error" && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-2 text-center text-error">
            <AlertTriangle size={22} />
            Impossible de charger les flashcards pour le moment. Réessaie plus tard.
          </div>
        )}

        {/* index a dépassé la fin de la pile : soit navigation manuelle jusqu'au bout, soit fin
            de l'auto-évaluation (voir handleSelfAssess) — les deux cas atterrissent ici. */}
        {status === "ready" && !card && cards.length > 0 && (
          <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
              <PartyPopper size={26} />
            </div>
            <div>
              <p className="font-heading text-lg font-semibold text-base-content">Pile terminée !</p>
              {sessionStats.total > 0 && (
                <p className="mt-1 text-sm text-base-content/60">
                  {sessionStats.correct} / {sessionStats.total} cartes sues du premier coup
                  {!token && " · connecte-toi pour garder cette progression d'une session à l'autre"}
                </p>
              )}
            </div>
            <div className="flex items-center gap-3">
              <Button variant="outline" size="sm" onClick={() => setStatus("picking")}>
                Changer les chapitres
              </Button>
              <Button variant="primary" size="sm" onClick={loadSelectedChapters}>
                <RotateCw size={14} /> Recommencer
              </Button>
            </div>
          </div>
        )}

        {status === "ready" && card && (
          <>
            <div className="w-full max-w-md">
              <div className="mb-2 flex items-center justify-between text-sm text-base-content/50">
                <span>
                  Carte {index + 1} / {cards.length}
                  {selectedChapters.length > 1 && card.chapterLabel && (
                    <span className="ml-2 text-xs text-base-content/40">· {card.chapterLabel}</span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  {flipped && (
                    <span className="flex items-center gap-1 text-xs font-medium text-primary">
                      <CheckCircle2 size={13} /> Réponse
                    </span>
                  )}
                  <button
                    type="button"
                    onClick={handleShuffle}
                    title="Mélanger les cartes"
                    className="flex items-center gap-1 text-xs font-medium text-base-content/50 hover:text-primary"
                  >
                    <Shuffle size={13} /> Mélanger
                  </button>
                </div>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-base-200">
                <div
                  className="h-full rounded-full bg-primary transition-all duration-300 ease-out"
                  style={{ width: `${((index + 1) / cards.length) * 100}%` }}
                />
              </div>
            </div>

            {/* Perspective sur le conteneur externe, rotation sur l'interne : les deux faces sont
                superposées (absolute inset-0) et chacune masquée quand elle regarde "vers
                l'intérieur" (backface-visibility), donnant l'effet de retournement 3D. */}
            <div
              className="w-full max-w-md [perspective:1200px]"
              role="button"
              tabIndex={0}
              onClick={() => setFlipped((f) => !f)}
              title="Cliquer pour retourner la carte"
            >
              <div
                className="relative h-72 w-full transition-transform duration-500 ease-out [transform-style:preserve-3d]"
                style={{ transform: flipped ? "rotateY(180deg)" : "rotateY(0deg)" }}
              >
                <div className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl border border-primary/20 bg-gradient-to-br from-base-100 to-primary/[0.06] p-7 text-center shadow-md [backface-visibility:hidden]">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/15 text-primary">
                    <HelpCircle size={20} />
                  </div>
                  <Badge variant="primary">Question</Badge>
                  <div className="font-heading text-lg font-semibold leading-snug text-base-content">
                    <MathContent>{card.front}</MathContent>
                  </div>
                  <span className="mt-1 flex shrink-0 items-center gap-1.5 rounded-full bg-base-200/70 px-3 py-1.5 text-xs font-medium text-base-content/55">
                    <RotateCw size={12} /> Clique pour voir la réponse
                  </span>
                </div>
                <div
                  className="absolute inset-0 flex cursor-pointer flex-col items-center justify-center gap-4 overflow-y-auto rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/[0.12] to-primary/5 p-7 text-center shadow-md [backface-visibility:hidden]"
                  style={{ transform: "rotateY(180deg)" }}
                >
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary">
                    <CheckCircle2 size={20} />
                  </div>
                  <Badge variant="success">Réponse</Badge>
                  <div className="font-heading text-lg font-semibold leading-snug text-primary">
                    <MathContent>{card.back}</MathContent>
                  </div>
                </div>
              </div>
            </div>

            {flipped ? (
              // Auto-évaluation plutôt qu'une simple navigation une fois la réponse vue (voir
              // handleSelfAssess) : c'est CE signal, pas la navigation, qui alimente la
              // répétition espacée — "À revoir" fait revenir la carte plus tard dans cette
              // même session (façon Leitner), en plus d'enregistrer le résultat côté serveur.
              <div className="flex w-full max-w-md items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleSelfAssess(false)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-error/30 bg-error/5 px-4 py-2.5 text-sm font-medium text-error transition-colors hover:bg-error/10"
                >
                  <X size={16} /> À revoir
                </button>
                <button
                  type="button"
                  onClick={() => handleSelfAssess(true)}
                  className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-medium text-primary-content shadow-glow transition-transform active:scale-[0.98] hover:brightness-110"
                >
                  <Check size={16} /> Je savais
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => goTo(index - 1)}
                  disabled={index <= 0}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-base-300/60 text-base-content/70 hover:bg-base-200 disabled:pointer-events-none disabled:opacity-30"
                  title="Carte précédente"
                >
                  <ChevronLeft size={18} />
                </button>
                <button
                  type="button"
                  onClick={() => goTo(index + 1)}
                  disabled={index >= cards.length - 1}
                  className="flex h-10 w-10 items-center justify-center rounded-full border border-base-300/60 text-base-content/70 hover:bg-base-200 disabled:pointer-events-none disabled:opacity-30"
                  title="Carte suivante"
                >
                  <ChevronRight size={18} />
                </button>
              </div>
            )}

            <button
              type="button"
              onClick={() => setStatus("picking")}
              className="text-xs font-medium text-base-content/40 hover:text-primary"
            >
              Changer les chapitres
            </button>
          </>
        )}
      </div>
    </Container>
  )
}
