import { rm } from 'node:fs/promises'

await rm('server-dist', { recursive: true, force: true })
