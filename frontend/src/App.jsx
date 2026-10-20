import React, { useEffect, useRef, useState } from "react"
import { AnimatePresence, motion } from "framer-motion"
import { AlertTriangle, CheckCircle2, XCircle, PanelLeftClose, PanelLeftOpen, HelpCircle } from "lucide-react"
import {
  checkHealth,
  getClasses,
  getChapters,
  askQuestionStream,
  simplifyResponse,
  generateExercise,
  generateExerciseSolution,
  explainExercisePhoto,
  generatePrerequis,
  checkCourseAvailable,
  checkSummaryFileAvailable,
  getSummaryFileUrl,
  listConversations,
  createConversation,
  getConversation,
  deleteConversation,
  exportHistory,
  postRemediationResults,
  postStruggle,
  getGreeting,
  getStudentProfile,
} from "./api.js"
import Header from "./components/Header.jsx"
import Sidebar from "./components/Sidebar.jsx"
import MessageBubble from "./components/MessageBubble.jsx"
import ExerciseCard from "./components/ExerciseCard.jsx"
import RemediationQuiz from "./components/RemediationQuiz.jsx"
import ChatInput from "./components/ChatInput.jsx"
import TypingIndicator from "./components/TypingIndicator.jsx"
import WelcomeCard from "./components/WelcomeCard.jsx"
import AboutPanel from "./components/AboutPanel.jsx"
import CourseViewer from "./components/CourseViewer.jsx"
import FlashcardsViewer from "./components/FlashcardsViewer.jsx"
import EditProfileSheet from "./components/EditProfileSheet.jsx"
import BottomSheet from "./components/ui/BottomSheet.jsx"
import BackgroundBlobs from "./components/BackgroundBlobs.jsx"
import AuthGate from "./components/AuthGate.jsx"
import ConsentGate from "./components/ConsentGate.jsx"
import ProfileCompletionGate from "./components/ProfileCompletionGate.jsx"
import AdminDashboard from "./components/AdminDashboard.jsx"
import Button from "./components/ui/Button.jsx"
import ExportMenu from "./components/ExportMenu.jsx"
import { exportNodeToPDF } from "./lib/pdf.js"
import { exportMessagesToDocx, exportHistoryToDocx } from "./lib/docx.js"
import { compressImageFile } from "./lib/image.js"
import { getProfile, recordTopicVisit, recordStruggle, dismissStruggle, clearProfile } from "./lib/profile.js"
import { getToken, logout as authLogout, restoreSession, AUTH_CHOICE_KEY } from "./lib/auth.js"
import { buildHistoryUpTo } from "./lib/history.js"
import { mapServerMessagesToClient } from "./lib/serverMessages.js"
import { isSameDay, formatDaySeparator } from "./lib/dateFormat.js"
import { useIsMobile } from "./lib/useMediaQuery.js"

const STORAGE_KEY = "chatmaths-session-v1"

function loadSavedSession() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    // Une réponse laissée en plein streaming (page rechargée en cours de génération) ne doit
    // pas rester bloquée avec son curseur clignotant au prochain chargement.
    if (Array.isArray(parsed.messages)) {
      parsed.messages = parsed.messages.map((m) => (m.streaming ? { ...m, streaming: false } : m))
    }
    return parsed
  } catch {
    return null
  }
}

const saved = loadSavedSession()

/** Retrouve la dernière question/réponse d'une conversation rechargée, pour que "Simplifie"
 * fonctionne tout de suite après avoir rouvert une conversation depuis l'historique. */
function deriveLastExchange(msgs) {
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i].type === "bot" && (!msgs[i].kind || msgs[i].kind === "chat")) {
      const prevUser = msgs[i - 1]
      return { lastQuestion: prevUser?.type === "user" ? prevUser.text : "", lastAnswer: msgs[i].text || "" }
    }
  }
  return { lastQuestion: "", lastAnswer: "" }
}

/** Étiquette centrée entre deux messages de jours calendaires différents ("Aujourd'hui", "Hier",
 * "12 août" — voir lib/dateFormat.js). */
function DateSeparator({ iso }) {
  return (
    <div className="my-3 flex items-center justify-center">
      <span className="rounded-full bg-base-200 px-3 py-1 text-xs font-medium text-base-content/50">
        {formatDaySeparator(iso)}
      </span>
    </div>
  )
}

