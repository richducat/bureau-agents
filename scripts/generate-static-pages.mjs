import { readFile, writeFile, mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const dist = path.join(root, 'dist')
const indexedPages = JSON.parse(await readFile(path.join(root, 'seo-pages.json'), 'utf8'))
const appPages = JSON.parse(await readFile(path.join(root, 'app-pages.json'), 'utf8'))
const pages = [...indexedPages, ...appPages]
const siteUrl = (process.env.VITE_SITE_URL || 'https://ai.eb28.co').replace(/\/$/, '')
const socialImage = `${siteUrl}/bureau-social-card.png`
const shell = await readFile(path.join(dist, 'index.html'), 'utf8')
const bootstrapScript = shell.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
const bootstrapHash = createHash('sha256').update(bootstrapScript).digest('base64')
const configuredApi = process.env.VITE_API_BASE_URL
const apiOrigin = configuredApi && /^https:\/\//.test(configuredApi) ? new URL(configuredApi).origin : ''

const escapeHtml = (value) => value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' })[character])
const safeJson = (value) => JSON.stringify(value).replace(/</g, '\\u003c')

function render(page) {
  const canonical = `${siteUrl}${page.route === '/' ? '/' : page.route}`
  const schema = {
    '@context': 'https://schema.org',
    '@type': page.route.startsWith('/guides/') ? 'Article' : page.route.startsWith('/categories/') ? 'CollectionPage' : 'WebPage',
    name: page.title,
    headline: page.heading,
    description: page.description,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'Bureau', url: `${siteUrl}/` },
    publisher: { '@type': 'Organization', name: 'Bureau', url: `${siteUrl}/` },
    dateModified: new Date().toISOString().slice(0, 10),
  }
  const schemaJson = safeJson(schema)
  const schemaHash = createHash('sha256').update(schemaJson).digest('base64')
  const csp = `default-src 'self'; script-src 'self' 'sha256-${bootstrapHash}' 'sha256-${schemaHash}'; style-src 'self' 'unsafe-inline'; font-src 'self' data:; img-src 'self' data: https:; connect-src 'self'${apiOrigin ? ` ${apiOrigin}` : ''}; object-src 'none'; base-uri 'self'; form-action 'self'; frame-src 'none'; worker-src 'none'; manifest-src 'self'; upgrade-insecure-requests`
  const head = [
    `<meta name="robots" content="${page.indexable === false ? 'noindex, nofollow' : 'index, follow, max-image-preview:large'}" />`,
    `<link rel="canonical" href="${escapeHtml(canonical)}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Bureau" />`,
    `<meta property="og:title" content="${escapeHtml(page.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(page.description)}" />`,
    `<meta property="og:url" content="${escapeHtml(canonical)}" />`,
    `<meta property="og:image" content="${escapeHtml(socialImage)}" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta property="og:image:alt" content="Bureau — hire AI agents for real business work." />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:image" content="${escapeHtml(socialImage)}" />`,
    `<script type="application/ld+json">${schemaJson}</script>`,
  ].join('\n    ')
  const preRendered = `<main class="seo-shell"><a href="${siteUrl}/">Bureau</a><h1>${escapeHtml(page.heading)}</h1><p>${escapeHtml(page.body)}</p><nav><a href="${siteUrl}/services">What we can do</a> <a href="${siteUrl}/how-it-works">How it works</a> <a href="${siteUrl}/pricing">Pricing</a> <a href="${siteUrl}/start">Describe your task</a></nav></main>`
  return shell
    .replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />\n    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}" />\n    <meta name="referrer" content="strict-origin-when-cross-origin" />`)
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(page.title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escapeHtml(page.description)}" />`)
    .replace('</head>', `    ${head}\n  </head>`)
    .replace('<div id="root"></div>', `<div id="root">${preRendered}</div>`)
}

for (const page of pages) {
  const directory = page.route === '/' ? dist : path.join(dist, page.route.slice(1))
  await mkdir(directory, { recursive: true })
  await writeFile(path.join(directory, 'index.html'), render(page))
}

const lastmod = new Date().toISOString().slice(0, 10)
const sitemap = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${indexedPages.map((page) => `  <url><loc>${siteUrl}${page.route === '/' ? '/' : page.route}</loc><lastmod>${lastmod}</lastmod><changefreq>${page.changefreq}</changefreq><priority>${page.priority.toFixed(2)}</priority></url>`).join('\n')}\n</urlset>\n`
await writeFile(path.join(dist, 'sitemap.xml'), sitemap)
await writeFile(path.join(dist, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /workspace\nDisallow: /contracts\nDisallow: /messages\nDisallow: /settings\nSitemap: ${siteUrl}/sitemap.xml\n`)
await writeFile(path.join(dist, 'llms.txt'), `# Bureau\n\nBureau is a hiring marketplace built for AI agents. Customers can buy an affordable starter package, ask Bureau to define and manage a custom task, compare a job posted elsewhere, choose an agent directly, or post work for milestone bids. Bureau keeps the scope, accountable operator, delivery evidence, acceptance, and payment record together.\n\n## Key pages\n${indexedPages.filter((page) => page.priority >= 0.75).map((page) => `- [${page.title}](${siteUrl}${page.route})`).join('\n')}\n\n## Agent API\nThe operator platform is available at ${siteUrl}/for-agent-builders and ${siteUrl}/docs/agent-api.\nThe production OpenAPI contract is available at https://api.ai.eb28.co/api/openapi.yaml.\n`)

const guidePages = indexedPages.filter((page) => page.route.startsWith('/guides/'))
await writeFile(path.join(dist, 'feed.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<feed xmlns="http://www.w3.org/2005/Atom"><title>Bureau Field Guides</title><id>${siteUrl}/guides</id><updated>${new Date().toISOString()}</updated><link href="${siteUrl}/feed.xml" rel="self"/>${guidePages.map((page) => `<entry><title>${escapeHtml(page.title)}</title><id>${siteUrl}${page.route}</id><link href="${siteUrl}${page.route}"/><updated>${new Date().toISOString()}</updated><summary>${escapeHtml(page.description)}</summary></entry>`).join('')}</feed>\n`)

const notFoundPath = path.join(dist, '404.html')
const notFound = await readFile(notFoundPath, 'utf8')
const redirectScript = notFound.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? ''
const redirectHash = createHash('sha256').update(redirectScript).digest('base64')
const notFoundCsp = `default-src 'none'; script-src 'sha256-${redirectHash}'; base-uri 'none'; form-action 'none'; frame-src 'none'`
await writeFile(notFoundPath, notFound.replace('<meta charset="utf-8" />', `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${escapeHtml(notFoundCsp)}" />\n    <meta name="robots" content="noindex" />`))
