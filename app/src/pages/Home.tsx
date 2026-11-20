import { useEffect, useMemo, useRef, useState } from 'react'
import {
  AudioLines, Check, ChevronRight, CircleHelp, Download, FileAudio, FileMusic, FolderOpen,
  ListMusic, LoaderCircle, LockKeyhole, Settings2, ShieldCheck, Sparkles, Upload, X,
} from 'lucide-react'
import GlassSelector from '../components/GlassSelector'
import HelpDialog from '../components/HelpDialog'
import Onboarding from '../components/Onboarding'
import WaveformEditor from '../components/WaveformEditor'
import { analyzeAudio } from '../lib/audio'
import {
  createEdit, downloadXml, exportRekordboxXml, initialEditFromAutoCues, parseRekordboxXml,
} from '../lib/rekordbox'
import type {
  AnalysisResult, EditorTrack, Profile, RekordboxSession, TrackEdit,
} from '../types'
import '../App.css'

const PROFILE_KEY = 'lyzer-web-profile-v1'

function loadProfile(): Profile | null {
  try {
    const value = localStorage.getItem(PROFILE_KEY)
    return value ? JSON.parse(value) as Profile : null
  } catch {
    return null
  }
}

function normalizedName(name: string): string {
  return name.toLocaleLowerCase().normalize('NFC').trim()
}

