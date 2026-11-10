import { portalApi } from '../services/portalApi.js'

// Reuse the existing sign-out boundary. Never claim success or clear preferences
// when the configured sign-out operation fails.
export const receptionistSession = { signOut: () => portalApi.logout() }
