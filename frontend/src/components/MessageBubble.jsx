import React, { useState } from "react"
import { motion } from "framer-motion"
import { Bot, GraduationCap, Copy, Check, RefreshCcw, BookOpen, ListChecks, Baby, AlertTriangle } from "lucide-react"
import Button from "./ui/Button"
import Card from "./ui/Card"
import MathContent from "./MathContent"
import { formatMessageTime } from "../lib/dateFormat"

const KIND_META = {
  summary: { label: "Résumé", icon: ListChecks, colorClass: "text-primary" },
  simplify: { label: "Version simplifiée", icon: Baby, colorClass: "text-primary" },
  error: { label: "Erreur", icon: AlertTriangle, colorClass: "text-error" },
}

// "Simplifie" n'a de sens que sur une réponse de chat "normale" — pas sur un résumé, une version
// déjà simplifiée, ou un message d'erreur (même critère que l'ancien canSimplify de ChatInput,
// désormais évalué par message plutôt que globalement — voir App.jsx::handleSimplify).
const SIMPLIFIABLE_KINDS = [undefined, "chat"]

export default function MessageBubble({ message, onRegenerate, regenerating, onSimplify, simplifying }) {
  const isUser = message.type === "user"
  const [copied, setCopied] = useState(false)
  const kindMeta = KIND_META[message.kind]
  const canSimplify = Boolean(onSimplify) && SIMPLIFIABLE_KINDS.includes(message.kind)

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(message.text || "")
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable, ignore */
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className={`flex gap-3 ${isUser ? "flex-row-reverse" : "flex-row"}`}
    >
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full shadow-sm ${
          isUser ? "bg-secondary/15 text-secondary" : "bg-gradient-to-br from-primary/20 to-accent/20 text-primary"
        }`}
      >
        {isUser ? <GraduationCap size={18} /> : <Bot size={18} />}
      </div>

      {/* min-w-0 : sans ça, un enfant flex ne rétrécit jamais sous la largeur intrinsèque de son
          contenu (formule KaTeX ou tableau large) — le overflow-x:auto de .prose-chat ne sert
          alors à rien, la bulle entière pousse la page au lieu de défiler en interne (voir
          RAPPORT_MOBILE.md §8). */}
      <div className={`flex min-w-0 max-w-[85%] flex-col gap-1.5 ${isUser ? "items-end" : "items-start"}`}>
        <Card
          className={`px-4 py-3 ${
            isUser
              ? "bg-gradient-to-br from-primary to-secondary text-primary-content border-transparent rounded-tr-sm"
              : message.kind === "error"
                ? "bg-error/5 rounded-tl-sm border-l-4 border-l-error/50"
                : "bg-base-100 rounded-tl-sm border-l-4 border-l-primary/40"
          }`}
        >
          <div className="px-1">
            {!isUser && kindMeta && (
              <div className={`mb-1.5 flex items-center gap-1.5 text-sm font-semibold ${kindMeta.colorClass}`}>
                <kindMeta.icon size={14} />
                {kindMeta.label}
              </div>
            )}
            {isUser ? (
              <>
                {message.imageUrl && (
                  <img
                    src={message.imageUrl}
                    alt="Photo de l'exercice envoyée"
                    className="mb-2 max-h-64 w-auto rounded-lg border border-white/20 object-contain"
                  />
                )}
                {message.text && <p className="whitespace-pre-wrap text-base leading-relaxed">{message.text}</p>}
              </>
            ) : (
              <div className="prose-chat max-w-none">
                <MathContent>{message.text || ""}</MathContent>
                {message.streaming && (
                  <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-primary/70 align-middle" />
                )}
              </div>
            )}
          </div>

          {!isUser && message.sources?.length > 0 && (
            <details className="mt-2 rounded-lg bg-base-200/60 px-3 py-2 text-xs">
              <summary className="cursor-pointer select-none font-medium text-base-content/70">
                <BookOpen size={12} className="mr-1 inline" />
                Sources ({message.sources.length})
              </summary>
              <div className="mt-1.5 space-y-1">
                {message.sources.map((s, i) => (
                  <div key={i} className="text-base-content/60">
                    {s.chapitre}
                    {s.classe ? ` · ${s.classe}` : ""}
                  </div>
                ))}
              </div>
            </details>
          )}
        </Card>

        {message.createdAt && (
          <span className="px-1 text-[11px] text-base-content/40">{formatMessageTime(message.createdAt)}</span>
        )}

        {!isUser && message.text && (
          <div className="flex items-center gap-1 px-1">
            <Button variant="ghost" size="icon" title="Copier" onClick={handleCopy}>
              {copied ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            </Button>
            {onRegenerate && (
              <Button variant="ghost" size="icon" title="Régénérer la réponse" onClick={onRegenerate} disabled={regenerating}>
                <RefreshCcw size={14} className={regenerating ? "animate-spin" : ""} />
              </Button>
            )}
            {canSimplify && (
              <Button
                variant="ghost"
                size="icon"
                title="Simplifie cette réponse"
                onClick={onSimplify}
                disabled={simplifying}
              >
                <Baby size={14} className={simplifying ? "animate-pulse" : ""} />
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}
