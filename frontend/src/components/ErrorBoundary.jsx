import React from "react"

/** Filet de sécurité global : sans lui, une erreur de rendu N'IMPORTE OÙ dans l'arbre (ex: une
 * session invité restaurée depuis localStorage — voir App.jsx::loadSavedSession — contenant un
 * message dans une forme que le composant ne sait plus lire après une mise à jour) fait
 * disparaître TOUTE l'application sans le moindre message, juste une page blanche : le pire
 * résultat possible côté élève, et impossible à diagnostiquer à distance. Class component
 * volontairement : c'est le seul moyen d'implémenter un error boundary React (pas d'équivalent
 * à base de hooks). "Recommencer" vide le stockage local (session invité, thème...) plutôt que de
 * juste recharger la page : si l'erreur vient d'une donnée locale corrompue, un simple F5 la
 * referait planter à l'identique. */
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error("[ErrorBoundary] Erreur de rendu interceptée :", error, info?.componentStack)
  }

  handleReset = () => {
    try {
      localStorage.clear()
    } catch {
      /* stockage indisponible, tant pis */
    }
    window.location.reload()
  }

  render() {
    if (!this.state.hasError) return this.props.children

    return (
      <div className="flex min-h-screen items-center justify-center bg-base-200 p-6">
        <div className="w-full max-w-md rounded-2xl border border-base-300/60 bg-base-100 p-6 text-center shadow-sm">
          <p className="font-heading text-lg font-bold text-base-content">Une erreur est survenue</p>
          <p className="mt-2 text-sm text-base-content/60">
            Quelque chose a empêché la page de s'afficher correctement. Réessaie — si le problème persiste,
            "Recommencer" efface les données enregistrées localement (session invité, préférences) qui en sont
            peut-être la cause.
          </p>
          <div className="mt-4 flex justify-center gap-3">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="rounded-xl border border-base-300 px-4 py-2 text-sm font-semibold text-base-content hover:bg-base-200"
            >
              Réessayer
            </button>
            <button
              type="button"
              onClick={this.handleReset}
              className="rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-content hover:opacity-90"
            >
              Recommencer
            </button>
          </div>
        </div>
      </div>
    )
  }
}
