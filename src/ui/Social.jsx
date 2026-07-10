import { useState, useEffect, useRef } from 'react'
import { useStore } from '../store'
import { bridge } from '../net/bridge'

export default function Social() {
  const open = useStore((s) => s.socialOpen)
  const close = () => {
    useStore.getState().setSocialOpen(false)
    useStore.getState().setProfileModal(null)
  }
  
  // profileModal id (if it is not 'me' and not null, we show the remote profile view)
  const profileId = useStore((s) => s.profileModal)
  
  const [tab, setTab] = useState('online') // online, offline, pending
  const [focusSection, setFocusSection] = useState('tabs') // 'tabs', 'list', 'actions'
  const [focusIndex, setFocusIndex] = useState(0)
  
  const [remoteProf, setRemoteProf] = useState(null)
  const [loading, setLoading] = useState(false)
  
  const friends = useStore((s) => s.friends) || []
  const requests = useStore((s) => s.friendRequests) || []
  
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

  return (
    <div className="identity social-panel open" style={{ width: 280 }}>
      {isProfile ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {loading ? (
            <div style={{ color: 'rgba(255,255,255,0.7)', textAlign: 'center', padding: '20px 0' }}>Loading...</div>
          ) : remoteProf ? (
            <>
              <div style={{ textAlign: 'center', margin: '8px 0' }}>
                <div style={{ fontSize: '18px', fontWeight: 'bold', color: 'white' }}>{remoteProf.name}</div>
                <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.7)' }}>{remoteProf.title}</div>
              </div>
              <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'white', marginBottom: '4px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Trees Planted</span><span>{remoteProf.treesPlanted}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'white', marginBottom: '4px' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Landmarks</span><span>{remoteProf.landmarks} / 10</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: 'white' }}>
                  <span style={{ color: 'rgba(255,255,255,0.7)' }}>Joined</span><span>{remoteProf.joinDate ? new Date(remoteProf.joinDate).toLocaleDateString() : 'Unknown'}</span>
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <button 
                  className="btn small" 
                  style={{ outline: focusSection === 'actions' && focusIndex === 0 ? '2px solid white' : 'none' }}
                  onClick={() => bridge.sendFriendRequest(profileId).then(r => useStore.getState().flash(r.ok ? 'Friend request sent!' : r.error))}
                >
                  Add Friend
                </button>
                <button 
                  className="btn small" 
                  style={{ background: 'rgba(255,255,255,0.1)', outline: focusSection === 'actions' && focusIndex === 1 ? '2px solid white' : 'none' }}
                  onClick={() => useStore.getState().flash('Muted.')}
                >
                  Mute
                </button>
              </div>
            </>
          ) : (
            <div style={{ color: 'white', textAlign: 'center' }}>Player not found.</div>
          )}
        </div>
      ) : (
        <>
          <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
            <button className={`btn small ${tab === 'online' ? 'active' : ''}`} style={{ flex: 1, outline: focusSection === 'tabs' && tab === 'online' ? '2px solid white' : 'none' }} onClick={() => setTab('online')}>Online</button>
            <button className={`btn small ${tab === 'offline' ? 'active' : ''}`} style={{ flex: 1, outline: focusSection === 'tabs' && tab === 'offline' ? '2px solid white' : 'none' }} onClick={() => setTab('offline')}>Offline</button>
            <button className={`btn small ${tab === 'pending' ? 'active' : ''}`} style={{ flex: 1, outline: focusSection === 'tabs' && tab === 'pending' ? '2px solid white' : 'none', position: 'relative' }} onClick={() => setTab('pending')}>
              Req
              {requests.length > 0 && <span style={{ position: 'absolute', top: -4, right: -4, background: 'red', color: 'white', fontSize: 10, borderRadius: '50%', padding: '0 4px' }}>{requests.length}</span>}
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: '200px', overflowY: 'auto' }}>
            {listData.length === 0 ? (
              <div style={{ color: 'rgba(255,255,255,0.5)', textAlign: 'center', padding: '10px 0', fontSize: 12 }}>Nothing here</div>
            ) : (
              listData.map((item, i) => (
                <div key={item.id || item.sender_id} style={{ 
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', 
                  background: 'rgba(0,0,0,0.2)', padding: '6px 8px', borderRadius: '4px',
                  outline: focusSection === 'list' && focusIndex === i ? '2px solid white' : 'none'
                }}>
                  <div style={{ cursor: 'pointer', flex: 1 }} onClick={() => useStore.getState().setProfileModal(tab === 'pending' ? item.sender_id : item.id)}>
                    <div style={{ color: 'white', fontSize: 13, fontWeight: 'bold' }}>{item.name}</div>
                    <div style={{ fontSize: 10, color: tab === 'online' ? '#4caf50' : 'rgba(255,255,255,0.5)' }}>
                      {tab === 'online' ? 'Online' : tab === 'offline' ? 'Offline' : 'Pending Request'}
                    </div>
                  </div>
                  {tab === 'pending' ? (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn small" style={{ padding: '0 6px' }} onClick={() => bridge.acceptFriendRequest(item.sender_id).then(r => useStore.getState().flash(r.ok ? 'Accepted!' : r.error))}>✓</button>
                      <button className="btn small" style={{ padding: '0 6px', background: 'rgba(255,255,255,0.1)' }} onClick={() => bridge.declineFriendRequest(item.sender_id).then(r => useStore.getState().flash(r.ok ? 'Declined' : r.error))}>✕</button>
                    </div>
                  ) : (
                    <button className="btn small" onClick={() => useStore.getState().flash(tab === 'online' ? 'Whisper coming soon' : 'Offline')}>
                      {tab === 'online' ? 'Chat' : '...'}
                    </button>
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
