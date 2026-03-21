import resultsHtml from '../sections/results/results.html?raw'

export function Results() {
  return (
    <section
      id="landing-results"
      dangerouslySetInnerHTML={{ __html: resultsHtml }}
    />
  )
}

