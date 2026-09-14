import { useSessionStore } from '@renderer/shared/sessionStore'
import { Login } from './Login'
import { Shell } from './Shell'
import { Spinner } from './components/ui'

export function App() {
  const loaded = useSessionStore((s) => s.loaded)
  const session = useSessionStore((s) => s.session)
  if (!loaded) {
    return (
      <div className="drag flex h-full items-center justify-center bg-surface">
        <Spinner />
      </div>
    )
  }
  return session ? <Shell /> : <Login />
}
