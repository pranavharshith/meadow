import { useStore } from '../store'

export default function CutAction({ selection, onCut }) {
  const clearSelection = useStore((s) => s.clearSelection)
  const label = selection ? `${selection.kind === 'rock' ? 'rock' : 'tree'} selected` : ''

  return (
    <div className={`cut-pill no-look${selection ? ' show' : ''}`}>
      <span className="cut-pill-label">{label}</span>
      <button className="cut-pill-cancel" onClick={clearSelection} title="Cancel (Esc)">
        x
      </button>
      <button className="cut-pill-action" onClick={onCut} title="Cut selected (X)">
        Cut
        <span className="cut-pill-key">X</span>
      </button>
    </div>
  )
}
