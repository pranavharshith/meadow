import { useStore } from '../store'

export default function Status() {
  const online = useStore((s) => s.online)
  const count = useStore((s) => s.playerCount)
  const renderedCount = useStore((s) => s.renderedCount)
  const connectionStatus = useStore((s) => s.connectionStatus)
  const connectionNote = useStore((s) => s.connectionNote)
  const connecting = useStore((s) => s.connecting)

  const isReconnecting = connectionStatus === 'reconnecting'
  const isConnecting = connecting || connectionStatus === 'connecting'
  const isOffline = !online && !isConnecting && !isReconnecting

  let label
  if (isConnecting) label = 'connecting…'
  else if (isReconnecting) label = 'reconnecting…'
  else if (online) label = `${count} in zone · ${renderedCount + 1} nearby`
  else label = 'offline'

  const title = connectionNote
    || (isConnecting ? 'Signing in to the shared meadow…'
      : isReconnecting ? 'Connection lost — trying again…'
        : online ? 'Online in multiplayer meadow'
          : 'Playing offline — multiplayer unavailable')

  return (
    <div
      className={`status${online ? ' on' : ''}${isReconnecting || isConnecting ? ' reconnecting' : ''}${isOffline && connectionNote ? ' offline-note' : ''}`}
      title={title}
      role="status"
      aria-live="polite"
    >
      <span className="live" aria-hidden="true" />
      <span className="status-label">{label}</span>
      {isOffline && connectionNote && (
        <span className="status-note">{connectionNote}</span>
      )}
    </div>
  )
}
