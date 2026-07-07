import { useFrame } from '@react-three/fiber'
import { windTime, windStrength } from '../wind'

// Advances the shared wind clock and gently breathes the wind strength between
// calm (~0.7) and breezy (~1.4) so the meadow never feels static.
export default function WindClock() {
  useFrame((_, dt) => {
    const step = Math.min(dt, 0.05)
    windTime.value += step
    const t = windTime.value
    const breeze = 0.5 * Math.sin(t * 0.07) + 0.3 * Math.sin(t * 0.19 + 1.3)
    windStrength.value = 1.05 + breeze * 0.35
  })
  return null
}
