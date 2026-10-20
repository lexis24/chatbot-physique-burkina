import React, { useState } from "react"
import { motion } from "framer-motion"
import { PencilRuler, Lightbulb, Eye, EyeOff, Sparkles, Star, ArrowRight, Loader2 } from "lucide-react"
import Card from "./ui/Card"
import Button from "./ui/Button"
import Badge from "./ui/Badge"
import MathContent from "./MathContent"
import GeometryFigure from "./GeometryFigure"
import QcmQuestion from "./QcmQuestion"

const STAR_LABELS = {
  1: "QCM d'application",
  2: "Application guidée",
  3: "Notions combinées",
  4: "Situation d'intégration",
  5: "Type olympiades",
}

function StarRating({ level }) {
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={12}
          className={
            i === 5
              ? level === 5
                ? "fill-accent text-accent"
                : "text-accent/40"
              : i <= level
                ? "fill-primary text-primary"
                : "text-base-content/25"
          }
        />
      ))}
    </span>
  )
}

export default function ExerciseCard({ exercise, onNext, generatingNext, onFetchSolution }) {
  const [indiceShown, setIndiceShown] = useState(false)
  const [solutionShown, setSolutionShown] = useState(false)
  const [qcmAnswers, setQcmAnswers] = useState({})
  // La correction n'est plus incluse dans l'exercice généré (voir generate_exercise_solution
  // côté backend) : récupérée à la demande, au premier clic sur "Voir la solution détaillée"
  // seulement, puis gardée en mémoire ici pour ne pas la redemander à chaque bascule d'affichage.
  const [fetchedSolution, setFetchedSolution] = useState(null)
  const [solutionLoading, setSolutionLoading] = useState(false)
  const [solutionError, setSolutionError] = useState(false)

  const solution = fetchedSolution?.solution ?? exercise.solution
  const reponseFinale = fetchedSolution?.reponse_finale ?? exercise.reponse_finale
  const hasSolution = Boolean(solution)

  const isQcm = Array.isArray(exercise.qcm) && exercise.qcm.length > 0
  const allAnswered = isQcm && exercise.qcm.every((_, i) => qcmAnswers[i] !== undefined)
  const qcmScore = isQcm
    ? exercise.qcm.reduce((acc, q, i) => acc + (qcmAnswers[i] === q.reponse_correcte_index ? 1 : 0), 0)
    : 0

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card glow className="p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-primary">
            <PencilRuler size={18} />
            <span className="font-heading font-semibold">Exercice : {exercise.chapter}</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="neutral">{exercise.class_level}</Badge>
            <Badge variant="primary" title={STAR_LABELS[exercise.difficulty] || ""}>
              <StarRating level={exercise.difficulty} />
            </Badge>
          </div>
        </div>

        <div className="prose-chat max-w-none rounded-xl bg-gradient-to-br from-primary/5 to-secondary/5 p-4">
          <MathContent>{exercise.enonce}</MathContent>
          {exercise.figure && <GeometryFigure spec={exercise.figure} />}
        </div>

        {isQcm ? (
          <div className="mt-4 space-y-3">
            {exercise.qcm.map((q, i) => (
              <QcmQuestion
                key={i}
                index={i}
                question={q.question}
                choices={q.choix}
                correctIndex={q.reponse_correcte_index}
                explication={q.explication}
                selected={qcmAnswers[i]}
                onSelect={(choiceIndex) => setQcmAnswers((prev) => ({ ...prev, [i]: choiceIndex }))}
                revealed={qcmAnswers[i] !== undefined}
              />
            ))}
            {allAnswered && (
              <div className="rounded-xl border border-primary/30 bg-primary/5 px-4 py-2.5 text-sm font-semibold text-primary">
                Score : {qcmScore}/{exercise.qcm.length} bonnes réponses
              </div>
            )}
          </div>
        ) : (
          <>
            {exercise.indices?.length > 0 && (
              <div className="mt-3 space-y-2">
                {indiceShown && (
                  <div className="prose-chat max-w-none rounded-xl border border-warning/30 bg-warning/5 p-3">
                    <span className="mr-1 font-semibold text-warning">Indice :</span>
                    <MathContent>{exercise.indices[0]}</MathContent>
                  </div>
                )}
                <Button variant="soft" size="sm" onClick={() => setIndiceShown((s) => !s)}>
                  <Lightbulb size={14} /> {indiceShown ? "Masquer l'indice" : "Voir l'indice"}
                </Button>
              </div>
            )}

            <div className="mt-4">
              <Button
                variant={solutionShown ? "outline" : "primary"}
                size="sm"
                disabled={solutionLoading}
                onClick={async () => {
                  if (solutionShown) {
                    setSolutionShown(false)
                    return
                  }
                  setSolutionShown(true)
                  if (hasSolution || solutionLoading) return
                  setSolutionLoading(true)
                  setSolutionError(false)
                  try {
                    const result = await onFetchSolution(exercise)
                    setFetchedSolution(result)
                  } catch {
                    setSolutionError(true)
                  }
                  setSolutionLoading(false)
                }}
              >
                {solutionLoading ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : solutionShown ? (
                  <EyeOff size={14} />
                ) : (
                  <Eye size={14} />
                )}
                {solutionLoading ? "Génération de la correction…" : solutionShown ? "Masquer la solution" : "Voir la solution détaillée"}
              </Button>

              {solutionShown && !solutionLoading && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="prose-chat mt-3 max-w-none space-y-2 overflow-hidden rounded-xl border border-success/30 bg-success/5 p-4"
                >
                  {solutionError ? (
                    <p className="text-error">Impossible de générer la correction pour le moment. Réessaie.</p>
                  ) : (
                    <>
                      <MathContent>{solution}</MathContent>
                      {reponseFinale && (
                        <div className="mt-2 flex items-center gap-2 rounded-lg bg-success/15 px-3 py-2 font-semibold text-success">
                          <Sparkles size={14} />
                          <MathContent>{reponseFinale}</MathContent>
                        </div>
                      )}
                    </>
                  )}
                </motion.div>
              )}
            </div>
          </>
        )}

        {/* Un seul exercice généré à la fois (voir RAPPORT_MOBILE.md §7) : "suivant" remplace la
            génération en série de 5 d'un coup. N'apparaît que sous le dernier exercice de la
            conversation (voir App.jsx, onNext=null pour les cartes plus anciennes). */}
        {onNext && (
          <div className="mt-4 border-t border-base-300/50 pt-4">
            <Button variant="outline" size="sm" onClick={onNext} disabled={generatingNext} className="w-full sm:w-auto">
              {generatingNext ? "Génération…" : "Exercice suivant"}
              {!generatingNext && <ArrowRight size={14} />}
            </Button>
          </div>
        )}
      </Card>
    </motion.div>
  )
}
