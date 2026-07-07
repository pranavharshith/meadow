import { useEffect, useState } from 'react'
import { place } from '../player-state'

// Shows the name of the place you're standing in, when near a landmark.
export default function PlaceLabel() {
  const [name, setName] = useState('')

  useEffect(() => {
    let raf
    const tick = () => {
      setName((n) => (n !== place.name ? place.name : n))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  return <div className={`place${name ? ' show' : ''}`}>{name}</div>
}
