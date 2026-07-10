import { useState, useEffect } from 'react'
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
  const [focusSection, setFocusSection] = useState('tabs') // 'tabs', 'subtabs', 'grid'

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
    const onKey = (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return
      if (!['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(e.code)) return
      e.preventDefault()

      const isPlotTab = tab === 'plots'
      const isCosmeticTab = tab === 'cosmetics'
      const isHatTab = isCosmeticTab && cosmeticSubTab === 'hats'
      const itemsList = isPlotTab ? [PLOT_ITEM] : (isCosmeticTab ? (isHatTab ? HAT_ITEMS : DYE_ITEMS) : (tab === 'trees' ? TREE_ITEMS : ROCK_ITEMS))
      const itemType = tab === 'trees' ? 'tree' : tab === 'rocks' ? 'rock' : tab === 'plots' ? 'plot' : (isHatTab ? 'hat' : 'dye')
      
      let currentIndex = itemsList.findIndex(i => i.id === selectedItem.id && selectedItem.type === itemType)
      if (currentIndex === -1) currentIndex = 0

      if (focusSection === 'tabs') {
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
          const tabs = ['trees', 'rocks', 'plots', 'cosmetics']
          const tIdx = tabs.indexOf(tab)
          const nextTab = e.code === 'ArrowRight' ? tabs[(tIdx + 1) % tabs.length] : tabs[(tIdx - 1 + tabs.length) % tabs.length]
          setTab(nextTab)
          if (nextTab !== 'cosmetics' && focusSection === 'subtabs') setFocusSection('tabs')
        } else if (e.code === 'ArrowDown') {
          setFocusSection(tab === 'cosmetics' ? 'subtabs' : 'grid')
        }
      } else if (focusSection === 'subtabs') {
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
          const subtabs = ['hats', 'head', 'body', 'legs']
          const sIdx = subtabs.indexOf(cosmeticSubTab)
          const nextSub = e.code === 'ArrowRight' ? subtabs[(sIdx + 1) % subtabs.length] : subtabs[(sIdx - 1 + subtabs.length) % subtabs.length]
          setCosmeticSubTab(nextSub)
        } else if (e.code === 'ArrowUp') {
          setFocusSection('tabs')
        } else if (e.code === 'ArrowDown') {
          setFocusSection('grid')
        }
      } else if (focusSection === 'grid') {
        if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
          const next = e.code === 'ArrowRight' ? itemsList[(currentIndex + 1) % itemsList.length] : itemsList[(currentIndex - 1 + itemsList.length) % itemsList.length]
          setSelectedItem({
            type: itemType, id: next.id, shape: tab === 'trees' ? next.shape : undefined,
            rockShape: tab === 'rocks' ? next.rockShape : undefined, cost: next.cost, color: next.color,
          })
        } else if (e.code === 'ArrowUp') {
          setFocusSection(tab === 'cosmetics' ? 'subtabs' : 'tabs')
        } else if (e.code === 'Enter') {
          const item = itemsList[currentIndex]
          const cantBuyPlot = itemType === 'plot' && hasMaxPlots
          const canAfford = (itemType === 'plot' ? (gold >= item.cost && !hasMaxPlots) : (gold >= item.cost))
          
          if (cantBuyPlot || !canAfford) return
          
          if (itemType === 'hat') {
            useStore.getState().buyCosmetic('hat', item.id, null, item.cost)
          } else if (itemType === 'dye') {
            useStore.getState().buyCosmetic(cosmeticSubTab, null, item.color, item.cost)
          } else {
            setShopOpen(false)
            if (itemType === 'plot') {
              setTimeout(() => useStore.getState().enterPlacement(), 10)
            }
          }
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [shopOpen, tab, cosmeticSubTab, selectedItem, gold, hasMaxPlots, setSelectedItem, setShopOpen])

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
            style={focusSection === 'tabs' && tab === 'trees' ? { outline: '2px solid white' } : {}}
            onClick={() => { setTab('trees'); setFocusSection('tabs'); }}
          >
            🌳 Trees
          </button>
          <button
            className={`shop-tab${tab === 'rocks' ? ' active' : ''}`}
            style={focusSection === 'tabs' && tab === 'rocks' ? { outline: '2px solid white' } : {}}
            onClick={() => { setTab('rocks'); setFocusSection('tabs'); }}
          >
            🪨 Rocks
          </button>
          <button
            className={`shop-tab${tab === 'plots' ? ' active' : ''}`}
            style={focusSection === 'tabs' && tab === 'plots' ? { outline: '2px solid white' } : {}}
            onClick={() => { setTab('plots'); setFocusSection('tabs'); }}
          >
            📌 Plots
          </button>
          <button
            className={`shop-tab${tab === 'cosmetics' ? ' active' : ''}`}
            style={focusSection === 'tabs' && tab === 'cosmetics' ? { outline: '2px solid white' } : {}}
            onClick={() => { setTab('cosmetics'); setFocusSection('tabs'); }}
          >
            🎩 Style
          </button>
        </div>

        {tab === 'cosmetics' && (
          <div className="shop-tabs" style={{ background: 'transparent', padding: '0 8px 8px' }}>
            <button className={`shop-tab${cosmeticSubTab === 'hats' ? ' active' : ''}`} style={focusSection === 'subtabs' && cosmeticSubTab === 'hats' ? { outline: '2px solid white' } : {}} onClick={() => { setCosmeticSubTab('hats'); setFocusSection('subtabs'); }}>Hats</button>
            <button className={`shop-tab${cosmeticSubTab === 'head' ? ' active' : ''}`} style={focusSection === 'subtabs' && cosmeticSubTab === 'head' ? { outline: '2px solid white' } : {}} onClick={() => { setCosmeticSubTab('head'); setFocusSection('subtabs'); }}>Head Dye</button>
            <button className={`shop-tab${cosmeticSubTab === 'body' ? ' active' : ''}`} style={focusSection === 'subtabs' && cosmeticSubTab === 'body' ? { outline: '2px solid white' } : {}} onClick={() => { setCosmeticSubTab('body'); setFocusSection('subtabs'); }}>Body Dye</button>
            <button className={`shop-tab${cosmeticSubTab === 'legs' ? ' active' : ''}`} style={focusSection === 'subtabs' && cosmeticSubTab === 'legs' ? { outline: '2px solid white' } : {}} onClick={() => { setCosmeticSubTab('legs'); setFocusSection('subtabs'); }}>Legs Dye</button>
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
              <div key={item.id} style={focusSection === 'grid' && isSelected ? { outline: '2px solid white', borderRadius: '8px' } : {}}>
                <ItemCard
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
