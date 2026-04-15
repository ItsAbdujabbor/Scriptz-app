/**
 * Billing — top-level page wrapping the existing BillingSettingsPanel.
 *
 * Promoted out of SettingsModal so it's a first-class screen at `#billing`,
 * matching the pattern used by Dashboard / Optimize / A/B Testing.
 */
import { BillingSettingsPanel } from '../components/BillingSettingsPanel'
import './Billing.css'

export function Billing() {
  return (
    <div className="billing-page">
      <header className="billing-page-header">
        <h1 className="billing-page-title">Billing</h1>
        <p className="billing-page-sub">Plan, credits, and invoices — all in one place.</p>
      </header>
      <div className="billing-page-body">
        <BillingSettingsPanel active />
      </div>
    </div>
  )
}

export default Billing
