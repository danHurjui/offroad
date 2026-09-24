import fs from 'fs'
import path from 'path'

// RL-042: the read-only gate reads the owner's plan and vehicles, which
// these mocks do not model; readOnly.test.ts tests it on its own.
jest.mock('@/lib/vehicleAllowance', () => ({
  ...jest.requireActual('@/lib/vehicleAllowance'),
  refuseIfReadOnly: jest.fn(async () => null),
}))
jest.mock('next-auth', () => ({ getServerSession: jest.fn() }))
jest.mock('@/lib/auth', () => ({ authOptions: {} }))
jest.mock('@/lib/storage', () => ({
  saveUpload: jest.fn(),
  deleteUpload: jest.fn().mockResolvedValue(undefined),
  StorageError: class StorageError extends Error {},
  MAX_UPLOAD_BYTES: 4 * 1024 * 1024,
  ALLOWED_UPLOAD_TYPES: ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'],
}))
jest.mock('@/lib/prisma', () => ({
  prisma: {
    vehicle: { findUnique: jest.fn() },
    projectCollaborator: { findFirst: jest.fn() },
    accident: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn(), delete: jest.fn() },
    accidentPhoto: { create: jest.fn(), delete: jest.fn() },
  },
}))

import { getServerSession } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { deleteUpload, saveUpload } from '@/lib/storage'
import { ACCIDENT_PHOTO_LIMIT, parseAccident } from '@/lib/accidents'
import { POST } from '@/app/api/vehicles/[id]/accidents/route'
import { DELETE, PATCH } from '@/app/api/vehicles/[id]/accidents/[accidentId]/route'
import { POST as POST_PHOTO } from '@/app/api/vehicles/[id]/accidents/[accidentId]/photos/route'
import { DELETE as DELETE_PHOTO } from '@/app/api/vehicles/[id]/accidents/[accidentId]/photos/[photoId]/route'

const NOW = new Date('2026-09-23T12:00:00Z')
const day = (d: string) => new Date(`${d}T00:00:00Z`)
const req = (body: unknown) => ({ json: () => Promise.resolve(body) }) as never
const upload = (file: File) => {
  const form = new FormData()
  form.append('file', file)
  return { headers: new Headers({ 'content-type': 'multipart/form-data; boundary=x' }), formData: () => Promise.resolve(form) } as never
}
const jpeg = () => new File([new Uint8Array([1, 2, 3])], 'dent.jpg', { type: 'image/jpeg' })
const valid = { date: '2025-06-01', kind: 'COLLISION', description: '  Rear bumper, hit at a junction.  ' }

describe('parseAccident', () => {
  it('needs a date, a kind and a description on create, and trims the description', () => {
    expect(parseAccident(valid, { create: true }, NOW)).toEqual({
      ok: true,
      data: { date: day('2025-06-01'), kind: 'COLLISION', description: 'Rear bumper, hit at a junction.' },
    })
    expect(parseAccident({ kind: 'COLLISION', description: 'x' }, { create: true }, NOW)).toEqual({ ok: false, field: 'date' })
  })

  it('on edit, returns only what was sent', () => {
    expect(parseAccident({ insurance: 'CASCO' }, { create: false }, NOW)).toEqual({ ok: true, data: { insurance: 'CASCO' } })
    expect(parseAccident({ insurance: '' }, { create: false }, NOW)).toEqual({ ok: true, data: { insurance: null } })
  })

  it.each([
    [{ ...valid, date: '2999-01-01' }, 'date'],
    [{ ...valid, kind: 'METEOR' }, 'kind'],
    [{ ...valid, description: '   ' }, 'description'],
    [{ ...valid, description: 'x'.repeat(1001) }, 'description'],
    [{ ...valid, km: -5 }, 'km'],
    [{ ...valid, insurance: 'MAYBE' }, 'insurance'],
    [{ ...valid, repairCostRon: -1 }, 'repairCostRon'],
    [{ ...valid, repairedAt: '2025-05-01' }, 'repairedAt'],
  ])('refuses %j', (body, field) => {
    expect(parseAccident(body, { create: true }, NOW)).toEqual({ ok: false, field })
  })

  it('a repair cannot predate the damage, checked against the stored date on an edit', () => {
    const existing = { date: day('2025-06-01'), repairedAt: null }
    expect(parseAccident({ repairedAt: '2025-05-30' }, { create: false, existing }, NOW)).toEqual({ ok: false, field: 'repairedAt' })
    expect(parseAccident({ date: '2025-07-01' }, { create: false, existing: { date: day('2025-06-01'), repairedAt: day('2025-06-20') } }, NOW)).toEqual({
      ok: false,
      field: 'repairedAt',
    })
  })
})

