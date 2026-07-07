import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

// Chat panel — bottom-left. Opens on Enter or clicking the chat button.
// Inside: tabs for Region (free, nearby players) and World (costs gold, everyone).
export default function Chat() {
  const chat = useStore((s) => s.chat)
  const scope = useStore((s) => s.chatScope)
  const setChatScope = useStore((s) => s.setChatScope)
  const sendChat = useStore((s) => s.sendChat)
  const online = useStore((s) => s.online)
  const [text, setText] = useState('')
  const [open, setOpen] = useState(false)
  const inputRef = useRef()
  const listRef = useRef()

  useEffect(() => {
    const onKey = (e) => {
      if (e.code === 'Enter' && document.activeElement !== inputRef.current) {
        setOpen(true)
        setTimeout(() => inputRef.current && inputRef.current.focus(), 0)
      } else if (e.code === 'Escape' && document.activeElement === inputRef.current) {
        inputRef.current.blur()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight
  }, [chat, open])

  const submit = (e) => {
    e.preventDefault()
    if (!text.trim()) return
    sendChat(text)
    setText('')
  }

  const shown = chat.filter((m) => m.scope === scope).slice(-40)

  if (!open) {
    return (
      <div className="chat no-look">
        <button className="chat-toggle-btn" onClick={() => setOpen(true)}>
          chat
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
        {shown.map((m) => (
          <div className="chat-msg" key={m.id}>
            <span className="chat-name" style={{ color: m.color }}>
              {m.name}
            </span>
            <span className="chat-text">{m.text}</span>
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
        />
        <button type="submit">send</button>
      </form>
    </div>
  )
}
