import React from "react"
import ReactMarkdown from "react-markdown"
import remarkMath from "remark-math"
import remarkGfm from "remark-gfm"
import rehypeKatex from "rehype-katex"
import PhysicsFigure from "./PhysicsFigure"

function parseFigureSpec(raw) {
  try {
    const data = JSON.parse(raw)
    return data && typeof data === "object" ? data : null
  } catch {
    return null
  }
}

/**
 * Rendu Markdown commun au chat et aux exercices : LaTeX via KaTeX, plus les blocs
 * ```figure { ... } ``` rendus comme un schéma SVG (circuit, forces, optique, graphique, géométrie —
 * voir PhysicsFigure) au lieu d'un bloc de code.
 * Pendant le streaming, un bloc `figure` incomplet retombe simplement en bloc de code brut
 * jusqu'à ce que le JSON soit valide.
 */
export default function RichContent({ children }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      components={{
        code({ inline, className, children: codeChildren, ...props }) {
          const lang = /language-(\w+)/.exec(className || "")?.[1]
          if (!inline && lang === "figure") {
            const raw = String(codeChildren).replace(/\n$/, "")
            const spec = parseFigureSpec(raw)
            if (spec) return <PhysicsFigure spec={spec} />
          }
          return (
            <code className={className} {...props}>
              {codeChildren}
            </code>
          )
        },
      }}
    >
      {children || ""}
    </ReactMarkdown>
  )
}
