jest.mock('@/lib/storage', () => ({
  readUpload: jest.fn(),
  StorageError: class StorageError extends Error {},
}))

import { readUpload } from '@/lib/storage'
import { pdfFilename, resolveImageDataUri, renderPdf } from '@/lib/pdf'

const mockReadUpload = readUpload as jest.Mock

describe('pdfFilename', () => {
  it('sanitizes the vehicle name and appends an ISO date', () => {
    const name = pdfFilename('RigLog', '2001 Jeep Wrangler (TJ)', new Date('2024-06-15'))
    expect(name).toBe('RigLog_2001_Jeep_Wrangler_TJ_2024-06-15.pdf')
  })
})

describe('resolveImageDataUri', () => {
  it('returns a data URI for a JPEG using the storage-reported content type', async () => {
    mockReadUpload.mockResolvedValue({ buffer: Buffer.from('abc'), contentType: 'image/jpeg' })
    const uri = await resolveImageDataUri('u1/v1/photo.jpg')
    expect(uri).toBe(`data:image/jpeg;base64,${Buffer.from('abc').toString('base64')}`)
  })

  it('falls back to the file extension when the backend reports no content type', async () => {
    mockReadUpload.mockResolvedValue({ buffer: Buffer.from('abc'), contentType: null })
    const uri = await resolveImageDataUri('u1/v1/photo.png')
    expect(uri).toBe(`data:image/png;base64,${Buffer.from('abc').toString('base64')}`)
  })

  it('returns null for a non-embeddable type like a PDF receipt', async () => {
    mockReadUpload.mockResolvedValue({ buffer: Buffer.from('abc'), contentType: 'application/pdf' })
    const uri = await resolveImageDataUri('u1/v1/receipt.pdf')
    expect(uri).toBeNull()
  })

  it('returns null (rather than throwing) when the file is missing', async () => {
    const { StorageError } = jest.requireMock('@/lib/storage')
    mockReadUpload.mockRejectedValue(new StorageError('Not found'))
    const uri = await resolveImageDataUri('u1/v1/gone.jpg')
    expect(uri).toBeNull()
  })
})

describe('renderPdf', () => {
  it('renders a valid PDF buffer', async () => {
    const buffer = await renderPdf({ content: [{ text: 'Test' }] })
    expect(buffer.subarray(0, 4).toString()).toBe('%PDF')
  })
})
