import { CircleHelp, FileUp, FolderOpen, LockKeyhole } from 'lucide-react'
import { useRef, useState } from 'react'
import HelpDialog from './HelpDialog'

interface Props {
  onFile: (file: File) => void
  error: string
}

export default function GlassSelector({ onFile, error }: Props) {
  const input = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  return (
    <main className="glass-selector">
      <div className="type-stream type-stream-left" aria-hidden="true">
        <div>{Array.from({ length: 10 }, (_, index) => <span key={index}>LYZER</span>)}</div>
      </div>
      <div className="type-stream type-stream-right" aria-hidden="true">
        <div>{Array.from({ length: 10 }, (_, index) => <span key={index}>LYZER</span>)}</div>
      </div>
      <section
        className={`glass-panel ${dragging ? 'is-dragging' : ''}`}
        onDragOver={(event) => { event.preventDefault(); setDragging(true) }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files[0]
          if (file) onFile(file)
        }}
      >
        <div className="glass-shine" />
        <div className="selector-content">
          <div className="brand-mark"><span /> LYZER</div>
          <button className="icon-button selector-help-button" onClick={() => setHelpOpen(true)} aria-label="Open help"><CircleHelp size={19} /></button>
          <div className="selector-icon"><FileUp size={26} strokeWidth={1.6} /></div>
          <h1>Your set. Your cues.</h1>
          <p>Select your rekordbox XML export and open a playlist.</p>
          <button className="button button-primary button-large" onClick={() => input.current?.click()}>
            <FolderOpen size={18} /> Select XML file
          </button>
          <input ref={input} type="file" accept=".xml,application/xml,text/xml" hidden onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) onFile(file)
            event.target.value = ''
          }} />
          {error && <div className="inline-error" role="alert">{error}</div>}
          <button className="help-link" onClick={() => setHelpOpen(true)}><CircleHelp size={14} /> How do I export from rekordbox?</button>
          <div className="privacy-note"><LockKeyhole size={14} /> Processed locally. Your original stays unchanged.</div>
        </div>
        <div className="selector-help">
          <span>In rekordbox</span>
          <strong>File → Export Collection in xml format</strong>
          <span>One playlist is enough.</span>
        </div>
      </section>
      <div className="selector-footer">AUTOMATIC HOT CUES · MANUAL CONTROL</div>
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </main>
  )
}
