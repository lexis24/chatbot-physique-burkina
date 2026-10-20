import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true
      }
    }
  },
  test: {
    environment: 'node',
    // dateFormat.js (isSameDay, formatDaySeparator) compare des dates en heure LOCALE à
    // dessein : un élève au Burkina Faso doit voir "Aujourd'hui"/"Hier" selon son jour local,
    // pas le jour UTC. Sans fuseau fixé ici, dateFormat.test.js hérite du fuseau de la machine
    // qui exécute les tests — ses horaires figés en UTC près de minuit basculaient alors de
    // "même jour" à "jours différents" selon que cette machine soit à UTC+0 ou pas. Africa/
    // Ouagadougou (UTC+0, le fuseau réel des utilisateurs) rend le test déterministe partout,
    // sans changer le comportement réel de l'app pour qui que ce soit.
    env: { TZ: 'Africa/Ouagadougou' },
  },
})