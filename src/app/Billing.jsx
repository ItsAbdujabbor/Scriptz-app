/**
 * Billing — first-class authenticated screen at `#billing`.
 *
 * Renders inside the shared Dashboard shell chain (dashboard-main-scroll →
 * dashboard-main--subpage → dashboard-content-shell--page) so its outer
 * chrome is pixel-identical to `#pro` / `#optimize`.
 */
import { BillingSettingsPanel } from '../components/BillingSettingsPanel'
import './Billing.css'

export function Billing() {
  return (
    <div className="dashboard-main-scroll">
      <div className="dashboard-main dashboard-main--subpage">
        <div className="dashboard-content-shell dashboard-content-shell--page">
          <div className="billing-page">
            <header className="billing-page-header">
              <h1 className="billing-page-title">Billing</h1>
              <p className="billing-page-sub">Plan, credits, and invoices — all in one place.</p>
            </header>
            <div className="billing-page-body">
              <BillingSettingsPanel active />
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

export default Billing
