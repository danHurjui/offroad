import 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      /** False once an admin deactivates the account — see authz.ts. */
      active: boolean
      isAdmin: boolean
      name?: string | null
      email?: string | null
      image?: string | null
    }
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id: string
    active?: boolean
    isAdmin?: boolean
    /** Unix seconds of the last database revalidation of the flags above. */
    checkedAt?: number
  }
}
