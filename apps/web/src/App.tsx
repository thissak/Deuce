import { useQuery } from '@tanstack/react-query'
import { meQuery } from './api/queries'
import { LoginScreen } from './auth/LoginScreen'
import { Shell } from './components/Shell'
import { SocketProvider } from './realtime/socket'

export function App() {
  const me = useQuery(meQuery)
  if (me.isPending) return null
  if (!me.data) return <LoginScreen />
  return (
    <SocketProvider meId={me.data.id}>
      <Shell me={me.data} />
    </SocketProvider>
  )
}
