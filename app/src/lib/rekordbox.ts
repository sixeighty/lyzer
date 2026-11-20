import type {
  Beat,
  CueName,
  EditorTrack,
  ExportResult,
  Playlist,
  Profile,
  RekordboxSession,
  TrackEdit,
} from '../types'

export const CUE_ORDER: CueName[] = ['H', 'E', 'A', 'B', 'F', 'C', 'D']
export const SLOT_NAMES = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'] as const
export const DEFAULT_COLORS: Record<CueName, string> = {
  A: '#ffcd2d', B: '#ff414b', C: '#ffcd2d', D: '#ff414b',
  E: '#28b4ff', F: '#28b4ff', H: '#28e678',
}

function numberAttribute(element: Element, name: string, fallback = 0): number {
  const value = Number(element.getAttribute(name))
  return Number.isFinite(value) ? value : fallback
}

function fileNameFromLocation(location: string): string {
  try {
    const url = new URL(location)
    return decodeURIComponent(url.pathname.split('/').pop() ?? '')
  } catch {
    return decodeURIComponent(location.split('/').pop() ?? location)
  }
}

export function buildBeatGrid(track: Element, doubleTime: boolean): Beat[] {
  const duration = numberAttribute(track, 'TotalTime')
  const points = Array.from(track.children)
    .filter((child) => child.tagName === 'TEMPO')
    .map((tempo) => ({
      start: numberAttribute(tempo, 'Inizio'),
      bpm: numberAttribute(tempo, 'Bpm'),
      phase: Math.max(1, Math.min(4, numberAttribute(tempo, 'Battito', 1))),
    }))
    .filter((point) => point.start >= 0 && point.bpm > 0)
    .sort((a, b) => a.start - b.start)
  if (!points.length || duration <= 0) return []

  const beats: Beat[] = []
  points.forEach((point, index) => {
    const end = index + 1 < points.length ? points[index + 1].start : duration
    const beatLength = 60 / point.bpm
    for (let beatNumber = 0; ; beatNumber += 1) {
      const position = point.start + beatNumber * beatLength
      if (position >= end - 0.000001 || position >= duration) break
      const phase = ((point.phase - 1 + beatNumber) % 4) + 1
      beats.push({ position, downbeat: phase === 1 })
    }
  })

  const medianBpm = [...points.map((point) => point.bpm)].sort((a, b) => a - b)[Math.floor(points.length / 2)]
  if (!doubleTime || medianBpm >= 120) return beats

  const doubled: Beat[] = []
  beats.forEach((beat, index) => {
    doubled.push({ position: beat.position, downbeat: beat.downbeat || index % 4 === 2 })
    const next = index + 1 < beats.length ? beats[index + 1].position : duration
    const midpoint = (beat.position + next) / 2
    if (midpoint < duration) doubled.push({ position: midpoint, downbeat: false })
  })
  return doubled
}

function parseTrack(track: Element): EditorTrack | null {
  const id = track.getAttribute('TrackID')
  if (!id) return null
  const location = track.getAttribute('Location') ?? ''
  const manualCues = Array.from(track.children).some((mark) =>
    mark.tagName === 'POSITION_MARK'
    && mark.getAttribute('Type') === '0'
    && !(mark.getAttribute('Name') ?? '').startsWith('AUTO:')
    && Number(mark.getAttribute('Num')) >= 0
    && Number(mark.getAttribute('Num')) < 8,
  )
  return {
    id,
    title: track.getAttribute('Name') || fileNameFromLocation(location),
    artist: track.getAttribute('Artist') ?? '',
    duration: numberAttribute(track, 'TotalTime'),
    fileName: fileNameFromLocation(location),
    location,
    normalBeats: buildBeatGrid(track, false),
    doubleBeats: buildBeatGrid(track, true),
    hasManualCues: manualCues,
  }
}

export function parseRekordboxXml(text: string, fileName: string): RekordboxSession {
  const document = new DOMParser().parseFromString(text, 'application/xml')
  if (document.querySelector('parsererror') || document.documentElement.tagName !== 'DJ_PLAYLISTS') {
    throw new Error('This is not a valid rekordbox XML file.')
  }
  const tracks = new Map<string, EditorTrack>()
  Array.from(document.getElementsByTagName('TRACK')).forEach((element) => {
    if (element.parentElement?.tagName !== 'COLLECTION') return
    const track = parseTrack(element)
    if (track) tracks.set(track.id, track)
  })

  const playlists: Playlist[] = []
  const visit = (node: Element, parents: string[]) => {
    const name = node.getAttribute('Name') ?? 'Playlist'
    if (node.getAttribute('Type') === '1') {
      const trackIds = Array.from(node.children)
        .filter((child) => child.tagName === 'TRACK')
        .map((child) => child.getAttribute('Key') ?? '')
        .filter((id) => tracks.has(id))
      playlists.push({
        id: `playlist-${playlists.length}`,
        name: [...parents, name].join(' / '),
        trackIds,
      })
    }
    Array.from(node.children)
      .filter((child) => child.tagName === 'NODE')
      .forEach((child) => visit(child, node.getAttribute('Type') === '0' ? [...parents, name] : parents))
  }
  const root = document.getElementsByTagName('PLAYLISTS')[0]
  if (root) Array.from(root.children).filter((node) => node.tagName === 'NODE').forEach((node) => visit(node, []))
  if (!playlists.length && tracks.size) {
    playlists.push({ id: 'collection', name: 'Entire collection', trackIds: [...tracks.keys()] })
  }
  return { document, fileName, playlists, tracks }
}

