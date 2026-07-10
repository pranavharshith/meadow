import { useState, useEffect } from 'react'
import { useStore } from '../store'
import { TREE_ITEMS, ROCK_ITEMS, PLOT_ITEM, HAT_ITEMS, DYE_ITEMS } from '../catalog'

// ── Item Card ──────────────────────────────────────────────────────────────

function ItemCard({ item, selected, canAfford, isProcessing, onClick }) {
  return (
    <button
      className={`shop-card${selected ? ' selected' : ''}${!canAfford ? ' cant-afford' : ''}${isProcessing ? ' loading' : ''}`}
      onClick={onClick}
      disabled={isProcessing}
      title={item.desc}
    >
      <div className="shop-card-emoji">{isProcessing ? '⏳' : item.emoji}</div>
      <div className="shop-card-name">{isProcessing ? 'Buying...' : item.name}</div>
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
  const [isProcessing, setIsProcessing] = useState(false)

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

  useEffect(() => {
    if (!shopOpen) return
    // Focus the first tab when shop opens if nothing is focused
    if (document.activeElement === document.body) {
      const firstTab = document.querySelector('.shop-tab')
      if (firstTab) firstTab.focus()
    }

    const onKey = async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      
      const tabKeys = ['trees', 'rocks', 'plots', 'cosmetics']
      const itemType = tab === 'trees' ? 'tree' : tab === 'rocks' ? 'rock' : tab === 'plots' ? 'plot' : (isHatTab ? 'hat' : 'dye')

      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault()
        const idx = items.findIndex((i) => i.id === currentItem.id)
        if (idx !== -1) {
          const nextIdx = e.code === 'ArrowRight' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length
          const nextItem = items[nextIdx]
          setSelectedItem({
            type: itemType,
            id: nextItem.id,
            shape: nextItem.shape,
            rockShape: nextItem.rockShape,
            cost: nextItem.cost,
            color: nextItem.color,
          })
        }
      } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault()
        const idx = tabKeys.indexOf(tab)
        const nextTab = e.code === 'ArrowDown' ? tabKeys[(idx + 1) % tabKeys.length] : tabKeys[(idx - 1 + tabKeys.length) % tabKeys.length]
        setTab(nextTab)
      } else if (e.code === 'Enter') {
        e.preventDefault()
        const cantBuyPlot = itemType === 'plot' && hasMaxPlots
        const canAfford = (itemType === 'plot' ? (gold >= currentItem.cost && !hasMaxPlots) : (gold >= currentItem.cost))
        
        if (!canAfford || cantBuyPlot || isProcessing) return
        
        if (itemType === 'hat') {
          setIsProcessing(true)
          await useStore.getState().buyCosmetic('hat', currentItem.id, null, currentItem.cost)
          setIsProcessing(false)
        } else if (itemType === 'dye') {
          setIsProcessing(true)
          await useStore.getState().buyCosmetic(cosmeticSubTab, null, currentItem.color, currentItem.cost)
          setIsProcessing(false)
        } else {
          setShopOpen(false)
          if (itemType === 'plot') {
            setTimeout(() => useStore.getState().enterPlacement(), 10)
          }
        }
      }
    }
    
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shopOpen, tab, items, currentItem, hasMaxPlots, gold, isProcessing, cosmeticSubTab, isHatTab])

  if (!shopOpen) return null

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
            onClick={() => { setTab('trees'); }}
          >
            🌳 Trees
          </button>
          <button
            className={`shop-tab${tab === 'rocks' ? ' active' : ''}`}
            onClick={() => { setTab('rocks'); }}
          >
            🪨 Rocks
          </button>
          <button
            className={`shop-tab${tab === 'plots' ? ' active' : ''}`}
            onClick={() => { setTab('plots'); }}
          >
            📌 Plots
          </button>
          <button
            className={`shop-tab${tab === 'cosmetics' ? ' active' : ''}`}
            onClick={() => { setTab('cosmetics'); }}
          >
            🎩 Style
          </button>
        </div>

        {tab === 'cosmetics' && (
          <div className="shop-tabs" style={{ background: 'transparent', padding: '0 8px 8px' }}>
            <button className={`shop-tab${cosmeticSubTab === 'hats' ? ' active' : ''}`} onClick={() => { setCosmeticSubTab('hats'); }}>Hats</button>
            <button className={`shop-tab${cosmeticSubTab === 'head' ? ' active' : ''}`} onClick={() => { setCosmeticSubTab('head'); }}>Head Dye</button>
            <button className={`shop-tab${cosmeticSubTab === 'body' ? ' active' : ''}`} onClick={() => { setCosmeticSubTab('body'); }}>Body Dye</button>
            <button className={`shop-tab${cosmeticSubTab === 'legs' ? ' active' : ''}`} onClick={() => { setCosmeticSubTab('legs'); }}>Legs Dye</button>
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
              <div key={item.id}>
                <ItemCard
                  item={item}
                  selected={isSelected}
                  canAfford={canAfford}
                  isProcessing={isProcessing && isSelected}
                  onClick={async () => {
                    if (cantBuyPlot || isProcessing) return
                    setSelectedItem({
                      type: itemType,
                      id: item.id,
                      shape: tab === 'trees' ? item.shape : undefined,
                      rockShape: tab === 'rocks' ? item.rockShape : undefined,
                      cost: item.cost,
                      color: item.color,
                    })
                    
                    if (itemType === 'hat') {
                      setIsProcessing(true)
                      await useStore.getState().buyCosmetic('hat', item.id, null, item.cost)
                      setIsProcessing(false)
                    } else if (itemType === 'dye') {
                      setIsProcessing(true)
                      await useStore.getState().buyCosmetic(cosmeticSubTab, null, item.color, item.cost)
                      setIsProcessing(false)
                    } else {
                      setShopOpen(false) // Auto-close for placables!
                      if (itemType === 'plot') {
                        setTimeout(() => useStore.getState().enterPlacement(), 10)
                      }
                    }
                  }}
                />
              </div>
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
