import { useStore } from '../store'

export default function Status() {
  const online = useStore((s) => s.online)
  const count = useStore((s) => s.playerCount)
  const connectionStatus = useStore((s) => s.connectionStatus)

  return (
    <div className={`status${online ? ' on' : ''}${connectionStatus === 'reconnecting' ? ' reconnecting' : ''}`}>
      <span className="live" />
      {connectionStatus === 'reconnecting' ? 'reconnecting...' : online ? `${count} here` : 'offline'}
    </div>
  )
}
