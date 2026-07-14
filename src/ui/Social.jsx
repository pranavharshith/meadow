import { useState, useEffect, useRef, useCallback } from 'react'
import { useStore } from '../store'
import { bridge } from '../net/bridge'
import { toggleMute } from '../net/moderation'
import { useFocusTrap } from './a11y'

const REPORT_REASONS = [
  'Harassment',
  'Spam / advertising',
  'Inappropriate name or chat',
  'Griefing builds',
  'Other',
]

export default function Social() {
  const open = useStore((s) => s.socialOpen)
  const panelRef = useRef(null)
  const close = useCallback(() => {
    useStore.getState().setSocialOpen(false)
    useStore.getState().setProfileModal(null)
  }, [])
  useFocusTrap(panelRef, open)
  // Escape handled below: profile → back first, then close panel
  
  // profileModal id (if it is not 'me' and not null, we show the remote profile view)
  const profileId = useStore((s) => s.profileModal)
  
  const [tab, setTab] = useState('online') // online, offline, pending
  const [focusSection, setFocusSection] = useState('tabs') // 'tabs', 'list', 'actions'
  const [focusIndex, setFocusIndex] = useState(0)
  
  const [remoteProf, setRemoteProf] = useState(null)
  const [loading, setLoading] = useState(false)
  
  const [searchName, setSearchName] = useState('')
  const [searchStatus, setSearchStatus] = useState('')
  const [reportOpen, setReportOpen] = useState(false)
  const [reportReason, setReportReason] = useState(REPORT_REASONS[0])
  const [reportNote, setReportNote] = useState('')
  const [reportBusy, setReportBusy] = useState(false)

  const onlineUserIds = useStore((s) => s.onlineUserIds)
  const friendsRaw = useStore((s) => s.friends) || []
  const requests = useStore((s) => s.friendRequests) || []
  
  const friends = friendsRaw.map(f => ({ ...f, online: onlineUserIds.has(f.id) }))
  const onlineFriends = friends.filter(f => f.online)
  const offlineFriends = friends.filter(f => !f.online)

  // Force open the social panel if a remote profile is selected
  useEffect(() => {
    if (profileId && profileId !== 'me') {
      useStore.getState().setSocialOpen(true)
      setRemoteProf(null)
      setLoading(true)
      bridge.getProfile(profileId).then(res => {
        setLoading(false)
        if (res.ok && res.data) {
          setRemoteProf({
            id: profileId,
            name: res.data.name,
            title: 'Wanderer',
            joinDate: res.data.created_at,
            treesPlanted: res.data.trees_planted,
            landmarks: res.data.landmarks_discovered
          })
        }
      })
    }
  }, [profileId])

  const listData = tab === 'online' ? onlineFriends : tab === 'offline' ? offlineFriends : requests

  useEffect(() => {
    if (!open) return
    const handleKeyDown = (e) => {
      if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
      if (e.key === 'Escape') {
        if (profileId && profileId !== 'me') {
          useStore.getState().setProfileModal(null)
        } else {
          close()
        }
        return
      }
      
      const isProfile = profileId && profileId !== 'me'
      
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (focusSection === 'tabs') {
          setFocusSection(isProfile ? 'actions' : 'list')
          setFocusIndex(0)
        } else if (focusSection === 'list') {
          setFocusIndex(prev => Math.min(prev + 1, listData.length - 1))
        } else if (focusSection === 'actions') {
          setFocusIndex(1) // Usually max 2 buttons
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (focusSection === 'list') {
          if (focusIndex === 0) setFocusSection('tabs')
          else setFocusIndex(prev => Math.max(prev - 1, 0))
        } else if (focusSection === 'actions') {
          if (focusIndex === 0) setFocusSection('tabs')
          else setFocusIndex(prev => Math.max(prev - 1, 0))
        }
      } else if (e.key === 'ArrowRight' && focusSection === 'tabs') {
        e.preventDefault()
        if (isProfile) return
        if (tab === 'online') setTab('offline')
        else if (tab === 'offline') setTab('pending')
      } else if (e.key === 'ArrowLeft' && focusSection === 'tabs') {
        e.preventDefault()
        if (isProfile) return
        if (tab === 'pending') setTab('offline')
        else if (tab === 'offline') setTab('online')
      } else if (e.key === 'Enter') {
        e.preventDefault()
        if (isProfile) {
          if (focusSection === 'actions') {
            if (focusIndex === 0) {
              bridge.sendFriendRequest(profileId).then(r => useStore.getState().flash(r.ok ? 'Friend request sent!' : r.error))
            } else {
              useStore.getState().flash('Muted.')
            }
          }
        } else {
          if (focusSection === 'list' && listData[focusIndex]) {
            if (tab === 'pending') {
              bridge.acceptFriendRequest(listData[focusIndex].sender_id).then(res => useStore.getState().flash(res.ok ? 'Accepted!' : res.error))
            } else {
              useStore.getState().setProfileModal(listData[focusIndex].id)
            }
          }
        }
      }
    }
    
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, focusSection, focusIndex, tab, listData, profileId])

  if (!open) return null

  const isProfile = profileId && profileId !== 'me'
  const tabFocused = (t) => focusSection === 'tabs' && tab === t

  return (
    <div
      ref={panelRef}
      className="identity social-panel open"
      role="dialog"
      aria-modal="true"
      aria-labelledby="social-title"
    >
      <h2 id="social-title" className="sr-only">{isProfile ? 'Player profile' : 'Friends and social'}</h2>
      {isProfile ? (
        <div className="col">
          {loading ? (
            <div className="panel-loading" role="status">Loading...</div>
          ) : remoteProf ? (
            <>
              <div className="profile-hero">
                <div className="profile-name">{remoteProf.name}</div>
                <div className="profile-title">{remoteProf.title}</div>
              </div>
              <div className="stat-grid inset">
                <div className="stat-row sm">
                  <span className="stat-label">Trees Planted</span><span>{remoteProf.treesPlanted}</span>
                </div>
                <div className="stat-row sm">
                  <span className="stat-label">Landmarks</span><span>{remoteProf.landmarks} / 10</span>
                </div>
                <div className="stat-row sm">
                  <span className="stat-label">Joined</span><span>{remoteProf.joinDate ? new Date(remoteProf.joinDate).toLocaleDateString() : 'Unknown'}</span>
                </div>
              </div>
              <div className="col actions">
                <button 
                  type="button"
                  className={`btn small kbd-focus${focusSection === 'actions' && focusIndex === 0 ? ' is-focused' : ''}`}
                  onClick={() => bridge.sendFriendRequest(profileId).then(r => useStore.getState().flash(r.ok ? 'Friend request sent!' : r.error, r.ok ? 'success' : 'error'))}
                >
                  Add Friend
                </button>
                <button 
                  type="button"
                  className={`btn small ghost kbd-focus${focusSection === 'actions' && focusIndex === 1 ? ' is-focused' : ''}`}
                  onClick={() => {
                    const muted = toggleMute(profileId, remoteProf.name)
                    useStore.getState().flash(muted ? `Muted ${remoteProf.name}` : `Unmuted ${remoteProf.name}`)
                  }}
                >
                  Mute
                </button>
                <button
                  type="button"
                  className="btn small danger-soft"
                  onClick={() => setReportOpen((v) => !v)}
                  aria-expanded={reportOpen}
                >
                  Report
                </button>
                {reportOpen && (
                  <div className="report-form" role="group" aria-label="Report player">
                    <label htmlFor="report-reason" className="sr-only">Reason</label>
                    <select
                      id="report-reason"
                      className="report-select"
                      value={reportReason}
                      onChange={(e) => setReportReason(e.target.value)}
                    >
                      {REPORT_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                    <label htmlFor="report-note" className="sr-only">Optional details</label>
                    <textarea
                      id="report-note"
                      className="report-note"
                      rows={2}
                      maxLength={400}
                      placeholder="Optional details…"
                      value={reportNote}
                      onChange={(e) => setReportNote(e.target.value)}
                      onFocus={() => useStore.getState().setInputContext('CHAT')}
                      onBlur={() => useStore.getState().setInputContext('UI')}
                    />
                    <button
                      type="button"
                      className="btn small danger-soft"
                      disabled={reportBusy}
                      onClick={async () => {
                        setReportBusy(true)
                        const res = await bridge.reportPlayer(
                          profileId,
                          reportReason,
                          reportNote.trim() || null
                        )
                        setReportBusy(false)
                        if (res.ok) {
                          useStore.getState().flash('Report submitted — thank you', 'success')
                          setReportOpen(false)
                          setReportNote('')
                        } else {
                          useStore.getState().flash(res.error || 'Could not send report', 'error')
                        }
                      }}
                    >
                      {reportBusy ? 'Sending…' : 'Submit report'}
                    </button>
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="panel-empty">Player not found.</div>
          )}
        </div>
      ) : (
        <>
          <div className="tabs-row">
            <input 
              type="text" 
              className="inline-input"
              placeholder="Add friend by name..." 
              value={searchName}
              onChange={(e) => { setSearchName(e.target.value); setSearchStatus(''); }}
              onFocus={() => useStore.getState().setInputContext('CHAT')}
              onBlur={() => useStore.getState().setInputContext('GAME')}
              onKeyDown={async (e) => {
                if (e.key === 'Enter' && searchName.trim()) {
                  setSearchStatus('Sending...')
                  const res = await bridge.sendFriendRequestByName(searchName.trim())
                  setSearchStatus(res.ok ? 'Sent!' : res.error)
                  if (res.ok) setTimeout(() => { setSearchName(''); setSearchStatus(''); }, 2000)
                }
              }}
            />
          </div>
          {searchStatus && (
            <div className={`search-status${searchStatus === 'Sent!' ? ' ok' : ' err'}`}>
              {searchStatus}
            </div>
          )}

          <div className="tabs-row">
            <button
              className={`btn small flex-tab kbd-focus${tab === 'online' ? ' active' : ''}${tabFocused('online') ? ' is-focused' : ''}`}
              onClick={() => setTab('online')}
            >
              Online
            </button>
            <button
              className={`btn small flex-tab kbd-focus${tab === 'offline' ? ' active' : ''}${tabFocused('offline') ? ' is-focused' : ''}`}
              onClick={() => setTab('offline')}
            >
              Offline
            </button>
            <button
              className={`btn small flex-tab has-badge kbd-focus${tab === 'pending' ? ' active' : ''}${tabFocused('pending') ? ' is-focused' : ''}`}
              onClick={() => setTab('pending')}
            >
              Req
              {requests.length > 0 && <span className="badge">{requests.length}</span>}
            </button>
          </div>

          <div className="scroll-list">
            {listData.length === 0 ? (
              <div className="list-empty">Nothing here</div>
            ) : (
              listData.map((item, i) => (
                <div
                  key={item.id || item.sender_id}
                  className={`list-item${focusSection === 'list' && focusIndex === i ? ' is-focused' : ''}`}
                >
                  <div
                    className="list-item-main"
                    onClick={() => useStore.getState().setProfileModal(tab === 'pending' ? item.sender_id : item.id)}
                  >
                    <div className="list-item-name">{item.name}</div>
                    <div className={`list-item-meta${tab === 'online' ? ' online' : ''}`}>
                      {tab === 'online' ? 'Online' : tab === 'offline' ? 'Offline' : 'Pending Request'}
                    </div>
                  </div>
                  {tab === 'pending' ? (
                    <div className="list-item-actions">
                      <button className="btn small icon-tight" onClick={() => bridge.acceptFriendRequest(item.sender_id).then(r => useStore.getState().flash(r.ok ? 'Accepted!' : r.error))}>✓</button>
                      <button className="btn small icon-tight ghost" onClick={() => bridge.declineFriendRequest(item.sender_id).then(r => useStore.getState().flash(r.ok ? 'Declined' : r.error))}>✕</button>
                    </div>
                  ) : (
                    <div className="list-item-actions">
                      <button className="btn small" onClick={() => useStore.getState().flash(tab === 'online' ? 'Whisper coming soon' : 'Offline')}>
                        {tab === 'online' ? 'Chat' : '...'}
                      </button>
                      <button className="btn small danger-soft" onClick={() => bridge.unfriend(item.id).then(r => useStore.getState().flash(r.ok ? 'Removed friend.' : r.error))}>
                        Remove
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </>
      )}
    </div>
  )
}
