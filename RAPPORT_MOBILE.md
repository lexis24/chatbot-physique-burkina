# Rapport — Correctifs d'affichage mobile (Chat'Maths)

Dernière mise à jour : 2026-08-13 — voir addenda en fin de §2 et §6 (AboutPanel, barre d'outils
resserrée, modale bureau décentrée, Réglages/Historique en feuille sur mobile)

## 1. Résumé (10 lignes)

L'application a été rendue utilisable sur mobile bas de gamme (largeur de test : 360px) sans
supprimer aucune fonctionnalité — tout a été relocalisé, regroupé ou masqué derrière une action
explicite. Le champ de saisie est maintenant visible dès le premier écran, sans défiler : l'en-tête
tient en 56px, le bloc d'accueil se réduit à un message + 2 suggestions, et les 3 cartes
explicatives + la vidéo rejoignent une feuille "Comment ça marche ?". La barre latérale (7 blocs)
devient 2 onglets ("Réglages" / "Historique") sur mobile. La barre d'outils du champ de saisie se
réduit à caméra + envoi, le reste rejoint une feuille "⋯" ; "Simplifie" quitte la barre pour vivre
sous chaque réponse et cible désormais le message précis cliqué (plus seulement la dernière
réponse). Les exercices se génèrent un par un avec un bouton "Exercice suivant" plutôt que cinq
d'un coup. Trois bugs de mise en page touchant tous les écrans ont été corrigés : figures
géométriques en SVG responsive, formules KaTeX et tableaux qui débordaient de leur bulle. Le fond
animé décoratif ne se monte plus sous 768px pour économiser batterie/GPU. Neuf commits, un par
section, tests et build vérifiés à chaque étape.

## 2. Fichiers créés et modifiés

### Créés

| Fichier | Rôle |
|---|---|
| `frontend/src/lib/useMediaQuery.js` | Hook `useMediaQuery(query)` + `useIsMobile()` (`max-width: 767px`), utilisé partout où un composant a besoin de savoir s'il est en mode mobile. |
| `frontend/src/components/ui/BottomSheet.jsx` | Primitive générique feuille modale (fond + panneau qui glisse depuis le bas), fermeture par Échap ou clic sur le fond, verrouillage du défilement de la page pendant l'ouverture, bouton de fermeture 44px. Réutilisée par `HowItWorksSheet` et le menu "⋯" de `ChatInput`. |
| `frontend/src/lib/onboardingSteps.js` | Tableau `ONBOARDING_STEPS` (les 3 cartes "comment ça marche") extrait pour être partagé entre l'affichage bureau (dans WelcomeCard) et la feuille mobile. |
| `frontend/src/lib/suggestions.js` | Fonction `buildSuggestions(chapitre)` extraite de l'ancienne Sidebar — désormais seule source utilisée par WelcomeCard. |
| `frontend/src/components/HowItWorksSheet.jsx` | Feuille modale mobile "Comment ça marche ?" : vidéo de démonstration + les 3 cartes explicatives, ouverte depuis WelcomeCard. |

### Modifiés

