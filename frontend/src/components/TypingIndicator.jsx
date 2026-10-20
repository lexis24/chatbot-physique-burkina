import React from "react"
import { Bot } from "lucide-react"

export default function TypingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="relative flex h-9 w-9 shrink-0 items-center justify-center">
        <span className="absolute inset-0 rounded-full bg-primary/40 motion-safe:animate-pulse-ring" />
        <div className="relative flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary">
          <Bot size={18} />
        </div>
      </div>
      <div className="flex items-center gap-1.5 rounded-2xl rounded-tl-sm border border-base-300/60 bg-base-100 px-4 py-3.5 shadow-sm">
        <span className="typing-dot h-2 w-2 rounded-full bg-primary/70" />
        <span className="typing-dot h-2 w-2 rounded-full bg-primary/70" />
        <span className="typing-dot h-2 w-2 rounded-full bg-primary/70" />
      </div>
    </div>
  )
}
