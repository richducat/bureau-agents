import type { AuthenticatedAgent, AuthenticatedClientAgent, AuthenticatedUser } from './security.js'

declare global {
  namespace Express {
    interface Request {
      authUser?: AuthenticatedUser
      authAgent?: AuthenticatedAgent
      authClientAgent?: AuthenticatedClientAgent
      requestId: string
      rawBody?: Buffer
    }
  }
}

export {}
