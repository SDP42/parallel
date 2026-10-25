import { useTranslation } from 'react-i18next'
import { Mic, ShieldCheck, Sparkles } from 'lucide-react'
import { PageHead } from './AppShell'
import { CoachChat, useCoach } from '@/components/VoiceCoach'
import { Panel } from '@/components/charts'
import { LANGS } from '@/lib/i18n'
import { useAuth } from '@/lib/auth'
import { useSeo } from '@/lib/seo'

const PERSONA_STYLE: Record<string, string> = {
  student: 'Talks in chapters and exam blocks.',
  developer: 'Talks in bugs, PRs and flow state.',
  creator: 'Talks in edits, drafts and posting windows.',
  professional: 'Talks in meetings, analysis and inbox time.',
}

export default function Coach() {
  useSeo('Twin coach', 'Ask your attention twin anything, by voice or text, in four languages.', '/app/coach', { noindex: true })
  const { t, i18n } = useTranslation()
  const { user } = useAuth()
  const coach = useCoach()
  return (
    <>
      <PageHead title={t('coach.title')} crumbs="Coach" sub="A persona-aware assistant. It answers from your twin’s numbers, never from thin air, in English, हिन्दी, मराठी or Español." />
      <div className="grid gap-3 xl:grid-cols-12">
        <section className="xl:col-span-8 panel p-5" aria-label="Conversation"><CoachChat coach={coach} tall /></section>
        <div className="xl:col-span-4 flex flex-col gap-3">
          <Panel title="Language" sub="Changes the interface, voice input and spoken replies.">
            <div className="grid grid-cols-2 gap-2">
              {LANGS.map((l) => (
                <button key={l.code} aria-pressed={i18n.language === l.code} onClick={() => i18n.changeLanguage(l.code)}
                  className={`px-3 py-2.5 text-left ${i18n.language === l.code ? 'bg-chaos text-field-ink' : 'bg-surface-2 hover:bg-bg'}`}>
                  <span className="block font-medium">{l.label}</span><span className="small opacity-80">{l.speech}</span>
                </button>
              ))}
            </div>
          </Panel>
          <Panel title="Your coach’s persona">
            <p className="flex items-start gap-2"><Sparkles size={18} className="text-calm shrink-0 mt-1" /> <span><span className="capitalize font-medium">{user?.persona}</span> twin. {PERSONA_STYLE[user?.persona ?? 'developer']}</span></p>
            <p className="small text-muted mt-3">Goals it optimises for: {user?.goals.join(', ') || 'none set'}.</p>
          </Panel>
          <Panel title="How it stays honest">
            <ul className="flex flex-col gap-2 small text-muted">
              <li className="flex gap-2"><ShieldCheck size={16} className="text-calm shrink-0" /> An intent router picks the question type. Numbers come from your models, so it can’t invent statistics.</li>
              <li className="flex gap-2"><Mic size={16} className="text-calm shrink-0" /> Voice uses your browser’s speech engine. Audio never reaches Parallel.</li>
              <li className="flex gap-2"><ShieldCheck size={16} className="text-calm shrink-0" /> Conversations are stored in your account and included in your data export.</li>
            </ul>
          </Panel>
        </div>
      </div>
    </>
  )
}
