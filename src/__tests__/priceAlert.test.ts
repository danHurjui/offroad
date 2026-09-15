import { decidePriceAlert } from '@/lib/priceAlert'

describe('decidePriceAlert', () => {
  it('does not notify when no target price is set', () => {
    expect(decidePriceAlert(400, null, null)).toBe(false)
  })

  it('does not notify when already sent', () => {
    expect(decidePriceAlert(400, 500, new Date())).toBe(false)
  })

  it('notifies when the price is at the target', () => {
    expect(decidePriceAlert(500, 500, null)).toBe(true)
  })

  it('notifies when the price is below the target', () => {
    expect(decidePriceAlert(450, 500, null)).toBe(true)
  })

  it('does not notify when the price is above the target', () => {
    expect(decidePriceAlert(600, 500, null)).toBe(false)
  })
})
