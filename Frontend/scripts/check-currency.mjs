import assert from 'node:assert/strict'
import { CURRENCY, formatCurrency } from '../src/utils/currency.js'

assert.equal(CURRENCY.code, 'ILS')
assert.equal(formatCurrency(80, 'en'), '\u20AA80.00')
assert.equal(formatCurrency(80, 'ar'), '80.00 \u20AA')
assert.equal(formatCurrency(80, 'ar-PS'), '80.00 \u20AA')
assert.equal(formatCurrency(25.5, 'en'), '\u20AA25.50')
assert.equal(formatCurrency(25.555, 'ar'), '25.56 \u20AA')
assert.equal(formatCurrency(0, 'en'), '\u20AA0.00')
assert.equal(formatCurrency(1234.5, 'ar'), '1,234.50 \u20AA')
assert.equal(formatCurrency(Number.NaN), '\u2014')
const price = 80
formatCurrency(price, 'ar')
assert.equal(price, 80)
console.log('Currency checks passed: ILS symbol, EN/AR placement, two decimals, grouping, rounding, and unchanged numerical values.')
