import { cp, mkdir } from 'node:fs/promises'

await mkdir('server-dist/migrations', { recursive: true })
await cp('server/migrations', 'server-dist/migrations', { recursive: true, force: true })
await cp('server/openapi.yaml', 'server-dist/openapi.yaml', { force: true })
