import { useStore } from '../store'

export default function NavIndicator() {
  const navTarget = useStore((s) => s.navTarget)
  const clearNav = useStore((s) => s.clearNav)

  if (!navTarget) return null

  return (
    <button className="nav-indicator no-look" onClick={clearNav} title="click to cancel navigation">
      <span className="nav-arrow">&gt;</span>
      <span className="nav-name">{navTarget.name}</span>
      <span className="nav-cancel">x</span>
    </button>
  )
}
