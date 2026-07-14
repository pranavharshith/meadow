import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'
import { isMuted, toggleMute } from '../net/moderation'
import { remotePlayers } from '../net/state'

// Chat panel — bottom-left. Opens on Enter or clicking the chat button.
// Tabs: Region (free, nearby) and World (costs 3 gold, everyone).
// Each remote message has a small "mute" affordance that hides that user's
// messages + name bubbles for the rest of this browser (stored in localStorage).
export default function Chat() {
  const chat = useStore((s) => s.chat)
  const scope = useStore((s) => s.chatScope)
  const setChatScope = useStore((s) => s.setChatScope)
  const sendChat = useStore((s) => s.sendChat)
  const setNavTarget = useStore((s) => s.setNavTarget)
  const flash = useStore((s) => s.flash)
  const online = useStore((s) => s.online)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const [muteBump, setMuteBump] = useState(0) // force re-render after mute toggles
  const [unreadCount, setUnreadCount] = useState(0)
  const lastReadCount = useRef(0)
  const inputRef = useRef()
  const listRef = useRef()

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Enter' && document.activeElement !== inputRef.current) {
        setOpen(true)
        setTimeout(() => inputRef.current && inputRef.current.focus(), 0)
      } else if (open) {
        if ((e.code === 'Enter' || e.code === 'Escape') && document.activeElement === inputRef.current) {
          if (e.code === 'Escape') {
            inputRef.current.blur()
            setOpen(false)
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
  }, [])

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
      // Only auto-scroll if the user is already near the bottom (within 60px)
      // This prevents ripping the screen down if they are reading old messages.
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 60
      if (isAtBottom || !open) {
        listRef.current.scrollTop = listRef.current.scrollHeight
      }
    }
  }, [chat, open])

  const submit = (e) => {
    e.preventDefault()
    if (text.trim()) {
      sendChat(text)
      setText('')
    }
  }

  // Filter muted, then take the tail. muteBump forces re-eval when mutes change.
  const shown = chat
    .filter((m) => m.scope === scope && !(m.userId && isMuted(m.userId)))
    .slice(-40)
  // touch muteBump so React re-renders when it changes
  void muteBump

  const handleMuteClick = (userId) => {
    if (!userId) return
    toggleMute(userId)
    setMuteBump((n) => n + 1)
  }

  if (!open) {
    return (
      <div className="chat no-look">
        <button className="chat-toggle-btn" onClick={() => setOpen(true)}>
          chat
          {unreadCount > 0 && (
            <span className="chat-unread">{unreadCount > 99 ? '99+' : unreadCount}</span>
          )}
        </button>
      </div>
    )
  }

  return (
    <div className="chat no-look open">
      <div className="chat-head">
        <button
          className={`chat-tab${scope === 'region' ? ' active' : ''}`}
          onClick={() => setChatScope('region')}
        >
          Region
        </button>
        <button
          className={`chat-tab${scope === 'world' ? ' active' : ''}`}
          onClick={() => setChatScope('world')}
        >
          World <span className="chat-tab-cost">3g</span>
        </button>
        <button className="chat-close" onClick={() => setOpen(false)} aria-label="close chat">
          ×
        </button>
      </div>

      <div className="chat-list" ref={listRef}>
        {shown.length === 0 && (
          <div className="chat-empty">
            {online ? 'say hello to the meadow' : 'offline — others appear when connected'}
          </div>
        )}
        {shown.map((m) => {
          const hasBadge = useStore.getState().worldTreeDonors.has(m.userId)
          return (
            <div className="chat-msg" key={m.id}>
              <span className="chat-name" style={{ color: m.color, cursor: 'pointer' }} onClick={() => useStore.getState().setProfileModal(m.self ? 'me' : m.userId)}>
                {hasBadge && <span className="chat-badge" title="World Tree Donor">🌳</span>}
                {m.name}
              </span>
              <span className="chat-text">{m.text}</span>
            {m.userId && !m.self && (
              <>
                <button
                  className="chat-nav"
                  onClick={() => {
                    const rp = remotePlayers.get(m.userId)
                    if (rp) {
                      setNavTarget({ x: rp.x, z: rp.z, name: m.name })
                      flash(`navigating to ${m.name}`)
                    } else {
                      flash(`${m.name} is no longer nearby`)
                    }
                  }}
                  title={`navigate to ${m.name}`}
                  aria-label={`navigate to ${m.name}`}
                >
                  ⌖
                </button>
                <button
                  className="chat-mute"
                  onClick={() => handleMuteClick(m.userId)}
                  title={`mute ${m.name}`}
                  aria-label={`mute ${m.name}`}
                >
                  ⊘
                </button>
              </>
            )}
          </div>
        ))}
      </div>

      <form className="chat-input" onSubmit={submit}>
        <input
          ref={inputRef}
          value={text}
          maxLength={160}
          placeholder={scope === 'world' ? 'world · costs 3 gold' : 'region · free'}
          onChange={(e) => setText(e.target.value)}
          onFocus={() => useStore.getState().setInputContext('CHAT')}
          onBlur={() => useStore.getState().setInputContext('GAME')}
        />
        <button type="submit">send</button>
      </form>
    </div>
  )
}
