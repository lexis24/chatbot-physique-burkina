import React, { useEffect, useRef, useState } from "react"
import { School, Check } from "lucide-react"
import { searchSchools } from "../api.js"
import { cn } from "../lib/utils"

const DEBOUNCE_MS = 300

/**
 * Champ établissement avec suggestions (debounce 300 ms sur GET /api/schools/search). La saisie
 * libre reste acceptée si aucune correspondance : `value` est toujours la source de vérité
 * (le texte tapé), pas seulement une sélection dans la liste — voir database.resolve_school côté
 * serveur, qui crée un nouvel établissement non vérifié si le nom ne correspond à rien de connu.
 */
export default function SchoolAutocomplete({ value, onChange, error }) {
  const [suggestions, setSuggestions] = useState([])
  const [open, setOpen] = useState(false)
  const containerRef = useRef(null)
  const debounceRef = useRef(null)

  useEffect(() => {
    if (!value || value.trim().length < 2) {
      setSuggestions([])
      return
    }
    clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(async () => {
      try {
        const results = await searchSchools(value.trim())
        setSuggestions(results)
      } catch {
        setSuggestions([])
      }
    }, DEBOUNCE_MS)
    return () => clearTimeout(debounceRef.current)
  }, [value])

  return (
    <label className="relative flex flex-col gap-1.5" ref={containerRef}>
      <span className="text-sm font-semibold text-base-content">Établissement</span>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-xl border bg-base-100 px-3.5 py-3 transition-colors focus-within:ring-2 focus-within:ring-primary/15",
          error ? "border-error focus-within:border-error" : "border-base-300 focus-within:border-primary"
        )}
      >
        <School size={17} className="shrink-0 text-base-content/40" />
        <input
          className="w-full bg-transparent text-base font-medium text-base-content outline-none placeholder:font-normal placeholder:text-base-content/35"
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onBlur={(e) => {
            if (!containerRef.current?.contains(e.relatedTarget)) setOpen(false)
          }}
          placeholder="ex : Lycée Philippe Zinda Kaboré"
          autoComplete="off"
        />
      </div>
      {error && <span className="text-sm font-medium text-error">{error}</span>}

      {open && suggestions.length > 0 && (
        <ul className="absolute top-full z-20 mt-1 max-h-56 w-full overflow-y-auto scrollbar-thin rounded-xl border border-base-300 bg-base-100 py-1 shadow-lg">
          {suggestions.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm hover:bg-base-200"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onChange(s.name)
                  setOpen(false)
                }}
              >
                <span className="min-w-0 truncate">
                  {s.name}
                  {s.city && <span className="text-base-content/50"> · {s.city}</span>}
                </span>
                {s.is_verified && <Check size={14} className="shrink-0 text-success" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </label>
  )
}
