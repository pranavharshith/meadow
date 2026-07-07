import { useStore } from '../store'

export default function Toast() {
  const toast = useStore((s) => s.toast)
  return <div className={`toast${toast ? ' show' : ''}`}>{toast ? toast.msg : ''}</div>
}
