import { useState, useEffect, useCallback } from 'react'
import { useStore } from '../store'
import {
  TREE_ITEMS,
  ROCK_ITEMS,
  PLOT_ITEM,
  HAT_ITEMS,
  AVATAR_COLORS,
  EXOTIC_TREE_ITEMS,
} from '../catalog'
import { CRAFTING_CATALOG } from '../catalog_crafting'
import Modal from './Modal'

const ALL_TREES = [...TREE_ITEMS, ...EXOTIC_TREE_ITEMS]
const HUB_TABS = [
  { id: 'trees', label: 'Trees', icon: '🌳' },
  { id: 'rocks', label: 'Rocks', icon: '🪨' },
  { id: 'craft', label: 'Craft', icon: '🔨' },
  { id: 'plots', label: 'Land', icon: '📌' },
  { id: 'cosmetics', label: 'Style', icon: '🎩' },
]

function CatalogCard({
  selected,
  canAfford,
  isProcessing,
  status,
  emoji,
  name,
  desc,
  costNode,
  onClick,
  onDoubleClick,
  ariaLabel,
}) {
  const isEquipped = status === 'equipped'
  const isOwned = status === 'owned'
  const locked = !canAfford && !isOwned && !isEquipped

  return (
    <button
      type="button"
      className={`shop-card${selected ? ' selected' : ''}${locked ? ' cant-afford' : ''}${isProcessing ? ' loading' : ''}`}
      onClick={onClick}
      onDoubleClick={onDoubleClick}
      disabled={isProcessing || isEquipped}
      aria-disabled={locked || isEquipped || isProcessing || undefined}
      aria-pressed={selected}
      aria-label={ariaLabel}
      title={desc}
    >
      <div className="shop-card-emoji" aria-hidden="true">
        {isProcessing ? '⏳' : emoji}
      </div>
      <div className="shop-card-name">{isProcessing ? 'Equipping...' : name}</div>
      <div className="shop-card-desc">{desc}</div>
      <div className="shop-card-cost">{costNode}</div>
      {selected && <div className="shop-card-sel-ring" aria-hidden="true" />}
    </button>
  )
}

/**
 * Create hub — one place to plant, craft, claim land, and style.
 * Hotkeys: G (trees/nature) · Q (craft tab)
 */
