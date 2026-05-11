import { AwsRum } from 'aws-rum-web'

let awsRum = null

export function initRum() {
  const applicationId = import.meta.env.VITE_RUM_APP_ID
  const identityPoolId = import.meta.env.VITE_RUM_IDENTITY_POOL_ID
  const region = import.meta.env.VITE_RUM_REGION || 'us-east-1'

  if (!applicationId || !identityPoolId) {
    return null
  }

  try {
    awsRum = new AwsRum(applicationId, '1.0.0', region, {
      sessionSampleRate: 1,
      identityPoolId,
      endpoint: `https://dataplane.rum.${region}.amazonaws.com`,
      telemetries: ['errors', 'performance', 'http'],
      allowCookies: true,
      enableXRay: false,
    })
    return awsRum
  } catch (err) {
    console.error('RUM init failed:', err)
    return null
  }
}

export function rumSetUser(user) {
  if (!awsRum || !user) return
  try {
    awsRum.addSessionAttributes({
      userId: String(user.id ?? ''),
      tier: String(user.tier ?? user.plan ?? ''),
    })
  } catch {}
}

export function rumClearUser() {
  if (!awsRum) return
  try {
    awsRum.addSessionAttributes({ userId: '', tier: '' })
  } catch {}
}

export function rumRecordError(err, meta) {
  if (!awsRum || !err) return
  try {
    awsRum.recordError(err)
    if (meta) awsRum.recordEvent('clixa_meta', meta)
  } catch {}
}
