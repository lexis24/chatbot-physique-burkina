import React, { useState } from "react"
import { motion } from "framer-motion"
import { GraduationCap, BookOpen, RotateCcw, Gauge, Info, Star, SlidersHorizontal, History, UserRound } from "lucide-react"
import Card from "./ui/Card"
import Button from "./ui/Button"
import ProfilePanel from "./ProfilePanel"
import ConversationList from "./ConversationList"
import { cn } from "../lib/utils"
import { useIsMobile } from "../lib/useMediaQuery"

const STAR_LABELS = {
  1: "QCM d'application",
  2: "Application guidée",
  3: "Notions combinées",
  4: "Situation d'intégration",
  5: "Type olympiades",
}

function SectionLabel({ icon: Icon, color, children }) {
  return (
    <label className="font-heading mb-2 flex items-center gap-2 text-sm font-semibold text-base-content/80">
      <span className={cn("flex h-6 w-6 items-center justify-center rounded-lg", color)}>
        <Icon size={13} />
      </span>
      {children}
    </label>
  )
}

/** Étoiles de difficulté + bouton "Auto" : partagé entre la présentation bureau (dans une Card,
 * avec SectionLabel et texte d'aide) et la présentation mobile (nue, voir MobileSettingsTab). */
function DifficultyControl({ difficulty, setDifficulty }) {
  return (
    <div className="flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((level) => (
        <button
          key={level}
          onClick={() => setDifficulty(level === difficulty ? null : level)}
          title={STAR_LABELS[level]}
          className="flex h-11 w-11 items-center justify-center rounded-lg transition-transform hover:scale-110 sm:h-auto sm:w-auto sm:p-1"
        >
          <Star
            size={22}
            className={
              level === 5
                ? difficulty === 5
                  ? "fill-accent text-accent"
                  : "text-accent/40"
                : difficulty && level <= difficulty
                  ? "fill-primary text-primary"
                  : "text-base-content/25"
            }
          />
        </button>
      ))}
      <button
        onClick={() => setDifficulty(null)}
        className={cn(
          "ml-1 rounded-full border px-2.5 py-2 text-xs font-medium transition-colors sm:py-1",
          difficulty === null
            ? "border-primary/40 bg-primary/10 text-primary"
            : "border-base-300/60 text-base-content/50 hover:border-primary/30"
        )}
      >
        Auto
      </button>
    </div>
  )
}

/** Ligne en lecture seule affichant la classe d'un compte connecté (fixée à app.users.class_code,
 * voir RAPPORT_MIGRATION.md) — remplace le sélecteur pour lui, un invité gardant le sélecteur
 * libre. « Changer » ouvre le contrôle de changement de classe de ProfilePanel.jsx (PATCH
 * /api/profile), pas un simple champ local : changer de classe est une action sur le compte. */
function ReadOnlyClassRow({ classeNom, onChangeClick }) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-base-300/60 bg-base-100 px-3.5 py-2.5 text-sm">
      <span>
        <span className="text-base-content/50">Classe : </span>
        <span className="font-medium text-base-content">{classeNom || "Non renseignée"}</span>
      </span>
      <button type="button" onClick={onChangeClick} className="text-xs font-semibold text-primary hover:underline">
        Changer
      </button>
    </div>
  )
}

/** Réglages "nus" (sans carte, sans icône, sans titre de section) — voir RAPPORT_MOBILE.md §3 :
 * juste les trois contrôles, pour réduire la densité verticale sur mobile. */
