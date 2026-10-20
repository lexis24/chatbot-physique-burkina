import React, { useState } from "react"
import { motion } from "framer-motion"
import { ClipboardCheck, CheckCircle2, AlertTriangle, BookOpen } from "lucide-react"
import Card from "./ui/Card"
import Button from "./ui/Button"
import MathContent from "./MathContent"
import QcmQuestion from "./QcmQuestion"

const PASS_THRESHOLD = 0.8

/** Anciennes conversations enregistrées avant le passage à la structure {notion, rappel,
 * exercices} (voir generate_prerequis côté backend) : `data.questions` était alors une liste
 * plate {notion, question, choix, reponse_correcte_index, explication}. Regroupée ici par notion
 * pour rester affichable telle quelle (rappel vide : ces anciennes questions n'en avaient pas).
 * Le champ JSON s'appelle "questions" dans les DEUX formats (nom conservé côté API pour la
 * compatibilité, voir PrerequisResponse) : on distingue donc l'ancien du nouveau par la FORME de
 * chaque élément (un groupe a "exercices", une ancienne question a "choix" directement) plutôt
 * que par un nom de champ. */
function isNotionGroup(item) {
  return Boolean(item) && Array.isArray(item.exercices)
}

function groupLegacyQuestions(questions) {
  const byNotion = new Map()
  questions.forEach((q) => {
    if (!byNotion.has(q.notion)) byNotion.set(q.notion, { notion: q.notion, rappel: "", exercices: [] })
    byNotion.get(q.notion).exercices.push(q)
  })
  return Array.from(byNotion.values())
}

/** Aplatit les groupes {notion, rappel, exercices} en une liste d'exercices indexée globalement
 * (numérotation continue sur tout le diagnostic, état des réponses par index global) — tout en
 * gardant la trace du groupe d'origine (notionIndex) pour l'affichage et pour les résultats
 * renvoyés à onSubmitResults (un par exercice, avec sa notion). */
function flattenExercices(notions) {
  const flat = []
  notions.forEach((n, notionIndex) => {
    ;(n.exercices || []).forEach((ex) => {
      flat.push({ ...ex, notion: n.notion, notionIndex })
    })
  })
  return flat
}

export default function RemediationQuiz({ data, onSubmitResults }) {
  const rawItems = Array.isArray(data?.questions) ? data.questions : []
  const notions = isNotionGroup(rawItems[0]) ? rawItems : groupLegacyQuestions(rawItems)
  const exercices = flattenExercices(notions)
  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState(false)

  const allAnswered = exercices.length > 0 && exercices.every((_, i) => answers[i] !== undefined)
  const score = exercices.reduce((acc, ex, i) => acc + (answers[i] === ex.reponse_correcte_index ? 1 : 0), 0)
  const ratio = exercices.length > 0 ? score / exercices.length : 0
  const passed = ratio >= PASS_THRESHOLD

  function handleValidate() {
    setSubmitted(true)
    onSubmitResults?.(
      exercices.map((ex, i) => ({ notion: ex.notion, is_correct: answers[i] === ex.reponse_correcte_index }))
    )
  }

  const notionsToReview = submitted
    ? notions.filter((n, notionIndex) =>
        exercices.some((ex, i) => ex.notionIndex === notionIndex && answers[i] !== ex.reponse_correcte_index)
      )
    : []

  // Numérotation continue des exercices à travers les notions (voir flattenExercices) : chaque
  // groupe sait à partir de quel index global ses propres exercices commencent.
  let runningIndex = 0

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.25 }}>
      <Card glow className="p-5">
        <div className="mb-3 flex items-center gap-2 text-primary">
          <ClipboardCheck size={18} />
          <span className="font-heading font-semibold">Prérequis : {data.chapter}</span>
        </div>
        <p className="mb-4 text-sm text-base-content/60">
          Avant de commencer ce chapitre, relis chaque rappel puis réponds à l'exercice qui suit pour vérifier que tu maîtrises encore la notion.
        </p>

        <div className="space-y-5">
          {notions.map((n, notionIndex) => {
            const startIndex = runningIndex
            runningIndex += (n.exercices || []).length
            return (
              <div key={notionIndex} className="space-y-3">
                {n.rappel && (
                  <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
                    <div className="mb-1.5 flex items-center gap-2 text-sm font-semibold text-primary">
                      <BookOpen size={15} />
                      {n.notion}
                    </div>
                    <div className="prose-chat max-w-none text-sm text-base-content/80">
                      <MathContent>{n.rappel}</MathContent>
                    </div>
                  </div>
                )}

                {(n.exercices || []).map((ex, j) => {
                  const i = startIndex + j
                  return (
                    <QcmQuestion
                      key={i}
                      index={i}
                      question={ex.question}
                      choices={ex.choix}
                      correctIndex={ex.reponse_correcte_index}
                      explication={ex.explication}
                      selected={answers[i]}
                      onSelect={(choiceIndex) => !submitted && setAnswers((prev) => ({ ...prev, [i]: choiceIndex }))}
                      revealed={submitted}
                    />
                  )
                })}
              </div>
            )
          })}
        </div>

        {!submitted ? (
          <Button variant="primary" size="md" className="mt-4" disabled={!allAnswered} onClick={handleValidate}>
            Valider mes réponses
          </Button>
        ) : (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            className={`mt-4 space-y-3 rounded-xl border p-4 ${
              passed ? "border-success/30 bg-success/5" : "border-warning/30 bg-warning/5"
            }`}
          >
            <div className={`flex items-center gap-2 font-semibold ${passed ? "text-success" : "text-warning"}`}>
              {passed ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
              Score : {score}/{exercices.length} ({Math.round(ratio * 100)}%)
            </div>

            {passed ? (
              <p className="text-sm text-base-content/70">
                Tu maîtrises les prérequis de « {data.chapter} », tu peux le commencer sereinement.
              </p>
            ) : (
              <div className="text-sm text-base-content/70">
                <p className="mb-2">Voici les prérequis à revoir avant de commencer ce chapitre :</p>
                <ul className="list-disc space-y-1 pl-5">
                  {notionsToReview.map((n) => (
                    <li key={n.notion}>
                      <strong>{n.notion}</strong>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </motion.div>
        )}
      </Card>
    </motion.div>
  )
}
