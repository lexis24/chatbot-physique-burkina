import React from "react"
import { cn } from "../../lib/utils"

export default function Card({ className, children, glow = false, interactive = false, ...props }) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-base-300/60 bg-base-100/80 backdrop-blur-sm shadow-sm",
        glow && "glow-border",
        interactive && "card-interactive",
        className
      )}
      {...props}
    >
      {children}
    </div>
  )
}
