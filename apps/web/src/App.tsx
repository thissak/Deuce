import { useQuery } from '@tanstack/react-query'
import { meQuery } from './api/queries'
import { LoginScreen } from './auth/LoginScreen'
import { Shell } from './components/Shell'
import { SocketProvider } from './realtime/socket'
import { DesktopBadge } from './components/DesktopBadge'

export function App() {
  const me = useQuery(meQuery)
  if (me.isPending) return null
  if (!me.data) return <><DesktopBadge signedIn={false} /><LoginScreen /></>
  return (
    <>
      <DesktopBadge signedIn />
      <SocketProvider meId={me.data.id}>
        <Shell me={me.data} />
      </SocketProvider>
    </>
  )
}
