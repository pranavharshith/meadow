import { useEffect, useRef, useState, useMemo, memo, useCallback } from 'react'
import { useStore, CHAT_TEXT_MAX, WORLD_CHAT_GOLD_COST } from '../store'
import {
  isMuted,
  toggleMute,
  listMutes,
  subscribeMutes,
  getMuteRevision,
  rememberMuteName,
} from '../net/moderation'
import { remotePlayers } from '../net/state'

const ChatMessage = memo(function ChatMessage({
  m,
  hasBadge,
  onProfile,
  onNav,
  onMute,
}) {
  const nameColor =
    typeof m.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(m.color)
      ? m.color
      : '#a9d98a'

  return (
    <div className="chat-msg">
      <button
        type="button"
        className="chat-name-btn"
        style={{ color: nameColor }}
        onClick={() => onProfile(m)}
      >
        {hasBadge && (
          <span className="chat-badge" title="World Tree Donor" aria-label="World Tree Donor">
            🌳
          </span>
        )}
        {m.name}
      </button>
      <span className="chat-text">{m.text}</span>
      {m.userId && !m.self && (
        <>
          <button
            type="button"
            className="chat-nav"
            onClick={() => onNav(m)}
            title={`navigate to ${m.name}`}
            aria-label={`navigate to ${m.name}`}
          >
            <span aria-hidden="true">⌖</span>
          </button>
          <button
            type="button"
            className="chat-mute"
            onClick={() => onMute(m)}
            title={`mute ${m.name}`}
            aria-label={`mute ${m.name}`}
          >
            <span aria-hidden="true">⊘</span>
          </button>
        </>
      )}
    </div>
  )
})

