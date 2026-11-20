export const categories = ['blood', 'vitamins', 'thyroid', 'liver', 'kidney', 'lipids', 'diabetes']

export const apiTestCategory = value => ({ blood: 'BLOOD_TESTS', vitamins: 'VITAMINS_MINERALS' }[value] ||
  (value === 'all' ? undefined : value.toUpperCase()))
