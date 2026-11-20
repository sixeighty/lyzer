export type GenreId = 'dnb' | 'house' | 'techno' | 'hiphop' | 'open'
export type CueName = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'H'

export interface Profile {
  genre: GenreId
  leadBeats: number
  doubleTime: boolean
  colors: Record<CueName, string>
}

export interface Beat {
  position: number
  downbeat: boolean
}

export interface Playlist {
  id: string
  name: string
  trackIds: string[]
}

export interface EditorTrack {
  id: string
  title: string
  artist: string
  duration: number
  fileName: string
  location: string
  normalBeats: Beat[]
  doubleBeats: Beat[]
  hasManualCues: boolean
}

export interface RekordboxSession {
  document: Document
  fileName: string
  playlists: Playlist[]
  tracks: Map<string, EditorTrack>
}

export interface TrackEdit {
  cues: Partial<Record<CueName, number>>
  doubleTime: boolean
  reviewed: boolean
}

export interface DropCandidate {
  position: number
  score: number
}

export interface PhaseRegion {
  start: number
  end: number
}

export interface WaveformBin {
  peak: number
  bass: number
  mid: number
  high: number
}

export interface AnalysisResult {
  duration: number
  waveform: WaveformBin[]
  candidates: DropCandidate[]
  phases: PhaseRegion[]
}

export interface ExportResult {
  xml: string
  added: number
  skipped: number
}
