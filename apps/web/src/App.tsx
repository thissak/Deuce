import { useQuery } from '@tanstack/react-query'
import { meQuery } from './api/queries'
import { LoginScreen } from './auth/LoginScreen'
import { Shell } from './components/Shell'

export function App() {
  const me = useQuery(meQuery)
  if (me.isPending) return null
  if (!me.data) return <LoginScreen />
  return <Shell me={me.data} />
}
