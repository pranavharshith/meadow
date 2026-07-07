import { useEffect, useRef, useState } from 'react'
import { useStore } from '../store'

// Calm chat: a collapsible panel bottom-left. Two scopes — Region (free, only
// people near you) and World (costs gold, reaches everyone). Press Enter to
// focus the input; Escape to blur.
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
    sendChat(text)
    setText('')
  }

  const shown = chat.filter((m) => m.scope === scope).slice(-40)

  return (
    <div className={`chat no-look${open ? ' open' : ''}`}>
      <div className="chat-head">
        <button className={`chip${scope === 'region' ? ' on' : ''}`} onClick={() => setChatScope('region')}>
          Region
        </button>
        <button className={`chip${scope === 'world' ? ' on' : ''}`} onClick={() => setChatScope('world')}>
          World
        </button>
        <button className="chip ghost" onClick={() => setOpen((v) => !v)}>
          {open ? '×' : 'chat'}
        </button>
      </div>

      {open && (
        <>
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
        </>
      )}
    </div>
  )
}