| Fichier | Ce qui a changé |
|---|---|
| `frontend/src/components/WelcomeCard.jsx` | Sur mobile : message de bienvenue + 2 suggestions maximum + lien "Comment ça marche ?" (ouvre la feuille). Sur bureau : grille de 3 cartes inchangée + suggestions (jusqu'ici dans la Sidebar, désormais ici pour les deux tailles d'écran). |
| `frontend/src/components/Header.jsx` | `h-14` (56px) fixe sur mobile, taille automatique sur bureau (`md:`). Logo et boutons rétrécis sur mobile, sous-titre masqué (`hidden md:block`). Boutons icône élargis à 44×44px sur mobile. |
| `frontend/src/components/Sidebar.jsx` | Sur mobile : 2 onglets ("Réglages" — classe/chapitre/difficulté nus, sans cartes ni icônes ; "Historique" — conversations + profil). Le bloc de suggestions et `buildSuggestions` ont été retirés entièrement (mobile et bureau) : ils vivent désormais dans WelcomeCard. `mobileTab`/`onMobileTabChange` optionnels (contrôlés par App.jsx, avec repli sur un état local). |
| `frontend/src/components/MessageBubble.jsx` | Ajout du bouton "Simplifie" (icône, à côté de Copier/Régénérer), affiché uniquement sur les réponses de chat normales (pas sur un résumé, une version déjà simplifiée ou une erreur). `min-w-0` ajouté sur le conteneur flex du contenu, nécessaire pour que le défilement horizontal des formules/tableaux fonctionne au lieu de pousser la bulle plus large que l'écran. |
| `frontend/src/components/ChatInput.jsx` | Sur mobile : bouton "⋯" ouvrant une feuille ("Un exercice", "Test de remédiation", "Voir le cours", "Résumé", puis "Télécharger" PDF/Word) ; caméra en icône seule à côté du champ ; deux pastilles classe/chapitre au-dessus du champ (ouvrent l'onglet Réglages). Sur bureau : barre d'outils inchangée, sans "Simplifie" (déplacé). Champ de saisie à hauteur automatique (1 à 4 lignes, pas de barre de défilement avant cette limite), placeholder raccourci en "Pose ta question". |
| `frontend/src/components/ExerciseCard.jsx` | Bouton "Exercice suivant" en pied de carte (`onNext`), affiché seulement sous le dernier exercice de la conversation. |
| `frontend/src/App.jsx` | Orchestration : état `isMobile`, ouverture de la feuille "Comment ça marche ?", `handleSimplify(index)` réécrit pour agir sur un message précis, `handleExercise()` réécrit pour générer un seul exercice avec dédoublonnage reconstruit à chaque appel depuis tous les exercices déjà affichés, `handleOpenSettings()` pour les pastilles, onglet mobile de la Sidebar remonté en état partagé. Pied de page enrichi du sous-titre retiré de l'en-tête. |
| `frontend/src/components/GeometryFigure.jsx` | SVG en largeur fluide (`width:100%; height:auto`, `preserveAspectRatio="xMidYMid meet"`, `max-width:320px`) au lieu d'une taille fixe en pixels — le tracé (viewBox) ne change pas. |
| `frontend/src/components/BackgroundBlobs.jsx` | Ne se monte plus sous 768px (`useIsMobile()`). |
| `frontend/src/styles/main.css` | Dégradé discret sur le bord droit de `.katex-display` et des tableaux Markdown (formules/tableaux larges) pour signaler qu'il y a une suite, sans réduire la taille de police. Règle `prefers-reduced-motion` étendue à une condition de largeur (`max-width: 767px`) pour les animations d'ambiance en boucle. |

### Addendum 2026-08-13 — AboutPanel et resserrement de la barre d'outils

`HowItWorksSheet.jsx` (créé dans ce chantier, voir tableau ci-dessus) est **supprimé** : entièrement
remplacé par `AboutPanel.jsx`, qui reprend son contenu (vidéo + 3 cartes) et y ajoute une
présentation du projet et un rappel du texte de consentement — voir RAPPORT_MIGRATION.md §14.2 pour
le détail fonctionnel. Contrairement à `HowItWorksSheet` (mobile uniquement, bureau gardait vidéo +
cartes affichées en ligne en permanence), `AboutPanel` sert désormais les DEUX tailles d'écran, en
feuille modale sur mobile et en fenêtre centrée sur bureau.

| Fichier | Rôle |
|---|---|
| `frontend/src/components/AboutPanel.jsx` | Remplace `HowItWorksSheet.jsx` (supprimé) : vidéo, 3 cartes, présentation du projet, rappel de consentement. Choisit `BottomSheet` ou `Modal` selon `useIsMobile()`. |
| `frontend/src/components/ui/Modal.jsx` | Pendant bureau de `BottomSheet.jsx` (même contrat open/onClose/title/children) — fenêtre centrée plutôt que remontant du bas. |
| `frontend/src/lib/serverMessages.js` | `mapServerMessagesToClient` — conversion des messages serveur vers la forme attendue par l'interface (voir RAPPORT_MIGRATION.md §14.4, bug corrigé). |
| `frontend/src/lib/dateFormat.js` | `formatMessageTime`/`formatDaySeparator`/`isSameDay`, utilisés par `MessageBubble.jsx` et `App.jsx` (voir RAPPORT_MIGRATION.md §14.3). |

| Fichier | Ce qui a changé |
|---|---|
| `frontend/src/components/WelcomeCard.jsx` | Les 3 cartes explicatives (bureau) et le bouton "Comment ça marche ?" (mobile) sont remplacés par un lien unique, identique sur les deux tailles d'écran, ouvrant `AboutPanel`. `ONBOARDING_STEPS`/`stepVariants` retirés (plus utilisés ici). |
| `frontend/src/App.jsx` | `VideoGuide` ne s'affiche plus en ligne sur bureau ; `AboutPanel` remplace `HowItWorksSheet` ; lien "Comment ça marche ?" ajouté au pied de page ; état renommé `howItWorksOpen`→`aboutOpen`. |
| `frontend/src/components/ChatInput.jsx` | Voir addendum §6 ci-dessous (padding/gap mobile resserrés, bouton d'envoi corrigé). |
| `frontend/src/components/MessageBubble.jsx` | Heure sous chaque message (`formatMessageTime`). |
| `frontend/src/lib/docx.js` | Heure de chaque message et date de chaque conversation dans les exports Word. |

## 3. Où est passée chaque action ? (à lire en premier)

| Action | Avant | Après (mobile < 768px) | Après (bureau ≥ 768px) |
|---|---|---|---|
| Voir le cours | Bouton dans la barre d'outils du champ | Dans la feuille "⋯" | Inchangé, barre d'outils |
| Résumé de la séance | Bouton dans la barre d'outils du champ | Dans la feuille "⋯" | Inchangé, barre d'outils |
| Générer un exercice | Bouton dans la barre d'outils du champ (5 exercices d'un coup) | Dans la feuille "⋯" (1 exercice, bouton "Exercice suivant" sous la carte pour continuer) | Barre d'outils, mais génère aussi 1 seul exercice désormais (voir §6) |
| Test de remédiation | Bouton dans la barre d'outils du champ | Dans la feuille "⋯" | Inchangé, barre d'outils |
| Photo / fichier d'exercice | Bouton texte dans la barre d'outils | Icône seule, à côté du champ de saisie (toujours visible) | Inchangé, bouton texte dans la barre d'outils |
| Télécharger PDF / Word | Menu déroulant `ExportMenu` dans la barre d'outils | Section "Télécharger" (PDF, Word) dans la feuille "⋯" | Inchangé, menu déroulant |
| Simplifie | Bouton dans la barre d'outils, agissait sur la dernière réponse seulement | Sous chaque réponse (à côté de Copier/Régénérer), agit sur ce message précis | Idem — déplacé sous chaque réponse sur les deux tailles d'écran (voir §6, correction universelle) |
| Suggestions de questions | Bloc dans la Sidebar (bureau et mobile) | Dans WelcomeCard, 2 maximum, disparaissent dès le premier message | Dans WelcomeCard, sans limite, disparaissent dès le premier message |
| 3 cartes "comment ça marche" | Affichées en ligne dans WelcomeCard | Derrière le lien "Comment ça marche ?" (feuille modale) | Inchangé, affichées en ligne |
| Vidéo de démonstration | Affichée en ligne au-dessus du fil de discussion | Dans la feuille "Comment ça marche ?" (avec la logique de masquage définitif déjà existante) | Inchangé, affichée en ligne |

## 4. Confirmation du critère du §1

**Critère : le champ de saisie doit être visible au premier rendu (360×640) sans défiler, invité
comme connecté.**

Aucun outil de rendu de navigateur (capture d'écran, Playwright...) n'est disponible dans cet
environnement — la vérification ci-dessous est un calcul de mise en page (flexbox) fait à la main
à partir du code, pas une capture visuelle réelle. Je le signale explicitement plutôt que
d'affirmer un test que je n'ai pas pu faire ; une vérification visuelle rapide sur un téléphone ou
les outils de développement du navigateur reste recommandée avant mise en production.

Calcul, à 360×640 :
- En-tête : 56px fixe sur mobile (`h-14`).
- La barre latérale est fermée par défaut sous 1024px (`sidebarOpen` initial), donc invisible au
  premier rendu — invité comme connecté, cet état ne dépend pas de l'authentification.
- Le panneau `main` a `min-h-[70vh]` (448px à 640px de haut) et `flex-1` : dans la colonne
  `min-h-screen` de la page, il s'étire pour occuper l'espace restant, borné en pratique à environ
  450–530px selon la hauteur du pied de page. Son dernier enfant flex est `ChatInput`, donc le bas
  du champ de saisie tombe entre ≈516px et ≈580px depuis le haut — dans tous les cas sous la barre
  de 640px.
- Ce calcul ne dépend pas du contenu de `WelcomeCard` (message d'accueil personnalisé pour un
  compte connecté vs générique pour un invité) : la zone de discussion défile en interne
  (`overflow-y-auto`) si son contenu est plus haut que l'espace disponible, sans repousser
  `ChatInput` hors de l'écran — c'est justement ce que corrige la structure flex existante.

Sous réserve de cette limite (pas de capture réelle), le critère est respecté par construction pour
les deux cas (invité et connecté).

## 5. Ce qui n'a pas été fait, et pourquoi

- **Découpage du bundle** (imports dynamiques de jsPDF/html2canvas/docx, `React.lazy` sur
  `AdminDashboard`) : explicitement exclu du périmètre de cette tâche par la consigne initiale.
  L'avertissement de build sur la taille des chunks (>500 kB) est antérieur à ce chantier et
  n'a pas été traité.
- **Modification d'AdminDashboard** : explicitement exclue.
- **Refonte des écrans d'inscription** : explicitement exclue (déjà traitée dans un chantier
  précédent).
- **Vérification visuelle réelle en navigateur** (360px et 1280px) : aucun outil de capture d'écran
  ou de navigateur piloté n'était disponible dans cet environnement. La vérification s'est limitée
  au build de production, à la suite Vitest (22 tests, 3 fichiers, tous verts) et à une relecture
  attentive du CSS/flexbox généré. Voir §4 pour le détail du calcul remplaçant la capture d'écran.
- **Détection JS de dépassement réel pour le dégradé KaTeX/tableaux** : le dégradé (§8) est posé en
  CSS pur, donc toujours présent, même quand le contenu tient déjà dans la largeur disponible (pas
  de mesure `scrollWidth`/`clientWidth` en JS pour l'activer conditionnellement). Choisi
  volontairement discret (`box-shadow` léger) pour rester inoffensif dans ce cas — voir §6.

## 6. Points d'attention

### Choix faits par défaut (ambiguïtés de la consigne)

- **"Simplifie" agit désormais par message, sur les deux tailles d'écran** (pas seulement sur
  mobile) : la consigne le présentait dans le contexte de la réorganisation mobile, mais cibler
  précisément le message cliqué plutôt que "la dernière réponse" est une correction de fond
  (l'ancien comportement pouvait simplifier la mauvaise réponse dès qu'on remontait dans
  l'historique) — appliquée partout plutôt que de garder un bug connu sur bureau.
- **Un seul exercice à la fois, sur les deux tailles d'écran** : la consigne invitait explicitement
  à statuer sur le comportement bureau. Choix : uniforme, un exercice + bouton "suivant" partout.
  Justification : générer 5 exercices d'un coup n'apportait rien de plus qu'un exercice + un bouton
  pour enchaîner, sur aucune taille d'écran, et le dédoublonnage reconstruit à chaque appel est
  plus robuste que l'ancien système par lot.
- **Hauteur automatique du champ de saisie (1 à 4 lignes)** : appliquée aux deux tailles d'écran
  (comportement général, pas spécifiquement mobile).
- **Sous-titre retiré de l'en-tête mobile** : placé uniquement dans le pied de page (pas dans
  WelcomeCard, pour ne pas alourdir le premier écran alors que l'objectif principal de cette tâche
  est justement de le désencombrer).
- **Suggestions déplacées dans WelcomeCard sur les deux tailles d'écran** (pas seulement mobile) :
  la consigne ne limitait pas explicitement ce point au mobile ; elles ont donc quitté la Sidebar
  partout, avec un plafond de 2 uniquement sous 768px.
- **Dégradé KaTeX/tableaux toujours présent** (pas de détection d'overflow réel) : voir §5.

### Risques de régression bureau à surveiller

- La Sidebar bureau a perdu son bloc de suggestions (déplacé vers WelcomeCard) : c'est un
  changement visuel intentionnel et assumé (voir ci-dessus), mais à valider auprès des utilisateurs
  habitués à l'ancien emplacement.
- Le dégradé `box-shadow` sur `.katex-display`/tableaux est désormais visible en permanence sur
  bureau aussi, y compris sur des formules/tableaux qui tiennent déjà dans la largeur — effet
  voulu très discret (`rgba(0,0,0,0.16)` clair / `0.45` sombre) mais à confirmer visuellement.
- `GeometryFigure` a une largeur maximale de 320px sur toutes les tailles d'écran désormais (avant :
  taille fixe 320×240 partout) — comportement identique en pratique puisque la taille précédente
  était déjà fixée à 320px, mais toute figure affichée dans un conteneur très étroit (moins de
  320px, situation qui ne se produisait pas avant) se réduira désormais au lieu de déborder.

### Bugs repérés en cours de route

- Avant correction, une bulle de message contenant une formule KaTeX ou un tableau large que
  l'écran poussait toute la bulle (et potentiellement la page) plus large que le conteneur au lieu
  de défiler en interne — cause : absence de `min-width: 0` sur le conteneur flex de
  `MessageBubble`, un enfant flex ne rétrécissant jamais sous la largeur intrinsèque de son contenu
  par défaut. Corrigé dans le cadre du §8 (voir tableau des fichiers modifiés).
- **Découvert le 2026-08-13, sans rapport avec le mobile mais bloquant pour l'horodatage des
  messages (voir RAPPORT_MIGRATION.md §14.4)** : `App.jsx::openConversation` ne convertissait
  jamais les messages renvoyés par le serveur (forme `role`/`kind`/`content`/`payload`) vers la
  forme attendue par l'interface (`type`/`text`/`data`/`sources`) — rouvrir une conversation
  affichait donc des bulles vides, un exercice/QCM historique ne réaffichait plus sa carte, et
  "Simplifie" perdait le contexte de la dernière réponse. Corrigé par
  `frontend/src/lib/serverMessages.js::mapServerMessagesToClient`.

### Addendum 2026-08-13 — Barre d'outils mobile resserrée (icônes caméra/⋯, bouton d'envoi)

Constat initial (mesuré, voir plus bas) : à 360px de large, avec le padding d'origine (`p-3`, 12px,
plus 12px hérités du conteneur parent commun à toute la mise en page — voir plus bas) et
l'espacement (`gap-2`, 8px), le champ de saisie n'occupait que ≈54% de la largeur de la ligne —
sous le plancher de 60% visé — malgré des cibles tactiles caméra/⋯ déjà correctement à 44×44px.
**Cause principale, pas mentionnée dans la consigne initiale** : le bouton d'envoi utilisait
`size="lg"` (`px-5`, soit 20px de padding horizontal de chaque côté) au lieu de `size="icon"` —
`min-w-[44px]` ne fait qu'imposer un plancher, pas un plafond, donc ce bouton mesurait en réalité
≈58-60px de large sur mobile, pas 44px.

