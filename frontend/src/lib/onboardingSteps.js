import { MessageCircleQuestion, PencilRuler, Baby } from "lucide-react"

/** Les 3 cartes explicatives "comment ça marche", affichées dans AboutPanel (voir
 * RAPPORT_MOBILE.md/RAPPORT_MIGRATION.md) — extrait ici pour rester la seule source si un autre
 * composant en a un jour besoin. */
export const ONBOARDING_STEPS = [
  {
    icon: MessageCircleQuestion,
    color: "bg-primary/15 text-primary",
    title: "Pose ta question",
    text: "Directement, à tout moment — choisir ta classe et ton chapitre aide à affiner la réponse, mais ce n'est pas obligatoire.",
  },
  {
    icon: Baby,
    color: "bg-secondary/15 text-secondary",
    title: "Pas compris ?",
    text: "Clique sur \"Simplifie\" sous une réponse pour une explication encore plus simple, avec un autre exemple.",
  },
  {
    icon: PencilRuler,
    color: "bg-accent/15 text-accent",
    title: "Entraîne-toi",
    text: "Génère un exercice sur mesure, avec des indices et une correction détaillée.",
  },
]
