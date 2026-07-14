import { useEffect, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { supabase, ONLINE } from './supabase'
import { bridge } from './bridge'
import { REGION, isDeepInRegion, regionOf, regionKey, regionChannel, regionChatChannel, shardFor, chunkOf, chunkKey, chunkChannel, CHUNK_SIZE } from './region'
import { remotePlayers, netStatus } from './state'
import { P } from '../player-state'
import { useStore } from '../store'
import { isMuted, setMutesFromServer } from './moderation'
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
  const currentChunkRef = useRef(null)
  const acc = useRef(0)
  const identityTimer = useRef(null)
  const lastProfileRef = useRef({ name: 'wanderer', color: '#a9d98a' })
  const switchingRef = useRef(false)
  const joinRegionRef = useRef(async () => {})
  const loadChunksRef = useRef(async () => {})
  const syncChunksRef = useRef(async () => {})

  useEffect(() => {
    if (!ONLINE) {
      useStore.getState().setOnline(false)
      // Expose local mute controls even offline (though there's no one to mute)
      bridge.isMuted = isMuted
      bridge.toggleMute = async () => {}
      // Offline: claim daily bonus via localStorage path
      useStore.getState().claimDailyBonus()
      return
    }

    let disposed = false
    const activeChunkChannels = new Map()

    // ---------- receivers ----------
    const receivePos = (payload) => {
      if (!payload) return
      let id, x, z, yaw, emote, name, color, headColor, bodyColor, legColor, hatId;
      if (Array.isArray(payload)) {
        [id, x, z, yaw, emote] = payload;
      } else {
        ({ id, x, z, yaw, emote, name, color, headColor, bodyColor, legColor, hatId } = payload);
      }
      if (id === meId.current) return
      if (isMuted(id)) return // still track presence, just don't render
      let rp = remotePlayers.get(id)
      if (!rp) {
        rp = {
          id: id,
          name: name || 'wanderer',
          color: color || '#a9d98a',
          headColor: headColor || null,
          bodyColor: bodyColor || null,
          legColor: legColor || null,
          hatId: hatId || null,
          x: x, z: z, yaw: yaw || 0,
          tx: x, tz: z, tyaw: yaw || 0,
          emote: emote || null, msg: '', msgUntil: 0,
        }
        remotePlayers.set(id, rp)
      }
      rp.tx = x
      rp.tz = z
      rp.tyaw = yaw || 0
      rp.emote = emote || null
      if (name) rp.name = name
      if (color) rp.color = color
      if (headColor !== undefined) rp.headColor = headColor
      if (bodyColor !== undefined) rp.bodyColor = bodyColor
      if (legColor !== undefined) rp.legColor = legColor
      if (hatId !== undefined) rp.hatId = hatId
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

    // A remote peer placed a rock. Add it to the local scene.
    const receiveRock = (payload) => {
      if (!payload || payload.owner_id === meId.current) return
      useStore.getState().addRock({
        id: payload.id,
        x: payload.x,
        z: payload.z,
        rot: payload.rot ?? 0,
        rockShape: payload.rock_shape ?? 2,
        sx: payload.sx ?? 1,
        sy: payload.sy ?? 1,
        sz: payload.sz ?? 1,
        matIdx: payload.mat_idx ?? 0,
        placedAt: payload.placed_at ? new Date(payload.placed_at).getTime() : Date.now(),
        owner: false,
      })
    }

    // A remote peer removed a rock. Drop it from the local scene.
    const receiveRemoveRock = (payload) => {
      if (!payload || !payload.id || payload.owner_id === meId.current) return
      useStore.getState().removeRockLocal(payload.id)
    }

    const receivePlot = (payload) => {
      if (!payload || payload.owner_id === meId.current) return
      useStore.getState().addPlot({
        id: payload.id,
        x: payload.x,
        z: payload.z,
        radius: payload.radius ?? 10,
        shapeType: payload.shape_type ?? 0,
        width: payload.width ?? 20,
        depth: payload.depth ?? 20,
        owner: false,
        name: payload.name || '',
      })
    }

    const receiveRemovePlot = (payload) => {
      if (!payload || !payload.id || payload.owner_id === meId.current) return
      useStore.getState().removePlotLocal(payload.id)
    }

    const receiveDye = (payload) => {
      if (!payload || !payload.id || payload.owner_id === meId.current) return
      useStore.getState().set((s) => ({
        trees: s.trees.map((t) => t.id === payload.id ? { ...t, dye: payload.color } : t),
      }))
    }

    const receiveCraftedItem = (payload) => {
      if (!payload || payload.owner_id === meId.current) return
      useStore.getState().addCraftedItem({
        id: payload.id,
        x: payload.x,
        z: payload.z,
        rot: payload.rot ?? 0,
        itemId: payload.item_id,
        placedAt: payload.placed_at ? new Date(payload.placed_at).getTime() : Date.now(),
        owner: false,
      })
    }

    const receiveRemoveCraftedItem = (payload) => {
      if (!payload || !payload.id || payload.owner_id === meId.current) return
      useStore.getState().removeCraftedItemLocal(payload.id)
    }

    const receiveCutProcedural = (payload) => {
      if (!payload || !payload.id || payload.user_id === meId.current) return
      useStore.getState().addCutResource(payload.id, {
        type: payload.type,
        chunk_key: payload.chunk_key,
        cut_at: payload.cut_at || new Date().toISOString()
      })
    }

    async function loadChunksAround(cx, cz) {
      const minX = (cx - 1) * CHUNK_SIZE
      const maxX = (cx + 2) * CHUNK_SIZE
      const minZ = (cz - 1) * CHUNK_SIZE
      const maxZ = (cz + 2) * CHUNK_SIZE

      Promise.all([
        supabase.from('trees').select('*').gte('x', minX).lt('x', maxX).gte('z', minZ).lt('z', maxZ).limit(1000),
        supabase.from('rocks').select('*').gte('x', minX).lt('x', maxX).gte('z', minZ).lt('z', maxZ).limit(500),
        supabase.from('plots').select('*').gte('x', minX).lt('x', maxX).gte('z', minZ).lt('z', maxZ).limit(100),
        supabase.from('crafted_items').select('*').gte('x', minX).lt('x', maxX).gte('z', minZ).lt('z', maxZ).limit(500),
        supabase.from('cut_resources').select('*') // we filter this client-side or use a more precise query if needed. 
      ]).then(([treesRes, rocksRes, plotsRes, craftedRes, cutsRes]) => {
        if (disposed) return
        
        if (!treesRes.error) {
          const trees = (treesRes.data || []).map(t => ({
            id: t.id, x: t.x, z: t.z, variant: t.variant, shape: t.shape || 0,
            scale: t.scale, dye: t.dye || null,
            plantedAt: t.planted_at ? new Date(t.planted_at).getTime() : Date.now(),
            owner: t.owner_id === meId.current,
          }))
          useStore.getState().setTrees(trees)
        }
        
        if (!rocksRes.error) {
          const rocks = (rocksRes.data || []).map(r => ({
            id: r.id, x: r.x, z: r.z, rot: r.rot ?? 0, rockShape: r.rock_shape ?? 2,
            sx: r.sx ?? 1, sy: r.sy ?? 1, sz: r.sz ?? 1, matIdx: r.mat_idx ?? 0,
            placedAt: r.placed_at ? new Date(r.placed_at).getTime() : Date.now(),
            owner: r.owner_id === meId.current,
          }))
          useStore.getState().setRocks(rocks)
        }
        
        if (!plotsRes.error) {
          const plots = (plotsRes.data || []).map(p => ({
            id: p.id, x: p.x, z: p.z, radius: p.radius ?? 10, shapeType: p.shape_type ?? 0,
            width: p.width ?? 20, depth: p.depth ?? 20, owner: p.owner_id === meId.current,
            name: p.players?.name || '',
          }))
          useStore.getState().setPlots(plots)
        }
        
        if (!craftedRes.error) {
          const items = (craftedRes.data || []).map(i => ({
            id: i.id, x: i.x, z: i.z, rot: i.rot ?? 0, itemId: i.item_id,
            placedAt: i.placed_at ? new Date(i.placed_at).getTime() : Date.now(),
            owner: i.owner_id === meId.current,
          }))
          useStore.getState().setCraftedItems(items)
        }
        
        if (!cutsRes.error) {
          const needed = new Set()
          for (let dx = -1; dx <= 1; dx++) {
            for (let dz = -1; dz <= 1; dz++) {
              needed.add(chunkKey(cx + dx, cz + dz))
            }
          }
          const cutsObj = {}
          for (const c of (cutsRes.data || [])) {
            if (needed.has(c.chunk_key)) cutsObj[c.id] = c
          }
          useStore.getState().setCutResources(cutsObj)
        }
      })
    }
    loadChunksRef.current = loadChunksAround

    async function syncChunks(cx, cz) {
      if (disposed) return
      const needed = new Set()
      for (let dx = -1; dx <= 1; dx++) {
        for (let dz = -1; dz <= 1; dz++) {
          needed.add(chunkKey(cx + dx, cz + dz))
        }
      }

      for (const [key, ch] of activeChunkChannels.entries()) {
        if (!needed.has(key)) {
          try { await ch.unsubscribe() } catch {}
          try { supabase.removeChannel(ch) } catch {}
          activeChunkChannels.delete(key)
        }
      }

      for (const key of needed) {
        if (!activeChunkChannels.has(key)) {
          const [ccx, ccz] = key.split(':').map(Number)
          const ch = supabase.channel(chunkChannel(ccx, ccz), {
            config: { broadcast: { self: false } },
          })
          ch.on('broadcast', { event: 'pos' }, ({ payload }) => receivePos(payload))
          ch.on('broadcast', { event: 'tree' }, ({ payload }) => receiveTree(payload))
          ch.on('broadcast', { event: 'cut' }, ({ payload }) => receiveCut(payload))
          ch.on('broadcast', { event: 'rock' }, ({ payload }) => receiveRock(payload))
          ch.on('broadcast', { event: 'removerock' }, ({ payload }) => receiveRemoveRock(payload))
          ch.on('broadcast', { event: 'plot' }, ({ payload }) => receivePlot(payload))
          ch.on('broadcast', { event: 'removeplot' }, ({ payload }) => receiveRemovePlot(payload))
          ch.on('broadcast', { event: 'dye' }, ({ payload }) => receiveDye(payload))
          ch.on('broadcast', { event: 'crafted' }, ({ payload }) => receiveCraftedItem(payload))
          ch.on('broadcast', { event: 'removecrafted' }, ({ payload }) => receiveRemoveCraftedItem(payload))
          ch.on('broadcast', { event: 'cutprocedural' }, ({ payload }) => receiveCutProcedural(payload))
          ch.subscribe()
          activeChunkChannels.set(key, ch)
        }
      }
      
      posChannelRef.current = activeChunkChannels.get(chunkKey(cx, cz))
    }
    syncChunksRef.current = syncChunks

    async function joinRegion(rx, rz) {
      if (chatChannelRef.current) {
        const finalPresence = chatChannelRef.current.presenceState() || {}
        try { await chatChannelRef.current.unsubscribe() } catch {}
        try { await supabase.removeChannel(chatChannelRef.current) } catch {}
        chatChannelRef.current = null
        
        const activeIds = new Set(Object.keys(finalPresence))
        for (const id of remotePlayers.keys()) {
          if (!activeIds.has(id)) remotePlayers.delete(id)
        }
      } else {
        remotePlayers.clear()
      }

      const name = useStore.getState().name
      const color = useStore.getState().color

      // --- region-wide chat + authoritative head count (un-sharded) ---
      const chatCh = supabase.channel(regionChatChannel(rx, rz), {
        config: { presence: { key: meId.current }, broadcast: { self: false } },
      })
      chatCh.on('broadcast', { event: 'chat' }, ({ payload }) => receiveChat(payload, 'region'))
      chatCh.on('presence', { event: 'sync' }, () => {
        const st = chatCh.presenceState()
        netStatus.count = Object.keys(st).length || 1
        useStore.getState().setPlayerCount(netStatus.count)
        
        for (const [key, presences] of Object.entries(st)) {
          if (key === meId.current || !presences.length) continue
          const p = presences[0]
          let rp = remotePlayers.get(key)
          if (!rp) {
            rp = {
              id: key,
              name: p.name || 'wanderer',
              color: p.color || '#a9d98a',
              headColor: p.headColor || null,
              bodyColor: p.bodyColor || null,
              legColor: p.legColor || null,
              hatId: p.hatId || null,
              x: 0, z: 0, yaw: 0, tx: 0, tz: 0, tyaw: 0,
              emote: null, msg: '', msgUntil: 0, moving: false, running: false,
              lastSeen: Date.now()
            }
            remotePlayers.set(key, rp)
          } else {
            rp.lastSeen = Date.now()
            if (p.name) rp.name = p.name
            if (p.color) rp.color = p.color
            if (p.headColor !== undefined) rp.headColor = p.headColor
            if (p.bodyColor !== undefined) rp.bodyColor = p.bodyColor
            if (p.legColor !== undefined) rp.legColor = p.legColor
            if (p.hatId !== undefined) rp.hatId = p.hatId
          }
        }
      })
      chatCh.on('presence', { event: 'sync' }, () => {
        const state = chatCh.presenceState()
        const onlineSet = new Set()
        for (const id in state) {
          state[id].forEach(p => { if (p.id) onlineSet.add(p.id) })
        }
        useStore.getState().setOnlineUserIds(onlineSet)
      })

      chatCh.subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await chatCh.track({ 
            id: meId.current, 
            name, 
            color,
            headColor: useStore.getState().headColor,
            bodyColor: useStore.getState().bodyColor,
            legColor: useStore.getState().legColor,
            hatId: useStore.getState().hatId
          })
        }
      })
      chatChannelRef.current = chatCh

      regionRef.current = `${rx}:${rz}`
      netStatus.region = regionRef.current
      // Force initial chunk load if we join a new region
      currentChunkRef.current = null
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
        // Captcha token is strictly enforced; an exception here halts boot
        const captchaToken = await getCaptchaToken()
        const { data, error } = await supabase.auth.signInAnonymously({ options: { captchaToken } })
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
        lastProfileRef.current = { name: prof.name, color: prof.color }
        setMutesFromServer(prof.blocked_users || [])
        useStore.getState().hydrateProfile({
          gold: prof.gold,
          name: prof.name,
          color: prof.color,
          headColor: prof.head_color,
          bodyColor: prof.body_color,
          legColor: prof.leg_color,
          hatId: prof.hat_id,
          discovered: prof.discovered || [],
          customSpawn: (prof.custom_spawn_x != null ? { x: prof.custom_spawn_x, z: prof.custom_spawn_z } : undefined),
          joinDate: prof.created_at,
          treesPlanted: prof.trees_planted,
          ownedCosmetics: prof.owned_cosmetics || [],
          lastSeen: Date.now()
        })
      }

      // ---------- Social Hydration & Realtime Sync ----------
      const fetchSocialData = async () => {
        const { data, error } = await supabase.rpc('get_social_data')
        if (!error && data) {
          const st = useStore.getState()
          st.setFriends(data.friends || [])
          st.setFriendRequests(data.requests || [])
        }
      }
      
      await fetchSocialData()

      const friendsCh = supabase.channel(`friends:${user.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friends' }, fetchSocialData)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'friend_requests' }, fetchSocialData)
        .subscribe()

      // ---------- World Tree Hydration & Sync ----------
      const fetchWorldTree = async () => {
        const { data: wt } = await supabase.from('world_tree').select('total_wood').eq('id', 1).single()
        if (wt) useStore.getState().setWorldTreeWood(wt.total_wood)
        
        const { data: donors } = await supabase.from('world_tree_donors').select('user_id')
        if (donors) useStore.getState().setWorldTreeDonors(donors.map(d => d.user_id))
      }
      await fetchWorldTree()

      const wtCh = supabase.channel('world_tree_sync')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'world_tree' }, (payload) => {
          if (payload.new && payload.new.total_wood !== undefined) {
            useStore.getState().setWorldTreeWood(payload.new.total_wood)
          }
        })
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'world_tree_donors' }, (payload) => {
          if (payload.new && payload.new.user_id) {
            useStore.getState().addWorldTreeDonor(payload.new.user_id)
          }
        })
        .subscribe()


      // ---------- bridge wiring: all mutations go through RPCs ----------
      bridge.online = true
      bridge.isMuted = isMuted
      bridge.toggleMute = async (userId) => {
        const { data, error } = await supabase.rpc('toggle_block', { target_id: userId })
        if (!error && data) {
          setMutesFromServer(data)
        }
      }

      bridge.getProfile = async (id) => {
        const { data, error } = await supabase.rpc('get_player_profile', { p_id: id })
        if (error) return { ok: false, error: error.message }
        return { ok: true, data }
      }

      bridge.sendFriendRequest = async (id) => {
        const { error } = await supabase.rpc('send_friend_request', { p_receiver_id: id })
        return { ok: !error, error: error?.message }
      }

      bridge.sendFriendRequestByName = async (name) => {
        const { data, error } = await supabase.rpc('send_friend_request_by_name', { p_target_name: name })
        if (error) return { ok: false, error: error.message }
        if (data === 'SUCCESS') return { ok: true }
        if (data === 'PLAYER_NOT_FOUND') return { ok: false, error: 'Player not found.' }
        if (data === 'CANNOT_ADD_SELF') return { ok: false, error: 'You cannot add yourself.' }
        if (data === 'ALREADY_FRIENDS') return { ok: false, error: 'Already friends.' }
        return { ok: false, error: data }
      }

      bridge.acceptFriendRequest = async (id) => {
        const { error } = await supabase.rpc('accept_friend_request', { p_sender_id: id })
        return { ok: !error, error: error?.message }
      }

      bridge.declineFriendRequest = async (id) => {
        const { error } = await supabase.rpc('decline_friend_request', { p_sender_id: id })
        return { ok: !error, error: error?.message }
      }

      bridge.unfriend = async (id) => {
        const { error } = await supabase.rpc('unfriend', { p_friend_id: id })
        return { ok: !error, error: error?.message }
      }

      bridge.saveIdentity = async (name, color, headColor, bodyColor, legColor, hatId) => {
        const { data, error } = await supabase.rpc('update_profile', {
          p_name: name,
          p_color: color,
          p_head_color: headColor,
          p_body_color: bodyColor,
          p_leg_color: legColor,
          p_hat_id: hatId,
        })
        if (error) {
          const m = error.message.toLowerCase()
          let flash = 'could not update profile'
          if (m.includes('profanity'))           flash = 'name contains inappropriate language'
          else if (m.includes('too fast'))        flash = 'please wait before changing your name'
          else if (m.includes('too short'))       flash = 'name must be at least 2 characters'
          else if (m.includes('already taken'))   flash = 'that name is already taken'
          useStore.getState().flash(flash)
        } else if (data) {
          lastProfileRef.current = { name: data.name, color: data.color }
          useStore.getState().hydrateProfile({ 
            name: data.name, 
            color: data.color,
            headColor: data.head_color,
            bodyColor: data.body_color,
            legColor: data.leg_color,
            hatId: data.hat_id
          })
          if (chatChannelRef.current && chatChannelRef.current.state === 'joined') {
            chatChannelRef.current.track({
              id: meId.current,
              name: data.name,
              color: data.color,
              headColor: data.head_color,
              bodyColor: data.body_color,
              legColor: data.leg_color,
              hatId: data.hat_id
            }).catch(() => {})
          }
        }
        return { ok: !error, error }
      }

      bridge.buyCosmetic = async (type, id, colorVal) => {
        const { data, error } = await supabase.rpc('buy_cosmetic', {
          p_type: type,
          p_id: id,
          p_color: colorVal
        })
        if (error) {
          console.error('buyCosmetic error', error)
          return { ok: false, error: error.message }
        }
        lastProfileRef.current = { name: data.name, color: data.color }
        useStore.getState().hydrateProfile({ 
          name: data.name, 
          color: data.color,
          headColor: data.head_color,
          bodyColor: data.body_color,
          legColor: data.leg_color,
          hatId: data.hat_id,
          gold: data.gold,
          ownedCosmetics: data.owned_cosmetics || []
        })
        return { ok: true, gold: data.gold }
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

      bridge.placeRock = async (rock, cost = 5) => {
        const { data, error } = await supabase.rpc('place_rock', {
          p_id:        rock.id,
          p_x:         rock.x,
          p_z:         rock.z,
          p_rot:       rock.rot ?? 0,
          p_rock_shape: rock.rockShape ?? 2,
          p_sx:        rock.sx ?? 1,
          p_sy:        rock.sy ?? 1,
          p_sz:        rock.sz ?? 1,
          p_mat_idx:   rock.matIdx ?? 0,
          p_cost:      cost,
        })
        if (error) return { ok: false, error: error.message }
        // Broadcast so same-shard peers see the rock immediately.
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: 'rock',
            payload: {
              id:         rock.id,
              owner_id:   meId.current,
              x:          rock.x,
              z:          rock.z,
              rot:        rock.rot ?? 0,
              rock_shape: rock.rockShape ?? 2,
              sx:         rock.sx ?? 1,
              sy:         rock.sy ?? 1,
              sz:         rock.sz ?? 1,
              mat_idx:    rock.matIdx ?? 0,
            },
          })
        }
        return { ok: true, gold: data } // scalar integer
      }

      bridge.removeRock = async (rockId) => {
        const { data, error } = await supabase.rpc('remove_rock', { p_rock_id: rockId })
        if (error) return { ok: false, error: error.message }
        // Tell same-shard peers to drop this rock from their scene.
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: 'removerock',
            payload: { id: rockId, owner_id: meId.current },
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

      bridge.releaseItem = async (id, type) => {
        const { data, error } = await supabase.rpc('release_overgrown_item', { p_id: id, p_type: type })
        if (error) return { ok: false, error: error.message }
        
        // Broadcast so same-shard peers see the item vanish
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: type === 'tree' ? 'cut' : 'removerock',
            payload: { id, owner_id: meId.current },
          })
        }
        return { ok: true, gold: data }
      }

      bridge.claimOfflineGold = async () => {
        const { data, error } = await supabase.rpc('claim_offline_gold')
        if (error) return { ok: false, error: error.message }
        return { ok: true, gold: data }
      }

      bridge.cutProceduralResource = async (id, type, chunkKey) => {
        const { data, error } = await supabase.rpc('cut_procedural_resource', { p_id: id, p_type: type, p_chunk_key: chunkKey })
        if (error) return { ok: false, error: error.message }
        
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: 'cutprocedural',
            payload: { id, type, chunk_key: chunkKey, user_id: meId.current },
          })
        }
        return { ok: true, wood: data.wood, stone: data.stone }
      }

      bridge.placeCraftedItem = async (item, costWood = 0, costStone = 0) => {
        const { data, error } = await supabase.rpc('place_crafted_item', {
          p_id: item.id,
          p_item_id: item.itemId,
          p_x: item.x,
          p_z: item.z,
          p_rot: item.rot ?? 0,
          p_cost_wood: costWood,
          p_cost_stone: costStone,
        })
        if (error) return { ok: false, error: error.message }
        
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: 'crafted',
            payload: {
              id: item.id,
              owner_id: meId.current,
              item_id: item.itemId,
              x: item.x,
              z: item.z,
              rot: item.rot ?? 0,
            },
          })
        }
        return { ok: true, wood: data.wood, stone: data.stone }
      }

      bridge.removeCraftedItem = async (itemId) => {
        const { data, error } = await supabase.rpc('remove_crafted_item', { p_id: itemId })
        if (error) return { ok: false, error: error.message }
        
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: 'removecrafted',
            payload: { id: itemId, owner_id: meId.current },
          })
        }
        return { ok: true, wood: data.wood, stone: data.stone }
      }

      bridge.teleport = async (landmarkId) => {
        const { data, error } = await supabase.rpc('teleport_to_landmark', {
          p_landmark_id: landmarkId,
        })
        if (error) return { ok: false, error: error.message }
        return { ok: true, gold: data }
      }

      bridge.setSpawn = async (x, z) => {
        const { data, error } = await supabase.rpc('set_spawn', { p_x: x, p_z: z })
        if (error) return { ok: false, error: error.message }
        return { ok: true, gold: data }
      }

      bridge.buyCustomPlot = async (plot) => {
        const params = {
          p_id:    String(plot.id),
          p_shape: Math.round(Number(plot.shapeType ?? 0)),
          p_w:     Number(plot.width  ?? 10),
          p_d:     Number(plot.depth  ?? 10),
          p_x:     Number(plot.x),
          p_z:     Number(plot.z),
        }
        console.log('[buyCustomPlot] sending:', params)
        const { data, error } = await supabase.rpc('buy_custom_plot', params)
        if (error) {
          return { ok: false, error: error.message }
        }
        // Broadcast so region peers see the plot immediately.
        const posCh = posChannelRef.current
        if (posCh && posCh.state === 'joined') {
          posCh
            .send({
              type: 'broadcast',
              event: 'plot',
              payload: {
                id: plot.id,
                owner_id: meId.current,
                x: plot.x,
                z: plot.z,
                radius: plot.width,
                shape_type: plot.shapeType,
                width: plot.width,
                depth: plot.depth,
                name: useStore.getState().name,
              },
            })
        }
        return { ok: true, gold: data }
      }

      bridge.dye = async (treeId, color, cost) => {
        const { data, error } = await supabase.rpc('dye_tree', {
          p_tree_id: treeId,
          p_color: color,
          p_cost: cost,
        })
        if (error) return { ok: false, error: error.message }
        const ch = posChannelRef.current
        if (ch && ch.state === 'joined') {
          ch.send({
            type: 'broadcast',
            event: 'dye',
            payload: { id: treeId, color, owner_id: meId.current },
          })
        }
        return { ok: true, gold: data }
      }

      bridge.sendChat = async (scope, text) => {
        if (scope === 'world') {
          // Server RPC pays, rate-limits, sanitizes, AND emits the broadcast
          // itself via realtime.send(). Client is receive-only for world chat.
          const { data, error } = await supabase.rpc('send_world_chat', { p_text: text })
          if (error) return { ok: false, error: error.message }
          return { ok: true, gold: data }
        }
        // Region chat: server rate-limits + sanitizes, returns the clean text.
        // Client then broadcasts the sanitized version so all shards get it.
        const { data: cleanText, error } = await supabase.rpc('check_region_chat', { p_text: text })
        if (error) return { ok: false, error: error.message }
        const s = useStore.getState()
        const payload = {
          id:   meId.current,
          mid:  Math.random().toString(36).slice(2),
          name: s.name,
          color: s.color,
          text: cleanText || text, // use server-sanitized version
        }
        const target = chatChannelRef.current
        if (target && target.state === 'joined') {
          target.send({ type: 'broadcast', event: 'chat', payload })
        }
        return { ok: true, text: cleanText || text }
      }

      bridge.donateToWorldTree = async (amount) => {
        const { error } = await supabase.rpc('donate_to_world_tree', { amount })
        if (error) return { ok: false, error: error.message }
        return { ok: true }
      }

      subscribeWorld()

      useStore.getState().setOnline(true)
      netStatus.online = true
      netStatus.ready = true

      // Online: claim daily bonus via server RPC (authoritative)
      useStore.getState().claimDailyBonus()
      useStore.getState().claimOfflineGold()

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
          const { cx, cz } = chunkOf(P.pos.x, P.pos.z)
          Promise.all([
            joinRegionRef.current(rx, rz),
            syncChunksRef.current(cx, cz)
          ]).finally(() => {
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
      bridge.placeRock = async () => ({ ok: false, error: 'offline' })
      bridge.removeRock = async () => ({ ok: false, error: 'offline' })
      bridge.teleport = async () => ({ ok: false, error: 'offline' })
      bridge.setSpawn = async () => ({ ok: false, error: 'offline' })
      bridge.buyCustomPlot = async () => ({ ok: false, error: 'offline' })
      bridge.dye = async () => ({ ok: false, error: 'offline' })
      clearTimeout(identityTimer.current)
      clearInterval(reconnectInterval)
      if (authListener && authListener.subscription) authListener.subscription.unsubscribe()
      for (const ch of activeChunkChannels.values()) supabase.removeChannel(ch)
      activeChunkChannels.clear()
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

    // Proximity chunk loader checking on every frame (only queries when chunk changes)
    const { cx, cz } = chunkOf(P.pos.x, P.pos.z)
    const cKey = chunkKey(cx, cz)
    if (cKey !== currentChunkRef.current) {
      currentChunkRef.current = cKey
      loadChunksRef.current(cx, cz)
      syncChunksRef.current(cx, cz)
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
          payload: [
            meId.current,
            +P.pos.x.toFixed(2),
            +P.pos.z.toFixed(2),
            +P.avatarYaw.toFixed(2),
            P.emote || 0
          ],
        })
      }
    }
  })

  return null
}
