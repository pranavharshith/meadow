import { useState } from 'react'
import { useStore } from '../store'

// ── Catalog definitions ────────────────────────────────────────────────────

export const TREE_ITEMS = [
  {
    id: 'broadleaf',
    name: 'Broadleaf Oak',
    shape: 0,
    cost: 0,
    emoji: '🌳',
    desc: 'Classic rounded canopy',
    color: '#5c8a3a',
  },
  {
    id: 'pine',
    name: 'Pine',
    shape: 1,
    cost: 5,
    emoji: '🌲',
    desc: 'Tall pointed conifer',
    color: '#2d5a3a',
  },
  {
    id: 'bushy',
    name: 'Bushy Shrub',
    shape: 2,
    cost: 5,
    emoji: '🫧',
    desc: 'Low, dense canopy',
    color: '#7a9a3a',
  },
  {
    id: 'willow',
    name: 'Willow',
    shape: 3,
    cost: 10,
    emoji: '🌿',
    desc: 'Graceful drooping boughs',
    color: '#6a9a70',
  },
]

export const DYE_ITEMS = [
  { id: 'autumn',    name: 'Autumn Orange',  color: '#d46a2a', cost: 50,  emoji: '🍂', desc: 'Warm fall hues' },
  { id: 'sunset',    name: 'Sunset Red',     color: '#c44030', cost: 50,  emoji: '🌅', desc: 'Deep evening glow' },
  { id: 'golden',    name: 'Golden Yellow',  color: '#e8b830', cost: 50,  emoji: '🌻', desc: 'Bright sunflower' },
  { id: 'sky',       name: 'Sky Blue',       color: '#5098d0', cost: 100, emoji: '💧', desc: 'Clear open sky' },
  { id: 'lavender',  name: 'Lavender Purple',color: '#b080d0', cost: 100, emoji: '🔮', desc: 'Soft mystic tone' },
  { id: 'blush',     name: 'Blush Pink',     color: '#e878a0', cost: 100, emoji: '🌸', desc: 'Gentle petal pink' },
  { id: 'teal',      name: 'Forest Teal',    color: '#308a78', cost: 150, emoji: '🌊', desc: 'Deep woodland pool' },
  { id: 'moonlight', name: 'Moonlight White',color: '#c8d8d0', cost: 150, emoji: '✨', desc: 'Pale silver shimmer' },
]

export const ROCK_ITEMS = [
  {
    id: 'round',
    name: 'Round Rock',
    rockShape: 2,
    cost: 5,
    emoji: '🪨',
    desc: 'Classic mossy stone',
    color: '#9a9488',
  },
  {
    id: 'boulder',
    name: 'Flat Boulder',
    rockShape: 0,
    cost: 8,
    emoji: '🗿',
    desc: 'Wide compressed slab',
    color: '#8d8b83',
  },
  {
    id: 'standing',
    name: 'Standing Stone',
    rockShape: 1,
    cost: 8,
    emoji: '🏛',
    desc: 'Tall upright monolith',
    color: '#7a7870',
  },
]

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

const PLOT_ITEM = {
  id: 'plot',
  name: 'Personal Plot',
  type: 'plot',
  cost: 250,
  emoji: '📌',
  desc: 'Claim a circle of land others can\'t plant on',
  color: '#5ba8d8',
}

export default function Shop() {
  const shopOpen = useStore((s) => s.shopOpen)
  const setShopOpen = useStore((s) => s.setShopOpen)
  const selectedItem = useStore((s) => s.selectedItem)
  const setSelectedItem = useStore((s) => s.setSelectedItem)
  const gold = useStore((s) => s.gold)
  const plots = useStore((s) => s.plots)

  const [tab, setTab] = useState('trees')

  if (!shopOpen) return null

  const isDyeTab = tab === 'dyes'
  const isPlotTab = tab === 'plots'
  const items = isDyeTab ? DYE_ITEMS : (isPlotTab ? [PLOT_ITEM] : (tab === 'trees' ? TREE_ITEMS : ROCK_ITEMS))
  const isPlot = selectedItem.type === 'plot'
  const isRock = selectedItem.type === 'rock'
  const currentList = isPlot ? [PLOT_ITEM] : (isRock ? ROCK_ITEMS : TREE_ITEMS)
  const currentItem =
    currentList.find((i) => i.id === selectedItem.id) ||
    (tab === 'trees' ? TREE_ITEMS[0] : tab === 'rocks' ? ROCK_ITEMS[0] : tab === 'dyes' ? DYE_ITEMS[0] : PLOT_ITEM)
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
          <button
            className={`shop-tab${tab === 'dyes' ? ' active' : ''}`}
            onClick={() => setTab('dyes')}
          >
            🎨 Dyes
          </button>
        </div>

        {/* Grid */}
        <div className="shop-grid">
          {items.map((item) => {
            const itemType = tab === 'trees' ? 'tree' : tab === 'rocks' ? 'rock' : tab === 'dyes' ? 'dye' : 'plot'
            const isSelected =
              selectedItem.id === item.id && selectedItem.type === itemType
            const cantBuyPlot = itemType === 'plot' && hasPlot
            const canAfford = gold >= item.cost && !cantBuyPlot
            return isDyeTab ? (
              <div key={item.id} className={`shop-card${!canAfford ? ' cant-afford' : ''}`}>
                <div className="dye-swatch-card" style={{ background: item.color }} />
                <div className="shop-card-name">{item.name}</div>
                <div className="shop-card-desc">{item.desc}</div>
                <div className="shop-card-cost">
                  <span className="shop-coin" />
                  <span>{item.cost}</span>
                </div>
              </div>
            ) : (
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
                }}
              />
            )
          })}
        </div>

        {/* Selection hint — no action button here; player uses the HUD
            "Plant" button or the E key to place the chosen item. */}
        <div className="shop-hint">
          {isDyeTab ? (
            <span style={{ color: 'rgba(255,255,255,0.65)', fontSize: '12px' }}>
              select a tree in the world, then click <b>Dye</b> in the action pill
            </span>
          ) : (
            <>
              selected: <b>{currentItem.emoji} {currentItem.name}</b>
              {currentItem.cost > 0 && (
                <span className="shop-hint-cost">
                  &nbsp;·&nbsp;costs <span className="shop-coin" /> {currentItem.cost}
                </span>
              )}
              <span className="shop-hint-key">press <kbd>E</kbd> to {isPlotTab ? 'claim' : 'place'}</span>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
