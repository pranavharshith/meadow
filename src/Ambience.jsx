import { useEffect, useRef } from 'react'
import { useStore } from './store'

// Asset-free ambience via WebAudio: a soft filtered-noise wind bed with a slow
// LFO, plus occasional gentle pentatonic chimes. Starts on the first user
// gesture (autoplay policy) and respects the mute toggle.
export default function Ambience() {
  const muted = useStore((s) => s.muted)
  const ctxRef = useRef(null)
  const masterRef = useRef(null)

  useEffect(() => {
    let chimeTimer = null

    const start = () => {
      if (ctxRef.current) return
      const AC = window.AudioContext || window.webkitAudioContext
      if (!AC) return
      const ctx = new AC()
      ctxRef.current = ctx

      const master = ctx.createGain()
      master.gain.value = useStore.getState().muted ? 0 : 0.9
      master.connect(ctx.destination)
      masterRef.current = master

      // wind: brown-ish noise -> lowpass (LFO-modulated) -> gain
      const len = ctx.sampleRate * 2
      const buf = ctx.createBuffer(1, len, ctx.sampleRate)
      const data = buf.getChannelData(0)
      let last = 0
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1
        last = (last + 0.02 * w) / 1.02
        data[i] = last * 3.2
      }
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.loop = true
      const lp = ctx.createBiquadFilter()
      lp.type = 'lowpass'
      lp.frequency.value = 450
      const wind = ctx.createGain()
      wind.gain.value = 0.13
      src.connect(lp)
      lp.connect(wind)
      wind.connect(master)
      src.start()

      const lfo = ctx.createOscillator()
      lfo.frequency.value = 0.08
      const lfoGain = ctx.createGain()
      lfoGain.gain.value = 180
      lfo.connect(lfoGain)
      lfoGain.connect(lp.frequency)
      lfo.start()

      const notes = [523.25, 587.33, 659.25, 783.99, 880.0]
      const chime = () => {
        const o = ctx.createOscillator()
        o.type = 'sine'
        o.frequency.value = notes[(Math.random() * notes.length) | 0]
        const g = ctx.createGain()
        o.connect(g)
        g.connect(master)
        const now = ctx.currentTime
        g.gain.setValueAtTime(0.0001, now)
        g.gain.linearRampToValueAtTime(0.05, now + 0.06)
        g.gain.exponentialRampToValueAtTime(0.0001, now + 2.6)
        o.start(now)
        o.stop(now + 2.7)
        chimeTimer = setTimeout(chime, 6000 + Math.random() * 12000)
      }
      chimeTimer = setTimeout(chime, 4000)
    }

    window.addEventListener('pointerdown', start)
    window.addEventListener('keydown', start)
    return () => {
      window.removeEventListener('pointerdown', start)
      window.removeEventListener('keydown', start)
      if (chimeTimer) clearTimeout(chimeTimer)
      if (ctxRef.current) ctxRef.current.close()
    }
  }, [])

  useEffect(() => {
    if (masterRef.current) masterRef.current.gain.value = muted ? 0 : 0.9
  }, [muted])

  return null
}
