import { useEffect, useState } from 'react'
import { getExperimentVariant, track } from './analytics'

/**
 * Read the assigned variant for an experiment.
 *
 *   const { variant, loading } = useExperiment('paywall_copy_v2')
 *   if (loading) return null
 *   return variant === 'treatment' ? <NewCopy /> : <OldCopy />
 *
 * Side effect: emits a `client_experiment_exposure` event the first time a
 * variant is resolved for the current page. This is what the admin
 * "Experiments" results panel counts as an exposure.
 */
export function useExperiment(key) {
  const [state, setState] = useState({ variant: null, loading: true })

  useEffect(() => {
    if (!key) {
      setState({ variant: null, loading: false })
      return
    }
    let cancelled = false
    getExperimentVariant(key).then((variant) => {
      if (cancelled) return
      setState({ variant, loading: false })
      if (variant) {
        track('client_experiment_exposure', {
          __exp_key: key,
          __exp_variant: variant,
        })
      }
    })
    return () => {
      cancelled = true
    }
  }, [key])

  return state
}
