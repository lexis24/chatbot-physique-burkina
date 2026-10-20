import { useEffect, useRef, useState } from "react"

const BAR_COUNT = 28
const SAMPLE_MS = 90

/** Historique du niveau sonore du micro, pour dessiner une vraie forme d'onde (pas une animation
 * factice) pendant la dictée — voir le bandeau d'enregistrement dans ChatInput.jsx. Indépendant de
 * useSpeechRecognition.js : la Web Speech API ne donne jamais accès au flux audio brut ni à son
 * niveau, donc on ouvre un second flux micro (getUserMedia) uniquement pour la visualisation, en
 * parallèle de la reconnaissance vocale qui gère le sien en interne. */
export function useMicLevels(active) {
  const [bars, setBars] = useState(() => new Array(BAR_COUNT).fill(0))
  const cleanupRef = useRef(null)

  useEffect(() => {
    if (!active) {
      setBars(new Array(BAR_COUNT).fill(0))
      return
    }

    let cancelled = false
    let stream = null
    let audioCtx = null
    let intervalId = null

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((mediaStream) => {
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return
        }
        stream = mediaStream
        audioCtx = new (window.AudioContext || window.webkitAudioContext)()
        const source = audioCtx.createMediaStreamSource(stream)
        const analyser = audioCtx.createAnalyser()
        analyser.fftSize = 512
        source.connect(analyser)

        const data = new Uint8Array(analyser.frequencyBinCount)
        intervalId = setInterval(() => {
          analyser.getByteTimeDomainData(data)
          // Amplitude RMS autour du point médian (128) plutôt qu'une simple moyenne : une onde
          // sonore oscille de part et d'autre de 128, la moyenne brute resterait proche de 0.
          let sumSquares = 0
          for (let i = 0; i < data.length; i++) {
            const centered = (data[i] - 128) / 128
            sumSquares += centered * centered
          }
          const level = Math.min(1, Math.sqrt(sumSquares / data.length) * 4)
          setBars((prev) => [...prev.slice(1), level])
        }, SAMPLE_MS)
      })
      .catch(() => {
        // Pas de micro accessible pour la visualisation (permission refusée, appareil absent...) :
        // la dictée elle-même continue de fonctionner via useSpeechRecognition, on affiche juste
        // une barre plate plutôt qu'une erreur.
      })

    cleanupRef.current = () => {
      cancelled = true
      if (intervalId) clearInterval(intervalId)
      stream?.getTracks().forEach((t) => t.stop())
      audioCtx?.close().catch(() => {})
    }
    return () => cleanupRef.current?.()
  }, [active])

  return bars
}
