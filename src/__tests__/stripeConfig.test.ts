import { getStripe, priceIdFor, isStripeTestMode } from '@/lib/stripe'

/**
 * Every one of these mistakes reaches the person paying as the same
 * sentence — "Could not start checkout" — and reaches the log as whatever
 * Stripe chose to say about it. "No such price: prod_Abc" does not name
 * which of three variables holds that value.
 */
describe('Stripe configuration errors name the variable and the fix', () => {
  const ENV = { ...process.env }
  afterEach(() => {
    process.env = { ...ENV }
  })

  describe('the secret key', () => {
    it('says when it is missing', () => {
      delete process.env.STRIPE_SECRET_KEY
      expect(() => getStripe()).toThrow(/STRIPE_SECRET_KEY is not set/)
    })

    it('recognises a publishable key in the secret slot', () => {
      // The two sit next to each other on the API keys page and the app
      // would otherwise report Stripe's "Invalid API Key provided".
      process.env.STRIPE_SECRET_KEY = 'pk_test_51abcdef'
      expect(() => getStripe()).toThrow(/publishable key/)
      expect(() => getStripe()).toThrow(/sk_/)
    })

    it('rejects anything that is not a key at all', () => {
      process.env.STRIPE_SECRET_KEY = 'whsec_somethingelse'
      expect(() => getStripe()).toThrow(/does not look like a Stripe secret key/)
    })

    it('accepts a real secret key', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_51abcdef'
      expect(() => getStripe()).not.toThrow()
    })
  })

  describe('the price ids', () => {
    it('says which variable is unset', () => {
      delete process.env.STRIPE_PRICE_PERSONAL_ANNUAL
      expect(() => priceIdFor('PERSONAL_ANNUAL')).toThrow(/STRIPE_PRICE_PERSONAL_ANNUAL is not set/)
    })

    it('recognises a product id pasted in place of a price id', () => {
      process.env.STRIPE_PRICE_PERSONAL_MONTHLY = 'prod_QxYz123'
      expect(() => priceIdFor('PERSONAL_MONTHLY')).toThrow(/STRIPE_PRICE_PERSONAL_MONTHLY/)
      expect(() => priceIdFor('PERSONAL_MONTHLY')).toThrow(/product id/)
      expect(() => priceIdFor('PERSONAL_MONTHLY')).toThrow(/price_/)
    })

    it('recognises a payment link', () => {
      process.env.STRIPE_PRICE_PERSONAL_LIFETIME = 'https://buy.stripe.com/test_abc'
      expect(() => priceIdFor('PERSONAL_LIFETIME')).toThrow(/URL/)
    })

    it('names the value when it is something else entirely', () => {
      process.env.STRIPE_PRICE_PERSONAL_MONTHLY = 'RON 14.99'
      expect(() => priceIdFor('PERSONAL_MONTHLY')).toThrow(/RON 14\.99/)
    })

    it('accepts a real price id, trimming a stray copy-paste space', () => {
      process.env.STRIPE_PRICE_PERSONAL_MONTHLY = ' price_1QabcDEF '
      expect(priceIdFor('PERSONAL_MONTHLY')).toBe('price_1QabcDEF')
    })
  })

  describe('isStripeTestMode', () => {
    it('is true for a test key and false for a live one', () => {
      process.env.STRIPE_SECRET_KEY = 'sk_test_51abc'
      expect(isStripeTestMode()).toBe(true)
      process.env.STRIPE_SECRET_KEY = 'sk_live_51abc'
      expect(isStripeTestMode()).toBe(false)
    })
  })
})