function trackElement(document: Document, id: string): Element | undefined {
  return Array.from(document.getElementsByTagName('TRACK')).find((track) =>
    track.parentElement?.tagName === 'COLLECTION' && track.getAttribute('TrackID') === id,
  )
}

export function initialEditFromAutoCues(session: RekordboxSession, id: string, doubleTime: boolean): TrackEdit | null {
  const element = trackElement(session.document, id)
  if (!element) return null
  const cues: TrackEdit['cues'] = {}
  Array.from(element.children).forEach((mark) => {
    if (mark.tagName !== 'POSITION_MARK' || !(mark.getAttribute('Name') ?? '').startsWith('AUTO:')) return
    const slot = Number(mark.getAttribute('Num'))
    if (slot >= 0 && slot < 8 && SLOT_NAMES[slot] !== 'G') {
      cues[SLOT_NAMES[slot]] = numberAttribute(mark, 'Start')
    }
  })
  if (cues.B === undefined) return null
  return { cues, doubleTime, reviewed: false }
}

export function nearestBeat(position: number, beats: Beat[], downbeatOnly = true): number {
  let nearest = position
  let distance = Number.POSITIVE_INFINITY
  beats.forEach((beat) => {
    if (downbeatOnly && !beat.downbeat) return
    const nextDistance = Math.abs(beat.position - position)
    if (nextDistance < distance) {
      distance = nextDistance
      nearest = beat.position
    }
  })
  return nearest
}

export function createEdit(first: number, second: number | null, track: EditorTrack, profile: Profile): TrackEdit {
  const beats = profile.doubleTime ? track.doubleBeats : track.normalBeats
  const firstDrop = nearestBeat(first, beats)
  const cues: TrackEdit['cues'] = { B: firstDrop }
  const firstIndex = beats.findIndex((beat) => Math.abs(beat.position - firstDrop) < 0.001)
  if (firstIndex >= profile.leadBeats) cues.A = beats[firstIndex - profile.leadBeats].position
  if (firstIndex >= profile.leadBeats * 2) cues.E = beats[firstIndex - profile.leadBeats * 2].position
  if (second !== null) {
    const secondDrop = nearestBeat(second, beats)
    const secondIndex = beats.findIndex((beat) => Math.abs(beat.position - secondDrop) < 0.001)
    if (secondIndex > firstIndex) {
      cues.D = secondDrop
      if (secondIndex >= profile.leadBeats) cues.C = beats[secondIndex - profile.leadBeats].position
      if (secondIndex >= profile.leadBeats * 2) cues.F = beats[secondIndex - profile.leadBeats * 2].position
    }
  }
  if (beats.length) cues.H = beats[0].position
  return { cues, doubleTime: profile.doubleTime, reviewed: false }
}

export function moveCue(edit: TrackEdit, slot: CueName, rawPosition: number, track: EditorTrack, downbeatOnly: boolean): TrackEdit {
  if (slot === 'H') return edit
  const beats = edit.doubleTime ? track.doubleBeats : track.normalBeats
  const position = nearestBeat(rawPosition, beats, downbeatOnly)
  const cues = { ...edit.cues }
  const previous = cues[slot]
  if (slot === 'B' && cues.D !== undefined && position >= cues.D) return edit
  if (slot === 'D' && cues.B !== undefined && position <= cues.B) return edit
  cues[slot] = position
  if (previous !== undefined && (slot === 'B' || slot === 'D')) {
    const delta = position - previous
    const followers: CueName[] = slot === 'B' ? ['A', 'E'] : ['C', 'F']
    followers.forEach((name) => {
      if (cues[name] !== undefined) cues[name] = nearestBeat((cues[name] as number) + delta, beats, false)
    })
  }
  return { ...edit, cues, reviewed: false }
}

export function changeGridMode(edit: TrackEdit, doubleTime: boolean, track: EditorTrack): TrackEdit {
  const beats = doubleTime ? track.doubleBeats : track.normalBeats
  const cues = { ...edit.cues }
  ;(Object.keys(cues) as CueName[]).forEach((name) => {
    if (name !== 'H') cues[name] = nearestBeat(cues[name] as number, beats)
  })
  return { ...edit, cues, doubleTime, reviewed: false }
}

