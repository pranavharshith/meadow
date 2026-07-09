import { useState } from 'react'
import { useStore } from '../store'
import { TREE_ITEMS, ROCK_ITEMS, PLOT_ITEM, HAT_ITEMS, DYE_ITEMS } from '../catalog'

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
  const [cosmeticSubTab, setCosmeticSubTab] = useState('hats') // 'hats', 'head', 'body', 'legs'

  if (!shopOpen) return null

  const isPlotTab = tab === 'plots'
  const isCosmeticTab = tab === 'cosmetics'
  const isHatTab = isCosmeticTab && cosmeticSubTab === 'hats'
  const isDyeTab = isCosmeticTab && !isHatTab
  const items = isPlotTab ? [PLOT_ITEM] : (isCosmeticTab ? (isHatTab ? HAT_ITEMS : DYE_ITEMS) : (tab === 'trees' ? TREE_ITEMS : ROCK_ITEMS))
  
  const isPlot = selectedItem.type === 'plot'
  const isRock = selectedItem.type === 'rock'
  const isHat = selectedItem.type === 'hat'
  const isDye = selectedItem.type === 'dye'
  
  const currentList = isPlot ? [PLOT_ITEM] : (isRock ? ROCK_ITEMS : (isHat ? HAT_ITEMS : (isDye ? DYE_ITEMS : TREE_ITEMS)))
  const currentItem =
    currentList.find((i) => i.id === selectedItem.id) ||
    (isCosmeticTab ? (isHatTab ? HAT_ITEMS[0] : DYE_ITEMS[0]) : (tab === 'trees' ? TREE_ITEMS[0] : tab === 'rocks' ? ROCK_ITEMS[0] : PLOT_ITEM))
  const myPlots = plots.filter((p) => p.owner)
  let myUsedArea = 0
  myPlots.forEach((p) => {
    const pw = p.width ?? 10
    const pd = p.depth ?? 10
    if (p.shapeType === 0 || p.shapeType === undefined) myUsedArea += 3.14159 * pw * pw
    else myUsedArea += (pw * 2) * (pd * 2)
  })
  const hasMaxPlots = myPlots.length >= 5 || myUsedArea >= 1600

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
          <button
            className={`shop-tab${tab === 'cosmetics' ? ' active' : ''}`}
            onClick={() => setTab('cosmetics')}
          >
            🎩 Style
          </button>
        </div>

        {tab === 'cosmetics' && (
          <div className="shop-tabs" style={{ background: 'transparent', padding: '0 8px 8px' }}>
            <button className={`shop-tab${cosmeticSubTab === 'hats' ? ' active' : ''}`} onClick={() => setCosmeticSubTab('hats')}>Hats</button>
            <button className={`shop-tab${cosmeticSubTab === 'head' ? ' active' : ''}`} onClick={() => setCosmeticSubTab('head')}>Head Dye</button>
            <button className={`shop-tab${cosmeticSubTab === 'body' ? ' active' : ''}`} onClick={() => setCosmeticSubTab('body')}>Body Dye</button>
            <button className={`shop-tab${cosmeticSubTab === 'legs' ? ' active' : ''}`} onClick={() => setCosmeticSubTab('legs')}>Legs Dye</button>
          </div>
        )}

        {/* Grid */}
        <div className="shop-grid">
          {items.map((item) => {
            const itemType = tab === 'trees' ? 'tree' : tab === 'rocks' ? 'rock' : tab === 'plots' ? 'plot' : (isHatTab ? 'hat' : 'dye')
            const isSelected = selectedItem.id === item.id && selectedItem.type === itemType
            const cantBuyPlot = itemType === 'plot' && hasMaxPlots
            const canAfford = (itemType === 'plot' ? (gold >= item.cost && !hasMaxPlots) : (gold >= item.cost))
            
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
                    color: item.color,
                  })
                  
                  if (itemType === 'hat') {
                    useStore.getState().buyCosmetic('hat', item.id, null, item.cost)
                  } else if (itemType === 'dye') {
                    useStore.getState().buyCosmetic(cosmeticSubTab, null, item.color, item.cost)
                  } else {
                    setShopOpen(false) // Auto-close for placables!
                    if (itemType === 'plot') {
                      setTimeout(() => useStore.getState().enterPlacement(), 10)
                    }
                  }
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
