import { Check, Minus, Pause, Play, Plus, RotateCcw, SkipBack, Trash2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { CUE_ORDER, changeGridMode, formatTime, moveCue, toggleSecondDrop } from '../lib/rekordbox'
import type { AnalysisResult, CueName, EditorTrack, TrackEdit } from '../types'

interface Props {
  track: EditorTrack
  analysis: AnalysisResult
  edit: TrackEdit
  audioFile: File
  colors: Record<CueName, string>
  onChange: (edit: TrackEdit) => void
  onReviewed: () => void
}

export default function WaveformEditor({ track, analysis, edit, audioFile, colors, onChange, onReviewed }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const frameRef = useRef<HTMLDivElement>(null)
  const audioRef = useRef<HTMLAudioElement>(null)
  const dragCue = useRef<CueName | null>(null)
  const [size, setSize] = useState({ width: 900, height: 260 })
  const [zoom, setZoom] = useState(1)
  const [viewStart, setViewStart] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [downbeatOnly, setDownbeatOnly] = useState(true)
  const audioUrl = useMemo(() => URL.createObjectURL(audioFile), [audioFile])
  const duration = analysis.duration
  const visibleDuration = duration / zoom
  const beats = edit.doubleTime ? track.doubleBeats : track.normalBeats

  useEffect(() => () => URL.revokeObjectURL(audioUrl), [audioUrl])
  useEffect(() => {
    const element = frameRef.current
    if (!element) return
    const update = () => {
      const rect = element.getBoundingClientRect()
      setSize({ width: Math.max(1, rect.width), height: Math.max(1, rect.height) })
    }
    update()
    const observer = new ResizeObserver(update)
    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!playing) return
    let animation = 0
    const tick = () => {
      const time = audioRef.current?.currentTime ?? 0
      setCurrentTime(time)
      if (zoom > 1) {
        const visible = duration / zoom
        setViewStart(Math.max(0, Math.min(duration - visible, time - visible / 2)))
      }
      animation = requestAnimationFrame(tick)
    }
    animation = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(animation)
  }, [playing, zoom, duration])

  useEffect(() => {
    setViewStart((start) => Math.max(0, Math.min(Math.max(0, duration - visibleDuration), start)))
  }, [zoom, duration, visibleDuration])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ratio = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(size.width * ratio)
    canvas.height = Math.round(size.height * ratio)
    const context = canvas.getContext('2d')
    if (!context) return
    context.scale(ratio, ratio)
    const width = size.width
    const height = size.height
    const waveTop = 46
    const waveBottom = height - 30
    const center = (waveTop + waveBottom) / 2
    const xFor = (time: number) => (time - viewStart) / visibleDuration * width
    context.clearRect(0, 0, width, height)
    context.fillStyle = '#0b0d10'
    context.fillRect(0, 0, width, height)

    analysis.phases.forEach((phase) => {
      const start = xFor(phase.start)
      const end = xFor(phase.end)
      if (end < 0 || start > width) return
      context.fillStyle = 'rgba(106, 242, 199, .035)'
      context.fillRect(Math.max(0, start), waveTop, Math.min(width, end) - Math.max(0, start), waveBottom - waveTop)
    })

    const firstBin = Math.max(0, Math.floor(viewStart / duration * analysis.waveform.length) - 1)
    const lastBin = Math.min(analysis.waveform.length - 1, Math.ceil((viewStart + visibleDuration) / duration * analysis.waveform.length) + 1)
    for (let index = firstBin; index <= lastBin; index += 1) {
      const bin = analysis.waveform[index]
      const x = xFor(index / analysis.waveform.length * duration)
      const nextX = xFor((index + 1) / analysis.waveform.length * duration)
      const amplitude = Math.max(1, bin.peak * (waveBottom - waveTop) * 0.47)
      const energy = Math.min(1, bin.bass * 0.65 + bin.mid * 0.25 + bin.high * 0.2)
      const red = Math.round(45 + energy * 155)
      const green = Math.round(105 + bin.high * 130)
      const blue = Math.round(165 + bin.mid * 85)
      context.fillStyle = `rgb(${red}, ${green}, ${blue})`
      context.fillRect(x, center - amplitude, Math.max(1, nextX - x + 0.3), amplitude * 2)
    }

    beats.forEach((beat) => {
      const x = xFor(beat.position)
      if (x < 0 || x > width) return
      context.strokeStyle = beat.downbeat ? 'rgba(255,255,255,.20)' : 'rgba(255,255,255,.065)'
      context.lineWidth = beat.downbeat ? 1 : 0.6
      context.beginPath()
      context.moveTo(x, waveTop)
      context.lineTo(x, waveBottom)
      context.stroke()
    })

    const rulerStep = visibleDuration > 180 ? 60 : visibleDuration > 70 ? 30 : visibleDuration > 25 ? 10 : 5
    context.font = '10px ui-monospace, monospace'
    context.fillStyle = 'rgba(255,255,255,.38)'
    for (let time = Math.floor(viewStart / rulerStep) * rulerStep; time <= viewStart + visibleDuration; time += rulerStep) {
      context.fillText(formatTime(time), xFor(time) + 5, height - 9)
    }

    CUE_ORDER.forEach((name, index) => {
      const position = edit.cues[name]
      if (position === undefined) return
      const x = xFor(position)
      if (x < -25 || x > width + 25) return
      const y = 10 + (index % 2) * 17
      context.strokeStyle = colors[name]
      context.lineWidth = 1.5
      context.globalAlpha = 0.75
      context.beginPath()
      context.moveTo(x, y + 15)
      context.lineTo(x, waveBottom)
      context.stroke()
      context.globalAlpha = 1
      context.fillStyle = colors[name]
      context.beginPath()
      context.roundRect(x - 12, y, 24, 16, 5)
      context.fill()
      context.fillStyle = '#0b0d10'
      context.font = '700 10px system-ui'
      context.textAlign = 'center'
      context.fillText(name, x, y + 12)
      context.textAlign = 'left'
    })

    const playheadX = xFor(currentTime)
    if (playheadX >= 0 && playheadX <= width) {
      context.strokeStyle = '#ffffff'
      context.lineWidth = 1.5
      context.beginPath()
      context.moveTo(playheadX, 0)
      context.lineTo(playheadX, waveBottom)
      context.stroke()
      context.fillStyle = '#ffffff'
      context.beginPath()
      context.moveTo(playheadX - 5, 0)
      context.lineTo(playheadX + 5, 0)
      context.lineTo(playheadX, 7)
      context.fill()
    }
  }, [size, analysis, beats, edit, colors, currentTime, viewStart, visibleDuration, duration])

  const positionAtPointer = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    return Math.max(0, Math.min(duration, viewStart + (event.clientX - rect.left) / rect.width * visibleDuration))
  }

  const pointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - rect.left
    const y = event.clientY - rect.top
    let closest: CueName | null = null
    let distance = 14
    CUE_ORDER.forEach((name) => {
      const position = edit.cues[name]
      if (position === undefined || name === 'H') return
      const cueX = (position - viewStart) / visibleDuration * rect.width
      if (Math.abs(cueX - x) < distance && y < 62) {
        closest = name
        distance = Math.abs(cueX - x)
      }
    })
    dragCue.current = closest
    event.currentTarget.setPointerCapture(event.pointerId)
    if (!closest && audioRef.current) {
      const position = positionAtPointer(event)
      audioRef.current.currentTime = position
      setCurrentTime(position)
    }
  }

  const pointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragCue.current) return
    onChange(moveCue(edit, dragCue.current, positionAtPointer(event), track, downbeatOnly))
  }

  const togglePlayback = async () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) {
      await audio.play()
      setPlaying(true)
    } else {
      audio.pause()
      setPlaying(false)
    }
  }

  const seek = (position: number) => {
    if (!audioRef.current) return
    audioRef.current.currentTime = position
    setCurrentTime(position)
    if (zoom > 1) setViewStart(Math.max(0, Math.min(duration - visibleDuration, position - visibleDuration / 2)))
  }

  const zoomAt = (next: number, anchor = currentTime) => {
    const value = Math.max(1, Math.min(24, next))
    const nextVisible = duration / value
    setZoom(value)
    setViewStart(Math.max(0, Math.min(duration - nextVisible, anchor - nextVisible / 2)))
  }

  return (
    <section className="editor-panel">
      <audio ref={audioRef} src={audioUrl} onEnded={() => setPlaying(false)} onPause={() => setPlaying(false)} />
      <div className="editor-toolbar">
        <div className="transport-controls">
          <button className="icon-button" onClick={() => seek(0)} title="Go to start"><SkipBack size={17} /></button>
          <button className="play-button" onClick={togglePlayback} title="Play / pause">{playing ? <Pause size={19} fill="currentColor" /> : <Play size={19} fill="currentColor" />}</button>
          <button className="icon-button" onClick={() => seek(edit.cues.B ?? 0)} title="Go to first drop"><RotateCcw size={16} /></button>
          <span className="timecode">{formatTime(currentTime)} <i>/</i> {formatTime(duration)}</span>
        </div>
        <div className="editor-tools">
          <div className="segmented-control" aria-label="Beat grid">
            <button className={!edit.doubleTime ? 'active' : ''} onClick={() => onChange(changeGridMode(edit, false, track))}>Normal</button>
            <button className={edit.doubleTime ? 'active' : ''} onClick={() => onChange(changeGridMode(edit, true, track))}>Doubletime</button>
          </div>
          <button className={`snap-button ${downbeatOnly ? 'active' : ''}`} onClick={() => setDownbeatOnly(!downbeatOnly)} title="Snap to downbeats only">
            <span className="magnet-icon">∩</span>{downbeatOnly ? 'Downbeats' : 'All beats'}
          </button>
          <div className="zoom-controls">
            <button className="icon-button" onClick={() => zoomAt(zoom / 1.6)} title="Zoom out"><Minus size={17} /></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button className="icon-button" onClick={() => zoomAt(zoom * 1.6)} title="Zoom in"><Plus size={17} /></button>
          </div>
        </div>
      </div>
      <div className="waveform-frame" ref={frameRef}>
        <canvas
          ref={canvasRef}
          style={{ width: size.width, height: size.height }}
          onPointerDown={pointerDown}
          onPointerMove={pointerMove}
          onPointerUp={() => { dragCue.current = null }}
          onPointerCancel={() => { dragCue.current = null }}
          onWheel={(event) => {
            event.preventDefault()
            const rect = event.currentTarget.getBoundingClientRect()
            const anchor = viewStart + (event.clientX - rect.left) / rect.width * visibleDuration
            if (event.ctrlKey || event.metaKey) zoomAt(zoom * (event.deltaY > 0 ? 0.88 : 1.12), anchor)
            else if (zoom > 1) setViewStart(Math.max(0, Math.min(duration - visibleDuration, viewStart + (event.deltaX || event.deltaY) / rect.width * visibleDuration)))
          }}
        />
        <div className="waveform-hint">Drag to snap · Pinch / ⌘ + scroll to zoom</div>
      </div>
      <div className="cue-strip">
        {CUE_ORDER.map((name) => {
          const position = edit.cues[name]
          if (position === undefined) return null
          return <button key={name} className="cue-chip" onClick={() => seek(position)} style={{ '--cue-color': colors[name] } as React.CSSProperties}>
            <span>{name}</span><strong>{formatTime(position)}</strong>
          </button>
        })}
        <button className="cue-chip add-drop" onClick={() => onChange(toggleSecondDrop(edit, track, analysis.candidates.map((candidate) => candidate.position)))}>
          {edit.cues.D === undefined ? <><Plus size={14} /><strong>Drop 2</strong></> : <><Trash2 size={14} /><strong>Drop 2</strong></>}
        </button>
      </div>
      <div className="editor-footer">
        <span>All cues except H are freely movable. A/C/E/F keep their spacing when their drops move.</span>
        <button className={`button review-button ${edit.reviewed ? 'reviewed' : ''}`} onClick={onReviewed}><Check size={16} /> {edit.reviewed ? 'Checked' : 'Checked & next'}</button>
      </div>
    </section>
  )
}
