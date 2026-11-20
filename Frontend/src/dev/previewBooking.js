import Checkout from '../portal/booking/BookingCheckout.jsx'
import Reschedule from '../portal/booking/AppointmentReschedule.jsx'
import Payment from '../portal/booking/PaymentMethod.jsx'
import { totalPrice } from '../portal/portalModel.js'
import { processHostedPayment } from '../services/hostedPayment.js'
import { requestServiceOperation } from '../services/serviceTransport.js'

const unavailable = () => requestServiceOperation('previewPayment')
const bookingApi = { createHostedPayment: unavailable, verifyPaymentAndBooking: unavailable, confirmPayAtLaboratory: unavailable }

export const previewBooking = {
  Checkout, Reschedule, Payment,
  run(state, draft, { receiptEmail, confirmCard }) {
    const payload = { requestId: draft.requestId, tests: draft.tests, date: draft.date, time: draft.time,
      method: draft.method, type: draft.type, orderId: draft.orderId || undefined }
    return draft.method === 'online'
      ? processHostedPayment({ api: bookingApi, payload, receiptEmail, confirmCard, expectedAmount: totalPrice(draft.tests, state.tests) })
      : bookingApi.confirmPayAtLaboratory(payload)
  },
}