// Chat panel — bottom-left. Opens on Enter or clicking the chat button.
// Tabs: Region (free, nearby) and World (costs gold, everyone).
export default function Chat({ openSignal = 0 }) {
  const chat = useStore((s) => s.chat)
  const scope = useStore((s) => s.chatScope)
  const setChatScope = useStore((s) => s.setChatScope)
  const sendChat = useStore((s) => s.sendChat)
  const setNavTarget = useStore((s) => s.setNavTarget)
  const flash = useStore((s) => s.flash)
  const online = useStore((s) => s.online)
  const chatError = useStore((s) => s.chatError)
  const clearChatError = useStore((s) => s.clearChatError)
  const worldTreeDonors = useStore((s) => s.worldTreeDonors)
  const gold = useStore((s) => s.gold)

  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [showMutes, setShowMutes] = useState(false)
  const [muteRev, setMuteRev] = useState(() => getMuteRevision())
  const [unreadCount, setUnreadCount] = useState(0)
  const lastReadCount = useRef(0)
  const inputRef = useRef()
  const listRef = useRef()

  // Mobile action bar can request open
  useEffect(() => {
    if (openSignal > 0) {
      setOpen(true)
      setTimeout(() => inputRef.current && inputRef.current.focus(), 0)
    }
  }, [openSignal])

  useEffect(() => subscribeMutes(setMuteRev), [])

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Enter' && document.activeElement !== inputRef.current) {
        const tag = document.activeElement?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'BUTTON') return
        if (document.body.classList.contains('modal-open')) return
        setOpen(true)
        setTimeout(() => inputRef.current && inputRef.current.focus(), 0)
      } else if (open) {
        if ((e.code === 'Enter' || e.code === 'Escape') && document.activeElement === inputRef.current) {
          if (e.code === 'Escape') {
            inputRef.current.blur()
            setOpen(false)
            useStore.getState().setInputContext('GAME')
          }
        }

        if ((e.code === 'ArrowLeft' || e.code === 'ArrowRight') && document.activeElement !== inputRef.current) {
          e.preventDefault()
          setChatScope(useStore.getState().chatScope === 'region' ? 'world' : 'region')
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, setChatScope])

  useEffect(() => {
    if (open) {
      setUnreadCount(0)
      lastReadCount.current = chat.length
    } else {
      const newMsgs = chat.length - lastReadCount.current
      if (newMsgs > 0) setUnreadCount(newMsgs)
    }

    if (listRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = listRef.current
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 60
      if (isAtBottom || !open) {
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    }
  }, [chat, open])

  // Remember names for mute list when messages arrive
  useEffect(() => {
    for (const m of chat) {
      if (m.userId && m.name) rememberMuteName(m.userId, m.name)
    }
  }, [chat])

  const mutedList = useMemo(() => {
    void muteRev
    return listMutes()
  }, [muteRev])

  const shown = useMemo(() => {
    void muteRev
    return chat
      .filter((m) => m.scope === scope && !(m.userId && isMuted(m.userId)))
      .slice(-40)
  }, [chat, scope, muteRev])

  const submit = async (e) => {
    e.preventDefault()
    if (!text.trim()) return
    const res = await sendChat(text)
    if (res?.ok !== false) setText('')
    // keep text on failure so user can edit/retry
  }

  const handleMute = useCallback((m) => {
    if (!m.userId) return
    const nowMuted = toggleMute(m.userId, m.name)
    flash(nowMuted ? `muted ${m.name}` : `unmuted ${m.name}`)
  }, [flash])

  const handleNav = useCallback((m) => {
    const rp = remotePlayers.get(m.userId)
    if (rp) {
      setNavTarget({ x: rp.x, z: rp.z, name: m.name })
      flash(`navigating to ${m.name}`)
    } else {
      flash(`${m.name} is no longer nearby`)
    }
  }, [setNavTarget, flash])

  const handleProfile = useCallback((m) => {
    useStore.getState().setProfileModal(m.self ? 'me' : m.userId)
  }, [])

  if (!open) {
    return (
      <div className="chat no-look">
        <button
          type="button"
          className="chat-toggle-btn"
          onClick={() => setOpen(true)}
          aria-expanded="false"
          aria-controls="chat-panel"
        >
          chat
          {unreadCount > 0 && (
            <span className="chat-unread" aria-label={`${unreadCount} unread`}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </button>
      </div>
    )
  }

  const worldShort = gold < WORLD_CHAT_GOLD_COST

  return (
    <div
      className="chat no-look open"
      id="chat-panel"
      role="region"
      aria-label="Chat"
    >
      <div className="chat-head" role="tablist" aria-label="Chat channel">
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'region'}
          className={`chat-tab${scope === 'region' ? ' active' : ''}`}
          onClick={() => setChatScope('region')}
        >
          Region
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={scope === 'world'}
          className={`chat-tab${scope === 'world' ? ' active' : ''}${worldShort ? ' cant-afford-tab' : ''}`}
          onClick={() => setChatScope('world')}
        >
          World{' '}
          <span className="chat-tab-cost" aria-label={`costs ${WORLD_CHAT_GOLD_COST} gold`}>
            {WORLD_CHAT_GOLD_COST}g
          </span>
        </button>
        <button
          type="button"
          className={`chat-mutes-btn${showMutes ? ' active' : ''}`}
          onClick={() => setShowMutes((v) => !v)}
          aria-expanded={showMutes}
          aria-controls="chat-mute-panel"
          title="Muted players"
        >
          mutes{mutedList.length > 0 ? ` (${mutedList.length})` : ''}
        </button>
        <button
          type="button"
          className="chat-close"
          onClick={() => {
            setOpen(false)
            setShowMutes(false)
            useStore.getState().setInputContext('GAME')
          }}
          aria-label="Close chat"
        >
          ×
        </button>
      </div>

      {showMutes && (
        <div id="chat-mute-panel" className="chat-mute-panel" role="region" aria-label="Muted players">
          {mutedList.length === 0 ? (
            <div className="chat-empty">no muted players</div>
          ) : (
            mutedList.map(({ id, name }) => (
              <div key={id} className="chat-mute-row">
                <span className="chat-mute-name">{name}</span>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => {
                    toggleMute(id, name)
                    flash(`unmuted ${name}`)
                  }}
                >
                  unmute
                </button>
              </div>
            ))
          )}
        </div>
      )}

      <div
        className="chat-list"
        ref={listRef}
        role="log"
        aria-live="polite"
        aria-relevant="additions"
        aria-label={`${scope} chat messages`}
      >
        {shown.length === 0 && (
          <div className="chat-empty">
            {online ? 'say hello to the meadow' : 'offline — others appear when connected'}
          </div>
        )}
        {shown.map((m) => (
          <ChatMessage
            key={m.id}
            m={m}
            hasBadge={!!(m.userId && worldTreeDonors.has(m.userId))}
            onProfile={handleProfile}
            onNav={handleNav}
            onMute={handleMute}
          />
        ))}
      </div>

      {chatError && (
        <div className="chat-error" role="alert">
          <span>{chatError}</span>
          <button type="button" className="chat-error-dismiss" onClick={clearChatError} aria-label="Dismiss error">
            ×
          </button>
        </div>
      )}

      <form className="chat-input" onSubmit={submit}>
        <label htmlFor="chat-message-input" className="sr-only">
          {scope === 'world'
            ? `World chat message, costs ${WORLD_CHAT_GOLD_COST} gold`
            : 'Region chat message'}
        </label>
        <input
          id="chat-message-input"
          ref={inputRef}
          value={text}
          maxLength={CHAT_TEXT_MAX}
          placeholder={
            scope === 'world'
              ? worldShort
                ? `world · need ${WORLD_CHAT_GOLD_COST}g`
                : `world · costs ${WORLD_CHAT_GOLD_COST} gold`
              : 'region · free'
          }
          onChange={(e) => {
            setText(e.target.value.slice(0, CHAT_TEXT_MAX))
            if (chatError) clearChatError()
          }}
          onFocus={() => useStore.getState().setInputContext('CHAT')}
          onBlur={() => useStore.getState().setInputContext('GAME')}
          autoComplete="off"
          aria-invalid={!!chatError}
          aria-describedby={chatError ? 'chat-error-text' : undefined}
        />
        <button type="submit">send</button>
      </form>
      <div className="chat-meta" aria-hidden="true">
        {text.length}/{CHAT_TEXT_MAX}
      </div>
    </div>
  )
}
