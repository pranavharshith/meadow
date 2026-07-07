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
  })
}

export function AppErrorBoundary({ children }) {
  if (!dsn) return children

  return (
    <Sentry.ErrorBoundary
      fallback={
        <div className="fatal-error">
          <div className="fatal-error-title">The meadow hit a snag.</div>
          <button onClick={() => window.location.reload()}>Reload</button>
        </div>
      }
    >
      {children}
    </Sentry.ErrorBoundary>
  )
}
