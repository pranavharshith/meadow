import { useEffect, useState } from 'react'
import { placement } from '../player-state'
import { useStore } from '../store'

export default function PlotCustomizer() {
  const mode = useStore((s) => s.placementMode)
  const subject = useStore((s) => s.placementSubject)
  const confirm = useStore((s) => s.confirmPlacement)
  const cancel = useStore((s) => s.cancelPlacement)
  const updateCustomPlot = useStore((s) => s.updateCustomPlot)
  const gold = useStore((s) => s.gold)
  const plots = useStore((s) => s.plots)

  const [status, setStatus] = useState({ valid: true, reason: '' })

  useEffect(() => {
    if (mode !== 'plot') return
    const id = window.setInterval(() => {
      setStatus({ valid: placement.valid, reason: placement.reason })
    }, 120)
    return () => window.clearInterval(id)
  }, [mode])

  if (mode !== 'plot' || !subject) return null

  const w = subject.width || 20
  const d = subject.depth || 20
  
  let cost = 0
  let newArea = 0
  if (subject.shapeType === 0) {
    newArea = 3.14159 * w * w
    cost = Math.round(newArea * 0.8)
  } else {
    newArea = (w * 2) * (d * 2)
    cost = Math.round(newArea * 0.15)
  }

  const myPlots = plots.filter((p) => p.owner)
  let myUsedArea = 0
  myPlots.forEach((p) => {
    const pw = p.width ?? 10
    const pd = p.depth ?? 10
    if (p.shapeType === 0 || p.shapeType === undefined) myUsedArea += 3.14159 * pw * pw
    else myUsedArea += (pw * 2) * (pd * 2)
  })

  const maxArea = 1600
  const areaOk = (myUsedArea + newArea) <= maxArea
  const canAfford = gold >= cost

  const handleShapeChange = (shape) => {
    if (shape === 0) {
      updateCustomPlot(0, Math.min(Math.max(w, 5), 20), d)
    } else {
      updateCustomPlot(1, Math.min(Math.max(w, 10), 40), Math.min(Math.max(d, 10), 40))
    }
  }

  return (
    <div className="plot-customizer no-look">
      <div className="pc-header">
        <h2>Customize Your Plot</h2>
        <div className="pc-cost">
          <span className="coin" /> {cost}
        </div>
      </div>
      <div className={`pc-quota${areaOk ? '' : ' over'}`}>
        Land Quota: {Math.round(myUsedArea + newArea)} / {maxArea} sqm
      </div>

      <div className="pc-body">
        <div className="pc-field">
          <label>Shape</label>
          <div className="pc-toggle">
            <button className={subject.shapeType === 0 ? 'active' : ''} onClick={() => handleShapeChange(0)}>Circle</button>
            <button className={subject.shapeType === 1 ? 'active' : ''} onClick={() => handleShapeChange(1)}>Rectangle</button>
          </div>
        </div>

        {subject.shapeType === 0 ? (
          <div className="pc-field">
            <label>Radius: {w}m</label>
            <input 
              type="range" min="5" max="20" step="1" 
              value={w} 
              onChange={(e) => updateCustomPlot(0, parseFloat(e.target.value), d)} 
            />
          </div>
        ) : (
          <>
            <div className="pc-field">
              <label>Width: {w}m</label>
              <input 
                type="range" min="10" max="40" step="1" 
                value={w} 
                onChange={(e) => updateCustomPlot(1, parseFloat(e.target.value), d)} 
              />
            </div>
            <div className="pc-field">
              <label>Depth: {d}m</label>
              <input 
                type="range" min="10" max="40" step="1" 
                value={d} 
                onChange={(e) => updateCustomPlot(1, w, parseFloat(e.target.value))} 
              />
            </div>
          </>
        )}
      </div>

      <div className="pc-footer">
        <div className="pc-status">
          {!canAfford ? 'Not enough gold' : !areaOk ? 'Quota exceeded' : status.valid ? 'Good spot' : status.reason || 'Blocked'}
        </div>
        <div className="pc-actions">
          <button className="pc-cancel" onClick={cancel}>Cancel</button>
          <button 
            className="pc-confirm" 
            disabled={!status.valid || !canAfford || !areaOk}
            onClick={() => { if (status.valid && canAfford && areaOk) confirm() }}
          >
            Purchase
          </button>
        </div>
      </div>
    </div>
  )
}
