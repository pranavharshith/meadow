import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'

/**
 * Small hysteresis controller shared by dense nature layers. It only reduces
 * the user's chosen setting and slowly recovers after sustained headroom.
 */
export function useAdaptiveNatureTier(enabled) {
  const [tier, setTier] = useState(0)
  const frameMs = useRef(16.6)
  const slowSeconds = useRef(0)
  const fastSeconds = useRef(0)

  useFrame((_, delta) => {
    if (!enabled) return
    const milliseconds = Math.min(delta * 1000, 100)
    frameMs.current = frameMs.current * 0.92 + milliseconds * 0.08

    if (frameMs.current > 22) {
      slowSeconds.current += delta
      fastSeconds.current = 0
      if (slowSeconds.current > 2.5 && tier < 2) {
        slowSeconds.current = 0
        setTier((value) => Math.min(value + 1, 2))
      }
    } else if (frameMs.current < 14) {
      fastSeconds.current += delta
      slowSeconds.current = 0
      if (fastSeconds.current > 6 && tier > 0) {
        fastSeconds.current = 0
        setTier((value) => Math.max(value - 1, 0))
      }
    } else {
      slowSeconds.current = Math.max(0, slowSeconds.current - delta * 0.5)
      fastSeconds.current = Math.max(0, fastSeconds.current - delta * 0.5)
    }
  })

  return tier
}
