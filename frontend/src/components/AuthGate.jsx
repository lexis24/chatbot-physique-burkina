import React, { useState } from "react"
import { motion, AnimatePresence } from "framer-motion"
import {
  Sigma, User, Lock, LogIn, UserPlus, ArrowRight, ArrowLeft, AlertCircle,
  Check,
} from "lucide-react"
import Button from "./ui/Button"
import ConsentNotice from "./ConsentNotice.jsx"
import RegistrationDetails from "./RegistrationDetails.jsx"
import { cn } from "../lib/utils"
import { login, register } from "../lib/auth"
import { emptyProfileFields, validateProfileFields } from "../lib/registrationValidation.js"

const TABS = [
  { id: "login", label: "Connexion", icon: LogIn },
  { id: "register", label: "Inscription", icon: UserPlus },
]

const MIN_PASSWORD_LENGTH = 8

// Inscription en 3 écrans (identifiants -> fiche -> consentement), mais un SEUL appel réseau
// contenant des données — POST /api/auth/register — à la toute fin de l'écran 3, une fois le
// consentement accepté. Rien n'est envoyé avant : ni la fiche remplie à l'écran 2 (elle reste en
// mémoire côté client, dans profileValues), ni quoi que ce soit d'autre. Seule exception :
// GET /api/schools/search (autocomplétion, écran 2) n'envoie que la chaîne tapée dans le champ
// école, jamais le reste de la fiche. Un élève qui abandonne ou refuse à l'écran 3 : l'état React
// est perdu au démontage du composant, aucun compte n'est créé (voir correctif de spécification,
// RAPPORT_MIGRATION.md). Il n'y a donc pas de bouton "Compléter plus tard" ici — contrairement à
// ProfileCompletionGate.jsx, qui régularise après coup un compte migré déjà existant EN base.
const REGISTER_STEPS = [
  { id: "identifiants", label: "Compte" },
  { id: "fiche", label: "Ma fiche" },
  { id: "consentement", label: "Consentement" },
]

/** Quelques symboles mathématiques en filigrane, très discrets : une touche « maths » légère
 * plutôt qu'une illustration à décoder — juste de la texture, pas un schéma. */
function FloatingGlyphs() {
  const glyphs = [
    { char: "π", top: "8%", left: "72%", size: "5.5rem", delay: 0, anim: "animate-float-slow" },
    { char: "∞", top: "62%", left: "8%", size: "4rem", delay: 0.4, anim: "animate-float-slower" },
    { char: "√", top: "78%", left: "68%", size: "4.5rem", delay: 0.8, anim: "animate-float-slow" },
    { char: "∑", top: "22%", left: "14%", size: "3.5rem", delay: 1.2, anim: "animate-float-slower" },
  ]
  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden="true">
      {glyphs.map((g, i) => (
        <span
          key={i}
          className={cn("font-heading absolute font-bold text-white/[0.07]", g.anim)}
          style={{ top: g.top, left: g.left, fontSize: g.size }}
        >
          {g.char}
        </span>
      ))}
    </div>
  )
}

function StepIndicator({ steps, activeIndex }) {
  return (
    <div className="mb-5 flex items-center gap-2">
      {steps.map((step, i) => (
        <React.Fragment key={step.id}>
          <div className="flex items-center gap-1.5">
            <span
              className={cn(
                "flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold transition-colors",
                i < activeIndex
                  ? "bg-primary text-primary-content"
                  : i === activeIndex
                    ? "bg-primary/15 text-primary ring-2 ring-primary"
                    : "bg-base-200 text-base-content/40"
              )}
            >
              {i < activeIndex ? <Check size={13} /> : i + 1}
            </span>
            <span
              className={cn(
                "hidden text-xs font-semibold sm:inline",
                i === activeIndex ? "text-base-content" : "text-base-content/40"
              )}
            >
              {step.label}
            </span>
          </div>
          {i < steps.length - 1 && <div className="h-px flex-1 bg-base-300" />}
        </React.Fragment>
      ))}
    </div>
  )
}

