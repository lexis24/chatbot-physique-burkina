import { useCallback, useEffect, useRef, useState } from "react"

const SpeechRecognitionImpl =
  typeof window !== "undefined" ? window.SpeechRecognition || window.webkitSpeechRecognition : null

/** Dictée vocale via l'API Web Speech du navigateur (aucun appel serveur : la transcription se
 * fait côté navigateur/OS, voir la discussion avec l'utilisateur sur les options possibles).
 * Absente de Firefox et capricieuse sur Safari — `supported` permet de masquer le bouton micro
 * plutôt que d'afficher une fonctionnalité cassée. `start(baseText)` reprend le texte déjà présent
 * dans le champ pour que la dictée s'ajoute à la suite plutôt que de l'écraser.
 *
 * `continuous: true` n'est pas fiable partout : Chrome (surtout sur Android) met souvent fin à la
 * reconnaissance après un simple silence de quelques secondes ou une seule phrase, malgré ce
 * réglage — un comportement documenté de longue date, pas un bug côté serveur. Sans y remédier,
 * l'élève voit la dictée s'arrêter net au moindre silence pendant qu'il réfléchit à sa phrase,
 * ce qui ressemble à une fonctionnalité cassée. On distingue donc un arrêt VOULU (stop()/cancel,
 * voir `intentionalStopRef`) d'une fin déclenchée par le navigateur lui-même : dans ce dernier
 * cas, on relance silencieusement une nouvelle instance plutôt que de rendre la main à
 * l'utilisateur, pour donner l'impression d'une dictée réellement continue. */
export function useSpeechRecognition({ onResult, onError, lang = "fr-FR" } = {}) {
  const [listening, setListening] = useState(false)
  const recognitionRef = useRef(null)
  const baseTextRef = useRef("")
  const intentionalStopRef = useRef(false)
  const onResultRef = useRef(onResult)
  const onErrorRef = useRef(onError)
  onResultRef.current = onResult
  onErrorRef.current = onError

  const createAndStart = useCallback(() => {
    const recognition = new SpeechRecognitionImpl()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true

    recognition.onresult = (event) => {
      let interim = ""
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript
        if (event.results[i].isFinal) {
          baseTextRef.current += `${transcript} `
        } else {
          interim += transcript
        }
      }
      onResultRef.current?.(baseTextRef.current + interim)
    }

    recognition.onerror = (event) => {
      // "no-speech" arrive régulièrement pendant un silence normal et précède souvent un `onend`
      // auto-restarté juste après : ce n'est pas une vraie erreur à remonter à l'élève.
      if (event.error !== "no-speech") onErrorRef.current?.(event.error)
    }

    recognition.onend = () => {
      if (intentionalStopRef.current) {
        recognitionRef.current = null
        setListening(false)
        return
      }
      // Fin non voulue (silence, quirk Android...) : on relance plutôt que d'interrompre l'élève.
      // Léger délai : certains navigateurs lèvent une InvalidStateError si `start()` est rappelé
      // immédiatement dans le `onend` du même cycle d'évènements.
      setTimeout(() => {
        if (intentionalStopRef.current) return
        try {
          recognitionRef.current = createAndStart()
        } catch {
          recognitionRef.current = null
          setListening(false)
        }
      }, 250)
    }

    recognition.start()
    return recognition
  }, [lang])

  const start = useCallback(
    (currentText = "") => {
      if (!SpeechRecognitionImpl || recognitionRef.current) return
      baseTextRef.current = currentText && !currentText.endsWith(" ") ? `${currentText} ` : currentText
      intentionalStopRef.current = false
      recognitionRef.current = createAndStart()
      setListening(true)
    },
    [createAndStart]
  )

  const stop = useCallback(() => {
    intentionalStopRef.current = true
    recognitionRef.current?.stop()
  }, [])

  useEffect(() => {
    return () => {
      intentionalStopRef.current = true
      recognitionRef.current?.stop()
    }
  }, [])

  return { supported: Boolean(SpeechRecognitionImpl), listening, start, stop }
}
