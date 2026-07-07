import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { supabase, ONLINE } from './supabase'
import { bridge } from './bridge'
import { regionOf, regionChannel, REGION } from './region'
import { remotePlayers, netStatus } from './state'
import { P } from '../player-state'
import { useStore } from '../store'

const POS_HZ = 10

// Orchestrates the whole online layer: anonymous identity, profile persistence,
// per-region presence + position broadcast, streamed trees, and chat. Renders
// nothing. When Supabase isn't configured it immediately bails and the game
// stays fully offline.
export default function Net() {
  const meId = useRef(null)
  const channelRef = useRef(null)
  const regionRef = useRef(null)
  const worldRef = useRef(null)
  const acc = useRef(0)
  const saveTimer = useRef(null)
  const switchingRef = useRef(false)
  const joinRegionRef = useRef(async () => {})

  useEffect(() => {
    if (!ONLINE) {
      useStore.getState().setOnline(false)
      return
    }

    let disposed = false

    const receivePos = (payload) => {
      if (!payload || payload.id === meId.current) return
      let rp = remotePlayers.get(payload.id)
      if (!rp) {
        rp = {
          id: payload.id,
          name: payload.name || 'wanderer',
          color: payload.color || '#a9d98a',
          x: payload.x,
          z: payload.z,
          yaw: payload.yaw || 0,
          tx: payload.x,
          tz: payload.z,
          tyaw: payload.yaw || 0,
          emote: null,
          msg: '',
          msgUntil: 0,
        }
        remotePlayers.set(payload.id, rp)
      }
      rp.tx = payload.x
      rp.tz = payload.z
      rp.tyaw = payload.yaw || 0
      rp.emote = payload.emote || null
      if (payload.name) rp.name = payload.name
      if (payload.color) rp.color = payload.color
    }

    const receiveChat = (payload, scope) => {
      if (!payload) return
      // regional bubble over the speaker
      if (scope === 'region' && payload.id && payload.id !== meId.current) {
        const rp = remotePlayers.get(payload.id)
        if (rp) {
          rp.msg = payload.text
          rp.msgUntil = performance.now() + 6000
        }
      }
      if (payload.id === meId.current) return // we already showed our own
      useStore.getState().addChatMessage({
        id: payload.mid || Math.random().toString(36).slice(2),
        scope,
        name: payload.name,
        color: payload.color,
        text: payload.text,
        at: Date.now(),
      })
    }

    const receiveTree = (payload) => {
      if (!payload || payload.owner_id === meId.current) return
      useStore.getState().addTree({
        id: payload.id,
        x: payload.x,
        z: payload.z,
        variant: payload.variant,
        scale: payload.scale,
        plantedAt: payload.planted_at ? new Date(payload.planted_at).getTime() : Date.now(),
      })
    }

    async function loadRegionTrees(rx, rz) {
      const { data, error } = await supabase
        .from('trees')
        .select('*')
        .eq('region_x', rx)
        .eq('region_z', rz)
        .limit(2000)
      if (error || disposed) return
      const trees = (data || []).map((t) => ({
        id: t.id,
        x: t.x,
        z: t.z,
        variant: t.variant,
        scale: t.scale,
        plantedAt: t.planted_at ? new Date(t.planted_at).getTime() : Date.now(),
        owner: t.owner_id === meId.current,
      }))
      useStore.getState().setTrees(trees)
    }

    async function joinRegion(rx, rz) {
      // leave the previous region channel
      if (channelRef.current) {
        try {
          await supabase.removeChannel(channelRef.current)
        } catch {
          /* ignore */
        }
        channelRef.current = null
      }
      remotePlayers.clear()

      const name = useStore.getState().name
      const color = useStore.getState().color
      const ch = supabase.channel(regionChannel(rx, rz), {
        config: { presence: { key: meId.current }, broadcast: { self: false } },
      })
      ch.on('broadcast', { event: 'pos' }, ({ payload }) => receivePos(payload))
      ch.on('broadcast', { event: 'chat' }, ({ payload }) => receiveChat(payload, 'region'))
      ch.on('broadcast', { event: 'tree' }, ({ payload }) => receiveTree(payload))
      ch.on('presence', { event: 'sync' }, () => {
        const st = ch.presenceState()
        netStatus.count = Object.keys(st).length || 1
        useStore.getState().setPlayerCount(netStatus.count)
      })
      ch.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences || []) {
          const id = p.id || p.key
          if (id) remotePlayers.delete(id)
        }
      })
      ch.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await ch.track({ id: meId.current, name, color })
        }
      })
      channelRef.current = ch
      regionRef.current = `${rx}:${rz}`
      netStatus.region = regionRef.current
      loadRegionTrees(rx, rz)
    }
    joinRegionRef.current = joinRegion

    async function init() {
      // anonymous identity (persisted by supabase-js in localStorage)
      let { data: sess } = await supabase.auth.getSession()
      if (!sess.session) {
        const { data, error } = await supabase.auth.signInAnonymously()
        if (error) {
          useStore.getState().setOnline(false)
          return
        }
        sess = data
      }
      const user = (await supabase.auth.getUser()).data.user
      if (!user || disposed) return
      meId.current = user.id

      // load or create profile
      const { data: prof } = await supabase.from('players').select('*').eq('id', user.id).single()
      if (prof) {
        useStore.getState().hydrateProfile({ gold: prof.gold, name: prof.name, color: prof.color })
      } else {
        const s = useStore.getState()
        await supabase.from('players').insert({
          id: user.id,
          name: s.name,
          color: s.color,
          gold: s.gold,
        })
      }

      // wire the bridge so the store can reach the network
      bridge.online = true
      bridge.saveProfile = () => {
        clearTimeout(saveTimer.current)
        saveTimer.current = setTimeout(async () => {
          const s = useStore.getState()
          await supabase
            .from('players')
            .update({ name: s.name, color: s.color, gold: s.gold, updated_at: new Date().toISOString() })
            .eq('id', meId.current)
        }, 800)
      }
      bridge.plant = async (tree) => {
        const { rx, rz } = regionOf(tree.x, tree.z)
        await supabase.from('trees').insert({
          id: tree.id,
          owner_id: meId.current,
          region_x: rx,
          region_z: rz,
          x: tree.x,
          z: tree.z,
          variant: tree.variant,
          scale: tree.scale,
          planted_at: new Date(tree.plantedAt).toISOString(),
        })
        if (channelRef.current) {
          channelRef.current.send({
            type: 'broadcast',
            event: 'tree',
            payload: { ...tree, owner_id: meId.current, planted_at: new Date(tree.plantedAt).toISOString() },
          })
        }
      }
      bridge.sendChat = (scope, text) => {
        const s = useStore.getState()
        const payload = { id: meId.current, mid: Math.random().toString(36).slice(2), name: s.name, color: s.color, text }
        const target = scope === 'world' ? worldRef.current : channelRef.current
        if (!target) return false
        target.send({ type: 'broadcast', event: 'chat', payload })
        return true
      }

      // world chat channel (always on)
      const world = supabase.channel('world', { config: { broadcast: { self: false } } })
      world.on('broadcast', { event: 'chat' }, ({ payload }) => receiveChat(payload, 'world'))
      world.subscribe()
      worldRef.current = world

      useStore.getState().setOnline(true)
      netStatus.online = true
      netStatus.ready = true

      const { rx, rz } = regionOf(P.pos.x, P.pos.z)
      joinRegion(rx, rz)
    }

    init()

    return () => {
      disposed = true
      bridge.online = false
      bridge.saveProfile = () => {}
      bridge.plant = () => {}
      bridge.sendChat = () => false
      clearTimeout(saveTimer.current)
      if (channelRef.current) supabase.removeChannel(channelRef.current)
      if (worldRef.current) supabase.removeChannel(worldRef.current)
      remotePlayers.clear()
    }
  }, [])

  // position broadcast + region switching
  useFrame((_, dt) => {
    if (!netStatus.online || !channelRef.current) return

    // switch region when the player crosses a boundary
    const { rx, rz } = regionOf(P.pos.x, P.pos.z)
    const key = `${rx}:${rz}`
    if (key !== regionRef.current && !switchingRef.current) {
      switchingRef.current = true
      Promise.resolve(joinRegionRef.current(rx, rz)).finally(() => {
        switchingRef.current = false
      })
    }

    acc.current += dt
    if (acc.current >= 1 / POS_HZ) {
      acc.current = 0
      channelRef.current.send({
        type: 'broadcast',
        event: 'pos',
        payload: {
          id: meId.current,
          x: +P.pos.x.toFixed(2),
          z: +P.pos.z.toFixed(2),
          yaw: +P.avatarYaw.toFixed(2),
          emote: P.emote,
        },
      })
    }
  })

  return null
}
