import fs from 'fs'
import path from 'path'

/**
 * Deleting an account has to actually work, and Prisma's defaults quietly
 * make sure it doesn't: a required relation with no `onDelete` is
 * `Restrict`, which blocks the parent's deletion rather than doing
 * anything. That is how `DELETE /api/me/account` came to 500 for every
 * user who had ever logged a task — the route looked correct, the schema
 * refused.
 *
 * So this reads the schema and insists every relation pointing at User
 * says what happens when that user goes. It's a blunt test, but the thing
 * it guards against is invisible in the code that breaks.
 */

const SCHEMA = fs.readFileSync(path.join(process.cwd(), 'prisma', 'schema.prisma'), 'utf8')

/** Relation field lines whose target type is User. */
function userRelationLines(): string[] {
  return SCHEMA.split('\n')
    .map((line) => line.trim())
    .filter((line) => /^\w+\s+User\??\s+@relation\(/.test(line))
}

describe('relations to User', () => {
  it('finds them (the regex still matches the schema)', () => {
    // A rename or a formatting change that breaks the regex would make
    // every assertion below vacuously pass.
    expect(userRelationLines().length).toBeGreaterThanOrEqual(10)
  })

  it('every one declares an onDelete rule', () => {
    const missing = userRelationLines().filter((line) => !line.includes('onDelete:'))
    expect(missing).toEqual([])
  })

  it('none of them is Restrict or NoAction, which would block deletion', () => {
    const blocking = userRelationLines().filter((line) => /onDelete:\s*(Restrict|NoAction)/.test(line))
    expect(blocking).toEqual([])
  })
})

describe('Task.addedBy specifically', () => {
  const line = userRelationLines().find((l) => l.includes('TaskAddedBy'))

  it('exists', () => {
    expect(line).toBeDefined()
  })

  /**
   * SetNull rather than Cascade, and the difference matters: a mechanic
   * collaborator deleting their own account must not take the vehicle
   * owner's service history with them. The work happened; only the
   * attribution goes.
   */
  it('is SetNull, so a collaborator leaving does not delete the owner’s log', () => {
    expect(line).toMatch(/onDelete:\s*SetNull/)
  })

  it('is an optional relation, as SetNull requires', () => {
    expect(line).toMatch(/User\?/)
    expect(SCHEMA).toMatch(/addedByUserId\s+String\?/)
  })
})

describe('ProjectCollaborator.invitedBy', () => {
  const line = userRelationLines().find((l) => l.includes('InvitedBy'))

  // The inviter is always the vehicle's owner, and the vehicle is going
  // away with them, so the invitation has nothing left to belong to.
  it('cascades', () => {
    expect(line).toMatch(/onDelete:\s*Cascade/)
  })
})

describe('Donation.user', () => {
  const line = userRelationLines().find((l) => /Donation|^user User\?/.test(l) && l.includes('SetNull'))

  /**
   * The one relation that deliberately survives: a charge that happened is
   * an accounting record. Deleting the account detaches it rather than
   * erasing it, and /privacy says so.
   */
  it('detaches rather than deletes', () => {
    expect(line).toBeDefined()
    expect(line).toMatch(/onDelete:\s*SetNull/)
  })
})
