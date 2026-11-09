// Public auth screens enter the isolated UI flow only in Vite development.
// Patient URLs remain owned by their real authorization guards.
export const flowRoutes = Object.freeze({
  '#/signup': 'signup',
  '#/verify-email': 'verify-email',
  '#/login': 'login',
  '#/onboarding/file': 'patient-file',
  '#/onboarding/file/new': 'create-file',
  '#/onboarding/file/link': 'link-file',
  '#/onboarding/dashboard': 'dashboard',
})
export const stepRoutes = Object.fromEntries(Object.entries(flowRoutes).map(([route, step]) => [step, route]))
export function flowStep(hash = '') { return flowRoutes[hash.split('?')[0]] }
