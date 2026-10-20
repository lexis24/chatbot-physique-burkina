import React from "react"
import { motion } from "framer-motion"
import { Sigma, Moon, Sun, LogIn, LogOut, UserCircle2 } from "lucide-react"
import Button from "./ui/Button"

export default function Header({ theme, onToggleTheme, user, onLoginClick, onLogout, onEditProfile, onNewConversation }) {
  return (
    <motion.header
      initial={{ opacity: 0, y: -12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-base-300/60 bg-base-100/70 px-3 backdrop-blur-md md:h-auto md:px-6 md:py-3"
    >
      <div className="flex min-w-0 items-center gap-2.5 md:gap-3">
        {/* min-h/min-w 44px : cible tactile minimale sur mobile (voir RAPPORT_MOBILE.md), sans
            agrandir le logo lui-même — seule la zone cliquable autour grandit. */}
        <button
          type="button"
          onClick={onNewConversation}
          title="Nouvelle conversation"
          className="flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center transition-transform hover:scale-105 active:scale-95 md:min-h-0 md:min-w-0"
        >
          <span className="relative flex h-8 w-8 items-center justify-center rounded-xl md:h-10 md:w-10">
            <span className="absolute inset-0 rounded-xl bg-primary/50 motion-safe:animate-pulse-ring" />
            <span className="relative flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-primary via-secondary to-accent text-white shadow-glow md:h-10 md:w-10">
              <Sigma size={16} className="md:hidden" />
              <Sigma size={20} className="hidden md:block" />
            </span>
          </span>
        </button>
        <div className="min-w-0">
          <h1 className="font-heading text-base font-extrabold leading-tight md:text-lg">
            Prof <span className="text-gradient motion-safe:animate-shimmer">Amira</span>
          </h1>
          {/* Masqué sous 768px (voir RAPPORT_MOBILE.md §2) : la hauteur maximale de 56px demandée
              pour l'en-tête mobile prime ici ; l'idée reste présente dans le pied de page. */}
          <p className="hidden text-sm text-base-content/60 md:block">Ton prof infatigable, toujours prêt à t'aider</p>
        </div>
      </div>

      <div className="flex items-center gap-1 md:gap-2">
        {user ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={onEditProfile}
              title="Modifier mon profil"
              className="hidden items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1.5 text-sm font-medium text-primary transition-colors hover:bg-primary/20 sm:flex"
            >
              <UserCircle2 size={15} />
              {user}
            </button>
            {/* min-h/min-w 44px : cible tactile minimale sur mobile (voir RAPPORT_MOBILE.md,
                contraintes générales) — Button::size="icon" seul (p-2) n'atteint pas 44px. */}
            <Button
              variant="ghost"
              size="icon"
              onClick={onLogout}
              title="Se déconnecter"
              className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
            >
              <LogOut size={17} />
            </Button>
          </div>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={onLoginClick}
            className="min-h-[44px] px-2.5 md:min-h-0 md:px-3.5"
          >
            <LogIn size={14} /> <span className="hidden md:inline">Se connecter</span>
          </Button>
        )}

        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleTheme}
          title="Changer de thème"
          className="min-h-[44px] min-w-[44px] md:min-h-0 md:min-w-0"
        >
          {theme === "chatmaths-dark" ? <Sun size={18} /> : <Moon size={18} />}
        </Button>
      </div>
    </motion.header>
  )
}