Correctifs appliqués (mobile uniquement, via `isMobile`, déjà disponible dans `ChatInput.jsx`) :
- Bouton d'envoi : `size={isMobile ? "icon" : "lg"}` — 44×44px sur mobile désormais, inchangé sur
  bureau.
- Icône caméra : 18px → 20px (alignée sur l'icône "⋯", déjà à 20px) — sans effet sur la largeur du
  bouton (le padding, `p-2`, absorbe la différence, la cible reste 44×44px dans les deux cas).
- Padding horizontal du conteneur `ChatInput` : `p-3` (12px) → `px-0.5` (2px) sur mobile seulement
  (`py-3` inchangé).
- Espacement entre les éléments de la ligne (⋯, caméra, champ, envoi) : `gap-2` (8px) → `gap-px`
  (1px) sur mobile seulement.
- **Padding du conteneur partagé Sidebar+zone de chat** (`App.jsx`, en dehors de `ChatInput.jsx`) :
  `p-3` (12px) → `px-1.5 py-3` (6px horizontal) sous 768px (`max-md:`). Nécessaire en plus des
  points ci-dessus : ces 12px de marge externe, communs à toute la mise en page (pas seulement au
  champ de saisie), pesaient à eux seuls plus lourd dans le calcul que tout le padding propre à
  `ChatInput`, et resserrer uniquement ce dernier ne suffisait pas à atteindre 60% même en
  poussant son propre padding à 0.

**Résultat mesuré** (pas seulement calculé cette fois : `chromium`/Playwright piloté en headless
contre le serveur de dev, à 360×740 — voir méthode ci-dessous) :

| Élément | Position/largeur mesurée |
|---|---|
| Bouton "⋯" | x=9, 44×44px |
| Bouton caméra | x=54, 44×44px |
| Champ de saisie | x=99, **207px de large** |
| Bouton d'envoi | x=307, 44×44px |

Ligne de contenu : de x=9 à x=351 (droite du bouton d'envoi), soit 342px. Champ de saisie 207px →
**207 / 342 ≈ 60,5%**, au-dessus du plancher visé. Capture d'écran prise à l'appui (voir
`03-mobile-toolbar` dans la session de vérification) : la barre reste lisible, chaque bouton garde
un contour visuellement distinct malgré l'espacement de 1px entre eux.

**Compromis assumé** : un espacement de 1px entre des cibles tactiles adjacentes de 44px, et un
padding de bord d'écran de 2-6px, sont en dessous de ce que recommandent généralement les lignes
directrices d'accessibilité tactile (habituellement ≥8px entre cibles voisines, même quand chaque
cible individuelle atteint 44px) — accepté ici pour respecter la contrainte numérique explicite
(champ ≥60% à 360px) sans jamais descendre une cible sous 44×44px, contrainte qui s'est révélée
mathématiquement impossible à tenir sans cet espacement minimal une fois les 3 cibles fixes (⋯,
caméra, envoi) et la marge externe partagée prises en compte. À valider sur un vrai téléphone avant
mise en production ; si le risque de faux-clic s'avère gênant en usage réel, revoir plutôt le
nombre de cibles toujours visibles (ex. fusionner caméra dans le menu "⋯") plutôt que de resserrer
encore l'espacement.

**Méthode de vérification** : contrairement au reste de ce rapport (voir §4, aucun outil de rendu
disponible à l'époque), un navigateur headless (`chromium` via Playwright, installé pour l'occasion
dans le répertoire de travail temporaire) a été piloté contre `npm run dev` pour cette vérification
— captures d'écran et mesures de position/taille (`boundingBox()`) réelles, pas un calcul manuel.
Utilisé aussi pour confirmer visuellement AboutPanel (feuille modale mobile / fenêtre centrée
bureau) et l'affichage de l'heure sous les messages (voir RAPPORT_MIGRATION.md §14).

### Addendum 2026-08-13 (suite) — Modale bureau décentrée, Réglages/Historique en feuille sur mobile

Deux correctifs demandés après relecture visuelle par l'équipe (captures d'écran à l'appui), sur des
points que ce rapport n'avait pas identifiés.

**1. `ui/Modal.jsx` (AboutPanel, bureau) affichait sa boîte décalée en bas-à-droite du centre réel,
pas centrée.** Cause : la boîte utilisait `left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2`
(classes Tailwind, centrage par `transform`) ET était un `motion.div` animant `scale`/`y`
(`initial`/`animate` framer-motion, qui pose sa propre valeur de `transform` en style inline).
Un style inline l'emporte toujours sur une classe CSS ciblant la même propriété : le `transform`
posé par framer-motion écrasait intégralement celui des classes Tailwind, laissant la boîte
positionnée à `left: 50%; top: 50%` SANS le décalage compensatoire de -50%/-50% — son coin
haut-gauche se retrouvait au centre de l'écran plutôt que son propre centre. Corrigé en centrant
par flexbox (`fixed inset-0 flex items-center justify-center` sur le fond, la boîte est un enfant
flex normal) : aucun conflit possible, cette technique ne touche jamais à `transform`. Vérifié par
mesure réelle (Playwright, `boundingBox()`) à 1280×800 : centre de la boîte (640, 400) = centre du
viewport (640, 400) exactement, décalage nul (avant correctif, décalage significatif dans les deux
axes). Piège à surveiller pour tout futur composant combinant classes de centrage par `transform`
et animation framer-motion sur ce même axe.

**2. Sur mobile, Réglages/Historique (`Sidebar.jsx`, 2 onglets) s'affichaient EN LIGNE au-dessus du
chat dès l'ouverture de l'appli** (si `sidebarOpen` valait `true` — voir plus bas pourquoi c'était
fréquent), poussant le champ de saisie hors du premier écran : exactement le problème que la feuille
"⋯" de `ChatInput.jsx` (§3 du tableau) avait déjà résolu pour les actions secondaires, mais qui
subsistait ici. Cause plus profonde qu'un simple oubli d'état par défaut : `sidebarOpen` était
**partagé entre bureau et mobile** — une préférence "ouvert" enregistrée sur bureau (son
comportement normal, ouvert par défaut) restait collée en `localStorage` et s'appliquait aussi sur
mobile à la prochaine visite, malgré la valeur par défaut initiale correcte (`matchMedia
"(min-width: 1024px)"`, fermé sous ce seuil) — un simple correctif de valeur par défaut n'aurait
donc pas suffi, tant que les deux tailles d'écran continuaient à lire/écrire la même clé.

Correctif : deux états distincts dans `App.jsx`.
- `sidebarOpen` (bureau uniquement désormais, comportement inchangé — colonne repliable à côté du
  chat, préférence mémorisée).
- `mobileSidebarOpen` (mobile uniquement, nouveau — jamais persisté, toujours fermé à l'arrivée).
  Réglages/Historique quittent la mise en page en ligne et rejoignent une `BottomSheet` (la même
  primitive que la feuille "⋯"), ouverte via le même bouton qui repliait/dépliait la colonne bureau
  (icône `PanelLeftOpen`, en haut à gauche du panneau de chat — toujours le premier élément visible,
  immédiatement accessible) ou via les pastilles classe/chapitre (`handleOpenSettings`, inchangé
  dans son intention, redirigé vers `mobileSidebarOpen`). `Sidebar.jsx` lui-même n'a pas changé :
  il détectait déjà le mode mobile pour afficher ses 2 onglets nus plutôt que ses colonnes bureau —
  seul son EMPLACEMENT dans `App.jsx` change (feuille modale au lieu d'en ligne).

Vérifié par capture d'écran réelle (Playwright, 375×667, session sans préférence enregistrée) :
le champ de saisie est visible dès le premier écran, sans défiler ; le bouton `PanelLeftOpen` ouvre
la feuille par-dessus le chat (pas en le repoussant) ; la feuille contient bien les 2 onglets
Réglages/Historique inchangés.

| Fichier | Ce qui a changé |
|---|---|
| `frontend/src/App.jsx` | `sidebarOpen` redevenu bureau-only ; nouvel état `mobileSidebarOpen` (jamais persisté) ; le bloc `Sidebar` en ligne n'est monté que si `!isMobile` ; nouvelle `BottomSheet` mobile-only contenant `Sidebar` ; bouton `PanelLeftOpen`/`handleOpenSettings` redirigés vers `mobileSidebarOpen` sur mobile. |
| `frontend/src/components/ui/Modal.jsx` | Centrage par flexbox au lieu de `transform` (voir ci-dessus) — aucun changement de contrat (`open`/`onClose`/`title`/`children` inchangés). |
