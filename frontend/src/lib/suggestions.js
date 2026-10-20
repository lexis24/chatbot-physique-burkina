/** Questions suggérées à partir du chapitre choisi. Vivait avant dans Sidebar.jsx ; déplacé ici
 * car les suggestions sont maintenant rendues dans WelcomeCard, pas dans la sidebar (voir
 * RAPPORT_MOBILE.md, §3/§4) — une seule fonction, partagée, plutôt que dupliquée. Toujours trois
 * suggestions (voir WelcomeCard.jsx) : génériques sans chapitre choisi, ciblées sinon.
 */
export function buildSuggestions(chapitre) {
  if (!chapitre) {
    return [
      "Pose-moi une question de maths",
      "Propose-moi un exercice à faire",
      "Explique-moi une notion du programme",
    ]
  }
  return [
    `Explique-moi simplement le chapitre "${chapitre}"`,
    `Donne-moi un exemple concret sur "${chapitre}"`,
    `Quelles sont les formules importantes de "${chapitre}" ?`,
  ]
}
