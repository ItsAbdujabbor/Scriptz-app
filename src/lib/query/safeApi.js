/**
 * Treat auth failures as empty data so queryFns don't throw (avoids unhandled
 * rejections in dev when the API returns 401 — e.g. wrong/missing JWT secret, expired session).
 */
export async function resultOrNullOnAuthFailure(promise) {
  try {
    return await promise
  } catch (e) {
    const s = e?.status
    if (s === 401 || s === 403) return null
    throw e
  }
}
