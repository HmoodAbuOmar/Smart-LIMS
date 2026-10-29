export const CURRENCY = Object.freeze({ code: 'ILS', symbol: '\u20AA' })

// Display only: the original price is never converted or mutated.
// Latin digits and a decimal point match the requested format in both languages.
const decimals = new Intl.NumberFormat('en-IL', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  numberingSystem: 'latn',
})

export function formatCurrency(amount, language = 'en') {
  if (typeof amount !== 'number' || !Number.isFinite(amount)) return '\u2014'
  const formatted = decimals.format(amount)
  return language.toLowerCase().startsWith('ar')
    ? `${formatted} ${CURRENCY.symbol}`
    : `${CURRENCY.symbol}${formatted}`
}