export default function AuthGate({ onAuthenticated, onContinueAsGuest }) {
  const [tab, setTab] = useState("login")

  // ---- Connexion ----
  const [loginUsername, setLoginUsername] = useState("")
  const [loginPassword, setLoginPassword] = useState("")
  const [loginError, setLoginError] = useState("")
  const [loginLoading, setLoginLoading] = useState(false)

  // ---- Inscription ----
  const [step, setStep] = useState(0)
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [identityError, setIdentityError] = useState("")
  const [consentChecked, setConsentChecked] = useState(false)
  const [consentError, setConsentError] = useState("")
  const [profileValues, setProfileValues] = useState(emptyProfileFields())
  const [profileErrors, setProfileErrors] = useState({})
  const [registerLoading, setRegisterLoading] = useState(false)
  const [registerError, setRegisterError] = useState("")

  function switchTab(next) {
    setTab(next)
    setLoginError("")
    setRegisterError("")
  }

  async function handleLoginSubmit(e) {
    e.preventDefault()
    setLoginError("")
    if (!loginUsername.trim() || !loginPassword) {
      setLoginError("Renseigne un nom d'utilisateur et un mot de passe.")
      return
    }
    setLoginLoading(true)
    try {
      const session = await login(loginUsername.trim(), loginPassword)
      onAuthenticated(session)
    } catch (err) {
      setLoginError(err.message || "Une erreur est survenue.")
    } finally {
      setLoginLoading(false)
    }
  }

  function handleIdentityNext() {
    setIdentityError("")
    if (!username.trim() || !password) {
      setIdentityError("Renseigne un nom d'utilisateur et un mot de passe.")
      return
    }
    if (password.length < MIN_PASSWORD_LENGTH) {
      setIdentityError(`Le mot de passe doit contenir au moins ${MIN_PASSWORD_LENGTH} caractères.`)
      return
    }
    if (password !== confirmPassword) {
      setIdentityError("Les deux mots de passe ne correspondent pas.")
      return
    }
    setStep(1)
  }

  function handleProfileChange(patch) {
    setProfileValues((v) => ({ ...v, ...patch }))
  }

  function handleProfileNext() {
    const errors = validateProfileFields(profileValues)
    setProfileErrors(errors)
    if (Object.keys(errors).length > 0) return
    setStep(2)
  }

  async function handleFinish(e) {
    e.preventDefault()
    if (!consentChecked) {
      setConsentError("Coche la case pour continuer.")
      return
    }
    setConsentError("")

    setRegisterError("")
    setRegisterLoading(true)
    try {
      const session = await register(username.trim(), password, {
        classCode: profileValues.classCode,
        gender: profileValues.gender,
        birthDate: profileValues.birthDate,
        isCandidatLibre: profileValues.isCandidatLibre,
        schoolName: profileValues.schoolName,
      })
      onAuthenticated(session)
    } catch (err) {
      setRegisterError(err.message || "Une erreur est survenue.")
    } finally {
      setRegisterLoading(false)
    }
  }

  return (
    <div className="grid min-h-screen bg-base-100 text-base-content lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)]">
      {/* Panneau de marque — masqué sur mobile, où le contenu ci-dessous suffit */}
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-[#062b28] via-primary to-secondary lg:flex lg:flex-col">
        <FloatingGlyphs />

        <div className="relative z-10 p-10">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white backdrop-blur-sm">
              <Sigma size={18} />
            </div>
            <span className="font-heading text-lg font-bold tracking-tight text-white">Prof Amira</span>
          </div>
        </div>

        <div className="relative z-10 flex flex-1 items-center px-10">
          <motion.p
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
            className="font-heading max-w-sm text-[2.75rem] font-extrabold leading-[1.1] text-white"
          >
            Progresse en maths,{" "}
            <span className="bg-gradient-to-r from-accent via-white to-secondary bg-clip-text italic text-transparent">
              à ton rythme.
            </span>
          </motion.p>
        </div>
      </div>

      {/* Panneau principal */}
      <div className="flex items-center justify-center px-5 py-12 sm:px-10">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: "easeOut" }}
          className="w-full max-w-sm"
        >
          <div className="mb-8 flex flex-col items-start gap-3 lg:hidden">
            <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
              <span className="absolute inset-0 rounded-2xl bg-primary/50 motion-safe:animate-pulse-ring" />
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow">
                <Sigma size={22} />
              </div>
            </div>
            <h1 className="font-heading text-2xl font-extrabold leading-tight">
              Prof <span className="text-gradient motion-safe:animate-shimmer">Amira</span>
            </h1>
          </div>

          <div className="mb-6 grid grid-cols-2 gap-1.5 rounded-xl border border-base-300 bg-base-200/50 p-1">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => switchTab(t.id)}
                className={cn(
                  "flex items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-semibold transition-colors",
                  tab === t.id
                    ? "bg-base-100 text-primary shadow-sm ring-1 ring-base-300"
                    : "text-base-content/55 hover:text-base-content"
                )}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>

          {tab === "login" && (
            <>
              <p className="font-heading text-[0.7rem] font-bold uppercase tracking-[0.18em] text-primary">
                Bon retour
              </p>
              <h2 className="font-heading mt-1.5 text-[1.65rem] font-extrabold leading-tight text-base-content">
                Connecte-toi à ton compte
              </h2>
              <p className="mt-2 text-[0.95rem] text-base-content/70">
                Retrouve ton historique et tes conseils personnalisés.
              </p>

              <form onSubmit={handleLoginSubmit} className="mt-5 flex flex-col gap-4">
                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-base-content">Nom d'utilisateur</span>
                  <div className="flex items-center gap-2.5 rounded-xl border border-base-300 bg-base-100 px-3.5 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                    <User size={17} className="shrink-0 text-base-content/40" />
                    <input
                      className="w-full bg-transparent text-base font-medium text-base-content outline-none placeholder:font-normal placeholder:text-base-content/35"
                      value={loginUsername}
                      onChange={(e) => setLoginUsername(e.target.value)}
                      placeholder="ex : fatou_ouedraogo"
                      autoComplete="username"
                    />
                  </div>
                </label>

                <label className="flex flex-col gap-1.5">
                  <span className="text-sm font-semibold text-base-content">Mot de passe</span>
                  <div className="flex items-center gap-2.5 rounded-xl border border-base-300 bg-base-100 px-3.5 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                    <Lock size={17} className="shrink-0 text-base-content/40" />
                    <input
                      type="password"
                      className="w-full bg-transparent text-base font-medium text-base-content outline-none placeholder:font-normal placeholder:text-base-content/35"
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder="••••••••"
                      autoComplete="current-password"
                    />
                  </div>
                </label>

                {loginError && (
                  <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error">
                    <AlertCircle size={16} className="mt-0.5 shrink-0" />
                    {loginError}
                  </div>
                )}

                <Button type="submit" variant="primary" size="lg" disabled={loginLoading} className="mt-1 w-full font-bold">
                  {loginLoading ? "Un instant..." : "Se connecter"}
                </Button>
              </form>
            </>
          )}

          {tab === "register" && (
            <>
              <p className="font-heading text-[0.7rem] font-bold uppercase tracking-[0.18em] text-primary">
                Bienvenue
              </p>
              <h2 className="font-heading mt-1.5 text-[1.65rem] font-extrabold leading-tight text-base-content">
                Crée ton compte élève
              </h2>

              <StepIndicator steps={REGISTER_STEPS} activeIndex={step} />

              <AnimatePresence mode="wait">
                <motion.div
                  key={step}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                >
                  {step === 0 && (
                    <div className="flex flex-col gap-4">
                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-semibold text-base-content">Nom d'utilisateur</span>
                        <div className="flex items-center gap-2.5 rounded-xl border border-base-300 bg-base-100 px-3.5 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                          <User size={17} className="shrink-0 text-base-content/40" />
                          <input
                            className="w-full bg-transparent text-base font-medium text-base-content outline-none placeholder:font-normal placeholder:text-base-content/35"
                            value={username}
                            onChange={(e) => setUsername(e.target.value)}
                            placeholder="ex : fatou_ouedraogo"
                            autoComplete="username"
                          />
                        </div>
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-semibold text-base-content">Mot de passe</span>
                        <div className="flex items-center gap-2.5 rounded-xl border border-base-300 bg-base-100 px-3.5 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                          <Lock size={17} className="shrink-0 text-base-content/40" />
                          <input
                            type="password"
                            className="w-full bg-transparent text-base font-medium text-base-content outline-none placeholder:font-normal placeholder:text-base-content/35"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                          />
                        </div>
                      </label>

                      <label className="flex flex-col gap-1.5">
                        <span className="text-sm font-semibold text-base-content">Confirme le mot de passe</span>
                        <div className="flex items-center gap-2.5 rounded-xl border border-base-300 bg-base-100 px-3.5 py-3 transition-colors focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
                          <Lock size={17} className="shrink-0 text-base-content/40" />
                          <input
                            type="password"
                            className="w-full bg-transparent text-base font-medium text-base-content outline-none placeholder:font-normal placeholder:text-base-content/35"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="••••••••"
                            autoComplete="new-password"
                          />
                        </div>
                      </label>

                      {identityError && (
                        <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" />
                          {identityError}
                        </div>
                      )}

                      <Button type="button" variant="primary" size="lg" className="mt-1 w-full font-bold" onClick={handleIdentityNext}>
                        Suivant <ArrowRight size={16} />
                      </Button>
                    </div>
                  )}

                  {step === 1 && (
                    <div className="flex flex-col gap-4">
                      <div>
                        <h3 className="font-heading text-base font-bold text-base-content">Ta fiche</h3>
                        <p className="mt-1 text-sm text-base-content/60">
                          L'écran suivant t'explique ce qu'on fait de ces informations.
                        </p>
                      </div>

                      <RegistrationDetails values={profileValues} onChange={handleProfileChange} errors={profileErrors} />

                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="lg" onClick={() => setStep(0)}>
                          <ArrowLeft size={16} />
                        </Button>
                        <Button type="button" variant="primary" size="lg" className="flex-1 font-bold" onClick={handleProfileNext}>
                          Suivant <ArrowRight size={16} />
                        </Button>
                      </div>
                    </div>
                  )}

                  {step === 2 && (
                    <form onSubmit={handleFinish} className="flex flex-col gap-4">
                      <ConsentNotice checked={consentChecked} onCheckedChange={setConsentChecked} error={consentError} />

                      {registerError && (
                        <div className="flex items-start gap-2 rounded-xl border border-error/30 bg-error/10 px-3.5 py-2.5 text-sm font-medium text-error">
                          <AlertCircle size={16} className="mt-0.5 shrink-0" />
                          {registerError}
                        </div>
                      )}

                      <div className="flex gap-2">
                        <Button type="button" variant="outline" size="lg" onClick={() => setStep(1)}>
                          <ArrowLeft size={16} />
                        </Button>
                        <Button
                          type="submit"
                          variant="primary"
                          size="lg"
                          className="flex-1 font-bold"
                          disabled={registerLoading}
                        >
                          {registerLoading ? "Un instant..." : "Terminer"}
                        </Button>
                      </div>
                    </form>
                  )}
                </motion.div>
              </AnimatePresence>
            </>
          )}

          <button
            type="button"
            onClick={onContinueAsGuest}
            className="mt-5 flex w-full items-center justify-center gap-1.5 text-sm font-semibold text-base-content/60 hover:text-primary"
          >
            Continuer sans compte <ArrowRight size={14} />
          </button>
        </motion.div>
      </div>
    </div>
  )
}