function MobileSettingsTab({ user, classes, classCode, setClassCode, chapters, chapitre, setChapitre, difficulty, setDifficulty, onGoToClassEdit }) {
  const classeNom = classes.find((c) => c.code === classCode)?.name || classCode
  return (
    <div className="flex flex-col gap-4 p-4">
      <div>
        {user ? (
          <ReadOnlyClassRow classeNom={classeNom} onChangeClick={onGoToClassEdit} />
        ) : (
          <>
            <select
              className="select select-bordered w-full rounded-xl bg-base-100"
              value={classCode}
              onChange={(e) => setClassCode(e.target.value)}
            >
              <option value="">-- Classe (optionnel) --</option>
              {classes.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </select>
            <p className="mt-1 text-[12px] text-base-content/50">
              Choisir ta classe et ton chapitre est facultatif — ça aide juste à affiner les réponses.
            </p>
          </>
        )}
      </div>

      <select
        className="select select-bordered w-full rounded-xl bg-base-100"
        value={chapitre}
        onChange={(e) => setChapitre(e.target.value)}
        disabled={!classCode}
      >
        <option value="">{classCode ? "-- Chapitre (optionnel) --" : "Choisis d'abord une classe"}</option>
        {chapters.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>

      <div>
        <p className="mb-1.5 text-[12px] font-medium text-base-content/50">Difficulté des exercices</p>
        <DifficultyControl difficulty={difficulty} setDifficulty={setDifficulty} />
      </div>
    </div>
  )
}

function MobileHistoryTab({
  user, conversations, activeConversationId, onSelectConversation, onDeleteConversation, onNewConversation,
  profile, onResumeTopic, onReviewStruggle, onDismissStruggle,
  classes, classCode, classEditOpen, onCloseClassEdit, onClassChanged, onEditProfile,
}) {
  return (
    <div className="flex flex-col gap-4 p-4">
      {user ? (
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={onSelectConversation}
          onDelete={onDeleteConversation}
          onNew={onNewConversation}
        />
      ) : (
        <p className="text-sm text-base-content/50">Connecte-toi pour garder ton historique d'une fois sur l'autre.</p>
      )}
      <ProfilePanel
        user={user}
        classes={classes}
        classCode={classCode}
        classEditOpen={classEditOpen}
        onCloseClassEdit={onCloseClassEdit}
        onClassChanged={onClassChanged}
        profile={profile}
        onResumeTopic={onResumeTopic}
        onReviewStruggle={onReviewStruggle}
        onDismissStruggle={onDismissStruggle}
      />
      {user && (
        <Button variant="outline" size="md" onClick={onEditProfile} className="min-h-[44px] w-full">
          <UserRound size={15} /> Modifier mon profil
        </Button>
      )}
    </div>
  )
}

const MOBILE_TABS = [
  { id: "reglages", label: "Réglages", icon: SlidersHorizontal },
  { id: "historique", label: "Historique", icon: History },
]

export default function Sidebar({
  classes,
  classCode,
  setClassCode,
  chapters,
  chapitre,
  setChapitre,
  difficulty,
  setDifficulty,
  onReset,
  profile,
  onResumeTopic,
  onReviewStruggle,
  onDismissStruggle,
  user,
  conversations,
  activeConversationId,
  onSelectConversation,
  onDeleteConversation,
  onNewConversation,
  mobileTab: controlledMobileTab,
  onMobileTabChange,
  classEditOpen,
  onOpenClassEdit,
  onCloseClassEdit,
  onClassChanged,
  onEditProfile,
}) {
  const isMobile = useIsMobile()
  // Contrôlé par App.jsx quand fourni ; sinon état local, pour rester utilisable isolément
  // (tests, Storybook...).
  const [localMobileTab, setLocalMobileTab] = useState("reglages")
  const mobileTab = controlledMobileTab ?? localMobileTab
  const setMobileTab = onMobileTabChange ?? setLocalMobileTab

  // Le contrôle de changement de classe vit dans ProfilePanel (onglet Historique) : le lien
  // « Changer » de la ligne classe en lecture seule (onglet Réglages) doit donc aussi y amener.
  function goToClassEdit() {
    setMobileTab("historique")
    onOpenClassEdit()
  }

  if (isMobile) {
    return (
      <aside className="flex w-full shrink-0 flex-col gap-3">
        <Card className="overflow-hidden p-0">
          <div className="grid grid-cols-2">
            {MOBILE_TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setMobileTab(t.id)}
                className={cn(
                  "flex min-h-[44px] items-center justify-center gap-1.5 py-3 text-sm font-semibold transition-colors",
                  mobileTab === t.id
                    ? "border-b-2 border-primary text-primary"
                    : "border-b-2 border-transparent text-base-content/50"
                )}
              >
                <t.icon size={15} />
                {t.label}
              </button>
            ))}
          </div>

          {mobileTab === "reglages" ? (
            <MobileSettingsTab
              user={user}
              classes={classes}
              classCode={classCode}
              setClassCode={setClassCode}
              chapters={chapters}
              chapitre={chapitre}
              setChapitre={setChapitre}
              difficulty={difficulty}
              setDifficulty={setDifficulty}
              onGoToClassEdit={goToClassEdit}
            />
          ) : (
            <MobileHistoryTab
              user={user}
              conversations={conversations}
              activeConversationId={activeConversationId}
              onSelectConversation={onSelectConversation}
              onDeleteConversation={onDeleteConversation}
              onNewConversation={onNewConversation}
              profile={profile}
              onResumeTopic={onResumeTopic}
              onReviewStruggle={onReviewStruggle}
              onDismissStruggle={onDismissStruggle}
              classes={classes}
              classCode={classCode}
              classEditOpen={classEditOpen}
              onCloseClassEdit={onCloseClassEdit}
              onClassChanged={onClassChanged}
              onEditProfile={onEditProfile}
            />
          )}
        </Card>

        {!user && (
          <Button variant="outline" size="md" onClick={onReset} className="min-h-[44px] w-full">
            <RotateCcw size={15} /> Nouvelle conversation
          </Button>
        )}
      </aside>
    )
  }

  return (
    <aside className="flex w-full shrink-0 flex-col gap-4 lg:w-80">
      {!user && (
        <Card className="flex items-start gap-2 border-primary/20 bg-primary/5 p-3.5 text-sm text-base-content/70">
          <Info size={15} className="mt-0.5 shrink-0 text-primary" />
          <span>Choisir ta classe et ton chapitre est <strong>facultatif</strong> — ça aide juste à affiner les réponses.</span>
        </Card>
      )}

      {user && (
        <ConversationList
          conversations={conversations}
          activeConversationId={activeConversationId}
          onSelect={onSelectConversation}
          onDelete={onDeleteConversation}
          onNew={onNewConversation}
        />
      )}

      <Card className="p-4">
        <SectionLabel icon={GraduationCap} color="bg-primary/15 text-primary">
          Ma classe
        </SectionLabel>
        {user ? (
          // Compte connecté : la classe est fixée au profil (app.users.class_code, voir
          // _resolve_class_level côté backend, qui l'impose désormais quoi que la sidebar
          // affiche) — même traitement que MobileSettingsTab, pour ne pas montrer un menu actif
          // qui n'aurait plus aucun effet une fois envoyé au serveur. onEditProfile (pas
          // goToClassEdit, propre au flux mobile via ProfilePanel/onglet Historique, absent de
          // ce rendu bureau) : ouvre EditProfileSheet, qui permet bien de modifier class_code.
          <ReadOnlyClassRow
            classeNom={classes.find((c) => c.code === classCode)?.name || classCode}
            onChangeClick={onEditProfile}
          />
        ) : (
          <select
            className="select select-bordered w-full rounded-xl bg-base-100"
            value={classCode}
            onChange={(e) => setClassCode(e.target.value)}
          >
            <option value="">-- Optionnel --</option>
            {classes.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </select>
        )}
      </Card>

      <Card className="p-4">
        <SectionLabel icon={BookOpen} color="bg-secondary/15 text-secondary">
          Chapitre
        </SectionLabel>
        <select
          className="select select-bordered w-full rounded-xl bg-base-100"
          value={chapitre}
          onChange={(e) => setChapitre(e.target.value)}
          disabled={!classCode}
        >
          <option value="">{classCode ? "-- Optionnel --" : "Choisis d'abord une classe"}</option>
          {chapters.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </Card>

      <Card className="p-4">
        <SectionLabel icon={Gauge} color="bg-accent/15 text-accent">
          Difficulté des exercices
        </SectionLabel>
        <DifficultyControl difficulty={difficulty} setDifficulty={setDifficulty} />
        <p className="mt-1.5 text-sm text-base-content/60">
          {difficulty ? STAR_LABELS[difficulty] : "Automatique — adaptée à tes questions (moyen par défaut)"}
        </p>
      </Card>

      {!user && (
        <Button variant="outline" size="md" onClick={onReset} className="w-full">
          <RotateCcw size={15} /> Nouvelle conversation
        </Button>
      )}
    </aside>
  )
}