export function toggleSecondDrop(edit: TrackEdit, track: EditorTrack, candidates: number[], leadBeats?: number): TrackEdit {
  const cues = { ...edit.cues }
  if (cues.D !== undefined) {
    delete cues.D
    delete cues.C
    delete cues.F
  } else if (cues.B !== undefined) {
    const beats = edit.doubleTime ? track.doubleBeats : track.normalBeats
    const position = candidates.find((candidate) => candidate > (cues.B as number) + 8)
      ?? beats.find((beat) => beat.downbeat && beat.position > (cues.B as number) + 45)?.position
    if (position !== undefined) {
      const firstIndex = beats.findIndex((beat) => Math.abs(beat.position - (cues.B as number)) < 0.001)
      const prepIndex = cues.A === undefined ? -1 : beats.findIndex((beat) => Math.abs(beat.position - (cues.A as number)) < 0.001)
      const spacing = leadBeats ?? (firstIndex >= 0 && prepIndex >= 0 ? firstIndex - prepIndex : 64)
      const secondIndex = beats.findIndex((beat) => Math.abs(beat.position - position) < 0.001)
      cues.D = position
      if (secondIndex >= spacing) cues.C = beats[secondIndex - spacing].position
      if (secondIndex >= spacing * 2) cues.F = beats[secondIndex - spacing * 2].position
    }
  }
  return { ...edit, cues, reviewed: false }
}

function hexToRgb(hex: string): [number, number, number] {
  const value = hex.replace('#', '')
  return [0, 2, 4].map((offset) => parseInt(value.slice(offset, offset + 2), 16)) as [number, number, number]
}

export function exportRekordboxXml(
  session: RekordboxSession,
  playlist: Playlist,
  edits: Record<string, TrackEdit>,
  colors: Record<CueName, string>,
): ExportResult {
  const clone = session.document.cloneNode(true) as Document
  const selected = new Set(playlist.trackIds)
  let added = 0
  let skipped = 0
  Object.entries(edits).forEach(([id, edit]) => {
    if (!selected.has(id)) return
    const track = trackElement(clone, id)
    if (!track) return
    Array.from(track.children).forEach((mark) => {
      const slot = Number(mark.getAttribute('Num'))
      if (mark.tagName === 'POSITION_MARK' && mark.getAttribute('Type') === '0' && slot >= 0 && slot < 8 && (mark.getAttribute('Name') ?? '').startsWith('AUTO:')) track.removeChild(mark)
    })
    const occupied = new Set<number>()
    const positions: number[] = []
    Array.from(track.children).forEach((mark) => {
      if (mark.tagName !== 'POSITION_MARK' || mark.getAttribute('Type') !== '0') return
      const slot = Number(mark.getAttribute('Num'))
      if (slot >= 0 && slot < 8) occupied.add(slot)
      positions.push(numberAttribute(mark, 'Start', -1))
    })
    SLOT_NAMES.forEach((name, slot) => {
      if (name === 'G') return
      const position = edit.cues[name]
      if (position === undefined) return
      if (occupied.has(slot) || positions.some((existing) => Math.abs(existing - position) < 0.01)) {
        skipped += 1
        return
      }
      const [red, green, blue] = hexToRgb(colors[name])
      const mark = clone.createElement('POSITION_MARK')
      const label = name === 'B' ? 'Drop 1' : name === 'D' ? 'Drop 2'
        : name === 'H' ? 'Track start' : name === 'A' || name === 'E' ? 'Drop 1 preparation'
          : name === 'C' || name === 'F' ? 'Drop 2 preparation' : 'Cue'
      mark.setAttribute('Name', `AUTO: ${label}`)
      mark.setAttribute('Type', '0')
      mark.setAttribute('Start', Math.max(0, position).toFixed(3))
      mark.setAttribute('Num', String(slot))
      mark.setAttribute('Red', String(red))
      mark.setAttribute('Green', String(green))
      mark.setAttribute('Blue', String(blue))
      track.appendChild(mark)
      occupied.add(slot)
      positions.push(position)
      added += 1
    })
  })
  return { xml: `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(clone)}`, added, skipped }
}

export function downloadXml(result: ExportResult, sourceName: string): void {
  const blob = new Blob([result.xml], { type: 'application/xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = window.document.createElement('a')
  anchor.href = url
  anchor.download = sourceName.replace(/\.xml$/i, '') + '-LYZER.xml'
  anchor.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function formatTime(seconds: number): string {
  const safe = Math.max(0, seconds)
  const minutes = Math.floor(safe / 60)
  return `${String(minutes).padStart(2, '0')}:${(safe - minutes * 60).toFixed(2).padStart(5, '0')}`
}