describe('accident routes', () => {
  const mockSession = getServerSession as jest.Mock
  const record = (o: Record<string, unknown> = {}) => ({
    id: 'a1', vehicleId: 'v1', createdByUserId: 'owner', date: day('2025-06-01'), repairedAt: null, photos: [], ...o,
  })

  beforeEach(() => {
    jest.clearAllMocks()
    jest.spyOn(console, 'error').mockImplementation(() => {})
    mockSession.mockResolvedValue({ user: { id: 'owner' } })
    ;(prisma.vehicle.findUnique as jest.Mock).mockResolvedValue({ id: 'v1', ownerId: 'owner' })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue(null)
    ;(prisma.accident.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'a1', repairCostRon: null, ...data }))
    ;(prisma.accident.update as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'a1', repairCostRon: null, ...data }))
    ;(prisma.accident.findUnique as jest.Mock).mockResolvedValue(record())
    ;(saveUpload as jest.Mock).mockResolvedValue('owner/v1/uuid.jpg')
    ;(prisma.accidentPhoto.create as jest.Mock).mockImplementation(({ data }) => Promise.resolve({ id: 'p1', ...data }))
  })

  it('records who added it, and names an invalid field', async () => {
    const res = await POST(req({ ...valid, repairCostRon: '2400,50' }), { params: { id: 'v1' } })
    expect(res.status).toBe(201)
    expect(prisma.accident.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ vehicleId: 'v1', kind: 'COLLISION', repairCostRon: 2400.5, createdByUserId: 'owner' }),
    })
    const bad = await POST(req({ ...valid, kind: 'METEOR' }), { params: { id: 'v1' } })
    expect(bad.status).toBe(400)
    expect((await bad.json()).error).toMatch(/kind/)
  })

  it('a stranger cannot see the vehicle at all', async () => {
    mockSession.mockResolvedValue({ user: { id: 'stranger' } })
    expect((await POST(req(valid), { params: { id: 'v1' } })).status).toBe(404)
  })

  it('a collaborator adds records, but changes and removes only their own', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    expect((await POST(req(valid), { params: { id: 'v1' } })).status).toBe(201)
    expect((await PATCH(req({ insurance: 'RCA' }), { params: { id: 'v1', accidentId: 'a1' } })).status).toBe(403)
    expect((await DELETE({} as never, { params: { id: 'v1', accidentId: 'a1' } })).status).toBe(403)
    expect((await POST_PHOTO(upload(jpeg()), { params: { id: 'v1', accidentId: 'a1' } })).status).toBe(403)
    expect(prisma.accident.delete).not.toHaveBeenCalled()
  })

  it('a record on another vehicle is not found', async () => {
    ;(prisma.accident.findUnique as jest.Mock).mockResolvedValue(record({ vehicleId: 'other' }))
    expect((await DELETE({} as never, { params: { id: 'v1', accidentId: 'a1' } })).status).toBe(404)
  })

  it('removing a record removes its photo files too (pitfall #14)', async () => {
    ;(prisma.accident.findUnique as jest.Mock).mockResolvedValue(record({ photos: [{ id: 'p1', url: 'owner/v1/a.jpg' }, { id: 'p2', url: 'owner/v1/b.jpg' }] }))
    expect((await DELETE({} as never, { params: { id: 'v1', accidentId: 'a1' } })).status).toBe(200)
    expect(prisma.accident.delete).toHaveBeenCalledWith({ where: { id: 'a1' } })
    expect((deleteUpload as jest.Mock).mock.calls.map((c) => c[0]).sort()).toEqual(['owner/v1/a.jpg', 'owner/v1/b.jpg'])
  })

  it('a photo is filed under the vehicle owner’s prefix, whoever uploads it', async () => {
    mockSession.mockResolvedValue({ user: { id: 'mechanic' } })
    ;(prisma.projectCollaborator.findFirst as jest.Mock).mockResolvedValue({ id: 'c1' })
    ;(prisma.accident.findUnique as jest.Mock).mockResolvedValue(record({ createdByUserId: 'mechanic' }))
    const res = await POST_PHOTO(upload(jpeg()), { params: { id: 'v1', accidentId: 'a1' } })
    expect(res.status).toBe(201)
    expect((saveUpload as jest.Mock).mock.calls[0][0]).toBe('owner')
    expect(prisma.accidentPhoto.create).toHaveBeenCalledWith({ data: { accidentId: 'a1', url: 'owner/v1/uuid.jpg' } })
  })

  it('photos only, and a limited number of them', async () => {
    const pdf = new File([new Uint8Array([1])], 'claim.pdf', { type: 'application/pdf' })
    expect((await POST_PHOTO(upload(pdf), { params: { id: 'v1', accidentId: 'a1' } })).status).toBe(400)
    const full = Array.from({ length: ACCIDENT_PHOTO_LIMIT }, (_, i) => ({ id: `p${i}`, url: `owner/v1/${i}.jpg` }))
    ;(prisma.accident.findUnique as jest.Mock).mockResolvedValue(record({ photos: full }))
    expect((await POST_PHOTO(upload(jpeg()), { params: { id: 'v1', accidentId: 'a1' } })).status).toBe(400)
    expect(saveUpload).not.toHaveBeenCalled()
  })

  it('removing a photo deletes its row and its file, and only a photo of this record', async () => {
    ;(prisma.accident.findUnique as jest.Mock).mockResolvedValue(record({ photos: [{ id: 'p1', url: 'owner/v1/a.jpg' }] }))
    expect((await DELETE_PHOTO({} as never, { params: { id: 'v1', accidentId: 'a1', photoId: 'nope' } })).status).toBe(404)
    expect((await DELETE_PHOTO({} as never, { params: { id: 'v1', accidentId: 'a1', photoId: 'p1' } })).status).toBe(200)
    expect(prisma.accidentPhoto.delete).toHaveBeenCalledWith({ where: { id: 'p1' } })
    expect(deleteUpload).toHaveBeenCalledWith('owner/v1/a.jpg')
  })
})

describe('accidents stay off every public surface', () => {
  const read = (f: string) => fs.readFileSync(path.join(process.cwd(), f), 'utf8')

  it('the public build page never reads them', () => {
    const dir = path.join(process.cwd(), 'src/app/builds')
    const files: string[] = []
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(path.join(d, e.name))
        else files.push(path.join(d, e.name))
      }
    }
    walk(dir)
    for (const f of files) expect({ f, mentions: /accident/i.test(fs.readFileSync(f, 'utf8')) }).toEqual({ f, mentions: false })
  })

  it('the passport counts photos and never loads their keys', () => {
    const loader = read('src/lib/passportRecords.ts')
    expect(loader).toContain('_count: { select: { photos: true } }')
    expect(loader).not.toMatch(/accidentPhoto/)
  })

  it('the repair cost is decided about in MONEY_COLUMNS, not silently added to the total', () => {
    expect(read('src/lib/ownershipCosts.ts')).toMatch(/'Accident\.repairCostRon': \{ excluded:/)
  })
})
