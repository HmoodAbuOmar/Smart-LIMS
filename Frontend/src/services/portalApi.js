// No URL or payload contract is invented. Wire these operations only after the
// backend publishes patient-owned, server-authorized portal contracts.
async function unavailable() { const error = new Error('Portal transport is not configured'); error.code = 'SERVICE_UNAVAILABLE'; throw error }
export const portalApi = Object.freeze({ loadWorkspace: unavailable, saveProfile: unavailable, createOrder: unavailable, bookAppointment: unavailable, rescheduleAppointment: unavailable, cancelAppointment: unavailable, readNotifications: unavailable, downloadReport: unavailable, logout: unavailable })
// Hosted session creation must never itself count as verified payment success.
export const bookingApi = Object.freeze({ createHostedPayment: unavailable, verifyPaymentAndBooking: unavailable, confirmPayAtLaboratory: unavailable })
