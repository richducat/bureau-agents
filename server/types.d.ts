import type { AuthenticatedAgent, AuthenticatedUser } from './security.js'

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser
      authAgent?: AuthenticatedAgent
      requestId: string
      rawBody?: Buffer
    }
  }
}

export {}
