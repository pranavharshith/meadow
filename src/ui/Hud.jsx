import { useState, useEffect } from 'react'
import { useStore } from '../store'
import Minimap from './Minimap'
import Chat from './Chat'
import WorldMap from './WorldMap'
import Settings from './Settings'
import Screenshot from './Screenshot'
import CreateHub from './CreateHub'
import { TREE_ITEMS, ROCK_ITEMS, PLOT_ITEM } from '../catalog'
import TouchJoystick from './TouchJoystick'
import PlaceLabel from './PlaceLabel'
import Status from './Status'
import Identity from './Identity'
import Social from './Social'
import Toast from './Toast'
import PlacementBanner from './PlacementBanner'
import ActionPill from './ActionPill'
import NavIndicator from './NavIndicator'
import PlotCustomizer from './PlotCustomizer'
import Compass from './Compass'
import FirstWalkQuest from './FirstWalkQuest'
import MobileActionBar from './MobileActionBar'
import ProgressPanel from './ProgressPanel'

const VIEW_LABEL = { third: 'Follow', first: 'First person', top: 'Map', drone: 'Drone' }

export default function Hud() {
  const gold = useStore((s) => s.gold)
  const friendRequests = useStore((s) => s.friendRequests) || []
  const wood = useStore((s) => s.wood)
  const stone = useStore((s) => s.stone)
  const view = useStore((s) => s.viewMode)
  const name = useStore((s) => s.name)
  const color = useStore((s) => s.color)
  const cycleView = useStore((s) => s.cycleView)
  const plantTree = useStore((s) => s.plantTree)
  const keybinds = useStore((s) => s.keybinds)
  const formatKey = (c) => {
    if (!c) return ''
    if (c.startsWith('Key')) return c.slice(3)
    if (c.startsWith('Arrow')) return c.slice(5)
    return c
  }
  const moveKeys = `${formatKey(keybinds.forward)}${formatKey(keybinds.left)}${formatKey(keybinds.backward)}${formatKey(keybinds.right)}`
  const cutSelection = useStore((s) => s.cutSelection)
  const selection = useStore((s) => s.selection)
  const createOpen = useStore((s) => s.createOpen)
  const setCreateOpen = useStore((s) => s.setCreateOpen)
  const teleportFlash = useStore((s) => s.teleportFlash)
  const socialOpen = useStore((s) => s.socialOpen)
  const setSocialOpen = useStore((s) => s.setSocialOpen)
  const selectedItem = useStore((s) => s.selectedItem)
  const profileModal = useStore((s) => s.profileModal)
  const [editing, setEditing] = useState(false)
  const [seen, setSeen] = useState(false)
  const [chatOpenRequest, setChatOpenRequest] = useState(0)

  useEffect(() => {
    if (profileModal === 'me') {
      setEditing(true)
      useStore.getState().setProfileModal(null)
    }
  }, [profileModal])

  const isPlot = selectedItem.type === 'plot'
  const isRock = selectedItem.type === 'rock'
  const isCrafted = selectedItem.type === 'crafted'
  const allItems = isRock ? ROCK_ITEMS : isPlot ? [] : isCrafted ? [] : TREE_ITEMS
  const currentItem = isPlot
    ? { name: 'Plot', emoji: '📌' }
    : isCrafted
      ? { name: 'Craft', emoji: '🔨' }
      : (allItems.find((i) => i.id === selectedItem.id) || allItems[0] || { name: 'Item', emoji: '·' })
  const plantLabel = isPlot
    ? 'Claim Plot 📌'
    : isRock
      ? `Place ${currentItem.emoji}`
      : isCrafted
        ? 'Place craft'
        : `Plant ${currentItem.emoji}`

  return (
    <div className="ui" id="game-ui">
      <div className="topbar">
        <div className="brand">
          <div className="title">a shared garden</div>
          <div className="who no-look">
            <button
              type="button"
              className="tag"
              onClick={() => setEditing((v) => !v)}
              title="edit profile & identity"
              aria-expanded={editing}
              aria-haspopup="dialog"
            >
              <span className="dot" style={{ '--dot-color': color }} aria-hidden="true" />
              <span className="tag-name">{name}</span>
            </button>
            <button
              type="button"
              className={`tag social-tag has-badge${socialOpen ? ' active' : ''}`}
              onClick={() => setSocialOpen(!socialOpen)}
              title="Friends & Social"
              aria-expanded={socialOpen}
              aria-haspopup="dialog"
            >
              <span className="social-tag-full">Social</span>
              <span className="social-tag-short" aria-hidden="true">👥</span>
              {friendRequests.length > 0 && (
                <span className="badge" aria-label={`${friendRequests.length} friend requests`}>
                  {friendRequests.length}
                </span>
              )}
            </button>
            <div className="resource-pill" title={`Wood ${wood} · Stone ${stone} · Gold ${gold}`}>
              <span className="resource-bit">🪵 {wood}</span>
              <span className="resource-sep" aria-hidden="true">·</span>
              <span className="resource-bit">🪨 {stone}</span>
              <span className="resource-sep" aria-hidden="true">·</span>
              <span className="resource-bit resource-gold">
                <span className="coin" aria-hidden="true" /> {gold}
              </span>
            </div>
            <Status />
          </div>
          <Identity open={editing} onClose={() => setEditing(false)} />
          <Social />
        </div>
        <div className="topbar-right">
          <Minimap />
          <Compass />
        </div>
      </div>

      <PlaceLabel />
      <div className="ui-queue no-look">
        <Toast />
        {/* Placement first so it stacks above soft quests when both would show */}
        <PlacementBanner />
        <PlotCustomizer />
        <FirstWalkQuest />
        <ActionPill selection={selection} onCut={cutSelection} />
      </div>

      {!seen && (
        <button className="hint no-look" onClick={() => setSeen(true)} title="Dismiss hint">
          <span>drag look</span>
          <span><b>{moveKeys}</b> walk</span>
          <span><b>V</b> view</span>
          <span><b>C</b> sit</span>
          <span><b>F</b> wave</span>
          <span><b>E</b> plant/place</span>
          <span className="hint-wide"><b>R</b> water</span>
          <span className="hint-wide">click item then <b>X</b> cut/break</span>
          <span className="hint-wide"><b>G</b> create · <b>Q</b> craft</span>
          <span className="hint-wide"><b>Enter</b> chat</span>
        </button>
      )}

      <div className="controls desktop-controls">
        <div className="buttons no-look" role="toolbar" aria-label="Game actions">
          <button type="button" className="btn" onClick={cycleView} aria-label={`Camera view: ${VIEW_LABEL[view]}`}>
            {VIEW_LABEL[view]}
          </button>
          <button type="button" className="btn plant" onClick={plantTree} title="Plant / Place selected item (E)">
            {plantLabel}
          </button>
          <button
            type="button"
            className={`btn shop-btn create-btn${createOpen ? ' active' : ''}`}
            onClick={() => setCreateOpen(!createOpen, createOpen ? undefined : 'trees')}
            title="Create hub (G) — trees, craft, land, style"
            aria-expanded={createOpen}
            aria-haspopup="dialog"
          >
            Create
          </button>
          <Screenshot />
          <Settings />
        </div>
      </div>

      <MobileActionBar
        plantLabel={plantLabel}
        onOpenChat={() => setChatOpenRequest((n) => n + 1)}
      />

      <Chat openSignal={chatOpenRequest} />
      <CreateHub />
      <WorldMap />
      <NavIndicator />
      <ProgressPanel />
      <TouchJoystick />

      <div
        className={`teleport-flash no-look${teleportFlash ? ' active' : ''}`}
        aria-hidden="true"
      />
    </div>
  )
}
