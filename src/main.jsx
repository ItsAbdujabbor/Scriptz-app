import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// design-tokens.css must load BEFORE every other stylesheet so its CSS
// custom properties (--accent-gradient, --surface-card, --radius-md, etc.)
// are resolved by every downstream rule. All app CSS should reference
// these tokens; legacy --dash-*/--vo-*/--auth-* names are aliased here.
import './design-tokens.css'
import './index.css'
import './dot-background.css'
import App from './App.jsx'
import { QueryClientProvider } from '@tanstack/react-query'
import { createAppQueryClient } from './lib/query/queryClient'
import { setAppQueryClient } from './lib/sessionReset'
import { installPaywallInterceptor } from './lib/paywallInterceptor'
import { installConversationLRU } from './queries/thumbnails/conversationLRU'

installPaywallInterceptor()

const queryClient = createAppQueryClient()
setAppQueryClient(queryClient)
// Cap the in-memory thumbnail conversation cache at the most-recent 50
// chats; persists the order to localStorage so the LRU bookkeeping
// survives reloads (messages re-fetch lazily on first open).
installConversationLRU(queryClient, { capacity: 50 })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
