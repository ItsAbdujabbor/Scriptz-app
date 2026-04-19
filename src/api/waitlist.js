/**
 * Landing waitlist — calls Brevo Contacts API directly from the browser.
 *
 * Set in .env (Vite): VITE_BREVO_API_KEY, optional VITE_BREVO_LIST_ID.
 * VITE_* values are embedded in the build — restrict the key in Brevo (contacts only).
 *
 * Dev: requests go to /__brevo/v3/contacts (Vite proxies to api.brevo.com) to avoid CORS.
 * Prod: set VITE_BREVO_API_URL to a same-origin path if your host proxies to Brevo, or rely on Brevo CORS.
 */

import { getViteEnv } from '../lib/env.js'

const DEFAULT_BREVO = 'https://api.brevo.com/v3/contacts'

function getContactsUrl() {
  const env = getViteEnv()
  const custom = env?.VITE_BREVO_API_URL
  if (custom && String(custom).trim() !== '') return String(custom).trim()
  if (env?.DEV) return '/__brevo/v3/contacts'
  return DEFAULT_BREVO
}

/**
 * @param {string} email
 * @param {string} [honeypot]
 * @returns {Promise<{ ok?: boolean, message?: string }>}
 */
export async function joinWaitlist(email, honeypot) {
  if (honeypot && String(honeypot).trim() !== '') {
    return { ok: true, message: "You're on the list." }
  }

  const env = getViteEnv()
  const apiKey = (env?.VITE_BREVO_API_KEY || '').trim()
  if (!apiKey) {
    throw new Error('Waitlist is not configured (add VITE_BREVO_API_KEY to .env).')
  }

  const listRaw = env?.VITE_BREVO_LIST_ID
  const payload = {
    email: email.trim().toLowerCase(),
    updateEnabled: true,
  }
  if (listRaw !== undefined && listRaw !== null && String(listRaw).trim() !== '') {
    const n = parseInt(String(listRaw).trim(), 10)
    if (!Number.isNaN(n)) payload.listIds = [n]
  }

  const url = getContactsUrl()
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': apiKey,
    },
    body: JSON.stringify(payload),
  })

  const data = await res.json().catch(() => ({}))

  if (res.ok || res.status === 201 || res.status === 204) {
    return { ok: true, message: "You're on the list." }
  }

  if (res.status === 400) {
    const msg = String(data.message || '')
    if (/duplicate|already|exist/i.test(msg)) {
      return { ok: true, message: "You're on the list." }
    }
  }

  let errMsg = res.statusText
  if (typeof data.message === 'string') errMsg = data.message
  if (res.status === 401 && /IP|authorised|authorized/i.test(errMsg)) {
    errMsg =
      'Could not complete sign-up. If you use Brevo IP allowlisting, add this network or use a proxy.'
  }
  const err = new Error(errMsg || 'Could not join the waitlist.')
  err.status = res.status
  throw err
}
