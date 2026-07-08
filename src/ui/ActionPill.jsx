import { useStore } from '../store'
import { TREE_ITEMS, ROCK_ITEMS, DYE_ITEMS } from '../catalog'

export default function ActionPill({ selection, onCut }) {
  const clearSelection = useStore((s) => s.clearSelection)
  const trees = useStore((s) => s.trees)
  const placedRocks = useStore((s) => s.placedRocks)
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

  let label = ''
  if (selection) {
    if (selection.kind === 'tree' && selTree) {
      const catalogItem = TREE_ITEMS.find((i) => i.shape === (selTree.shape || 0))
      label = catalogItem ? `${catalogItem.emoji} ${catalogItem.name} selected` : 'tree selected'
    } else if (selection.kind === 'rock') {
      const rock = placedRocks.find((r) => r.id === selection.id)
      if (rock) {
        const catalogItem = ROCK_ITEMS.find((i) => i.rockShape === (rock.rockShape ?? 2))
        label = catalogItem ? `${catalogItem.emoji} ${catalogItem.name} selected` : 'rock selected'
      } else {
        label = 'rock selected'
      }
    }
  }

  // ── Dye palette mode ──────────────────────────────────────────────────
  if (dyeingTreeId) {
    return (
      <div className="cut-pill show">
        <span className="cut-pill-label">choose a colour</span>
        <div className="dye-swatches">
          {DYE_ITEMS.map((sw) => {
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
      <button className="cut-pill-action" onClick={onCut} title={`${selection?.kind === 'rock' ? 'Break' : 'Cut'} selected (X)`}>
        {selection?.kind === 'rock' ? 'Break' : 'Cut'}
        <span className="cut-pill-key">X</span>
      </button>
    </div>
  )
}