export default function App() {
  const isMobile = useIsMobile()
  const [aboutOpen, setAboutOpen] = useState(false)
  const [courseViewerOpen, setCourseViewerOpen] = useState(false)
  const [flashcardsViewerOpen, setFlashcardsViewerOpen] = useState(false)
  const [editProfileOpen, setEditProfileOpen] = useState(false)
  // Ferme la feuille Réglages/Historique (mobile) avant d'ouvrir celle du profil : sinon les deux
  // BottomSheet s'empilent visuellement (celle du profil ouverte par-dessus, celle du dessous
  // toujours visible/interactive derrière). Inoffensif sur bureau (mobileSidebarOpen y est déjà
  // toujours faux, la sidebar bureau n'étant pas une feuille modale).
  function openEditProfile() {
    setMobileSidebarOpen(false)
    setEditProfileOpen(true)
  }
  const [theme, setTheme] = useState(() => localStorage.getItem("chatmaths-theme") || "chatmaths-light")
  // Bureau uniquement : ouvert par défaut, préférence mémorisée (voir l'effet de sauvegarde
  // plus bas). Sur mobile, Réglages/Historique ne sont plus jamais affichés en ligne — voir
  // mobileSidebarOpen ci-dessous — donc cette préférence bureau ne les concerne plus du tout :
  // avant ce correctif, les deux tailles d'écran partageaient le même état, et une préférence
  // "ouvert" enregistrée sur bureau restait collée en rouvrant l'appli sur mobile, poussant le
  // chat hors de l'écran au premier chargement (voir RAPPORT_MOBILE.md, correctif "Sidebar
  // mobile en feuille modale").
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    const stored = localStorage.getItem("chatmaths-sidebar-open")
    if (stored !== null) return stored !== "false"
    return typeof window !== "undefined" ? window.matchMedia("(min-width: 1024px)").matches : true
  })
  // Mobile uniquement : Réglages/Historique vivent dans une feuille modale ouverte à la demande
  // (bouton "PanelLeftOpen" du panneau de chat, ou les pastilles classe/chapitre — voir
  // handleOpenSettings) plutôt qu'affichés en ligne au-dessus du chat, qui poussait le champ de
  // saisie hors de l'écran au premier chargement. Jamais persisté : toujours fermé à l'arrivée,
  // comme la feuille "⋯" de ChatInput.
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false)

  // Comptes élèves (optionnel) : voir handleAuthenticated/handleContinueAsGuest plus bas.
  const [authChecking, setAuthChecking] = useState(() => localStorage.getItem(AUTH_CHOICE_KEY) === "authenticated")
  const [showAuthGate, setShowAuthGate] = useState(() => {
    const choice = localStorage.getItem(AUTH_CHOICE_KEY)
    return choice !== "guest" && choice !== "authenticated"
  })
  const [user, setUser] = useState(null)
  const [role, setRole] = useState(null)
  // Portes bloquantes pour un compte migré depuis l'ancienne base SQLite (voir
  // migrate_sqlite_to_pg.py) : consentement pas à jour et/ou fiche incomplète. Toujours True par
  // défaut — un invité (user=null) n'active jamais ces écrans, voir le rendu conditionnel plus bas.
  const [consentOk, setConsentOk] = useState(true)
  const [profileComplete, setProfileComplete] = useState(true)
  const [conversations, setConversations] = useState([])
  const [activeConversationId, setActiveConversationId] = useState(null)
  const [greetingMessage, setGreetingMessage] = useState(null)
  const [classes, setClasses] = useState([])
  const [classCode, setClassCode] = useState(saved?.classCode || "")
  const [chapters, setChapters] = useState([])
  const [chapitre, setChapitre] = useState(saved?.chapitre || "")
  // null = automatique (le serveur déduit un niveau adapté aux questions posées, moyen par défaut)
  const [difficulty, setDifficulty] = useState(saved?.difficulty ?? null)

  const [messages, setMessages] = useState(saved?.messages || [])
  const [question, setQuestion] = useState("")
  const [loading, setLoading] = useState(false)
  const [streaming, setStreaming] = useState(false)
  const [regeneratingIndex, setRegeneratingIndex] = useState(null)
  const [simplifyingIndex, setSimplifyingIndex] = useState(null)
  // Onglet mobile de la sidebar (Réglages/Historique), remonté ici pour que les pastilles
  // classe/chapitre de ChatInput puissent forcer "Réglages" même si la sidebar affichait déjà
  // "Historique" — voir Sidebar.jsx (mobileTab contrôlé) et handleOpenSettings plus bas.
  const [sidebarMobileTab, setSidebarMobileTab] = useState("reglages")
  const [serverOnline, setServerOnline] = useState(true)
  const [exportingSession, setExportingSession] = useState(false)
  const [photoLoading, setPhotoLoading] = useState(false)
  // Dernière photo/PDF d'exercice envoyée : tant qu'elle est active, les messages suivants la
  // renvoient à Claude avec l'historique (voir handleSend) pour qu'il puisse continuer à "voir"
  // l'exercice sur des questions de suivi ("résous la question a"). Remise à null au démarrage
  // d'une nouvelle conversation, au changement de conversation, ou en cliquant sur "Nouveau sujet".
  const [activePhoto, setActivePhoto] = useState(null)
  const [profile, setProfile] = useState(() => getProfile())
  const [toast, setToast] = useState(null)
  // Contrôle l'affichage du contrôle de changement de classe dans ProfilePanel (voir Sidebar.jsx :
  // le lien « Changer » de la ligne classe en lecture seule bascule cet état, plutôt que de gérer
  // l'ouverture localement dans ProfilePanel, pour pouvoir aussi ramener la sidebar mobile sur
  // l'onglet Historique — où vit ProfilePanel — au même moment.
  const [classEditOpen, setClassEditOpen] = useState(false)

  // Suivi séparé de la dernière question/réponse texte pour "Simplifie"
  // (le champ de saisie est vidé après l'envoi, donc on ne peut pas s'y fier)
  const [lastQuestion, setLastQuestion] = useState(saved?.lastQuestion || "")
  const [lastAnswer, setLastAnswer] = useState(saved?.lastAnswer || "")

  const chatRef = useRef(null)
  const sessionContentRef = useRef(null)
  // Miroir synchrone de activeConversationId, lu par ensureConversation()/setActiveConv() sans
  // attendre le re-render. Le backend persiste désormais lui-même chaque échange (question +
  // réponse) en une seule requête (voir conversation_id transmis à chaque appel API ci-dessous) :
  // il n'y a donc plus qu'UN SEUL appel à ensureConversation() par action élève (au lieu de deux
  // avant, un pour le message élève et un pour la réponse), ce qui élimine la course qui
  // nécessitait auparavant un verrou supplémentaire (creatingConversationRef, supprimé).
  const activeConversationIdRef = useRef(null)
  // Requête LLM actuellement en cours (chat, exercice, prérequis, résumé, simplification...) —
  // un seul contrôleur à la fois puisqu'une seule de ces actions tourne à la fois (voir `loading`).
  // Voir handleStop() : le bouton "envoyer" se change en carré pendant le chargement (ChatInput.jsx)
  // pour permettre à l'élève d'annuler plutôt que d'attendre une réponse longue à générer.
  const abortControllerRef = useRef(null)
  const classeNom = classes.find((c) => c.code === classCode)?.name || ""

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme)
    localStorage.setItem("chatmaths-theme", theme)
  }, [theme])

  useEffect(() => {
    localStorage.setItem("chatmaths-sidebar-open", String(sidebarOpen))
  }, [sidebarOpen])

  // Le backend peut mettre du temps à démarrer (première installation, chargement du modèle
  // d'embeddings...). Plutôt que d'échouer une fois pour toutes, on réessaie en tâche de fond
  // jusqu'à ce qu'il réponde, avec un délai croissant entre les tentatives.
  useEffect(() => {
    let cancelled = false
    let delay = 1000

    async function poll() {
      while (!cancelled) {
        const h = await checkHealth()
        const online = h.status === "healthy" || h.status === "degraded"
        if (cancelled) return
        setServerOnline(online)

        if (online) {
          try {
            const list = await getClasses()
            if (!cancelled) setClasses(list)
            return
          } catch {
            /* le serveur répond mais pas encore prêt à servir les classes, on reessaie */
          }
        }

        await new Promise((resolve) => setTimeout(resolve, delay))
        delay = Math.min(delay * 1.5, 5000)
      }
    }

    poll()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight
  }, [messages, loading])

  useEffect(() => {
    if (classCode) {
      loadChapters(classCode)
    } else {
      setChapters([])
    }
  }, [classCode])

  // Sauvegarde automatique de la session invité (classe, chapitre...) dans localStorage.
  // Un élève connecté a sa conversation persistée côté serveur à la place (voir plus bas) :
  // on n'écrase pas la session invité pendant qu'il est connecté.
  useEffect(() => {
    if (user) return
    // imageUrl est une blob: URL valable seulement pour la durée de vie de la page : on ne la
    // persiste pas (elle serait cassée au prochain chargement de toute façon).
    const persistableMessages = messages.some((m) => m.imageUrl)
      ? messages.map((m) => (m.imageUrl ? { ...m, imageUrl: null } : m))
      : messages
    const payload = { classCode, chapitre, difficulty, messages: persistableMessages, lastQuestion, lastAnswer }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload))
    } catch {
      /* stockage plein ou indisponible, tant pis */
    }
  }, [user, classCode, chapitre, difficulty, messages, lastQuestion, lastAnswer])

  // Au premier chargement, si un token de connexion était mémorisé, on le valide auprès du
  // backend avant d'afficher quoi que ce soit (évite un flash appli-invité puis connectée).
  useEffect(() => {
    if (localStorage.getItem(AUTH_CHOICE_KEY) !== "authenticated") return
    let cancelled = false
    restoreSession().then((session) => {
      if (cancelled) return
      if (session) {
        setUser(session.username)
        setRole(session.role)
        setConsentOk(session.consentOk !== false)
        setProfileComplete(session.profileComplete !== false)
        // La classe est fixée au compte (app.users.class_code) : on ne la redemande plus, on
        // reprend celle du compte plutôt que la dernière classe choisie en mode invité sur cet
        // appareil (voir STORAGE_KEY plus haut, qui reste dédié aux sessions invité).
        if (session.classCode) setClassCode(session.classCode)
      } else {
        setShowAuthGate(true)
      }
      setAuthChecking(false)
    })
    return () => {
      cancelled = true
    }
  }, [])

  // Une fois connecté : charge l'historique de conversations et l'accueil personnalisé.
  // Un décideur n'a pas de chat élève : il n'a pas besoin de cette donnée.
  useEffect(() => {
    if (!user || role === "decideur") return
    let cancelled = false

    async function loadUserData() {
      const token = getToken()
      try {
        const list = await listConversations(token)
        if (cancelled) return
        setConversations(list)
        if (list.length > 0) {
          await openConversation(list[0].id)
        } else {
          // Compte tout juste créé (ou sans historique) : on repart d'une page blanche plutôt
          // que de laisser traîner une éventuelle conversation invitée du même navigateur.
          setMessages([])
          setActiveConv(null)
          setLastQuestion("")
          setLastAnswer("")
        }
      } catch {
        /* historique indisponible pour le moment, on continue sans */
      }
      try {
        const greeting = await getGreeting(token)
        if (!cancelled) setGreetingMessage(greeting)
      } catch {
        /* accueil personnalisé indisponible, tant pis */
      }
      try {
        const serverProfile = await getStudentProfile(token)
        if (!cancelled) setProfile(serverProfile)
      } catch {
        /* profil indisponible pour le moment, on continue sans */
      }
    }

    loadUserData()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user])

  async function loadChapters(code) {
    try {
      const list = await getChapters(code)
      setChapters(list)
    } catch {
      pushBotError("Impossible de charger les chapitres pour cette classe.")
    }
  }

  function pushUserMessage(text, imageUrl = null) {
    setMessages((prev) => [...prev, { type: "user", text, sources: [], imageUrl, createdAt: new Date().toISOString() }])
  }

  function pushBotMessage(text, sources = [], kind = "chat") {
    setMessages((prev) => [...prev, { type: "bot", text, sources, kind, createdAt: new Date().toISOString() }])
  }

  function pushExerciseMessage(data) {
    setMessages((prev) => [...prev, { type: "exercise", data, createdAt: new Date().toISOString() }])
  }

  function pushRemediationMessage(data) {
    setMessages((prev) => [...prev, { type: "prerequis", data, createdAt: new Date().toISOString() }])
  }

  function pushBotError(text) {
    setMessages((prev) => [...prev, { type: "bot", text, sources: [], kind: "error", createdAt: new Date().toISOString() }])
  }

  function showToast(text, kind = "success") {
    setToast({ text, kind, id: Date.now() })
  }

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4000)
    return () => clearTimeout(timer)
  }, [toast])

  /** Met à jour le dernier message de la liste (utilisé pour brancher les fragments du streaming). */
  function patchLastMessage(patch) {
    setMessages((prev) => {
      if (prev.length === 0) return prev
      const next = [...prev]
      const last = next[next.length - 1]
      next[next.length - 1] = typeof patch === "function" ? patch(last) : { ...last, ...patch }
      return next
    })
  }

  function patchMessageAt(index, patch) {
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  /** Élève connecté : profil reconstruit depuis SON historique serveur (propre à ce compte).
   * Invité : profil local (localStorage), remis à zéro à la déconnexion — voir handleLogout. */
  async function refreshProfile() {
    if (user) {
      try {
        setProfile(await getStudentProfile(getToken()))
      } catch {
        /* on garde le profil precedent si la requete echoue */
      }
    } else {
      setProfile(getProfile())
    }
  }

  // ==========================================================================
  // Comptes élèves : chargement/écriture de l'historique côté serveur
  // ==========================================================================

  function setActiveConv(id) {
    activeConversationIdRef.current = id
    setActiveConversationId(id)
  }

  async function openConversation(id) {
    const token = getToken()
    // Capturé AVANT l'attente réseau : si un envoi de message a entre-temps rendu une autre
    // conversation active (voir ensureConversation) — typiquement un élève qui pose sa question
    // très vite après la connexion, avant que ce chargement initial (déclenché par loadUserData)
    // n'ait eu le temps de répondre — ce résultat est périmé. L'appliquer quand même écraserait
    // silencieusement le fil en cours (question et/ou réponse qui viennent d'être ajoutées),
    // symptôme observé : messages qui "disparaissent" juste après l'envoi.
    const idBeforeFetch = activeConversationIdRef.current
    const conv = await getConversation(token, id)
    if (activeConversationIdRef.current !== idBeforeFetch) return
    // Les messages renvoyés par le serveur (role/kind/content/payload, voir database.get_messages)
    // ont une forme différente de celle attendue par l'interface (type/text/data/sources, voir
    // MessageBubble.jsx/ExerciseCard.jsx/RemediationQuiz.jsx) — sans cette conversion, rouvrir une
    // conversation affichait des bulles vides (bug corrigé ici, voir lib/serverMessages.js).
    const mapped = mapServerMessagesToClient(conv.messages)
    setMessages(mapped)
    setActiveConv(id)
    setActivePhoto(null)
    // Un compte connecté est fixé à sa classe (voir plus haut) : rouvrir une conversation plus
    // ancienne, éventuellement créée sous une autre classe (avant un changement via le profil),
    // ne doit jamais l'écraser — elle garde son class_code d'origine en base, affiché tel quel
    // dans son titre, mais les réponses suivantes restent ancrées sur la classe ACTUELLE du
    // compte (le serveur l'impose de toute façon, voir _resolve_class_level côté backend). Seul
    // un invité (sans classe de compte) continue de suivre la classe de la conversation rouverte.
    if (!user && conv.class_level) setClassCode(conv.class_level)
    if (conv.chapter) setChapitre(conv.chapter)
    const { lastQuestion: lq, lastAnswer: la } = deriveLastExchange(mapped)
    setLastQuestion(lq)
    setLastAnswer(la)
  }

  /** Crée la conversation serveur au tout premier message si elle n'existe pas encore (pas de
   * ligne vide créée pour un élève connecté qui ne discute jamais). Le backend persiste ensuite
   * lui-même chaque échange dans cette conversation (voir conversation_id transmis par
   * handleSend/handleExercise/etc.), donc plus besoin d'un verrou anti-doublon ici : un seul
   * appel par action, jamais deux en parallèle pour le même tour de conversation.
   *
   * `titleHint` : texte réel tapé/reçu (question, énoncé...) utilisé comme titre de la
   * conversation dans l'historique — des mots-clés qui aident à s'y retrouver, plutôt que
   * "classe · chapitre" qui est identique pour toutes les conversations du même chapitre. Sans
   * hint (ex: un exercice généré en tout premier message, sans question tapée), on retombe sur
   * un intitulé neutre ; le titre réel apparaîtra dès la première vraie question de la conversation. */
  async function ensureConversation(titleHint = "") {
    if (!user) return null
    if (activeConversationIdRef.current) return activeConversationIdRef.current

    const token = getToken()
    const id = await createConversation(token, classCode, chapitre)
    setActiveConv(id)
    const title = titleHint.trim() ? titleHint.trim().slice(0, 60) : "Nouvelle conversation"
    setConversations((prev) => [
      { id, title, class_level: classCode, chapter: chapitre, updated_at: new Date().toISOString() },
      ...prev,
    ])
    return id
  }

  /** Bascule vers l'écran de consentement/complétion de fiche si l'API signale qu'un compte
   * connecté n'est pas à jour (comptes migrés depuis SQLite, voir migrate_sqlite_to_pg.py) :
   * consentOk/profileComplete sont normalement déjà corrects juste après login/restoreSession,
   * ce filet de sécurité couvre le cas où l'état serveur aurait changé entre-temps. Retourne
   * true si l'erreur a été absorbée (l'appelant ne doit alors PAS afficher son propre message
   * d'erreur générique par-dessus). */
  function interceptGateError(err) {
    if (err?.status !== 428) return false
    if (err.reason === "consent_required") {
      setConsentOk(false)
      return true
    }
    if (err.reason === "profile_incomplete") {
      setProfileComplete(false)
      return true
    }
    return false
  }

  function handleAuthenticated({ username, role: userRole, consentOk: sessionConsentOk, profileComplete: sessionProfileComplete, classCode: sessionClassCode }) {
    setUser(username)
    setRole(userRole)
    setConsentOk(sessionConsentOk !== false)
    setProfileComplete(sessionProfileComplete !== false)
    // Classe fixée au compte (fiche d'inscription, ou déjà présente pour une reconnexion) : voir
    // la même logique côté restauration de session plus haut.
    if (sessionClassCode) setClassCode(sessionClassCode)
    setShowAuthGate(false)
  }

  function handleContinueAsGuest() {
    localStorage.setItem(AUTH_CHOICE_KEY, "guest")
    setShowAuthGate(false)
  }

  function handleLoginClick() {
    setShowAuthGate(true)
  }

  function handleLogout() {
    authLogout()
    localStorage.setItem(AUTH_CHOICE_KEY, "guest")
    setUser(null)
    setRole(null)
    setConsentOk(true)
    setProfileComplete(true)
    setConversations([])
    setActiveConv(null)
    setGreetingMessage(null)
    setMessages([])
    setLastQuestion("")
    setLastAnswer("")
    // Le profil du compte qui vient de se déconnecter (sujets/notions) ne doit pas continuer à
    // s'afficher pour la session invité qui suit, ni pour un autre compte connecté ensuite sur
    // ce même navigateur : voir refreshProfile(), qui utilise ce stockage local uniquement
    // en mode invité (les comptes utilisent leur propre profil serveur, propre à chacun).
    setProfile(clearProfile())
  }

  async function handleSelectConversation(id) {
    if (loading || streaming || id === activeConversationId) return
    try {
      await openConversation(id)
    } catch {
      showToast("Impossible de charger cette conversation.", "error")
    }
  }

  async function handleDeleteConversation(id) {
    try {
      await deleteConversation(getToken(), id)
      setConversations((prev) => prev.filter((c) => c.id !== id))
      if (id === activeConversationId) {
        setMessages([])
        setActiveConv(null)
        setLastQuestion("")
        setLastAnswer("")
        setActivePhoto(null)
      }
    } catch {
      showToast("Impossible de supprimer cette conversation.", "error")
    }
  }

  function handleNewConversation() {
    setMessages([])
    setActiveConv(null)
    setLastQuestion("")
    setLastAnswer("")
    setActivePhoto(null)
  }

  async function handleRemediationResults(remediationData, answers) {
    if (!user) return
    try {
      await postRemediationResults(getToken(), remediationData.class_level, remediationData.chapter, answers)
    } catch {
      /* signal de lacune non enregistré, tant pis pour l'accueil personnalisé la prochaine fois */
    }
  }

  /** overrides permet d'envoyer une question précise avec une classe/un chapitre précis sans
   * dépendre du state React (qui ne serait pas encore à jour si on venait de faire setClassCode
   * juste avant) — utilisé par "Notions à revoir" pour renvoyer directement la question posée. */
  async function handleSend(overrides = {}) {
    const q = (overrides.question ?? question).trim()
    if (!q || loading || streaming) return
    const sendClassCode = overrides.classCode ?? classCode
    const sendChapitre = overrides.chapitre ?? chapitre
    const sendClasseNom = classes.find((c) => c.code === sendClassCode)?.name || classeNom
    const history = buildHistoryUpTo(messages)

    setQuestion("")
    pushUserMessage(q)

    // Résolu une seule fois avant l'appel (voir ensureConversation) : le serveur persiste
    // désormais lui-même la question ET la réponse en une requête, via ce conversation_id.
    const convId = await ensureConversation(q).catch(() => null)

    // Un seul contrôleur à la fois (voir abortControllerRef) : handleStop() l'utilise pour
    // annuler quelle que soit l'action en cours, sans avoir à savoir laquelle spécifiquement.
    const controller = new AbortController()
    abortControllerRef.current = controller

    // Une photo d'exercice est "active" (envoyée plus tôt dans cette conversation, jamais
    // remplacée depuis) : on la renvoie avec ce message plutôt que de faire un chat texte normal,
    // sinon Claude ne "voit" plus l'image et ne peut pas répondre à un suivi comme "résous le a".
    // Pas de streaming ici : c'est le même appel non-streamé que l'envoi initial de la photo.
    if (activePhoto) {
      setLoading(true)
      try {
        const answer = await explainExercisePhoto(activePhoto, sendClassCode, sendChapitre, q, history, convId, controller.signal, getToken())
        pushBotMessage(answer, [], "chat")
        setLastQuestion(q)
        setLastAnswer(answer)
        recordTopicVisit(sendClassCode, sendChapitre, sendClasseNom)
        refreshProfile()
      } catch (err) {
        if (err?.name !== "AbortError" && !interceptGateError(err)) {
          pushBotError("Impossible de continuer sur cette photo pour le moment. Réessaie, ou renvoie la photo.")
        }
      } finally {
        setLoading(false)
      }
      return
    }

    pushBotMessage("", [], "chat")
    setLoading(true)
    setStreaming(true)
    patchLastMessage({ streaming: true })

    let fullText = ""
    let firstChunk = true

    try {
      await askQuestionStream(q, sendClassCode, sendChapitre, history, convId, {
        signal: controller.signal,
        token: getToken(),
        onDelta: (delta) => {
          if (firstChunk) {
            setLoading(false)
            firstChunk = false
          }
          fullText += delta
          patchLastMessage((last) => ({ ...last, text: fullText }))
        },
        onDone: ({ sources }) => {
          patchLastMessage((last) => ({ ...last, sources, streaming: false }))
          setLastQuestion(q)
          setLastAnswer(fullText)
          recordTopicVisit(sendClassCode, sendChapitre, sendClasseNom)
          refreshProfile()
        },
        onAbort: () => {
          // Arrêt volontaire (bouton stop) : on garde ce qui a déjà été reçu, sans le traiter
          // comme une erreur ni marquer le sujet comme "vu" (réponse incomplète).
          patchLastMessage((last) => ({ ...last, streaming: false, text: fullText }))
          setLastQuestion(q)
          setLastAnswer(fullText)
        },
        onError: (err) => {
          if (interceptGateError(err)) {
            patchLastMessage((last) => ({ ...last, streaming: false, text: fullText }))
            return
          }
          const message = err?.message
          patchLastMessage((last) => ({
            ...last,
            streaming: false,
            text: fullText || (message?.includes("Failed to fetch") ? "Impossible de contacter le serveur backend." : message),
            kind: fullText ? last.kind : "error",
          }))
        },
      })
    } finally {
      setLoading(false)
      setStreaming(false)
    }
  }

  /** Annule l'action en cours (chat, exercice, prérequis, résumé, simplification) — voir le
   * bouton "envoyer" de ChatInput.jsx, qui se change en carré pendant le chargement. */
  function handleStop() {
    abortControllerRef.current?.abort()
  }

  async function handleRegenerate(index) {
    const userMsg = messages[index - 1]
    if (!userMsg || userMsg.type !== "user" || loading || streaming || regeneratingIndex !== null) return

    const history = buildHistoryUpTo(messages.slice(0, index - 1))
    setRegeneratingIndex(index)
    patchMessageAt(index, { text: "", sources: [], kind: "chat", streaming: true })

    // conversationId=null : une régénération ne réécrit pas l'historique déjà persisté, elle
    // remplace juste ce qui est affiché à l'écran (voir MessageBubble::onRegenerate).
    let fullText = ""
    await askQuestionStream(userMsg.text, classCode, chapitre, history, null, {
      token: getToken(),
      onDelta: (delta) => {
        fullText += delta
        patchMessageAt(index, { text: fullText })
      },
      onDone: ({ sources }) => {
        patchMessageAt(index, { sources, streaming: false })
        setLastQuestion(userMsg.text)
        setLastAnswer(fullText)
      },
      onError: (err) => {
        patchMessageAt(index, { streaming: false, text: fullText || "" })
        if (!interceptGateError(err)) {
          pushBotError("Impossible de régénérer cette réponse pour le moment.")
        }
      },
    })

    setRegeneratingIndex(null)
  }

  /** Simplifie le message bot à l'index donné — pas forcément le dernier de la conversation :
   * "Simplifie" vit maintenant sous chaque réponse (voir MessageBubble.jsx), plus seulement dans
   * la barre d'outils agissant implicitement sur lastAnswer. La question associée est déduite du
   * message utilisateur qui précède directement ce message-là. */
  async function handleSimplify(index) {
    if (loading || streaming || simplifyingIndex !== null) return
    const target = messages[index]
    if (!target || target.type !== "bot" || !target.text) return
    const precedingUser = messages[index - 1]
    const questionForThisMessage = precedingUser?.type === "user" ? precedingUser.text : lastQuestion

    setSimplifyingIndex(index)
    try {
      const convId = await ensureConversation(questionForThisMessage).catch(() => null)
      const simplified = await simplifyResponse(questionForThisMessage, target.text, classCode, chapitre, convId, undefined, getToken())
      pushBotMessage(simplified, [], "simplify")
      setLastAnswer(simplified)
      recordStruggle(classCode, chapitre, questionForThisMessage, classeNom)
      if (user) postStruggle(getToken(), classCode, chapitre, questionForThisMessage).catch(() => {})
      refreshProfile()
    } catch (err) {
      if (!interceptGateError(err)) {
        pushBotError("Impossible de simplifier la réponse pour le moment.")
      }
    }
    setSimplifyingIndex(null)
  }

  /** Génère UN exercice (pas cinq d'un coup, voir RAPPORT_MOBILE.md §7 : cinq écrans de
   * défilement à la fois était l'un des pires contributeurs à la densité mobile). "Exercice
   * suivant" sous la carte rappelle cette même fonction. Le dédoublonnage ("ne pas reproposer un
   * énoncé déjà vu") est reconstruit à chaque appel depuis TOUS les exercices déjà présents dans
   * la conversation (pas seulement ceux d'un "lot") : buildHistoryUpTo ignore les messages de
   * type "exercise" (voir lib/history.js), donc on les réinjecte nous-mêmes. */
  async function handleExercise() {
    if (!classCode || loading || streaming) return
    setLoading(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      // Hint synchronisé avec le titre de repli calculé côté serveur (voir
      // database.py::_fallback_conversation_title) : sans question tapée, "Exercice" est le tout
      // premier message de la conversation, donc rien d'autre ne fixera jamais son titre.
      const convId = await ensureConversation(chapitre ? `Exercice : ${chapitre}` : "Exercice").catch(() => null)
      const priorExercises = messages
        .filter((m) => m.type === "exercise")
        .map((m, i) => {
          const summary = m.data?.enonce || (m.data?.qcm || []).map((q) => q.question).join(" / ") || `Exercice ${i + 1}`
          return { role: "assistant", content: `Exercice déjà proposé dans cette conversation : ${summary}` }
        })
      const history = [...buildHistoryUpTo(messages), ...priorExercises]
      const exercise = await generateExercise(classCode, chapitre, difficulty, history, convId, controller.signal, getToken())
      pushExerciseMessage(exercise)
      recordTopicVisit(classCode, exercise.chapter || chapitre, classeNom)
      refreshProfile()
    } catch (err) {
      if (err?.name !== "AbortError" && !interceptGateError(err)) {
        pushBotError("Impossible de générer l'exercice pour le moment.")
      }
    }
    setLoading(false)
  }

  /** Génère la correction d'un exercice déjà affiché, à la demande (voir ExerciseCard.jsx, clic
   * sur "Voir la solution détaillée") — pas de setLoading/gestion globale ici : ExerciseCard gère
   * son propre état de chargement localement, sur son seul bouton, pour ne pas figer le reste de
   * l'interface pendant qu'un élève consulte une correction. Les métadonnées de l'exercice
   * (chapitre/classe/difficulté déjà choisis par le backend à la génération) voyagent avec
   * l'exercice lui-même plutôt que de redépendre de classCode/chapitre/difficulty courants, qui
   * ont pu changer depuis. */
  async function handleFetchExerciseSolution(exercise) {
    return generateExerciseSolution(
      exercise.class_level, exercise.chapter, exercise.difficulty,
      exercise.enonce, exercise.indices, exercise.figure, getToken()
    )
  }

  async function handlePhotoExercise(file) {
    if (loading || streaming || photoLoading) return
    setPhotoLoading(true)
    const isImage = file.type.startsWith("image/")
    // Ce que l'élève a éventuellement déjà tapé dans le champ de saisie accompagne la photo
    // (ex: "vérifie juste la question 2") : comme un message normal, le champ est vidé après envoi.
    const accompanyingPrompt = question.trim()
    setQuestion("")
    // Toujours un texte non vide, même sans consigne tapée par l'élève : ce texte alimente aussi
    // l'historique envoyé à Claude pour les messages suivants (voir buildHistoryUpTo). Un texte
    // vide y créerait un tour "élève" fantôme, sans aucune trace qu'une photo a été envoyée — le
    // modèle perd alors le fil dès que la question suivante s'éloigne de sa réponse précédente.
    const displayText =
      accompanyingPrompt || (isImage ? "[Photo d'exercice envoyée]" : `[Fichier envoyé : ${file.name || "exercice.pdf"}]`)
    // Un PDF n'est pas affichable dans une balise <img> (icône cassée) : on ne prévisualise
    // que les vraies images, un PDF envoyé apparaît juste comme un message texte.
    const imageUrl = isImage ? URL.createObjectURL(file) : null
    pushUserMessage(displayText, imageUrl)
    const convId = await ensureConversation(displayText).catch(() => null)
    try {
      const toSend = isImage ? await compressImageFile(file) : file
      const answer = await explainExercisePhoto(toSend, classCode, chapitre, accompanyingPrompt, [], convId, undefined, getToken())
      pushBotMessage(answer, [], "chat")
      setLastQuestion(accompanyingPrompt || "Photo d'exercice envoyée")
      setLastAnswer(answer)
      // Reste "active" pour les messages suivants (voir handleSend) : Claude pourra continuer à
      // voir cette même photo tant qu'une nouvelle photo ne la remplace pas ou que l'élève ne
      // change pas de conversation/sujet.
      setActivePhoto(toSend)
      if (classCode) recordTopicVisit(classCode, chapitre, classeNom)
      refreshProfile()
    } catch (err) {
      if (!interceptGateError(err)) {
        pushBotError("Impossible d'analyser ce fichier pour le moment. Réessaie avec une photo plus nette et bien cadrée, ou un autre fichier.")
      }
    }
    setPhotoLoading(false)
  }

  async function handleCourse() {
    if (!classCode || !chapitre || loading || streaming) return
    const available = await checkCourseAvailable(classCode, chapitre)
    if (!available) {
      showToast("Cours non disponible pour ce chapitre pour le moment.", "error")
      return
    }
    // Visualiseur interne (CourseViewer, voir plus bas) plutôt que window.open sur le fichier
    // directement : un PDF ouvert par le navigateur expose ses propres boutons
    // "Télécharger"/"Imprimer" (contrôles natifs, pas retirables depuis la page).
    setCourseViewerOpen(true)
  }

  function handleFlashcards() {
    // Pas de vérification de disponibilité ici contrairement à handleCourse/handleSummary : le
    // visualiseur (FlashcardsViewer, voir plus bas) fait lui-même l'appel et affiche son propre
    // état "indisponible" au 404, la réponse étant un petit JSON (pas un fichier à pré-vérifier
    // par HEAD avant d'ouvrir un onglet).
    if (!classCode || !chapitre || loading || streaming) return
    setFlashcardsViewerOpen(true)
  }

  async function handleRemediation() {
    if (!classCode || !chapitre || loading || streaming) return
    setLoading(true)
    const controller = new AbortController()
    abortControllerRef.current = controller
    try {
      const history = buildHistoryUpTo(messages)
      // Même raisonnement que dans handleExercise : hint synchronisé avec le titre de repli
      // calculé côté serveur (voir database.py::_fallback_conversation_title).
      const convId = await ensureConversation(`Prérequis : ${chapitre}`).catch(() => null)
      const remediation = await generatePrerequis(classCode, chapitre, history, convId, controller.signal, getToken())
      pushRemediationMessage(remediation)
      recordTopicVisit(classCode, chapitre, classeNom)
      refreshProfile()
    } catch (err) {
      if (err?.name !== "AbortError" && !interceptGateError(err)) {
        pushBotError("Impossible de générer le QCM de prérequis pour le moment.")
      }
    }
    setLoading(false)
  }

  async function handleSummary() {
    // Résumé prérédigé par l'équipe pédagogique (PDF par chapitre, voir data/summaries/ côté
    // backend) plutôt que généré par Claude : même schéma que handleCourse, mais sans visualiseur
    // maison — contrairement au cours complet, l'élève doit pouvoir télécharger ce résumé s'il le
    // souhaite, donc on laisse le navigateur ouvrir l'onglet normalement (voir getSummaryFileUrl).
    if (!classCode || !chapitre || loading || streaming) return
    const available = await checkSummaryFileAvailable(classCode, chapitre)
    if (!available) {
      showToast("Résumé non disponible pour ce chapitre pour le moment.", "error")
      return
    }
    window.open(getSummaryFileUrl(classCode, chapitre), "_blank", "noopener,noreferrer")
  }

  function handleReset() {
    setMessages([])
    setLastQuestion("")
    setLastAnswer("")
    setActivePhoto(null)
  }

  function handleSuggestionClick(q) {
    setQuestion(q)
  }

  function handleResumeTopic(topic) {
    setClassCode(topic.classCode)
    setChapitre(topic.chapitre)
  }

  function handleReviewStruggle(struggle) {
    // Re-pose directement la question (plutôt que de juste pré-remplir le champ) : cliquer sur
    // une notion à revoir doit amener une explication, pas juste préparer la saisie en silence.
    setClassCode(struggle.classCode)
    setChapitre(struggle.chapitre)
    handleSend({ question: struggle.question, classCode: struggle.classCode, chapitre: struggle.chapitre })
  }

  /** Après un changement de classe validé depuis le profil (voir ProfilePanel.jsx, PATCH
   * /api/profile) : le chapitre courant n'a probablement pas de sens dans la nouvelle classe
   * (les intitulés de chapitres diffèrent d'une classe à l'autre), donc on le vide plutôt que de
   * laisser un choix incohérent affiché. */
  function handleClassChanged(newClassCode) {
    setClassCode(newClassCode)
    setChapitre("")
    setClassEditOpen(false)
  }

  function handleDismissStruggle(index) {
    if (user) {
      // Profil serveur (propre au compte) : pas d'endpoint de suppression dédié, on masque
      // juste côté client — elle peut réapparaître à un prochain rafraîchissement du profil.
      setProfile((p) => ({ ...p, struggles: p.struggles.filter((_, i) => i !== index) }))
    } else {
      dismissStruggle(index)
      refreshProfile()
    }
  }

  async function handleDownloadSession(format = "pdf") {
    if (messages.length === 0) {
      showToast("Pose au moins une question avant de télécharger la session — il n'y a rien à exporter pour l'instant.", "error")
      return
    }
    if (exportingSession) return
    setExportingSession(true)
    try {
      const title = "Prof Amira : Session complète"
      const subtitle = `${classeNom || ""}${chapitre ? " · " + chapitre : ""}`.trim()
      let filename
      if (format === "docx") {
        filename = `chatmaths-session-${Date.now()}.docx`
        await exportMessagesToDocx(messages, { filename, title, subtitle })
      } else {
        // Ne devrait pas arriver (la ref est posée sur le conteneur des messages dès le premier
        // rendu), mais rendre la main SANS le moindre toast en cas contraire laisserait l'élève
        // sans aucun retour après un clic — symptôme "le bouton ne fait rien" indiscernable d'un
        // vrai échec de génération.
        if (!sessionContentRef.current) throw new Error("Zone de session introuvable pour l'export PDF")
        filename = `chatmaths-session-${Date.now()}.pdf`
        await exportNodeToPDF(sessionContentRef.current, { filename, title, subtitle })
      }
      // Le téléchargement se fait silencieusement (aucune fenêtre ne s'ouvre) : sans ce message,
      // on ne peut pas savoir si ça a marché. Le fichier atterrit dans le dossier Téléchargements.
      showToast(`Fichier téléchargé : ${filename} (dossier Téléchargements)`, "success")
    } catch (err) {
      console.error("Export de session échoué:", err)
      showToast("Le téléchargement a échoué. Réessaie, ou recharge la page si le problème persiste.", "error")
    } finally {
      setExportingSession(false)
    }
  }

  /** Export Word de TOUT l'historique de l'élève connecté (toutes conversations), pas seulement
   * la session à l'écran (voir handleDownloadSession, ci-dessus, pour l'export de la session
   * courante en PDF/Word) — voir ConversationList.jsx et ExportMenu.jsx. */
  async function handleDownloadFullHistory() {
    if (!user || exportingSession) return
    setExportingSession(true)
    try {
      const conversations = await exportHistory(getToken())
      if (conversations.length === 0) {
        showToast("Aucun historique à exporter pour l'instant.", "error")
        return
      }
      const filename = `chatmaths-historique-complet-${Date.now()}.docx`
      await exportHistoryToDocx(conversations, { filename, title: "Prof Amira : Historique complet" })
      showToast(`Fichier téléchargé : ${filename} (dossier Téléchargements)`, "success")
    } catch (err) {
      console.error("Export de l'historique échoué:", err)
      showToast("Le téléchargement a échoué. Réessaie, ou recharge la page si le problème persiste.", "error")
    } finally {
      setExportingSession(false)
    }
  }

  // Le chapitre est facultatif pour générer un exercice (le serveur en choisit un lui-même sinon) :
  // seule la classe est nécessaire. Voir le cours et les prérequis ciblent un chapitre précis,
  // donc restent conditionnés aux deux.
  const canGenerateExercise = Boolean(classCode)
  const canUseChapterFeatures = Boolean(classCode && chapitre)

  if (authChecking) {
    return (
      <div className="relative flex min-h-screen items-center justify-center bg-base-200">
        <BackgroundBlobs />
        <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow motion-safe:animate-pulse-slow" />
      </div>
    )
  }

  if (showAuthGate) {
    return <AuthGate onAuthenticated={handleAuthenticated} onContinueAsGuest={handleContinueAsGuest} />
  }

  // Comptes migrés depuis l'ancienne base SQLite (voir migrate_sqlite_to_pg.py) uniquement : un
  // invité (user === null) ne passe jamais par ici, ces deux états restant à leur valeur par
  // défaut (true) tant qu'aucun compte n'est connecté.
  if (user && !consentOk) {
    return <ConsentGate token={getToken()} onAccepted={() => setConsentOk(true)} />
  }
  if (user && !profileComplete) {
    return (
      <ProfileCompletionGate
        token={getToken()}
        onComplete={(newClassCode) => {
          setProfileComplete(true)
          // Fraîchement complétée : ce compte a maintenant une classe fixée, à reprendre tout de
          // suite plutôt que d'attendre un futur rechargement de page (voir restoreSession plus haut).
          if (newClassCode) setClassCode(newClassCode)
        }}
      />
    )
  }

  if (role === "decideur") {
    return (
      <AdminDashboard
        token={getToken()}
        username={user}
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "chatmaths-dark" ? "chatmaths-light" : "chatmaths-dark"))}
        onLogout={handleLogout}
      />
    )
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-base-200 text-base-content">
      <BackgroundBlobs />
      <Header
        theme={theme}
        onToggleTheme={() => setTheme((t) => (t === "chatmaths-dark" ? "chatmaths-light" : "chatmaths-dark"))}
        user={user}
        onLoginClick={handleLoginClick}
        onLogout={handleLogout}
        onEditProfile={openEditProfile}
        onNewConversation={handleNewConversation}
      />

      {!serverOnline && (
        <div className="mx-auto mt-3 flex w-full max-w-7xl items-center gap-2 px-3 text-sm text-error sm:px-4 lg:px-6">
          <div className="flex w-full items-center gap-2 rounded-xl border border-error/30 bg-error/10 px-4 py-2">
            <AlertTriangle size={15} />
            Le serveur ne répond pas pour le moment. Vérifie qu'il est bien lancé.
          </div>
        </div>
      )}

      {/* max-md:px-1.5 : sous 768px, la marge par défaut (p-3, 12px) laissait le champ de saisie
          de ChatInput sous les 60% de largeur visés à 360px même après avoir resserré son propre
          padding interne (voir RAPPORT_MOBILE.md §6, addendum 2026-08-13) — ces 12px de marge
          externe, communs à toute la mise en page (Sidebar + zone de chat), pesaient plus que le
          padding propre à ChatInput dans le calcul. */}
      <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 max-md:px-1.5 max-md:py-3 sm:p-4 lg:flex-row lg:p-6">
        {/* Bureau uniquement : sur mobile, ce même bloc (Réglages/Historique) vit désormais dans
            une feuille modale ouverte à la demande (voir plus bas) — sinon il s'empile AU-DESSUS
            du chat et pousse le champ de saisie hors du premier écran, exactement comme la feuille
            "⋯" de ChatInput évite ce même problème pour les actions secondaires. */}
        {!isMobile && (
          <AnimatePresence initial={false}>
            {sidebarOpen && (
              <motion.div
                key="sidebar"
                initial={{ opacity: 0, width: 0 }}
                animate={{ opacity: 1, width: "auto" }}
                exit={{ opacity: 0, width: 0 }}
                transition={{ duration: 0.2, ease: "easeOut" }}
                className="shrink-0 overflow-hidden"
              >
                <Sidebar
                  classes={classes}
                  classCode={classCode}
                  setClassCode={(c) => {
                    setClassCode(c)
                    setChapitre("")
                  }}
                  chapters={chapters}
                  chapitre={chapitre}
                  setChapitre={setChapitre}
                  difficulty={difficulty}
                  setDifficulty={setDifficulty}
                  onReset={handleReset}
                  profile={profile}
                  onResumeTopic={handleResumeTopic}
                  onReviewStruggle={handleReviewStruggle}
                  onDismissStruggle={handleDismissStruggle}
                  user={user}
                  conversations={conversations}
                  activeConversationId={activeConversationId}
                  onSelectConversation={handleSelectConversation}
                  onDeleteConversation={handleDeleteConversation}
                  onNewConversation={handleNewConversation}
                  mobileTab={sidebarMobileTab}
                  onMobileTabChange={setSidebarMobileTab}
                  classEditOpen={classEditOpen}
                  onOpenClassEdit={() => setClassEditOpen(true)}
                  onCloseClassEdit={() => setClassEditOpen(false)}
                  onClassChanged={handleClassChanged}
                  onEditProfile={openEditProfile}
                />
              </motion.div>
            )}
          </AnimatePresence>
        )}

        <main className="flex min-h-[70vh] flex-1 flex-col overflow-hidden rounded-2xl border border-base-300/60 bg-base-100/60 shadow-sm">
          <div className="flex items-center justify-between border-b border-base-300/50 px-4 py-2 sm:px-6">
            {/* Classe/chapitre volontairement absents ici : déjà affichés dans la sidebar ("Ma
                classe"/"Chapitre") et dans la ligne de contexte de l'accueil (WelcomeCard.jsx) —
                les répéter dans cette barre était redondant. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={() => (isMobile ? setMobileSidebarOpen(true) : setSidebarOpen((o) => !o))}
              title={isMobile ? "Réglages et historique" : sidebarOpen ? "Réduire le panneau latéral" : "Afficher le panneau latéral"}
            >
              {!isMobile && sidebarOpen ? <PanelLeftClose size={16} /> : <PanelLeftOpen size={16} />}
            </Button>
            <ExportMenu
              onExport={handleDownloadSession}
              onExportHistory={user ? handleDownloadFullHistory : undefined}
              exporting={exportingSession}
              label="Télécharger"
            />
          </div>

          <div ref={chatRef} className="scrollbar-thin flex-1 overflow-y-auto p-4 sm:p-6">
            <div ref={sessionContentRef} className="space-y-4">
              {messages.length === 0 && (
                <div className="flex min-h-[50vh] items-center justify-center py-6 md:min-h-[60vh]">
                  <WelcomeCard
                    username={user}
                    classeNom={classeNom}
                    chapitre={chapitre}
                    personalizedMessage={user ? greetingMessage : null}
                    onSuggestionClick={handleSuggestionClick}
                  />
                </div>
              )}

              <AnimatePresence initial={false}>
                {messages.map((msg, i) => {
                  const prev = messages[i - 1]
                  const showDateSeparator = msg.createdAt && (!prev?.createdAt || !isSameDay(prev.createdAt, msg.createdAt))
                  return (
                    <React.Fragment key={i}>
                      {showDateSeparator && <DateSeparator iso={msg.createdAt} />}
                      {msg.type === "exercise" ? (
                        <ExerciseCard
                          exercise={msg.data}
                          onNext={i === messages.length - 1 ? handleExercise : null}
                          generatingNext={i === messages.length - 1 && loading}
                          onFetchSolution={handleFetchExerciseSolution}
                        />
                      ) : msg.type === "prerequis" ? (
                        <RemediationQuiz
                          data={msg.data}
                          onSubmitResults={(answers) => handleRemediationResults(msg.data, answers)}
                        />
                      ) : (
                        <MessageBubble
                          message={msg}
                          onRegenerate={msg.type === "bot" && i > 0 && messages[i - 1]?.type === "user" ? () => handleRegenerate(i) : null}
                          regenerating={regeneratingIndex === i}
                          onSimplify={msg.type === "bot" ? () => handleSimplify(i) : null}
                          simplifying={simplifyingIndex === i}
                        />
                      )}
                    </React.Fragment>
                  )
                })}
              </AnimatePresence>
            </div>

            {loading && (
              <div className="mt-4">
                <TypingIndicator />
              </div>
            )}
          </div>

          <ChatInput
            question={question}
            setQuestion={setQuestion}
            onSend={handleSend}
            onStop={handleStop}
            onExercise={handleExercise}
            onCourse={handleCourse}
            onRemediation={handleRemediation}
            onSummary={handleSummary}
            onFlashcards={handleFlashcards}
            onDownloadSession={handleDownloadSession}
            onPhotoSelected={handlePhotoExercise}
            activePhoto={Boolean(activePhoto)}
            onClearActivePhoto={() => setActivePhoto(null)}
            onVoiceError={(msg) => showToast(msg, "error")}
            canExercise={canGenerateExercise}
            canChapterFeatures={canUseChapterFeatures}
            loading={loading || streaming}
            exportingSession={exportingSession}
            photoLoading={photoLoading}
          />

          {messages.length === 0 && (
            <div className="flex justify-center pb-3">
              <button
                type="button"
                onClick={() => setAboutOpen(true)}
                className="flex items-center gap-1.5 text-sm font-medium text-base-content/50 transition-colors hover:text-primary"
              >
                <HelpCircle size={14} />
                Comment ça marche ?
              </button>
            </div>
          )}
        </main>
      </div>

      <footer className="px-4 pb-4 text-center text-xs text-base-content/40">
        Prof Amira · Programme officiel du Burkina Faso (6ème à Terminale) · Un produit Hakili Lab
      </footer>

      <AboutPanel open={aboutOpen} onClose={() => setAboutOpen(false)} />
      <CourseViewer
        open={courseViewerOpen}
        onClose={() => setCourseViewerOpen(false)}
        classCode={classCode}
        chapter={chapitre}
      />
      <FlashcardsViewer
        open={flashcardsViewerOpen}
        onClose={() => setFlashcardsViewerOpen(false)}
        classCode={classCode}
        chapter={chapitre}
        token={getToken()}
      />
      {user && (
        <EditProfileSheet
          open={editProfileOpen}
          onClose={() => setEditProfileOpen(false)}
          token={getToken()}
          onSaved={(newClassCode) => {
            if (newClassCode && newClassCode !== classCode) {
              setClassCode(newClassCode)
              setChapitre("")
            }
          }}
        />
      )}

      {/* Réglages/Historique mobile : voir le commentaire sur mobileSidebarOpen plus haut. Sidebar
          détecte elle-même le mode mobile et affiche ses 2 onglets nus (pas de colonnes bureau)
          — inchangé, seul son EMPLACEMENT change (feuille modale plutôt qu'en ligne). */}
      {isMobile && (
        <BottomSheet
          open={mobileSidebarOpen}
          onClose={() => setMobileSidebarOpen(false)}
          title="Réglages et historique"
        >
          <Sidebar
            classes={classes}
            classCode={classCode}
            setClassCode={(c) => {
              setClassCode(c)
              setChapitre("")
            }}
            chapters={chapters}
            chapitre={chapitre}
            setChapitre={setChapitre}
            difficulty={difficulty}
            setDifficulty={setDifficulty}
            onReset={handleReset}
            profile={profile}
            onResumeTopic={handleResumeTopic}
            onReviewStruggle={handleReviewStruggle}
            onDismissStruggle={handleDismissStruggle}
            user={user}
            conversations={conversations}
            activeConversationId={activeConversationId}
            onSelectConversation={handleSelectConversation}
            onDeleteConversation={handleDeleteConversation}
            onNewConversation={handleNewConversation}
            mobileTab={sidebarMobileTab}
            onMobileTabChange={setSidebarMobileTab}
            classEditOpen={classEditOpen}
            onOpenClassEdit={() => setClassEditOpen(true)}
            onCloseClassEdit={() => setClassEditOpen(false)}
            onClassChanged={handleClassChanged}
            onEditProfile={openEditProfile}
          />
        </BottomSheet>
      )}

      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 20 }}
            className={`fixed bottom-4 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium shadow-lg ${
              toast.kind === "error"
                ? "border-error/30 bg-error/10 text-error"
                : "border-success/30 bg-success/10 text-success"
            }`}
          >
            {toast.kind === "error" ? <XCircle size={16} /> : <CheckCircle2 size={16} />}
            {toast.text}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
