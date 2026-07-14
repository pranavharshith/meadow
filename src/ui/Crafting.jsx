import { useEffect } from 'react'
import { useStore } from '../store'
import { CRAFTING_CATALOG } from '../catalog_crafting'

// ── Item Card ──────────────────────────────────────────────────────────────

function CraftingCard({ item, selected, canAfford, onClick }) {
  return (
    <button
      className={`shop-card${selected ? ' selected' : ''}${!canAfford ? ' cant-afford' : ''}`}
      onClick={onClick}
      title={item.desc}
    >
      <div className="shop-card-emoji">{item.icon}</div>
      <div className="shop-card-name">{item.name}</div>
      <div className="shop-card-desc">{item.desc}</div>
      <div className="shop-card-cost">
        {item.costWood === 0 && item.costStone === 0 ? (
          <span className="shop-free">free</span>
        ) : (
          <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
            {item.costWood > 0 && (
              <span>🪵 {item.costWood}</span>
            )}
            {item.costStone > 0 && (
              <span>🪨 {item.costStone}</span>
            )}
          </div>
        )}
      </div>
      {selected && <div className="shop-card-sel-ring" />}
    </button>
  )
}

// ── Main Crafting Panel ────────────────────────────────────────────────────

export default function Crafting() {
  const craftingOpen = useStore((s) => s.craftingOpen)
  const setCraftingOpen = useStore((s) => s.setCraftingOpen)
  const selectedItem = useStore((s) => s.selectedItem)
  const setSelectedItem = useStore((s) => s.setSelectedItem)
  const wood = useStore((s) => s.wood)
  const stone = useStore((s) => s.stone)

  const items = CRAFTING_CATALOG
  const currentItem = items.find((i) => i.id === selectedItem.id) || items[0]

  useEffect(() => {
    if (!craftingOpen) return
    if (document.activeElement === document.body) {
      const firstTab = document.querySelector('.shop-tab')
      if (firstTab) firstTab.focus()
    }

    const onKey = async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return

      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault()
        const idx = items.findIndex((i) => i.id === currentItem.id)
        if (idx !== -1) {
          const nextIdx = e.code === 'ArrowRight' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length
          const nextItem = items[nextIdx]
          setSelectedItem({
            type: 'crafted',
            id: nextItem.id,
            costWood: nextItem.costWood,
            costStone: nextItem.costStone,
          })
        }
      } else if (e.code === 'Enter') {
        e.preventDefault()
        const canAfford = wood >= currentItem.costWood && stone >= currentItem.costStone
        
        if (!canAfford) return
        
        setCraftingOpen(false)
        setTimeout(() => useStore.getState().enterPlacement(), 10)
      } else if (e.code === 'KeyQ') {
        e.preventDefault()
        setCraftingOpen(false)
      }
    }
    
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [craftingOpen, items, currentItem, wood, stone])

  if (!craftingOpen) return null

  return (
    <div className="shop-overlay no-look" onClick={(e) => { if (e.target === e.currentTarget) setCraftingOpen(false) }}>
      <div className="shop-drawer">
        {/* Header */}
        <div className="shop-header">
          <div className="shop-title">
            <span className="shop-title-icon">🔨</span>
            <span>Crafting</span>
          </div>
          <button className="shop-close" onClick={() => setCraftingOpen(false)} aria-label="Close crafting">✕</button>
        </div>

        {/* Grid */}
        <div className="shop-grid">
          {items.map((item) => {
            const isSelected = selectedItem.id === item.id && selectedItem.type === 'crafted'
            const canAfford = wood >= item.costWood && stone >= item.costStone
            
            return (
              <div key={item.id}>
                <CraftingCard
                  item={item}
                  selected={isSelected}
                  canAfford={canAfford}
                  onClick={() => {
                    setSelectedItem({
                      type: 'crafted',
                      id: item.id,
                      costWood: item.costWood,
                      costStone: item.costStone,
                    })
                    
                    if (canAfford) {
                      setCraftingOpen(false)
                      setTimeout(() => useStore.getState().enterPlacement(), 10)
                    }
                  }}
                />
              </div>
            )
          })}
        </div>

        {/* Selection hint */}
        <div className="shop-hint">
          selected: <b>{currentItem.icon} {currentItem.name}</b>
          {(currentItem.costWood > 0 || currentItem.costStone > 0) && (
            <span className="shop-hint-cost">
              &nbsp;·&nbsp;costs 
              {currentItem.costWood > 0 && <span> 🪵 {currentItem.costWood}</span>}
              {currentItem.costStone > 0 && <span> 🪨 {currentItem.costStone}</span>}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
