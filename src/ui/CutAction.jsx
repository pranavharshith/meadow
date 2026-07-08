import { useStore } from '../store'

const DYE_SWATCHES = [
  { id: 'autumn',    name: 'Autumn Orange',  color: '#d46a2a', cost: 50 },
  { id: 'sunset',    name: 'Sunset Red',     color: '#c44030', cost: 50 },
  { id: 'golden',    name: 'Golden Yellow',  color: '#e8b830', cost: 50 },
  { id: 'sky',       name: 'Sky Blue',       color: '#5098d0', cost: 100 },
  { id: 'lavender',  name: 'Lavender Purple',color: '#b080d0', cost: 100 },
  { id: 'blush',     name: 'Blush Pink',     color: '#e878a0', cost: 100 },
  { id: 'teal',      name: 'Forest Teal',    color: '#308a78', cost: 150 },
  { id: 'moonlight', name: 'Moonlight White',color: '#c8d8d0', cost: 150 },
]

export default function CutAction({ selection, onCut }) {
  const clearSelection = useStore((s) => s.clearSelection)
  const trees = useStore((s) => s.trees)
  const gold = useStore((s) => s.gold)
  const dyeingTreeId = useStore((s) => s.dyeingTreeId)
  const cancelDyeing = useStore((s) => s.cancelDyeing)
  const setDyeingTreeId = useStore((s) => s.setDyeingTreeId)
  const setPreviewColor = useStore((s) => s.setPreviewColor)
  const dyeTree = useStore((s) => s.dyeTree)
  const flash = useStore((s) => s.flash)

  const selTree = selection?.kind === 'tree'
    ? trees.find((t) => t.id === selection.id && t.owner)
    : null
  const canDye = selTree && (Date.now() - selTree.plantedAt) / 1000 >= 90

  const label = selection
    ? `${selection.kind === 'rock' ? 'rock' : 'tree'} selected`
    : ''

  // ── Dye palette mode ──────────────────────────────────────────────────
  if (dyeingTreeId) {
    return (
      <div className="cut-pill show">
        <span className="cut-pill-label">choose a colour</span>
        <div className="dye-swatches">
          {DYE_SWATCHES.map((sw) => {
            const cantAfford = gold < sw.cost
            return (
              <button
                key={sw.id}
                className={`dye-swatch${cantAfford ? ' cant-afford' : ''}`}
                style={{ background: sw.color }}
                title={`${sw.name} · ${sw.cost}g`}
                onMouseEnter={() => setPreviewColor(sw.color)}
                onMouseLeave={() => setPreviewColor(null)}
                onClick={() => {
                  if (cantAfford) { flash(`need ${sw.cost} gold`); return }
                  setPreviewColor(null)
                  dyeTree(dyeingTreeId, sw.color, sw.cost)
                }}
              >
                <span className="dye-swatch-cost">{sw.cost}</span>
              </button>
            )
          })}
        </div>
        <button
          className="cut-pill-cancel"
          onClick={() => { setPreviewColor(null); cancelDyeing() }}
          title="Cancel (Esc)"
        >
          x
        </button>
      </div>
    )
  }

  // ── Normal selection mode ─────────────────────────────────────────────
  return (
    <div className={`cut-pill no-look${selection ? ' show' : ''}`}>
      <span className="cut-pill-label">{label}</span>
      <button className="cut-pill-cancel" onClick={clearSelection} title="Cancel (Esc)">
        x
      </button>
      {canDye && (
        <button
          className="cut-pill-action cut-pill-action--dye"
          onClick={() => setDyeingTreeId(selTree.id)}
          title="Dye this tree's leaves"
        >
          Dye
        </button>
      )}
      <button className="cut-pill-action" onClick={onCut} title="Cut selected (X)">
        Cut
        <span className="cut-pill-key">X</span>
      </button>
    </div>
  )
}
