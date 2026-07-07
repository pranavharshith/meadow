import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { supabase, ONLINE } from './supabase'
import { bridge } from './bridge'
import {
  regionOf, regionChannel, regionChatChannel,
  isDeepInRegion, shardFor,
} from './region'
import { remotePlayers, netStatus } from './state'
import { P } from '../player-state'
import { useStore } from '../store'
import { isMuted, toggleMute as toggleMuteLocal } from './moderation'
import { getCaptchaToken } from './captcha'

const POS_HZ = 10

// Orchestrates the online layer: anonymous identity, RPC-mediated state,
// per-region presence + broadcast (sharded), streamed trees, and chat.
// Renders nothing.
export default function Net() {
  const meId = useRef(null)
  const shardRef = useRef(0)
  const posChannelRef = useRef(null)   // sharded: presence, pos, tree
  const chatChannelRef = useRef(null)  // region-wide: chat + head count
  const worldRef = useRef(null)        // global: world chat (server-emitted)
  const regionRef = useRef(null)
  const acc = useRef(0)
  const identityTimer = useRef(null)
  const switchingRef = useRef(false)
  const joinRegionRef = useRef(async () => {})

  useEffect(() => {
    if (!ONLINE) {
      useStore.getState().setOnline(false)
      // Expose local mute controls even offline (though there's no one to mute)
      bridge.isMuted = isMuted
      bridge.toggleMute = toggleMuteLocal
      return
    }

    let disposed = false

    // ---------- receivers ----------
    const receivePos = (payload) => {
      if (!payload || payload.id === meId.current) return
      if (isMuted(payload.id)) return // still track presence, just don't render
      let rp = remotePlayers.get(payload.id)
      if (!rp) {
        rp = {
          id: payload.id,
          name: payload.name || 'wanderer',
          color: payload.color || '#a9d98a',
          x: payload.x, z: payload.z, yaw: payload.yaw || 0,
          tx: payload.x, tz: payload.z, tyaw: payload.yaw || 0,
          emote: null, msg: '', msgUntil: 0,
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
      if (payload.id === meId.current) return
      if (isMuted(payload.id)) return // silently drop

      if (scope === 'region' && payload.id) {
        const rp = remotePlayers.get(payload.id)
        if (rp) {
          rp.msg = payload.text
          rp.msgUntil = performance.now() + 6000
        }
      }
      useStore.getState().addChatMessage({
        id: payload.mid || Math.random().toString(36).slice(2),
        userId: payload.id,
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
        shape: payload.shape || 0,
        scale: payload.scale,
        plantedAt: payload.planted_at ? new Date(payload.planted_at).getTime() : Date.now(),
      })
    }

    // A remote peer cut one of their own trees. Remove it locally so the
    // scene stays in sync without a full region reload.
    const receiveCut = (payload) => {
      if (!payload || !payload.id || payload.owner_id === meId.current) return
      useStore.getState().removeTreeLocal(payload.id)
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
        shape: t.shape || 0,
        scale: t.scale,
        plantedAt: t.planted_at ? new Date(t.planted_at).getTime() : Date.now(),
        owner: t.owner_id === meId.current,
      }))
      useStore.getState().setTrees(trees)
    }

    async function joinRegion(rx, rz) {
      // Tear down previous region channels
      if (posChannelRef.current) {
        try { await supabase.removeChannel(posChannelRef.current) } catch {}
        posChannelRef.current = null
      }
      if (chatChannelRef.current) {
        try { await supabase.removeChannel(chatChannelRef.current) } catch {}
        chatChannelRef.current = null
      }
      remotePlayers.clear()

      const name = useStore.getState().name
      const color = useStore.getState().color
      const shard = shardRef.current

      // --- sharded pos/tree channel: presence-lite, position, tree events ---
      const posCh = supabase.channel(regionChannel(rx, rz, shard), {
        config: { broadcast: { self: false } },
      })
      posCh.on('broadcast', { event: 'pos' }, ({ payload }) => receivePos(payload))
      posCh.on('broadcast', { event: 'tree' }, ({ payload }) => receiveTree(payload))
      posCh.on('broadcast', { event: 'cut' }, ({ payload }) => receiveCut(payload))
      posCh.on('presence', { event: 'leave' }, ({ leftPresences }) => {
        for (const p of leftPresences || []) {
          const id = p.id || p.key
          if (id) remotePlayers.delete(id)
        }
      })
      posCh.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await posCh.track({ id: meId.current })
        }
      })
      posChannelRef.current = posCh

      // --- region-wide chat + authoritative head count (un-sharded) ---
      const chatCh = supabase.channel(regionChatChannel(rx, rz), {
        config: { presence: { key: meId.current }, broadcast: { self: false } },
      })
      chatCh.on('broadcast', { event: 'chat' }, ({ payload }) => receiveChat(payload, 'region'))
      chatCh.on('presence', { event: 'sync' }, () => {
        const st = chatCh.presenceState()
        netStatus.count = Object.keys(st).length || 1
        useStore.getState().setPlayerCount(netStatus.count)
      })
      chatCh.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await chatCh.track({ id: meId.current, name, color })
        }
      })
      chatChannelRef.current = chatCh

      regionRef.current = `${rx}:${rz}`
      netStatus.region = regionRef.current
      loadRegionTrees(rx, rz)
    }
    joinRegionRef.current = joinRegion

    function subscribeWorld() {
      if (worldRef.current) {
        try { supabase.removeChannel(worldRef.current) } catch {}
      }
      // Server (send_world_chat RPC) emits 'chat' events into this topic via
      // realtime.send(). Clients are receive-only here — no client emits.
      const world = supabase.channel('world', { config: { broadcast: { self: false } } })
      world.on('broadcast', { event: 'chat' }, ({ payload }) => receiveChat(payload, 'world'))
      world.subscribe()
      worldRef.current = world
    }

    // ---------- init ----------
    async function init() {
      // anonymous identity (persisted by supabase-js in localStorage)
      let { data: sess } = await supabase.auth.getSession()
      if (!sess.session) {
        // Optional captcha token — null when Turnstile isn't configured.
        const captchaToken = await getCaptchaToken()
        const opts = captchaToken ? { options: { captchaToken } } : undefined
        const { data, error } = await supabase.auth.signInAnonymously(opts)
        if (error) {
          useStore.getState().setOnline(false)
          return
        }
        sess = data
      }
      const user = (await supabase.auth.getUser()).data.user
      if (!user || disposed) return
      meId.current = user.id
      shardRef.current = shardFor(user.id)

      // Ensure a player row exists and hydrate from server truth
      const s0 = useStore.getState()
      const { data: prof, error: profErr } = await supabase.rpc('ensure_profile', {
        p_name: s0.name,
        p_color: s0.color,
      })
      if (profErr) {
        console.warn('ensure_profile failed', profErr.message)
        useStore.getState().setOnline(false)
        return
      }
      if (prof) {
        useStore.getState().hydrateProfile({
          gold: prof.gold,
          name: prof.name,
          color: prof.color,
          discovered: prof.discovered || [],
        })
      }

      // ---------- bridge wiring: all mutations go through RPCs ----------
      bridge.online = true
      bridge.isMuted = isMuted
      bridge.toggleMute = toggleMuteLocal

      bridge.saveIdentity = async (name, color) => {
        clearTimeout(identityTimer.current)
        identityTimer.current = setTimeout(async () => {
          const { data, error } = await supabase.rpc('update_profile', {
            p_name: name,
            p_color: color,
          })
          if (!error && data) {
            useStore.getState().hydrateProfile({ name: data.name, color: data.color })
          }
        }, 400)
      }

      bridge.plant = async (tree) => {
        const { data, error } = await supabase.rpc('plant_tree', {
          p_id: tree.id,
          p_x: tree.x,
          p_z: tree.z,
          p_variant: tree.variant,
          p_shape: tree.shape || 0,
          p_scale: tree.scale,
        })
        if (error) return { ok: false, error: error.message }
        // broadcast so nearby players see it immediately (only if joined).
        // Peers on other shards of the same region will miss the broadcast
        // and pick it up on their next region-trees reload — acceptable.
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: 'tree',
            payload: {
              ...tree,
              owner_id: meId.current,
              planted_at: new Date(tree.plantedAt).toISOString(),
            },
          })
        }
        return { ok: true, gold: data ? data.gold : undefined }
      }

      bridge.water = async (treeId) => {
        const { data, error } = await supabase.rpc('water_tree', { p_tree_id: treeId })
        if (error) return { ok: false, error: error.message }
        return { ok: true, gold: data } // scalar integer
      }

      bridge.cut = async (treeId) => {
        const { data, error } = await supabase.rpc('cut_tree', { p_tree_id: treeId })
        if (error) return { ok: false, error: error.message }
        // Tell same-shard peers to drop this tree from their local state.
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: 'cut',
            payload: { id: treeId, owner_id: meId.current },
          })
        }
        return { ok: true, gold: data } // scalar integer
      }

      bridge.discover = async (landmarkId) => {
        const { data, error } = await supabase.rpc('discover_landmark', {
          p_landmark_id: landmarkId,
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true, gold: data }
      }

      bridge.claimDaily = async () => {
        const { data, error } = await supabase.rpc('claim_daily_bonus')
        if (error) return { ok: false, error: error.message }
        return { ok: true, gold: data }
      }

      bridge.sendChat = async (scope, text) => {
        if (scope === 'world') {
          // Server RPC pays, rate-limits, AND emits the broadcast itself
          // via realtime.send(). Client is receive-only for world chat now.
          const { data, error } = await supabase.rpc('send_world_chat', { p_text: text })
          if (error) return { ok: false, error: error.message }
          return { ok: true, gold: data }
        }
        // Region chat: server rate-limits, client broadcasts on the
        // region-wide chat channel so all shards receive it.
        const { error } = await supabase.rpc('check_region_chat', { p_text: text })
        if (error) return { ok: false, error: error.message }
        const s = useStore.getState()
        const payload = {
          id: meId.current,
          mid: Math.random().toString(36).slice(2),
          name: s.name,
          color: s.color,
          text,
        }
        const target = chatChannelRef.current
        if (target && target.state === 'joined') {
          target.send({ type: 'broadcast', event: 'chat', payload })
        }
        return { ok: true }
      }

      subscribeWorld()

      useStore.getState().setOnline(true)
      netStatus.online = true
      netStatus.ready = true

      const { rx, rz } = regionOf(P.pos.x, P.pos.z)
      joinRegion(rx, rz)
    }

    init()

    // --- Reconnection handling ---
    const { data: authListener } = supabase.auth.onAuthStateChange((event) => {
      if (disposed) return
      if (event === 'TOKEN_REFRESHED' || event === 'SIGNED_IN') {
        if (netStatus.ready) {
          useStore.getState().setConnectionStatus('connected')
          useStore.getState().setOnline(true)
          netStatus.online = true
        }
      }
    })

    const reconnectInterval = setInterval(() => {
      if (disposed) return
      const sock = supabase.realtime && supabase.realtime.conn
      const isConnected = sock ? sock.readyState === 1 : true

      if (!isConnected && netStatus.online) {
        netStatus.online = false
        useStore.getState().setConnectionStatus('reconnecting')
        useStore.getState().setOnline(false)
      } else if (isConnected && !netStatus.online && netStatus.ready) {
        netStatus.online = true
        useStore.getState().setConnectionStatus('connected')
        useStore.getState().setOnline(true)
        const { rx, rz } = regionOf(P.pos.x, P.pos.z)
        if (!switchingRef.current) {
          switchingRef.current = true
          Promise.resolve(joinRegionRef.current(rx, rz)).finally(() => {
            switchingRef.current = false
          })
        }
        subscribeWorld()
      }
    }, 3000)

    return () => {
      disposed = true
      bridge.online = false
      bridge.saveIdentity = async () => {}
      bridge.plant = async () => ({ ok: false, error: 'offline' })
      bridge.water = async () => ({ ok: false, error: 'offline' })
      bridge.cut = async () => ({ ok: false, error: 'offline' })
      bridge.discover = async () => ({ ok: false, error: 'offline' })
      bridge.claimDaily = async () => ({ ok: false, error: 'offline' })
      bridge.sendChat = async () => ({ ok: false, error: 'offline' })
      clearTimeout(identityTimer.current)
      clearInterval(reconnectInterval)
      if (authListener && authListener.subscription) authListener.subscription.unsubscribe()
      if (posChannelRef.current) supabase.removeChannel(posChannelRef.current)
      if (chatChannelRef.current) supabase.removeChannel(chatChannelRef.current)
      if (worldRef.current) supabase.removeChannel(worldRef.current)
      remotePlayers.clear()
    }
  }, [])

  // position broadcast + region switching
  useFrame((_, dt) => {
    if (!netStatus.online || !posChannelRef.current) return

    const { rx, rz } = regionOf(P.pos.x, P.pos.z)
    const key = `${rx}:${rz}`
    if (key !== regionRef.current && !switchingRef.current && isDeepInRegion(P.pos.x, P.pos.z, rx, rz)) {
      switchingRef.current = true
      Promise.resolve(joinRegionRef.current(rx, rz)).finally(() => {
        switchingRef.current = false
      })
    }

    acc.current += dt
    if (acc.current >= 1 / POS_HZ) {
      acc.current = 0
      // Only send once the channel finished joining; before that, `.send`
      // silently falls back to REST httpSend which triggers a deprecation
      // warning every tick.
      const ch = posChannelRef.current
      if (ch.state === 'joined') {
        ch.send({
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
    }
  })

  return null
}
