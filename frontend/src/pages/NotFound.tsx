import { Link } from 'react-router-dom'
import { ForkMark } from '@/components/Brand'
import { SiteNav } from '@/components/SiteChrome'
import { useSeo } from '@/lib/seo'

export default function NotFound() {
  useSeo('Page not found', 'This page took the other fork.', '/404', { noindex: true })
  return (
    <>
      <SiteNav />
      <main className="min-h-screen mx-auto max-w-[1400px] px-4 sm:px-10 pt-40 pb-20 grid lg:grid-cols-2 items-center gap-10">
        <div>
          <p className="text-chaos font-semibold text-lg">404</p>
          <h1 className="display mt-2 max-w-[10ch]">This page took the other fork.</h1>
          <p className="mt-6 lead text-muted max-w-[36ch]">In Universe A it exists. In this one, you can head somewhere useful instead.</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link to="/" className="btn">Back home</Link>
            <Link to="/app" className="btn btn-ghost">Open your twin</Link>
            <Link to="/contact" className="btn btn-ghost">Report a broken link</Link>
          </div>
        </div>
        <ForkMark size={420} className="text-ink justify-self-center max-w-full h-auto" />
      </main>
    </>
  )
}
