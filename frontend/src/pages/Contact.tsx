import { useState } from 'react'
import { Send } from 'lucide-react'
import { SiteFooter, SiteNav } from '@/components/SiteChrome'
import { Breadcrumbs } from '@/components/Brand'
import { api } from '@/lib/api'
import { useSeo } from '@/lib/seo'

export default function Contact() {
  useSeo('Contact', 'Talk to the Parallel team about the attention digital twin, partnerships, privacy or data deletion.', '/contact')
  const [form, setForm] = useState({ name: '', email: '', message: '' })
  const [state, setState] = useState<{ ok?: string; err?: string; busy?: boolean }>({})
  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setState({ busy: true })
    try {
      const r = await api<{ message: string }>('/contact', { body: form })
      setState({ ok: r.message }); setForm({ name: '', email: '', message: '' })
    } catch (ex) { setState({ err: (ex as Error).message }) }
  }
  return (
    <>
      <SiteNav />
      <main className="mx-auto max-w-[1400px] px-4 sm:px-10 pt-32 pb-20 grid lg:grid-cols-12 gap-10">
        <div className="lg:col-span-5">
          <Breadcrumbs items={[{ label: 'Home', to: '/' }, { label: 'Contact' }]} />
          <h1 className="head mt-6">Say hello</h1>
          <p className="mt-4 text-muted max-w-[40ch]">Partnerships, research collaborations, privacy questions or deletion requests. A human reads every message.</p>
        </div>
        <form onSubmit={submit} className="lg:col-span-7 panel p-6 sm:p-8 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 small text-muted">Name
            <input className="input" required maxLength={80} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} autoComplete="name" />
          </label>
          <label className="flex flex-col gap-1.5 small text-muted">Email
            <input className="input" type="email" required value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} autoComplete="email" />
          </label>
          <label className="flex flex-col gap-1.5 small text-muted">Message
            <textarea className="input min-h-40" required minLength={5} maxLength={2000} value={form.message} onChange={(e) => setForm({ ...form, message: e.target.value })} />
          </label>
          {state.ok && <p role="status" className="text-calm">{state.ok}</p>}
          {state.err && <p role="alert" className="text-chaos">{state.err}</p>}
          <button className="btn self-start" disabled={state.busy}>{state.busy ? 'Sending…' : 'Send message'} <Send size={16} /></button>
        </form>
      </main>
      <SiteFooter />
    </>
  )
}