export default function Home() {
  const [session, setSession] = useState<RekordboxSession | null>(null)
  const [playlistId, setPlaylistId] = useState('')
  const [profile, setProfile] = useState<Profile | null>(loadProfile)
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [audioFiles, setAudioFiles] = useState<File[]>([])
  const [analyses, setAnalyses] = useState<Record<string, AnalysisResult>>({})
  const [edits, setEdits] = useState<Record<string, TrackEdit>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [selectedTrackId, setSelectedTrackId] = useState<string | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [batchRunning, setBatchRunning] = useState(false)
  const [progress, setProgress] = useState(0)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [helpOpen, setHelpOpen] = useState(false)
  const audioInput = useRef<HTMLInputElement>(null)

  const playlist = session?.playlists.find((item) => item.id === playlistId) ?? null
  const tracks = useMemo(() => playlist?.trackIds.map((id) => session?.tracks.get(id)).filter((track): track is EditorTrack => Boolean(track)) ?? [], [playlist, session])
  const filesByName = useMemo(() => {
    const map = new Map<string, File[]>()
    audioFiles.forEach((file) => {
      const name = normalizedName(file.name)
      map.set(name, [...(map.get(name) ?? []), file])
    })
    return map
  }, [audioFiles])
  const selectedTrack = tracks.find((track) => track.id === selectedTrackId) ?? null
  const matchedFile = selectedTrack ? filesByName.get(normalizedName(selectedTrack.fileName)) : undefined
  const selectedFile = matchedFile?.length === 1 ? matchedFile[0] : null
  const selectedAnalysis = selectedTrack ? analyses[selectedTrack.id] : undefined
  const selectedEdit = selectedTrack ? edits[selectedTrack.id] : undefined
  const matchedCount = tracks.filter((track) => filesByName.get(normalizedName(track.fileName))?.length === 1).length

  useEffect(() => {
    if (!session || !playlist || !profile) return
    setEdits((current) => {
      const next = { ...current }
      playlist.trackIds.forEach((id) => {
        if (!next[id]) {
          const existing = initialEditFromAutoCues(session, id, profile.doubleTime)
          if (existing) next[id] = existing
        }
      })
      return next
    })
    if (!playlist.trackIds.includes(selectedTrackId ?? '')) setSelectedTrackId(playlist.trackIds[0] ?? null)
  }, [session, playlist, profile, selectedTrackId])

  const openXml = async (file: File) => {
    setError('')
    setNotice('')
    try {
      const parsed = parseRekordboxXml(await file.text(), file.name)
      if (!parsed.playlists.length) throw new Error('No playlist with tracks was found in this XML.')
      setSession(parsed)
      setPlaylistId((parsed.playlists.find((item) => item.trackIds.length) ?? parsed.playlists[0]).id)
      setAudioFiles([])
      setAnalyses({})
      setEdits({})
      setErrors({})
      setSelectedTrackId(null)
      setShowOnboarding(!profile)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'This XML could not be read.')
    }
  }

  const addAudio = (incoming: File[]) => {
    const supported = incoming.filter((file) => /\.(mp3|m4a|aac|wav|aiff?|flac|ogg)$/i.test(file.name) || file.type.startsWith('audio/'))
    setAudioFiles((current) => {
      const keys = new Set(current.map((file) => `${file.name}-${file.size}-${file.lastModified}`))
      return [...current, ...supported.filter((file) => !keys.has(`${file.name}-${file.size}-${file.lastModified}`))]
    })
    setNotice(`${supported.length} audio file${supported.length === 1 ? '' : 's'} loaded. Tracks are matched by filename.`)
  }

  const runAnalysis = async (track: EditorTrack) => {
    if (!profile || busyId) return
    const matches = filesByName.get(normalizedName(track.fileName))
    if (matches?.length !== 1) {
      setErrors((current) => ({ ...current, [track.id]: matches?.length ? 'This filename is ambiguous. Remove the duplicate audio file.' : 'The matching audio file is missing.' }))
      return
    }
    setBusyId(track.id)
    setProgress(0)
    setErrors((current) => { const next = { ...current }; delete next[track.id]; return next })
    try {
      const grid = profile.doubleTime ? track.doubleBeats : track.normalBeats
      const { result, drops } = await analyzeAudio(matches[0], grid, setProgress)
      setAnalyses((current) => ({ ...current, [track.id]: result }))
      setEdits((current) => ({ ...current, [track.id]: createEdit(drops[0], drops[1], track, profile) }))
      setSelectedTrackId(track.id)
    } catch (cause) {
      setErrors((current) => ({ ...current, [track.id]: cause instanceof Error ? cause.message : 'Audio analysis failed.' }))
    } finally {
      setBusyId(null)
      setProgress(0)
    }
  }

  const analyzeAll = async () => {
    if (busyId) return
    setBatchRunning(true)
    for (const track of tracks) {
      if (analyses[track.id] || filesByName.get(normalizedName(track.fileName))?.length !== 1) continue
      setSelectedTrackId(track.id)
      if (!profile) break
      const file = filesByName.get(normalizedName(track.fileName))?.[0]
      if (!file) continue
      setBusyId(track.id)
      setProgress(0)
      try {
        const { result, drops } = await analyzeAudio(file, profile.doubleTime ? track.doubleBeats : track.normalBeats, setProgress)
        setAnalyses((current) => ({ ...current, [track.id]: result }))
        setEdits((current) => ({ ...current, [track.id]: createEdit(drops[0], drops[1], track, profile) }))
      } catch (cause) {
        setErrors((current) => ({ ...current, [track.id]: cause instanceof Error ? cause.message : 'Audio analysis failed.' }))
      } finally {
        setBusyId(null)
      }
    }
    setBatchRunning(false)
    setProgress(0)
    setNotice('Batch analysis finished. Check the cues in the waveform before exporting.')
  }

  const updateEdit = (edit: TrackEdit) => {
    if (!selectedTrack) return
    setEdits((current) => ({ ...current, [selectedTrack.id]: edit }))
  }

  const reviewedAndNext = () => {
    if (!selectedTrack || !selectedEdit) return
    setEdits((current) => ({ ...current, [selectedTrack.id]: { ...selectedEdit, reviewed: true } }))
    const index = tracks.findIndex((track) => track.id === selectedTrack.id)
    if (index >= 0 && index + 1 < tracks.length) setSelectedTrackId(tracks[index + 1].id)
    else setNotice('All tracks checked. Your XML is ready to export.')
  }

  const exportXml = () => {
    if (!session || !playlist || !profile) return
    const result = exportRekordboxXml(session, playlist, edits, profile.colors)
    downloadXml(result, session.fileName)
    setNotice(`${result.added} Hot Cues exported${result.skipped ? ` · ${result.skipped} occupied positions skipped` : ''}. The original XML stays unchanged.`)
  }

  const reset = () => {
    setSession(null)
    setPlaylistId('')
    setAudioFiles([])
    setAnalyses({})
    setEdits({})
    setErrors({})
    setSelectedTrackId(null)
    setNotice('')
    setError('')
    setSettingsOpen(false)
    setHelpOpen(false)
  }

  if (!session) return <GlassSelector onFile={openXml} error={error} />
  if (showOnboarding) return <Onboarding onComplete={(next) => {
    localStorage.setItem(PROFILE_KEY, JSON.stringify(next))
    setProfile(next)
    setShowOnboarding(false)
  }} />
  if (!profile || !playlist) return null

  return (
    <main className="workspace">
      <header className="app-header">
        <button className="app-brand" onClick={reset} title="Open another XML"><span /> LYZER <small>BETA</small></button>
        <div className="header-file"><span>{session.fileName}</span><i>/</i><strong>{playlist.name}</strong></div>
        <div className="header-actions">
          <span className="local-badge"><LockKeyhole size={13} /> 100% local</span>
          <button className="icon-button" onClick={() => setHelpOpen(true)} title="XML workflow help"><CircleHelp size={18} /></button>
          <button className="icon-button" onClick={() => setSettingsOpen(true)} title="Cue preset and colors"><Settings2 size={18} /></button>
          <button className="button button-primary export-button" onClick={exportXml} disabled={!Object.keys(edits).length}><Download size={17} /> Export XML</button>
        </div>
      </header>

      <div className="workspace-body">
        <aside className="track-sidebar">
          <div className="sidebar-section playlist-section">
            <label htmlFor="playlist">PLAYLIST</label>
            <div className="select-wrap"><ListMusic size={16} /><select id="playlist" value={playlistId} onChange={(event) => setPlaylistId(event.target.value)}>
              {session.playlists.map((item) => <option key={item.id} value={item.id}>{item.name} ({item.trackIds.length})</option>)}
            </select></div>
          </div>
          <div className="sidebar-section audio-section">
            <div className="audio-summary"><div><FileAudio size={18} /><span><strong>{matchedCount} / {tracks.length}</strong><small>Tracks ready</small></span></div><span>{audioFiles.length} files</span></div>
            <button className="audio-dropzone" onClick={() => audioInput.current?.click()}><Upload size={17} /><span>Add music</span><small>Files or a folder · stays local</small></button>
            <input ref={audioInput} type="file" multiple hidden accept="audio/*,.mp3,.m4a,.wav,.aiff,.aif,.flac" onChange={(event) => { addAudio(Array.from(event.target.files ?? [])); event.target.value = '' }} />
            <label className="folder-button"><FolderOpen size={14} /> Select folder<input type="file" multiple hidden ref={(element) => element?.setAttribute('webkitdirectory', '')} onChange={(event) => { addAudio(Array.from(event.target.files ?? [])); event.target.value = '' }} /></label>
            {matchedCount > 0 && <button className="button analyze-all" onClick={analyzeAll} disabled={Boolean(busyId)}>{batchRunning ? <LoaderCircle className="spin" size={15} /> : <Sparkles size={15} />} Analyze all matched tracks</button>}
          </div>
          <div className="track-list-header"><span>TRACKS</span><span>{tracks.length}</span></div>
          <div className="track-list">
            {tracks.map((track) => {
              const analysis = analyses[track.id]
              const edit = edits[track.id]
              const fileState = filesByName.get(normalizedName(track.fileName))
              return <button key={track.id} className={`track-row ${selectedTrackId === track.id ? 'selected' : ''}`} onClick={() => setSelectedTrackId(track.id)}>
                <span className={`track-status ${edit?.reviewed ? 'done' : analysis ? 'analyzed' : fileState?.length === 1 ? 'ready' : ''}`}>
                  {busyId === track.id ? <LoaderCircle className="spin" size={13} /> : edit?.reviewed ? <Check size={12} /> : analysis ? <AudioLines size={12} /> : <FileMusic size={12} />}
                </span>
                <span className="track-copy"><strong>{track.title}</strong><small>{track.artist || 'Unknown artist'}</small></span>
                {track.hasManualCues && <ShieldCheck className="manual-cue" size={13} aria-label="Manual cues present" />}
                <ChevronRight className="track-chevron" size={14} />
              </button>
            })}
          </div>
        </aside>

        <section className="main-stage">
          {selectedTrack ? <>
            <div className="track-heading">
              <div><span className="eyebrow">NOW EDITING</span><h1>{selectedTrack.title}</h1><p>{selectedTrack.artist || 'Unknown artist'} <i>·</i> {selectedTrack.fileName}</p></div>
              <div className="track-meta"><span>{selectedTrack.normalBeats.length} grid beats</span>{selectedTrack.hasManualCues && <span className="protected-badge"><ShieldCheck size={13} /> Manual cues protected</span>}</div>
            </div>
            {notice && <div className="notice-bar"><Check size={15} /><span>{notice}</span><button onClick={() => setNotice('')}><X size={14} /></button></div>}
            {busyId === selectedTrack.id ? <div className="analysis-state">
              <div className="analysis-visual"><AudioLines size={38} /><span /><span /><span /></div>
              <h2>LYZER is listening.</h2><p>Phrases, bass changes and drop starts are being analyzed.</p>
              <div className="progress-track"><span style={{ width: `${progress}%` }} /></div><strong>{progress}%</strong><small>{batchRunning ? 'Running batch analysis' : selectedTrack.title}</small>
            </div> : selectedAnalysis && selectedEdit && selectedFile ? <WaveformEditor key={selectedTrack.id} track={selectedTrack} analysis={selectedAnalysis} edit={selectedEdit} audioFile={selectedFile} colors={profile.colors} onChange={updateEdit} onReviewed={reviewedAndNext} /> : <div className="empty-state">
              <div className="empty-icon"><AudioLines size={30} /></div>
              <h2>{!selectedFile ? 'Connect the audio file' : selectedEdit && !selectedAnalysis ? 'AUTO cues loaded' : 'Ready to analyze'}</h2>
              <p>{!selectedFile ? `Select “${selectedTrack.fileName}” from your music folder. The file path inside the XML is not directly accessible to a browser.` : selectedEdit && !selectedAnalysis ? 'Existing LYZER cues were found. Analyze the track again to open the waveform.' : 'Analysis runs completely in your browser. You can fine-tune every cue afterward.'}</p>
              {errors[selectedTrack.id] && <div className="inline-error">{errors[selectedTrack.id]}</div>}
              <button className="button button-primary button-large" disabled={Boolean(busyId)} onClick={() => selectedFile ? runAnalysis(selectedTrack) : audioInput.current?.click()}>{selectedFile ? <Sparkles size={17} /> : <Upload size={17} />}{selectedFile ? selectedEdit ? 'Analyze again' : 'Analyze drops' : 'Select audio file'}</button>
              {matchedFile && matchedFile.length > 1 && <small className="warning-copy">Multiple files with this name were found.</small>}
            </div>}
            <div className="stage-footer"><span><LockKeyhole size={12} /> No uploads · no server-side analysis</span><span>Only <code>AUTO:</code> cues are replaced · manual cues, loops & Memory Cues stay untouched</span></div>
          </> : <div className="empty-state"><h2>Select a track</h2></div>}
        </section>
      </div>

      {settingsOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setSettingsOpen(false) }}>
        <section className="settings-modal" role="dialog" aria-modal="true" aria-label="Cue settings">
          <header><div><span className="eyebrow">YOUR PRESET</span><h2>Cues & colors</h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Close settings"><X size={18} /></button></header>
          <div className="settings-group"><label>Default spacing for new analyses</label><div className="style-grid">{[16, 32, 64].map((beats) => <button key={beats} className={`style-card ${profile.leadBeats === beats ? 'selected' : ''}`} onClick={() => setProfile({ ...profile, leadBeats: beats })}><strong>{beats} / {beats * 2}</strong><small>beats before the drop</small></button>)}</div></div>
          <div className="settings-group"><label>Default beat grid</label><div className="segmented-control settings-grid"><button className={!profile.doubleTime ? 'active' : ''} onClick={() => setProfile({ ...profile, doubleTime: false })}>Normal</button><button className={profile.doubleTime ? 'active' : ''} onClick={() => setProfile({ ...profile, doubleTime: true })}>Double-time</button></div></div>
          <div className="settings-group"><label>Hot Cue colors</label><div className="color-settings">{(['A', 'B', 'C', 'D', 'E', 'F', 'H'] as const).map((name) => <label key={name}><input type="color" value={profile.colors[name]} onChange={(event) => setProfile({ ...profile, colors: { ...profile.colors, [name]: event.target.value } })} /><span>{name}</span></label>)}</div></div>
          <p className="settings-note">Spacing applies to new analyses. Existing edits are not moved unexpectedly.</p>
          <button className="button button-primary button-large" onClick={() => { localStorage.setItem(PROFILE_KEY, JSON.stringify(profile)); setSettingsOpen(false) }}><Check size={17} /> Save settings</button>
        </section>
      </div>}
      {helpOpen && <HelpDialog onClose={() => setHelpOpen(false)} />}
    </main>
  )
}
