# Flashcards Hakili Lab, Edition 2026

Tout ce qui concerne les flashcards de la collection est réuni ici : les 115 paquets,
l'application de révision, l'inventaire et les outils qui ont servi à les fabriquer.

**115 paquets · 4 011 cartes · 471 leçons couvertes · 7 niveaux, de la 6ème à la Terminale D.**

---

## Ce que contient ce dossier

### `revision_flashcards.html`

L'application de révision. Un seul fichier, les 4 011 cartes embarquées, aucune
dépendance : double-cliquer suffit, et cela fonctionne sans connexion.

Trois écrans : choisir la classe, choisir le chapitre, puis les cartes une à une.
La question s'affiche, un clic ou la barre d'espace révèle la réponse.

Au clavier : `espace` révéler puis avancer · `←` `→` naviguer · `1` je savais ·
`2` à revoir · `échap` quitter.

Le tirage est aléatoire par défaut, comme dans l'application cible ; une bascule
permet de suivre l'ordre du chapitre. L'entrée « Tout le niveau » brasse toutes les
cartes d'une classe. Les cartes marquées « à revoir » sont mémorisées dans le
navigateur de l'élève et peuvent être rejouées seules.

### `paquets/`

Les 115 fichiers JSON, rangés par niveau : `6eme`, `5eme`, `4eme`, `3eme`, `2ndc`,
`1ereD`, `tleD`. Un fichier par chapitre, nommé
`flashcards_<niveau>_<Chapitre_N_Titre>.json`.

Ce sont les fichiers à importer dans l'application de révision. Une copie de chacun
reste également dans le dossier de son chapitre, à côté du markdown source.

**Structure d'un paquet**

```json
{
  "niveau": "3ème",
  "chapitre": "Chapitre 8 : Théorème de Thalès et sa réciproque",
  "source": "maths/3eme/Chapitre_8_Thales",
  "nombre_cartes": 32,
  "cartes": [
    {
      "id": "3E-CH08-001",
      "lecon": "Configuration de Thalès",
      "type": "definition",
      "recto": "Dans quelle configuration peut-on appliquer le théorème de Thalès ?",
      "verso": "Deux droites sécantes en $A$ coupées par deux droites parallèles.",
      "difficulte": 1,
      "tags": ["thales", "configuration"]
    }
  ]
}
```

`type` vaut `definition` ou `formule`, et rien d'autre.
`difficulte` vaut 1 (restitution immédiate), 2 (notion demandant une précision ou une
condition) ou 3 (distinction fine ou cas particulier).
Les identifiants sont séquentiels par chapitre, avec un préfixe par niveau :
6E, 5E, 4E, 3E, 2C, 1D, TD.
Toutes les expressions mathématiques sont en LaTeX entre `$...$`.

### `flashcards_inventaire.csv`

Une ligne par leçon, 471 au total, avec son nombre de cartes. Séparateur `;`,
encodage UTF-8 avec BOM, prêt pour Excel. Colonnes : niveau, numéro de chapitre,
chapitre, leçon, cartes de la leçon, cartes du chapitre, dossier.

### `_outils/`

De quoi refabriquer ou compléter un paquet.

- `CONSIGNE_FLASHCARDS.md` : la recette de rédaction. Types de cartes autorisés,
  règles d'autoportance, volume, schéma JSON, règles de langue de la collection.
- `valider_flashcards.py` : le contrôle automatique. Usage :

  ```
  python3 valider_flashcards.py paquets/3eme/flashcards_3eme_Chapitre_8_Thales.json
  ```

  Il vérifie la validité du JSON, la cohérence de `nombre_cartes`, la séquence des
  identifiants, le LaTeX, l'absence de renvois externes et de doublons, l'absence de
  majuscule accentuée, et affiche la couverture leçon par leçon.

---

## Les règles qui gouvernent ces cartes

L'application tire les cartes **dans un ordre aléatoire**. Chaque carte est donc lue
isolée, sans le chapitre sous les yeux et sans les cartes voisines. Tout découle de là :

- le recto rappelle lui-même le cadre nécessaire, et ne renvoie jamais à une page, une
  figure, un exemple ou un autre chapitre ;
- une seule question par carte, jamais de question à réponse oui ou non ;
- le verso tient en une à trois phrases, traitables en moins de trente secondes ;
- deux cartes d'un même paquet ne testent jamais la même connaissance ;
- rien n'est inventé : chaque carte provient du chapitre lui-même, et c'est la
  présentation du manuel qui fait foi.

---

## Un point à traiter dans le manuel

3ème, chapitre 9, rubrique « Attention ! » de la leçon 3 : le manuel écrit que
$3x^{2} + 6x = 3(x^{2} + 6x)$ « n'est pas faux mais reste inachevé ». C'est faux,
puisque $3(x^{2}+6x) = 3x^{2}+18x$. La carte correspondante a été rédigée sur l'idée
visée, la factorisation complète $3x(x+2)$, sans reprendre l'égalité erronée. Le
markdown du chapitre reste à corriger.
