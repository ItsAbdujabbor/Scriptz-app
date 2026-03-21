import solutionHtml from '../sections/solution/solution.html?raw'

export function Solution() {
  return (
    <section
      id="landing-solution"
      dangerouslySetInnerHTML={{ __html: solutionHtml }}
    />
  )
}

