import pricingHtml from '../sections/pricing/pricing.html?raw'

export function Pricing() {
  return (
    <section
      id="landing-pricing"
      dangerouslySetInnerHTML={{ __html: pricingHtml }}
    />
  )
}

