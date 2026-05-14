import { useEffect, useRef, useState } from 'react'
// Self-import the FAQ CSS so the component renders correctly wherever
// it's mounted (landing, Pro pricing screen, etc.). The landing's
// styles.css used to be the only consumer, but the component now
// travels its styling with it so other screens can drop it in.
import '../sections/faq/faq.css'

const FAQS = [
  {
    q: 'What is Clixa AI?',
    a: (
      <p>
        Clixa AI is a YouTube packaging workspace — generate thumbnails from a prompt, paint a
        region to regenerate just that part, face-swap saved characters onto any image, brainstorm
        titles, and score every option before you publish — all in one place.
      </p>
    ),
  },
  {
    q: 'What can I create with the AI Thumbnail Generator?',
    a: (
      <p>
        Describe the idea in plain language and the Generator turns it into original 16:9 YouTube
        thumbnails in seconds. Attach reference photos you own, pick a saved style, and generate as
        many variations as you need — all in the same chat.
      </p>
    ),
  },
  {
    q: 'How does the Region Editor work?',
    a: (
      <p>
        Open any thumbnail, brush over the area you want to change, describe the change in plain
        language — only that region regenerates, the rest stays exactly as it was. The same panel
        handles face-swap with your saved characters.
      </p>
    ),
  },
  {
    q: 'How does the Analyzer score thumbnails and titles?',
    a: (
      <p>
        Every thumbnail gets a <strong>0–100 score</strong> with breakdowns for clarity, emotion,
        and click potential — plus written feedback on what's working and what to fix. Title
        Brainstorm scores titles on the same scale so you can pair the strongest title with the
        strongest thumbnail.
      </p>
    ),
  },
  {
    q: 'Can I keep a consistent look across my channel?',
    a: (
      <p>
        Yes. Save reusable <strong>visual styles</strong> (colours, layout, typography) and reusable{' '}
        <strong>characters</strong> (built from your own content or AI-generated originals), then
        apply them to every new thumbnail with one click.
      </p>
    ),
  },
  {
    q: 'What kind of images can I upload?',
    a: (
      <p>
        References and photos you <strong>own or have rights to</strong> — your own product shots,
        b-roll, brand art, or portraits of yourself. Uploading content that impersonates another
        person or infringes third-party rights is not permitted under our{' '}
        <a href="#terms" className="faq-link">
          Terms of Service
        </a>
        .
      </p>
    ),
  },
  {
    q: 'Can I download my thumbnails and use them on YouTube?',
    a: (
      <p>
        Yes — every thumbnail you generate is yours to download in YouTube-ready resolution and use
        on the channels you run. Generated thumbnails are royalty-free for your channels, subject to
        our Terms and the rights guidance for any reference images you uploaded.
      </p>
    ),
  },
  {
    q: 'How do credits work?',
    a: (
      <p>
        Every generation spends a transparent number of credits, shown on the button before you
        click. <strong>Starter</strong> includes 1,000 credits/month (~50 thumbnails at 20 credits
        each), <strong>Creator</strong> 3,000 (~150), <strong>Ultimate</strong> 9,000 (~450). Annual
        plans add a <strong>15% bonus</strong> on top.
      </p>
    ),
  },
  {
    q: 'Can I change plans, get more credits, or cancel anytime?',
    a: (
      <p>
        Yes to all three. Top up with a credit pack any time from the in-app billing screen, upgrade
        for a larger allowance (effective immediately, prorated), or cancel from your account
        settings — cancellation takes effect at the end of the current period. No email tickets
        required.
      </p>
    ),
  },
  {
    q: 'How do I try Clixa before subscribing?',
    a: (
      <p>
        Every new account gets <strong>100 free credits</strong> on sign-up — enough to generate a
        handful of thumbnails and explore the editor end-to-end before deciding. When you're ready
        for more, pick a plan (Starter / Creator / Ultimate); subscriptions are charged immediately
        and you get the full monthly credit allotment from day one.
      </p>
    ),
  },
  {
    q: 'Do you offer refunds?',
    a: (
      <p>
        Yes. New subscribers get a <strong>14-day satisfaction window</strong> for a full refund
        (provided you've consumed under 20% of credits). Unused credit packs are fully refundable
        within 7 days. Duplicate charges and outages over 24 hours are always refunded — see our{' '}
        <a href="#refund" className="faq-link">
          Refund Policy
        </a>{' '}
        for full terms.
      </p>
    ),
  },
  {
    q: 'What payment methods do you accept?',
    a: (
      <p>
        Paddle (our payment processor) handles all major credit and debit cards, Apple Pay, Google
        Pay, and PayPal. Local methods like iDEAL, SEPA, and others appear automatically based on
        your billing country, and Paddle handles VAT/sales tax for you on every invoice.
      </p>
    ),
  },
]

export function Faq() {
  const [openIndex, setOpenIndex] = useState(-1)

  return (
    <section className="faq-section" id="faq" aria-labelledby="faq-heading">
      <div className="faq-inner">
        {/* Header */}
        <div className="faq-header faq-reveal">
          <div className="faq-badge">
            <span className="faq-dot" />
            FAQ
          </div>
          <h2 className="faq-h2" id="faq-heading">
            Frequently Asked
            <br />
            <span className="faq-accent">Questions</span>
          </h2>
          <p className="faq-lead">Everything you need to know — product, billing, and rights.</p>
          <p className="faq-helper">
            Still have questions?{' '}
            <a href="mailto:support@clixa.app" className="faq-link">
              Email support@clixa.app
            </a>{' '}
            and a real person on our team will reply.
          </p>
        </div>

        {/* Accordion */}
        <div className="faq-list faq-reveal" role="list">
          {FAQS.map((item, i) => (
            <FaqItem
              key={i}
              q={item.q}
              a={item.a}
              isOpen={openIndex === i}
              onToggle={() => setOpenIndex((cur) => (cur === i ? -1 : i))}
            />
          ))}
        </div>
      </div>
    </section>
  )
}

function FaqItem({ q, a, isOpen, onToggle }) {
  const panelRef = useRef(null)
  const [maxHeight, setMaxHeight] = useState(0)

  useEffect(() => {
    if (isOpen && panelRef.current) {
      setMaxHeight(panelRef.current.scrollHeight)
    } else {
      setMaxHeight(0)
    }
  }, [isOpen])

  return (
    <div className={`faq-item${isOpen ? ' faq-open' : ''}`} role="listitem">
      <button type="button" className="faq-q" aria-expanded={isOpen} onClick={onToggle}>
        <span>{q}</span>
        <span className="faq-chevron" aria-hidden="true">
          <svg
            viewBox="0 0 20 20"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polyline points="5 8 10 13 15 8" />
          </svg>
        </span>
      </button>
      <div
        ref={panelRef}
        className="faq-a"
        role="region"
        style={{ maxHeight: isOpen ? maxHeight : 0 }}
      >
        <div className="faq-a-body">{a}</div>
      </div>
    </div>
  )
}
