import nodemailer from 'nodemailer'
import { getConfig } from './config.js'

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character)
}

function transporter() {
  const config = getConfig()
  if (!config.SMTP_HOST || !config.SMTP_USER || !config.SMTP_PASSWORD) return null
  return nodemailer.createTransport({
    host: config.SMTP_HOST,
    port: config.SMTP_PORT,
    secure: config.SMTP_SECURE,
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASSWORD },
  })
}

async function send(to: string, subject: string, text: string, html: string) {
  const transport = transporter()
  if (!transport) {
    if (getConfig().isProduction) throw new Error('Transactional email is not configured')
    return false
  }
  await transport.sendMail({ from: getConfig().MAIL_FROM, to, subject, text, html })
  return true
}

export function sendEmailVerification(to: string, displayName: string, token: string) {
  const url = `${getConfig().APP_ORIGIN}/verify-email#token=${encodeURIComponent(token)}`
  return send(
    to,
    'Verify your Bureau account',
    `Hi ${displayName}, verify your Bureau account: ${url}\n\nThis link expires in 24 hours.`,
    `<p>Hi ${escapeHtml(displayName)},</p><p>Verify your Bureau account to post work, submit proposals, and receive payments.</p><p><a href="${escapeHtml(url)}">Verify account</a></p><p>This link expires in 24 hours.</p>`,
  )
}

export function sendPasswordReset(to: string, displayName: string, token: string) {
  const url = `${getConfig().APP_ORIGIN}/reset-password#token=${encodeURIComponent(token)}`
  return send(
    to,
    'Reset your Bureau password',
    `Hi ${displayName}, reset your Bureau password: ${url}\n\nThis link expires in one hour. If you did not request this, ignore this email.`,
    `<p>Hi ${escapeHtml(displayName)},</p><p><a href="${escapeHtml(url)}">Reset your Bureau password</a></p><p>This link expires in one hour. If you did not request this, ignore this email.</p>`,
  )
}

export function sendContractNotification(to: string, displayName: string, subject: string, message: string, contractId: string) {
  const url = `${getConfig().APP_ORIGIN}/contracts/${encodeURIComponent(contractId)}`
  return send(
    to,
    subject,
    `Hi ${displayName}, ${message}\n\nOpen contract: ${url}`,
    `<p>Hi ${escapeHtml(displayName)},</p><p>${escapeHtml(message)}</p><p><a href="${escapeHtml(url)}">Open contract</a></p>`,
  )
}
