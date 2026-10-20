import React from "react"
import { cn } from "../../lib/utils"

const variants = {
  primary: "bg-primary text-primary-content hover:brightness-110 shadow-glow",
  outline: "border border-base-300 bg-base-100 hover:bg-base-200 text-base-content",
  ghost: "bg-transparent hover:bg-base-200 text-base-content",
  soft: "bg-primary/10 text-primary hover:bg-primary/20",
  danger: "bg-error text-white hover:brightness-110",
}

const sizes = {
  sm: "text-sm px-2.5 py-1.5 gap-1.5 rounded-lg",
  md: "text-base px-3.5 py-2 gap-2 rounded-xl",
  lg: "text-lg px-5 py-2.5 gap-2 rounded-xl",
  icon: "p-2 rounded-lg",
}

export default function Button({
  as: Component = "button",
  variant = "primary",
  size = "md",
  className,
  disabled,
  children,
  ...props
}) {
  return (
    <Component
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 select-none",
        "disabled:opacity-40 disabled:cursor-not-allowed disabled:pointer-events-none",
        "active:scale-[0.97]",
        variants[variant],
        sizes[size],
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </Component>
  )
}
