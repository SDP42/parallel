import { useEffect } from 'react'

const SITE = import.meta.env.VITE_SITE_URL ?? 'https://parallel-twin.app'

function setMeta(attr: 'name' | 'property', key: string, content: string) {
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${key}"]`)
  if (!el) { el = document.createElement('meta'); el.setAttribute(attr, key); document.head.appendChild(el) }
  el.content = content
}

/** Unique title, meta description, canonical and Open Graph tags per route. */
export function useSeo(title: string, description: string, path: string, opts: { noindex?: boolean } = {}) {
  useEffect(() => {
    const full = title.includes('Parallel') ? title : `${title} · Parallel`
    document.title = full
    setMeta('name', 'description', description)
    setMeta('property', 'og:title', full)
    setMeta('property', 'og:description', description)
    setMeta('property', 'og:url', SITE + path)
    setMeta('name', 'twitter:title', full)
    setMeta('name', 'twitter:description', description)
    setMeta('name', 'robots', opts.noindex ? 'noindex,nofollow' : 'index,follow')
    let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]')
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link) }
    link.href = SITE + path
    // Analytics page view (only if GA was configured via VITE_GA_ID and consent given)
    const w = window as any
    if (w.gtag) w.gtag('event', 'page_view', { page_path: path, page_title: full })
  }, [title, description, path, opts.noindex])
}
