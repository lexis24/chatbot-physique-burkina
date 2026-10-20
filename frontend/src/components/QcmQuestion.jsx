import React from "react"
import { Check, X } from "lucide-react"
import { cn } from "../lib/utils"
import MathContent from "./MathContent"

const LETTERS = ["A", "B", "C", "D"]

/**
 * Une question à choix multiples réutilisée par l'exercice 1 étoile (feedback immédiat par
 * question) et par le QCM de prérequis (révélation groupée après le bouton "Valider").
 */
export default function QcmQuestion({ index, question, choices, correctIndex, explication, selected, onSelect, revealed }) {
  return (
    <div className="rounded-xl border border-base-300/60 bg-base-100 p-4">
      <div className="prose-chat mb-3 max-w-none font-medium">
        <span className="mr-1.5 text-base-content/50">{index + 1}.</span>
        <MathContent>{question}</MathContent>
      </div>

      <div className="flex flex-col gap-2">
        {choices.map((choice, i) => {
          const isSelected = selected === i
          const isCorrectChoice = i === correctIndex
          const showState = revealed && (isSelected || isCorrectChoice)

          return (
            <button
              key={i}
              type="button"
              onClick={() => !revealed && onSelect(i)}
              disabled={revealed}
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-left text-sm transition-colors",
                revealed && isCorrectChoice && "border-success/50 bg-success/10",
                revealed && isSelected && !isCorrectChoice && "border-error/50 bg-error/10",
                !revealed && isSelected && "border-primary/60 bg-primary/5",
                !revealed && !isSelected && "border-base-300/60 hover:border-primary/40 hover:bg-primary/5"
              )}
            >
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-base-300/70 text-xs font-semibold text-base-content/60">
                {LETTERS[i]}
              </span>
              <span className="prose-chat max-w-none flex-1">
                <MathContent>{choice}</MathContent>
              </span>
              {showState && (isCorrectChoice ? <Check size={15} className="text-success" /> : <X size={15} className="text-error" />)}
            </button>
          )
        })}
      </div>

      {revealed && explication && (
        <div className="prose-chat mt-3 max-w-none rounded-lg bg-base-200/60 p-3 text-sm text-base-content/70">
          <MathContent>{explication}</MathContent>
        </div>
      )}
    </div>
  )
}
