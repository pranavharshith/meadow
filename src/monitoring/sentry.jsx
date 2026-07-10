import * as Sentry from '@sentry/react'

const dsn = import.meta.env.VITE_SENTRY_DSN
const tracesRate = Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? 0)

export function initMonitoring() {
  if (!dsn) return

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    tracesSampleRate: Number.isFinite(tracesRate) ? tracesRate : 0,
    sendDefaultPii: false,
    beforeSend(event) {
      // Deep-scrub string properties for PII before transmission
      try {
        let eventStr = JSON.stringify(event)
        
        // Scrub UUIDs (Supabase auth IDs, tree IDs, etc)
        const uuidRegex = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
        eventStr = eventStr.replace(uuidRegex, '[FILTERED_UUID]')
        
        // Scrub email addresses (in case any leak in auth errors or chat)
        const emailRegex = /([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)/gi
        eventStr = eventStr.replace(emailRegex, '[FILTERED_EMAIL]')
        
        return JSON.parse(eventStr)
      } catch (err) {
        // If parsing fails for some edge case, drop the event completely rather than risk a leak
        return null
      }
    }
  })
}

import React, { Component } from 'react'

class LocalErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }
  componentDidCatch(error, errorInfo) {
    console.error('Fatal React Error Caught:', error, errorInfo)
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback
    }
    return this.props.children
  }
}

export function AppErrorBoundary({ children }) {
  const fallbackUI = (
    <div className="fatal-error">
      <div className="fatal-error-title">The meadow hit a snag.</div>
      <p style={{ marginTop: '10px', fontSize: '14px', color: '#ffaaaa' }}>
        Check the browser console for details and relay the error to the AI!
      </p>
      <button style={{ marginTop: '20px' }} onClick={() => window.location.reload()}>Reload</button>
    </div>
  )

  if (!dsn) {
    return <LocalErrorBoundary fallback={fallbackUI}>{children}</LocalErrorBoundary>
  }

  return (
    <Sentry.ErrorBoundary fallback={fallbackUI}>
      {children}
    </Sentry.ErrorBoundary>
  )
}
