import { createHmac, randomUUID } from 'node:crypto'
import dns from 'node:dns/promises'
import net from 'node:net'
import type { RowDataPacket } from 'mysql2'
import { decryptSecret } from './crypto.js'
import { execute, transaction } from './db.js'

interface DeliveryRow extends RowDataPacket {
  id: string
  agent_id: string
  event_type: string
  event_id: string
  payload: string | Record<string, unknown>
  attempt_count: number
  webhook_url: string
  webhook_secret_ciphertext: string
}

function isPrivateIPv4(address: string) {
  const octets = address.split('.').map(Number)
  return octets[0] === 10
    || octets[0] === 127
    || (octets[0] === 169 && octets[1] === 254)
    || (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31)
    || (octets[0] === 192 && octets[1] === 168)
    || octets[0] === 0
    || octets[0] >= 224
}

function isPrivateAddress(address: string) {
  if (net.isIPv4(address)) return isPrivateIPv4(address)
  const normalized = address.toLowerCase()
  return normalized === '::1' || normalized === '::' || normalized.startsWith('fc') || normalized.startsWith('fd') || normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb') || normalized.startsWith('::ffff:127.') || normalized.startsWith('::ffff:10.') || normalized.startsWith('::ffff:192.168.')
}

async function validateWebhookUrl(raw: string) {
  const url = new URL(raw)
  if (url.protocol !== 'https:' || url.username || url.password || url.port && url.port !== '443') throw new Error('Webhook URL must use HTTPS on the standard port')
  const hostname = url.hostname.toLowerCase().replace(/\.$/, '')
  if (hostname === 'localhost' || hostname.endsWith('.localhost') || hostname.endsWith('.local') || hostname === 'metadata.google.internal') throw new Error('Webhook hostname is not allowed')
  const addresses = net.isIP(hostname) ? [{ address: hostname }] : await dns.lookup(hostname, { all: true, verbatim: true })
  if (!addresses.length || addresses.some((record) => isPrivateAddress(record.address))) throw new Error('Webhook resolves to a private or reserved address')
  return url
}

export async function assertSafeWebhookUrl(raw: string) {
  return (await validateWebhookUrl(raw)).toString()
}

export async function enqueueAgentWebhook(agentId: string, eventType: string, data: Record<string, unknown>) {
  const eventId = randomUUID()
  await execute(
    `INSERT INTO webhook_deliveries (id, agent_id, event_type, event_id, payload)
     SELECT ?, id, ?, ?, ? FROM agents WHERE id = ? AND webhook_url IS NOT NULL AND webhook_secret_ciphertext IS NOT NULL`,
    [randomUUID(), eventType, eventId, JSON.stringify({ id: eventId, type: eventType, createdAt: new Date().toISOString(), data }), agentId],
  )
}

async function claimDeliveries() {
  return transaction(async (connection) => {
    const [result] = await connection.execute<RowDataPacket[]>(
      `SELECT d.*, a.webhook_url, a.webhook_secret_ciphertext
       FROM webhook_deliveries d JOIN agents a ON a.id = d.agent_id
       WHERE d.status IN ('pending','failed') AND d.next_attempt_at <= UTC_TIMESTAMP(3) AND d.attempt_count < 8
       ORDER BY d.next_attempt_at ASC LIMIT 10 FOR UPDATE SKIP LOCKED`,
    )
    const deliveries = result as DeliveryRow[]
    for (const delivery of deliveries) {
      await connection.execute(`UPDATE webhook_deliveries SET status = 'delivering', attempt_count = attempt_count + 1 WHERE id = ?`, [delivery.id])
    }
    return deliveries
  })
}

async function deliver(delivery: DeliveryRow) {
  try {
    const url = await validateWebhookUrl(delivery.webhook_url)
    const payload = typeof delivery.payload === 'string' ? delivery.payload : JSON.stringify(delivery.payload)
    const timestamp = Math.floor(Date.now() / 1000).toString()
    const secret = decryptSecret(delivery.webhook_secret_ciphertext)
    const signature = createHmac('sha256', secret).update(`${timestamp}.${payload}`).digest('hex')
    const response = await fetch(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(7_000),
      headers: {
        'content-type': 'application/json',
        'user-agent': 'Bureau-Webhooks/1.0',
        'bureau-event-id': delivery.event_id,
        'bureau-event-type': delivery.event_type,
        'bureau-signature': `t=${timestamp},v1=${signature}`,
      },
      body: payload,
    })
    if (!response.ok) throw Object.assign(new Error(`Webhook returned HTTP ${response.status}`), { statusCode: response.status })
    await execute(
      `UPDATE webhook_deliveries SET status = 'delivered', last_status_code = ?, last_error = NULL, delivered_at = UTC_TIMESTAMP(3) WHERE id = ?`,
      [response.status, delivery.id],
    )
  } catch (error) {
    const statusCode = (error as { statusCode?: number }).statusCode ?? null
    const dead = delivery.attempt_count + 1 >= 8
    const delayMinutes = Math.min(360, 2 ** Math.min(8, delivery.attempt_count))
    await execute(
      `UPDATE webhook_deliveries SET status = ?, last_status_code = ?, last_error = ?,
       next_attempt_at = DATE_ADD(UTC_TIMESTAMP(3), INTERVAL ? MINUTE) WHERE id = ?`,
      [dead ? 'dead' : 'failed', statusCode, (error instanceof Error ? error.message : 'Webhook delivery failed').slice(0, 500), delayMinutes, delivery.id],
    )
  }
}

let timer: NodeJS.Timeout | undefined
let running = false

export function startWebhookWorker() {
  if (timer) return
  const tick = async () => {
    if (running) return
    running = true
    try {
      const deliveries = await claimDeliveries()
      await Promise.all(deliveries.map(deliver))
    } catch (error) {
      console.error('Webhook worker error:', error instanceof Error ? error.message : 'unknown')
    } finally {
      running = false
    }
  }
  timer = setInterval(() => void tick(), 5_000)
  timer.unref()
  void tick()
}

export function stopWebhookWorker() {
  if (timer) clearInterval(timer)
  timer = undefined
}
