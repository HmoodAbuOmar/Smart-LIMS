import assert from 'node:assert/strict'
import { validateAuth } from '../src/utils/authValidation.js'

const valid = { name: 'Test User', email: 'test@example.com', password: 'StrongPass9!', confirmPassword: 'StrongPass9!' }
assert.deepEqual(validateAuth(valid, 'signup'), {})
assert.deepEqual(validateAuth({ ...valid, password: 'مختبرذكي١!', confirmPassword: 'مختبرذكي١!' }, 'signup'), {})
assert.deepEqual(validateAuth({ name: ' ', email: '', password: '', confirmPassword: '' }, 'signup'), {
  name: 'nameRequired', email: 'emailRequired', password: 'passwordRequired', confirmPassword: 'confirmRequired',
})
for (const email of ['test', 'test@', '@example.com', 'test example@test.com']) {
  assert.equal(validateAuth({ ...valid, email }, 'signup').email, 'emailInvalid')
}
for (const password of ['Aa1!', 'NoNumbers!', 'NoSymbols123', '12345678!']) {
  assert.equal(validateAuth({ ...valid, password }, 'signup').password, 'passwordWeak')
}
assert.equal(validateAuth({ ...valid, confirmPassword: 'Different9!' }, 'signup').confirmPassword, 'passwordMismatch')
// Login must not impose new registration rules on existing passwords.
assert.deepEqual(validateAuth({ email: 'test@example.com', password: 'existing' }, 'login'), {})
assert.equal(validateAuth({ email: 'bad', password: '' }, 'login').password, 'passwordRequired')
console.log('Authentication UI validation checks passed.')
