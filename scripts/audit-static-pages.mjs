import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const siteUrl = (process.env.VITE_SITE_URL || 'https://ai.eb28.co').replace(/\/$/, '')
const indexedPages = JSON.parse(await readFile(path.join(root, 'seo-pages.json'), 'utf8'))
const appPages = JSON.parse(await readFile(path.join(root, 'app-pages.json'), 'utf8'))
const pages = [...indexedPages, ...appPages]
const allowedChangeFrequencies = new Set(['always', 'hourly', 'daily', 'weekly', 'monthly', 'yearly', 'never'])

function fail(message) {
  throw new Error(`[static-audit] ${message}`)
}

function requireCondition(condition, message) {
  if (!condition) fail(message)
}

function escapeHtml(value) {
  return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
}

function occurrences(value, needle) {
  return value.split(needle).length - 1
}

function canonicalFor(route) {
  return `${siteUrl}${route === '/' ? '/' : route}`
}

requireCondition(Array.isArray(indexedPages) && indexedPages.length > 0, 'seo-pages.json must contain at least one page')
requireCondition(Array.isArray(appPages) && appPages.length > 0, 'app-pages.json must contain at least one page')

const routes = new Set()
for (const page of pages) {
  requireCondition(page && typeof page === 'object', 'every page entry must be an object')
  for (const key of ['route', 'title', 'description', 'heading', 'body']) {
    requireCondition(typeof page[key] === 'string' && page[key].trim().length > 0, `${page.route ?? 'unknown route'} is missing ${key}`)
  }
  requireCondition(page.route.startsWith('/'), `${page.route} must start with /`)
  requireCondition(page.route === '/' || !page.route.endsWith('/'), `${page.route} must not end with /`)
  requireCondition(!page.route.includes('..') && !page.route.includes('?') && !page.route.includes('#'), `${page.route} is not a safe static route`)
  requireCondition(!routes.has(page.route), `duplicate route ${page.route}`)
  requireCondition(page.title.length <= 120, `${page.route} title is too long`)
  requireCondition(page.description.length <= 220, `${page.route} description is too long`)
  routes.add(page.route)
}

for (const page of indexedPages) {
  requireCondition(page.indexable !== false, `${page.route} is in seo-pages.json but marked noindex`)
  requireCondition(Number.isFinite(page.priority) && page.priority >= 0 && page.priority <= 1, `${page.route} has an invalid sitemap priority`)
  requireCondition(allowedChangeFrequencies.has(page.changefreq), `${page.route} has an invalid change frequency`)
}

for (const page of appPages) requireCondition(page.indexable === false, `${page.route} must be explicitly noindex`)

for (const page of pages) {
  const file = page.route === '/' ? path.join(dist, 'index.html') : path.join(dist, page.route.slice(1), 'index.html')
  const html = await readFile(file, 'utf8').catch(() => fail(`missing generated page ${file}`))
  const canonical = canonicalFor(page.route)
  const expectedRobots = page.indexable === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'
  const checks = [
    [`<title>${escapeHtml(page.title)}</title>`, 'title'],
    [`<meta name="description" content="${escapeHtml(page.description)}" />`, 'description'],
    [`<meta name="robots" content="${expectedRobots}" />`, 'robots directive'],
    [`<link rel="canonical" href="${escapeHtml(canonical)}" />`, 'canonical'],
    [`<h1>${escapeHtml(page.heading)}</h1>`, 'pre-rendered heading'],
    [`<p>${escapeHtml(page.body)}</p>`, 'pre-rendered body'],
  ]
  for (const [needle, label] of checks) requireCondition(occurrences(html, needle) === 1, `${page.route} must contain exactly one matching ${label}`)
  requireCondition(html.includes('Content-Security-Policy'), `${page.route} is missing its static Content Security Policy`)
}

const sitemap = await readFile(path.join(dist, 'sitemap.xml'), 'utf8')
const sitemapUrls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1])
const expectedUrls = indexedPages.map((page) => canonicalFor(page.route))
requireCondition(new Set(sitemapUrls).size === sitemapUrls.length, 'sitemap contains duplicate URLs')
requireCondition(sitemapUrls.length === expectedUrls.length, `sitemap contains ${sitemapUrls.length} URLs; expected ${expectedUrls.length}`)
for (const url of expectedUrls) requireCondition(sitemapUrls.includes(url), `sitemap is missing ${url}`)
for (const url of sitemapUrls) requireCondition(expectedUrls.includes(url), `sitemap contains unexpected URL ${url}`)
for (const page of indexedPages) {
  const entry = `<loc>${canonicalFor(page.route)}</loc><lastmod>`
  requireCondition(sitemap.includes(entry), `sitemap entry is malformed for ${page.route}`)
  requireCondition(sitemap.includes(`<changefreq>${page.changefreq}</changefreq><priority>${page.priority.toFixed(2)}</priority>`), `sitemap metadata is missing for ${page.route}`)
}
for (const page of appPages) requireCondition(!sitemap.includes(`<loc>${canonicalFor(page.route)}</loc>`), `${page.route} must not appear in the sitemap`)

const robots = await readFile(path.join(dist, 'robots.txt'), 'utf8')
requireCondition(robots.includes('User-agent: *\nAllow: /'), 'robots.txt must allow public crawling')
requireCondition(robots.includes(`Sitemap: ${siteUrl}/sitemap.xml`), 'robots.txt must point to the production sitemap')
for (const route of ['/admin', '/workspace', '/contracts', '/messages', '/settings']) {
  requireCondition(robots.includes(`Disallow: ${route}`), `robots.txt must disallow ${route}`)
}

const llms = await readFile(path.join(dist, 'llms.txt'), 'utf8')
for (const page of indexedPages.filter((item) => item.priority >= 0.75)) {
  requireCondition(llms.includes(`(${canonicalFor(page.route)})`), `llms.txt is missing high-priority route ${page.route}`)
}
requireCondition(llms.includes('https://api.ai.eb28.co/api/openapi.yaml'), 'llms.txt is missing the production OpenAPI contract')

const feed = await readFile(path.join(dist, 'feed.xml'), 'utf8')
for (const page of indexedPages.filter((item) => item.route.startsWith('/guides/'))) {
  requireCondition(feed.includes(`<id>${canonicalFor(page.route)}</id>`), `feed.xml is missing ${page.route}`)
}

const notFound = await readFile(path.join(dist, '404.html'), 'utf8')
requireCondition(notFound.includes('<meta name="robots" content="noindex" />'), '404.html must be noindex')
requireCondition(notFound.includes('Content-Security-Policy'), '404.html is missing its Content Security Policy')

console.log(`[static-audit] ${pages.length} generated pages, ${indexedPages.length} sitemap URLs, robots.txt, llms.txt, feed.xml, and 404.html passed`)
