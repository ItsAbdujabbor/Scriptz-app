/**
 * YouTube — thumbnail-fetch only.
 *
 * The full YouTube account integration was removed. The single capability
 * left is "given a YouTube URL, get the thumbnail image" so the user can
 * use a real video's thumbnail as a reference for AI image generation.
 */

import { apiFetch } from '../lib/apiFetch.js'

export const youtubeApi = {
  /**
   * Fetch the thumbnail image bytes for a YouTube URL.
   * Returns a Blob the caller can pass to URL.createObjectURL or upload.
   */
  fetchThumbnail(accessToken, youtubeUrl) {
    return apiFetch(`/api/youtube/thumbnail?url=${encodeURIComponent(youtubeUrl)}`, {
      method: 'GET',
      token: accessToken,
      responseType: 'blob',
    })
  },

  /**
   * Resolve the canonical public thumbnail URL for a YouTube video without
   * fetching the bytes. Returns `{ video_id, url, fallback_url }`.
   */
  getThumbnailUrl(accessToken, youtubeUrl) {
    return apiFetch(`/api/youtube/thumbnail-url?url=${encodeURIComponent(youtubeUrl)}`, {
      method: 'GET',
      token: accessToken,
    })
  },
}
