import socialProofHtml from '../sections/social-proof/social-proof.html?raw'

export function SocialProof() {
  return (
    <section
      id="landing-social-proof"
      dangerouslySetInnerHTML={{ __html: socialProofHtml }}
    />
  )
}

