import { useState } from 'react'
import { useStore } from '../store'
import Minimap from './Minimap'
import Chat from './Chat'
import WorldMap from './WorldMap'
import Settings from './Settings'
import Screenshot from './Screenshot'
import Compass from './Compass'
import Shop, { TREE_ITEMS, ROCK_ITEMS } from './Shop'
import TouchJoystick from './TouchJoystick'
import PlaceLabel from './PlaceLabel'
import Status from './Status'
import Identity from './Identity'
import Toast from './Toast'
import PlacementBanner from './PlacementBanner'
import CutAction from './CutAction'
import NavIndicator from './NavIndicator'

const VIEW_LABEL = { third: 'Follow', first: 'First person', top: 'Map' }

export default function Hud() {
  const gold = useStore((s) => s.gold)
  const view = useStore((s) => s.viewMode)
  const name = useStore((s) => s.name)
  const color = useStore((s) => s.color)
  const cycleView = useStore((s) => s.cycleView)
  const plantTree = useStore((s) => s.plantTree)
  const cutSelection = useStore((s) => s.cutSelection)
  const selection = useStore((s) => s.selection)
  const shopOpen = useStore((s) => s.shopOpen)
  const setShopOpen = useStore((s) => s.setShopOpen)
  const selectedItem = useStore((s) => s.selectedItem)
  const [seen, setSeen] = useState(false)
  const [editing, setEditing] = useState(false)

  const isRock = selectedItem.type === 'rock'
  const allItems = isRock ? ROCK_ITEMS : TREE_ITEMS
  const currentItem = allItems.find((i) => i.id === selectedItem.id) || allItems[0]
  const plantLabel = isRock ? `Place ${currentItem.emoji}` : `Plant ${currentItem.emoji}`

  return (
    <div className="ui">
      <div className="topbar">
        <div className="brand">
          <div className="title">a shared garden</div>
          <div className="who no-look">
            <button className="tag" onClick={() => setEditing((v) => !v)} title="edit name & colour">
              <span className="dot" style={{ background: color }} />
              {name}
            </button>
            <div className="gold">
              <span className="coin" /> {gold}
            </div>
            <Status />
          </div>
          <Identity open={editing} onClose={() => setEditing(false)} />
        </div>
        <Minimap />
        <Compass />
      </div>

      <PlaceLabel />
      <Toast />
      <PlacementBanner />
      <CutAction selection={selection} onCut={cutSelection} />

      {!seen && (
        <button className="hint no-look" onClick={() => setSeen(true)} title="Dismiss hint">
          <span>drag look</span>
          <span><b>WASD</b> walk</span>
          <span><b>V</b> view</span>
          <span><b>E</b> plant/place</span>
          <span className="hint-wide"><b>R</b> water</span>
          <span className="hint-wide">click item then <b>X</b> cut</span>
          <span className="hint-wide"><b>G</b> shop</span>
          <span className="hint-wide"><b>Enter</b> chat</span>
        </button>
      )}

      <div className="controls">
        <div className="buttons no-look">
          <button className="btn" onClick={cycleView}>
            {VIEW_LABEL[view]}
          </button>
          <button className="btn plant" onClick={plantTree} title="Plant / Place selected item (E)">
            {plantLabel}
          </button>
          <button
            className={`btn shop-btn${shopOpen ? ' active' : ''}`}
            onClick={() => setShopOpen(!shopOpen)}
            title="Nature Shop (G)"
          >
            Shop
          </button>
          <Screenshot />
          <Settings />
        </div>
      </div>

      <Chat />
      <Shop />
      <WorldMap />
      <NavIndicator />
      <TouchJoystick />
    </div>
  )
}
