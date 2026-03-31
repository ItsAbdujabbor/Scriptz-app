import { Dashboard } from './app/Dashboard'
import { CoachChat } from './app/CoachChat'
import { Optimize } from './app/Optimize'
import { Pro } from './app/Pro'
import { Library } from './app/Library'

/**
 * All primary app shells in one chunk so moving between them does not remount Suspense
 * or replace the whole tree (sidebar stays stable).
 */
export default function AuthenticatedRoutes({ view, onLogout }) {
  switch (view) {
    case 'dashboard':
      return <Dashboard onLogout={onLogout} />
    case 'coach':
      return <CoachChat onLogout={onLogout} />
    case 'optimize':
      return <Optimize onLogout={onLogout} />
    case 'pro':
      return <Pro onLogout={onLogout} />
    case 'library':
      return <Library onLogout={onLogout} />
    default:
      return null
  }
}
