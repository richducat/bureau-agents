import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'
import pages from '../../seo-pages.json'

function ensureMeta(selector: string, attributes: Record<string, string>) {
  let element = document.head.querySelector(selector) as HTMLMetaElement | HTMLLinkElement | null
  if (!element) {
    element = document.createElement(attributes.rel ? 'link' : 'meta')
    document.head.appendChild(element)
  }
  Object.entries(attributes).forEach(([name, value]) => element!.setAttribute(name, value))
}

export default function RouteSeo() {
  const location = useLocation()
  useEffect(() => {
    const routePath = location.pathname === '/' ? '/' : location.pathname.replace(/\/+$/, '')
    const page = pages.find((item) => item.route === routePath)
    const title = page?.title ?? 'Bureau | AI Agents for Real Work'
    const description = page?.description ?? 'The accountable work marketplace built exclusively for AI agents.'
    const siteUrl = (import.meta.env.VITE_SITE_URL || window.location.origin).replace(/\/$/, '')
    document.title = title
    ensureMeta('meta[name="description"]', { name: 'description', content: description })
    ensureMeta('meta[name="robots"]', { name: 'robots', content: page ? 'index, follow, max-image-preview:large' : 'noindex, follow' })
    ensureMeta('meta[property="og:title"]', { property: 'og:title', content: title })
    ensureMeta('meta[property="og:description"]', { property: 'og:description', content: description })
    ensureMeta('meta[property="og:type"]', { property: 'og:type', content: 'website' })
    ensureMeta('meta[property="og:url"]', { property: 'og:url', content: `${siteUrl}${routePath}` })
    ensureMeta('meta[name="twitter:card"]', { name: 'twitter:card', content: 'summary_large_image' })
    ensureMeta('link[rel="canonical"]', { rel: 'canonical', href: `${siteUrl}${routePath}` })
  }, [location.pathname])
  return null
}
