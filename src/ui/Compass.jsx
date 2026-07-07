import { useEffect, useState } from 'react'
import { look } from '../player-state'

// Small compass pill below the minimap showing cardinal direction + bearing.
// Updates every frame via rAF for smooth rotation tracking.

const CARDINALS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']

function yawToCardinal(yaw) {
  // yaw: 0 = looking along +Z (north), increases clockwise
  let deg = ((yaw * 180) / Math.PI) % 360
  if (deg < 0) deg += 360
  const idx = Math.round(deg / 45) % 8
  return { cardinal: CARDINALS[idx], deg: Math.round(deg) }
}

export default function Compass() {
  const [heading, setHeading] = useState({ cardinal: 'N', deg: 0 })

  useEffect(() => {
    let raf
    const tick = () => {
      const h = yawToCardinal(look.yaw)
      setHeading((prev) => (prev.deg !== h.deg ? h : prev))
      raf = requestAnimationFrame(tick)
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [])

  return (
    <div className="compass no-look">
      <span className="compass-cardinal">{heading.cardinal}</span>
      <span className="compass-deg">{heading.deg}°</span>
    </div>
  )
}