export default function CreateHub() {
  const createOpen = useStore((s) => s.createOpen)
  const createTab = useStore((s) => s.createTab)
  const setCreateOpen = useStore((s) => s.setCreateOpen)
  const setCreateTab = useStore((s) => s.setCreateTab)
  const selectedItem = useStore((s) => s.selectedItem)
  const setSelectedItem = useStore((s) => s.setSelectedItem)
  const gold = useStore((s) => s.gold)
  const wood = useStore((s) => s.wood)
  const stone = useStore((s) => s.stone)
  const plots = useStore((s) => s.plots)
  const ownedCosmetics = useStore((s) => s.ownedCosmetics) || []
  const hatId = useStore((s) => s.hatId)
  const headColor = useStore((s) => s.headColor)
  const bodyColor = useStore((s) => s.bodyColor)
  const legColor = useStore((s) => s.legColor)
  const online = useStore((s) => s.online)

  const [cosmeticSubTab, setCosmeticSubTab] = useState('hats')
  const [isProcessing, setIsProcessing] = useState(false)

  const tab = createTab || 'trees'
  const isCraft = tab === 'craft'
  const isPlotTab = tab === 'plots'
  const isCosmeticTab = tab === 'cosmetics'
  const isHatTab = isCosmeticTab && cosmeticSubTab === 'hats'
  /** Paid style needs online; free “No Hat” still works offline (E6). */
  const styleOnlineOnly = isCosmeticTab && !online

  const flash = useStore((s) => s.flash)

  const items = isCraft
    ? CRAFTING_CATALOG
    : isPlotTab
      ? [PLOT_ITEM]
      : isCosmeticTab
        ? isHatTab
          ? HAT_ITEMS
          : AVATAR_COLORS
        : tab === 'trees'
          ? ALL_TREES
          : ROCK_ITEMS

  const close = useCallback(() => setCreateOpen(false), [setCreateOpen])

  // Sync selected item when switching hub tab
  useEffect(() => {
    if (!createOpen) return
    if (tab === 'craft') {
      const first = CRAFTING_CATALOG[0]
      if (selectedItem.type !== 'crafted') {
        setSelectedItem({
          type: 'crafted',
          id: first.id,
          costWood: first.costWood,
          costStone: first.costStone,
        })
      }
    } else if (tab === 'trees' && selectedItem.type !== 'tree') {
      const t = ALL_TREES[0]
      setSelectedItem({ type: 'tree', id: t.id, shape: t.shape, cost: t.cost })
    } else if (tab === 'rocks' && selectedItem.type !== 'rock') {
      const r = ROCK_ITEMS[0]
      setSelectedItem({ type: 'rock', id: r.id, rockShape: r.rockShape, cost: r.cost })
    } else if (tab === 'plots' && selectedItem.type !== 'plot') {
      setSelectedItem({ type: 'plot', id: PLOT_ITEM.id, cost: PLOT_ITEM.cost })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, createOpen])

  useEffect(() => {
    if (!createOpen) return
    const onKey = async (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return
      if (e.code === 'KeyG' || e.code === 'KeyQ') {
        e.preventDefault()
        close()
        return
      }

      const tabIds = HUB_TABS.map((t) => t.id)
      if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
        e.preventDefault()
        const idx = tabIds.indexOf(tab)
        const next =
          e.code === 'ArrowDown'
            ? tabIds[(idx + 1) % tabIds.length]
            : tabIds[(idx - 1 + tabIds.length) % tabIds.length]
        setCreateTab(next)
        return
      }

      if (e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault()
        const idx = items.findIndex((i) => i.id === selectedItem.id)
        if (idx === -1) return
        const nextIdx =
          e.code === 'ArrowRight'
            ? (idx + 1) % items.length
            : (idx - 1 + items.length) % items.length
        const next = items[nextIdx]
        selectCatalogItem(next, false)
        return
      }

      if (e.code === 'Enter') {
        e.preventDefault()
        const current = items.find((i) => i.id === selectedItem.id) || items[0]
        if (current) await activateItem(current)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [createOpen, tab, items, selectedItem, gold, wood, stone, isProcessing, cosmeticSubTab])

  const myPlots = plots.filter((p) => p.owner)
  let myUsedArea = 0
  myPlots.forEach((p) => {
    const pw = p.width ?? 10
    const pd = p.depth ?? 10
    if (p.shapeType === 0 || p.shapeType === undefined) myUsedArea += 3.14159 * pw * pw
    else myUsedArea += pw * 2 * (pd * 2)
  })
  const hasMaxPlots = myPlots.length >= 5 || myUsedArea >= 1600

  function selectCatalogItem(item, activate) {
    if (isCraft) {
      setSelectedItem({
        type: 'crafted',
        id: item.id,
        costWood: item.costWood,
        costStone: item.costStone,
      })
    } else if (tab === 'trees') {
      setSelectedItem({ type: 'tree', id: item.id, shape: item.shape, cost: item.cost })
    } else if (tab === 'rocks') {
      setSelectedItem({ type: 'rock', id: item.id, rockShape: item.rockShape, cost: item.cost })
    } else if (tab === 'plots') {
      setSelectedItem({ type: 'plot', id: item.id, cost: item.cost })
    } else if (isHatTab) {
      setSelectedItem({ type: 'hat', id: item.id, cost: item.cost })
    } else {
      setSelectedItem({ type: 'dye', id: item.id, color: item.color, cost: item.cost })
    }
    if (activate) activateItem(item)
  }

  async function activateItem(item) {
    if (isProcessing) return

    if (isCraft) {
      const canAfford = wood >= item.costWood && stone >= item.costStone
      if (!canAfford) {
        const need = []
        if (wood < item.costWood) need.push(`${item.costWood - wood} more wood`)
        if (stone < item.costStone) need.push(`${item.costStone - stone} more stone`)
        flash(`need ${need.join(' and ')} for ${item.name}`)
        return
      }
      setSelectedItem({
        type: 'crafted',
        id: item.id,
        costWood: item.costWood,
        costStone: item.costStone,
      })
      close()
      setTimeout(() => useStore.getState().enterPlacement(), 10)
      return
    }

    if (isHatTab) {
      if (!online && item.id !== 'none') {
        flash('style purchases need online mode — free colours are in your profile')
        return
      }
      setIsProcessing(true)
      await useStore.getState().buyCosmetic('hat', item.id, null)
      setIsProcessing(false)
      return
    }

    if (isCosmeticTab && !isHatTab) {
      if (!online) {
        flash('avatar paints need online mode — free colours are in your profile')
        return
      }
      setIsProcessing(true)
      await useStore.getState().buyCosmetic(cosmeticSubTab, null, item.color)
      setIsProcessing(false)
      return
    }

    if (tab === 'plots' && hasMaxPlots) {
      flash('you have reached your plot limit')
      return
    }
    if (tab !== 'plots' && gold < (item.cost || 0) && item.cost > 0) {
      flash(`need ${item.cost} gold for ${item.name}`)
      return
    }

    setSelectedItem({
      type: tab === 'trees' ? 'tree' : tab === 'rocks' ? 'rock' : 'plot',
      id: item.id,
      shape: item.shape,
      rockShape: item.rockShape,
      cost: item.cost,
    })
    close()
    setTimeout(() => useStore.getState().enterPlacement(), 10)
  }

  const current =
    items.find((i) => i.id === selectedItem.id) || items[0] || { name: '—', emoji: '·', cost: 0 }

  const craftCanAfford =
    isCraft && current
      ? wood >= (current.costWood || 0) && stone >= (current.costStone || 0)
      : true

  /** Placeable catalog tabs: select on click, Place / Enter to commit. */
  const isPlaceableTab = isCraft || tab === 'trees' || tab === 'rocks' || tab === 'plots'

  let placeReady = false
  if (isCraft && current) placeReady = craftCanAfford
  else if (tab === 'plots') placeReady = !hasMaxPlots
  else if (tab === 'trees' || tab === 'rocks') {
    placeReady = gold >= (current.cost || 0) || (current.cost || 0) === 0
  }

  let footerInfo
  if (isCraft && current) {
    footerInfo = (
      <div className="craft-footer-preview">
        <span className="craft-footer-icon" aria-hidden="true">
          {current.icon}
        </span>
        <span>
          <b>{current.name}</b>
          {(current.costWood > 0 || current.costStone > 0) && (
            <span className="shop-hint-cost">
              {' '}
              · costs
              {current.costWood > 0 && (
                <span className={wood < current.costWood ? 'cost-short' : ''}>
                  {' '}
                  🪵 {current.costWood}
                  {wood < current.costWood ? ` (have ${wood})` : ''}
                </span>
              )}
              {current.costStone > 0 && (
                <span className={stone < current.costStone ? 'cost-short' : ''}>
                  {' '}
                  🪨 {current.costStone}
                  {stone < current.costStone ? ` (have ${stone})` : ''}
                </span>
              )}
            </span>
          )}
          {!craftCanAfford && (
            <span className="craft-footer-need"> · harvest more materials first</span>
          )}
        </span>
      </div>
    )
  } else if (current && isPlotTab) {
    footerInfo = (
      <>
        selected: <b>{current.emoji} {current.name}</b>
        <span className="shop-hint-cost">
          {' '}· from ~{current.cost}g · final price set by size when placing
        </span>
      </>
    )
  } else if (current) {
    footerInfo = (
      <>
        selected: <b>{current.emoji || current.icon} {current.name}</b>
        {current.cost > 0 && (
          <span className="shop-hint-cost">
            {' '}· costs <span className="shop-coin" /> {current.cost}
          </span>
        )}
        {current.cost === 0 && !isCosmeticTab && (
          <span className="shop-hint-cost"> · free</span>
        )}
      </>
    )
  }

  const footer = (
    <div className="create-footer-row">
      <div className="create-footer-info">
        {footerInfo}
        {isPlaceableTab && (
          <span className="shop-hint-key">Select a card · Place or Enter to put it in the world</span>
        )}
      </div>
      {isPlaceableTab && current && (
        <button
          type="button"
          className="btn create-place-btn"
          disabled={!placeReady || isProcessing}
          onClick={() => activateItem(current)}
        >
          Place
        </button>
      )}
      {isCosmeticTab && !isHatTab && current && (
        <button
          type="button"
          className="btn create-place-btn"
          disabled={isProcessing || (!online && true)}
          onClick={() => activateItem(current)}
        >
          Apply
        </button>
      )}
      {isHatTab && current && (
        <button
          type="button"
          className="btn create-place-btn"
          disabled={isProcessing || statusEquipped(current)}
          onClick={() => activateItem(current)}
        >
          Equip
        </button>
      )}
    </div>
  )

  function statusEquipped(item) {
    return (item.id === 'none' && !hatId) || hatId === item.id
  }

  return (
    <Modal
      open={createOpen}
      onClose={close}
      title="Create"
      titleId="create-hub-title"
      icon="✨"
      wide
      footer={footer}
    >
      <div className="create-wallet no-look" aria-label="Your resources">
        <span className="create-wallet-item" title="Wood">🪵 {wood}</span>
        <span className="create-wallet-item" title="Stone">🪨 {stone}</span>
        <span className="create-wallet-item" title="Gold">
          <span className="shop-coin" aria-hidden="true" /> {gold}
        </span>
      </div>
      {gold < 15 && (
        <p className="create-earn-tip" role="note">
          Low on gold? Walk to unexplored places (+20), water young saplings (+1), claim daily bonus in Settings, or harvest world trees for wood and rocks for stone.
        </p>
      )}

      <div className="shop-tabs create-tabs" role="tablist" aria-label="Create categories">
        {HUB_TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            className={`shop-tab${tab === t.id ? ' active' : ''}`}
            onClick={() => setCreateTab(t.id)}
          >
            <span aria-hidden="true">{t.icon}</span> {t.label}
          </button>
        ))}
      </div>

      {isCosmeticTab && (
        <div className="shop-tabs subtabs" role="tablist" aria-label="Style subcategories">
          {[
            { id: 'hats', label: 'Hats' },
            { id: 'head', label: 'Head' },
            { id: 'body', label: 'Body' },
            { id: 'legs', label: 'Legs' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              role="tab"
              aria-selected={cosmeticSubTab === s.id}
              className={`shop-tab${cosmeticSubTab === s.id ? ' active' : ''}`}
              onClick={() => setCosmeticSubTab(s.id)}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {isCosmeticTab && styleOnlineOnly && (
        <div className="create-offline-banner" role="status">
          <strong>Style is online-only.</strong>
          {' '}
          Join the shared meadow to buy hats and paints. Free pastel colours are still available in your profile (name button).
          {isHatTab && ' You can still remove a hat offline.'}
        </div>
      )}

      {isCosmeticTab && !isHatTab && !styleOnlineOnly && (
        <p className="create-style-hint" role="note">
          Avatar paints for your wanderer — different from tree leaf dyes (select a tree, then Dye).
        </p>
      )}

      {isCraft && (
        <p className="create-style-hint" role="note">
          Craft with wood & stone from cutting trees and breaking rocks. Grey cards need more materials.
        </p>
      )}

      <div className="shop-grid">
        {items.map((item) => {
          if (isCraft) {
            const canAfford = wood >= item.costWood && stone >= item.costStone
            const isSelected = selectedItem.id === item.id && selectedItem.type === 'crafted'
            return (
              <CatalogCard
                key={item.id}
                selected={isSelected}
                canAfford={canAfford}
                emoji={item.icon}
                name={item.name}
                desc={item.desc}
                ariaLabel={`${item.name}. ${item.desc}.`}
                costNode={
                  item.costWood === 0 && item.costStone === 0 ? (
                    <span className="shop-free">free</span>
                  ) : (
                    <div className="resource-cost-row">
                      {item.costWood > 0 && <span>🪵 {item.costWood}</span>}
                      {item.costStone > 0 && <span>🪨 {item.costStone}</span>}
                    </div>
                  )
                }
                onClick={() => selectCatalogItem(item, false)}
                onDoubleClick={() => {
                  selectCatalogItem(item, false)
                  if (canAfford) activateItem(item)
                  else {
                    const need = []
                    if (wood < item.costWood) need.push(`${item.costWood - wood} more wood`)
                    if (stone < item.costStone) need.push(`${item.costStone - stone} more stone`)
                    flash(`need ${need.join(' and ')} for ${item.name}`)
                  }
                }}
              />
            )
          }

          const itemType =
            tab === 'trees' ? 'tree' : tab === 'rocks' ? 'rock' : tab === 'plots' ? 'plot' : isHatTab ? 'hat' : 'dye'
          const isSelected = selectedItem.id === item.id && selectedItem.type === itemType
          const cantBuyPlot = itemType === 'plot' && hasMaxPlots
          const canAfford =
            itemType === 'plot'
              ? !hasMaxPlots
              : itemType === 'hat' || itemType === 'dye'
                ? true
                : gold >= (item.cost || 0)

          let status = 'none'
          if (itemType === 'hat') {
            if ((item.id === 'none' && !hatId) || hatId === item.id) status = 'equipped'
            else if (ownedCosmetics.includes(item.id) || item.id === 'none') status = 'owned'
          } else if (itemType === 'dye') {
            const activeColor =
              cosmeticSubTab === 'head' ? headColor : cosmeticSubTab === 'body' ? bodyColor : legColor
            if (activeColor === item.color) status = 'equipped'
            else if (ownedCosmetics.includes(item.color)) status = 'owned'
          }

          // Offline: lock paid cosmetics (E6). Free "No Hat" stays available.
          const offlineLocked =
            isCosmeticTab && !online && !(isHatTab && item.id === 'none')
          const canClick = canAfford && !cantBuyPlot && !offlineLocked

          return (
            <CatalogCard
              key={item.id}
              selected={isSelected}
              canAfford={canClick}
              isProcessing={isProcessing && isSelected}
              status={status}
              emoji={item.emoji}
              name={item.name}
              desc={offlineLocked ? 'Requires online mode' : item.desc}
              ariaLabel={`${item.name}. ${offlineLocked ? 'Requires online mode. ' : ''}${item.desc}.`}
              costNode={
                offlineLocked ? (
                  <span className="shop-free">online</span>
                ) : status === 'equipped' ? (
                  <span className="shop-free equipped">equipped</span>
                ) : status === 'owned' ? (
                  <span className="shop-free">owned</span>
                ) : itemType === 'plot' ? (
                  <span className="shop-free">from ~{item.cost}g</span>
                ) : item.cost === 0 ? (
                  <span className="shop-free">free</span>
                ) : (
                  <>
                    <span className="shop-coin" aria-hidden="true" />
                    <span>
                      {item.cost}
                      <span className="sr-only"> gold</span>
                    </span>
                  </>
                )
              }
              onClick={() => {
                if (cantBuyPlot || isProcessing || status === 'equipped') return
                if (offlineLocked) {
                  flash('style purchases need online mode — free colours are in your profile')
                  return
                }
                // Placeables: first click selects only (Place / Enter / double-click to commit).
                // Cosmetics: select then Equip/Apply in footer (or double-click).
                selectCatalogItem(item, false)
              }}
              onDoubleClick={async () => {
                if (cantBuyPlot || isProcessing || status === 'equipped') return
                if (offlineLocked) {
                  flash('style purchases need online mode — free colours are in your profile')
                  return
                }
                selectCatalogItem(item, false)
                await activateItem(item)
              }}
            />
          )
        })}
      </div>
    </Modal>
  )
}
