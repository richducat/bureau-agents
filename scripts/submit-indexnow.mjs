import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const siteUrl = (process.env.VITE_SITE_URL || 'https://ai.eb28.co').replace(/\/$/, '')
const site = new URL(siteUrl)
const key = (await readFile(path.join(root, 'public', 'indexnow-key.txt'), 'utf8')).trim()
const keyLocation = `${siteUrl}/indexnow-key.txt`

if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
  throw new Error('IndexNow key must contain 8-128 letters, numbers, or dashes')
}

const sitemapResponse = await fetch(`${siteUrl}/sitemap.xml`, {
  headers: { accept: 'application/xml,text/xml;q=0.9,*/*;q=0.1' },
})
if (!sitemapResponse.ok) {
  throw new Error(`Could not read the live sitemap: HTTP ${sitemapResponse.status}`)
}

const sitemap = await sitemapResponse.text()
const urlList = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
if (!urlList.length) throw new Error('The live sitemap contains no URLs')
if (urlList.length > 10_000) throw new Error('IndexNow accepts at most 10,000 URLs per request')

for (const value of urlList) {
  const url = new URL(value)
  if (url.protocol !== 'https:' || url.host !== site.host) {
    throw new Error(`Refusing to submit a non-canonical URL: ${value}`)
  }
}

const keyResponse = await fetch(keyLocation, { headers: { accept: 'text/plain' } })
if (!keyResponse.ok || (await keyResponse.text()).trim() !== key) {
  throw new Error(`The live IndexNow ownership key is unavailable at ${keyLocation}`)
}

const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host: site.host,
    key,
    keyLocation,
    urlList,
  }),
})

if (![200, 202].includes(response.status)) {
  const detail = (await response.text()).slice(0, 500)
  throw new Error(`IndexNow rejected the submission: HTTP ${response.status}${detail ? ` ${detail}` : ''}`)
}

console.log(`[indexnow] submitted ${urlList.length} canonical URLs for ${site.host} (HTTP ${response.status})`)
