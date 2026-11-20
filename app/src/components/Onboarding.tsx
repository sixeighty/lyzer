import { ArrowRight, Check, Music2 } from 'lucide-react'
import { useState } from 'react'
import { DEFAULT_COLORS } from '../lib/rekordbox'
import type { GenreId, Profile } from '../types'

const genres: { id: GenreId; name: string; bpm: string }[] = [
  { id: 'dnb', name: 'Drum & Bass', bpm: '160–180 BPM' },
  { id: 'house', name: 'House', bpm: '120–130 BPM' },
  { id: 'techno', name: 'Techno', bpm: '125–150 BPM' },
  { id: 'hiphop', name: 'Hip-Hop', bpm: '70–100 BPM' },
  { id: 'open', name: 'Open Format', bpm: 'Flexible' },
]
const styles = [
  { beats: 64, name: 'Long transitions', detail: '64 / 128 beats' },
  { beats: 32, name: 'Short transitions', detail: '32 / 64 beats' },
  { beats: 16, name: 'Compact cues', detail: '16 / 32 beats' },
]

export default function Onboarding({ onComplete }: { onComplete: (profile: Profile) => void }) {
  const [genre, setGenre] = useState<GenreId>('dnb')
  const [leadBeats, setLeadBeats] = useState(64)
  const complete = () => onComplete({ genre, leadBeats, doubleTime: genre === 'dnb', colors: { ...DEFAULT_COLORS } })
  return (
    <main className="onboarding">
      <div className="onboarding-orb orb-one" /><div className="onboarding-orb orb-two" />
      <section className="onboarding-card">
        <header className="onboarding-header">
          <div className="brand-mark"><span /> LYZER</div>
          <span className="step-label">SETUP · 01</span>
        </header>
        <div className="onboarding-title">
          <span className="eyebrow"><Music2 size={14} /> YOUR WORKFLOW</span>
          <h1>How do you DJ?</h1>
          <p>Set this up once. Every cue stays editable later.</p>
        </div>
        <div className="setup-group">
          <label>Your main genre</label>
          <div className="genre-grid">
            {genres.map((item) => <button key={item.id} className={`choice-card ${genre === item.id ? 'selected' : ''}`} onClick={() => setGenre(item.id)}>
              <span className="choice-check">{genre === item.id && <Check size={13} />}</span>
              <strong>{item.name}</strong><small>{item.bpm}</small>
            </button>)}
          </div>
        </div>
        <div className="setup-group">
          <label>How early do you set preparation cues?</label>
          <div className="style-grid">
            {styles.map((item) => <button key={item.beats} className={`style-card ${leadBeats === item.beats ? 'selected' : ''}`} onClick={() => setLeadBeats(item.beats)}>
              <strong>{item.name}</strong><small>{item.detail}</small>
            </button>)}
          </div>
        </div>
        <div className="preset-preview">
          <div><span className="eyebrow">YOUR PRESET</span><strong>{genres.find((item) => item.id === genre)?.name} · {genre === 'dnb' ? 'Double-time' : 'Normal grid'}</strong></div>
          <div className="preview-dots">{(['H', 'E', 'A', 'B', 'F', 'C', 'D'] as const).map((name) => <span key={name} style={{ background: DEFAULT_COLORS[name] }}>{name}</span>)}</div>
        </div>
        <button className="button button-primary button-large onboarding-submit" onClick={complete}>Use this preset <ArrowRight size={18} /></button>
      </section>
    </main>
  )
}
