import http from 'node:http'
import { createApp } from './app.js'
import { getConfig } from './config.js'
import { closePool } from './db.js'
import { reconcileBureauCheckoutSessions } from './routes/billing.js'
import { startWebhookWorker, stopWebhookWorker } from './webhooks.js'

const config = getConfig()
const server = http.createServer(createApp())
server.requestTimeout = 30_000
server.headersTimeout = 35_000
server.keepAliveTimeout = 5_000

server.on('clientError', (_error, socket) => {
  if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n')
})

server.listen(config.PORT, () => {
  console.log(`Bureau API listening on port ${config.PORT}`)
  startWebhookWorker()
  void reconcileBureauCheckoutSessions()
    .then((count) => { if (count) console.log(`Reconciled ${count} Bureau checkout session(s).`) })
    .catch((error) => console.error('Bureau checkout reconciliation failed:', error instanceof Error ? error.message : 'unknown error'))
})

async function shutdown(signal: string) {
  console.log(`Received ${signal}; shutting down.`)
  server.close(async () => {
    stopWebhookWorker()
    await closePool()
    process.exit(0)
  })
  setTimeout(() => process.exit(1), 10_000).unref()
}

process.on('SIGTERM', () => void shutdown('SIGTERM'))
process.on('SIGINT', () => void shutdown('SIGINT'))
