import { Download, FileMusic, Play, Upload, X } from 'lucide-react'

const steps = [
  {
    icon: Download,
    title: 'Export from rekordbox',
    text: 'Open rekordbox and choose File → Export Collection in xml format. Select the playlist you want to analyze. For a single playlist, exporting just that playlist keeps the XML small.',
  },
  {
    icon: FileMusic,
    title: 'Open LYZER',
    text: 'Select the exported XML in LYZER and choose the playlist. Because a browser cannot directly access file paths from the XML, add the audio files or select the folder that contains them. LYZER matches tracks by filename.',
  },
  {
    icon: Play,
    title: 'Analyze and refine',
    text: 'Analyze one track or all matched tracks. Check the detected drops in the waveform, drag cues to the grid, switch between normal and double-time, then export the XML.',
  },
  {
    icon: Upload,
    title: 'Import back into rekordbox',
    text: 'In rekordbox, choose File → Import → Import Rekordbox XML and select the LYZER XML. Rekordbox updates the matching collection entries with the new Hot Cues.',
  },
]

export default function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section className="help-modal" role="dialog" aria-modal="true" aria-label="Rekordbox XML help">
        <header>
          <div><span className="eyebrow">QUICK GUIDE</span><h2>Rekordbox XML workflow</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close help"><X size={18} /></button>
        </header>
        <div className="help-steps">
          {steps.map((step, index) => <article key={step.title}>
            <div className="help-number"><step.icon size={17} /></div>
            <div><span>STEP {index + 1}</span><h3>{step.title}</h3><p>{step.text}</p></div>
          </article>)}
        </div>
        <div className="help-note">
          <strong>What happens to existing cues?</strong>
          <p>LYZER creates a new XML and leaves your original file untouched. Existing manual Hot Cues, Memory Cues and loops stay in place. Only previous LYZER <code>AUTO:</code> cues are replaced.</p>
        </div>
      </section>
    </div>
  )
}
