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

installPaywallInterceptor()

const queryClient = createAppQueryClient()
setAppQueryClient(queryClient)

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </StrictMode>
)
