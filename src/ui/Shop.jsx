import { useState } from 'react'
import { useStore } from '../store'
import { TREE_ITEMS, ROCK_ITEMS, PLOT_ITEM } from '../catalog'

// ── Item Card ──────────────────────────────────────────────────────────────

function ItemCard({ item, selected, canAfford, onClick }) {
  return (
    <button
      className={`shop-card${selected ? ' selected' : ''}${!canAfford ? ' cant-afford' : ''}`}
      onClick={onClick}
      title={item.desc}
    >
      <div className="shop-card-emoji">{item.emoji}</div>
      <div className="shop-card-name">{item.name}</div>
      <div className="shop-card-desc">{item.desc}</div>
      <div className="shop-card-cost">
        {item.cost === 0 ? (
          <span className="shop-free">free</span>
        ) : (
          <>
            <span className="shop-coin" />
            <span>{item.cost}</span>
          </>
        )}
      </div>
      {selected && <div className="shop-card-sel-ring" />}
    </button>
  )
}

// ── Main Shop Panel ────────────────────────────────────────────────────────

export default function Shop() {
  const shopOpen = useStore((s) => s.shopOpen)
  const setShopOpen = useStore((s) => s.setShopOpen)
  const selectedItem = useStore((s) => s.selectedItem)
  const setSelectedItem = useStore((s) => s.setSelectedItem)
  const gold = useStore((s) => s.gold)
  const plots = useStore((s) => s.plots)

  const [tab, setTab] = useState('trees')

  if (!shopOpen) return null

  const isPlotTab = tab === 'plots'
  const items = isPlotTab ? [PLOT_ITEM] : (tab === 'trees' ? TREE_ITEMS : ROCK_ITEMS)
  const isPlot = selectedItem.type === 'plot'
  const isRock = selectedItem.type === 'rock'
  const currentList = isPlot ? [PLOT_ITEM] : (isRock ? ROCK_ITEMS : TREE_ITEMS)
  const currentItem =
    currentList.find((i) => i.id === selectedItem.id) ||
    (tab === 'trees' ? TREE_ITEMS[0] : tab === 'rocks' ? ROCK_ITEMS[0] : PLOT_ITEM)
  const hasPlot = plots.some((p) => p.owner)

  return (
    <div className="shop-overlay no-look" onClick={(e) => { if (e.target === e.currentTarget) setShopOpen(false) }}>
      <div className="shop-drawer">
        {/* Header */}
        <div className="shop-header">
          <div className="shop-title">
            <span className="shop-title-icon">🌿</span>
            <span>Nature Shop</span>
          </div>
          <button className="shop-close" onClick={() => setShopOpen(false)} aria-label="Close shop">✕</button>
        </div>

        {/* Tab bar */}
        <div className="shop-tabs">
          <button
            className={`shop-tab${tab === 'trees' ? ' active' : ''}`}
            onClick={() => setTab('trees')}
          >
            🌳 Trees
          </button>
          <button
            className={`shop-tab${tab === 'rocks' ? ' active' : ''}`}
            onClick={() => setTab('rocks')}
          >
            🪨 Rocks
          </button>
          <button
            className={`shop-tab${tab === 'plots' ? ' active' : ''}`}
            onClick={() => setTab('plots')}
          >
            📌 Plots
          </button>
        </div>

        {/* Grid */}
        <div className="shop-grid">
          {items.map((item) => {
            const itemType = tab === 'trees' ? 'tree' : tab === 'rocks' ? 'rock' : 'plot'
            const isSelected =
              selectedItem.id === item.id && selectedItem.type === itemType
            const cantBuyPlot = itemType === 'plot' && hasPlot
            const canAfford = gold >= item.cost && !cantBuyPlot
            return (
              <ItemCard
                key={item.id}
                item={item}
                selected={isSelected}
                canAfford={canAfford}
                onClick={() => {
                  if (cantBuyPlot) return
                  setSelectedItem({
                    type: itemType,
                    id: item.id,
                    shape: tab === 'trees' ? item.shape : undefined,
                    rockShape: tab === 'rocks' ? item.rockShape : undefined,
                    cost: item.cost,
                  })
                  setShopOpen(false) // Auto-close!
                }}
              />
            )
          })}
        </div>

        {/* Selection hint */}
        <div className="shop-hint">
          selected: <b>{currentItem.emoji} {currentItem.name}</b>
          {currentItem.cost > 0 && (
            <span className="shop-hint-cost">
              &nbsp;·&nbsp;costs <span className="shop-coin" /> {currentItem.cost}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}
