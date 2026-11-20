import FFT from 'fft.js'
import type { AnalysisResult, Beat, DropCandidate, PhaseRegion, WaveformBin } from '../types'

interface Envelopes {
  times: number[]
  bands: Float64Array[]
}

const pause = () => new Promise<void>((resolve) => window.setTimeout(resolve, 0))

function median(values: number[]): number {
  if (!values.length) return Number.NaN
  values.sort((a, b) => a - b)
  const middle = Math.floor(values.length / 2)
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2
}

function percentile(values: number[], percent: number): number {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * percent))]
}

function windowMedian(envelopes: Envelopes, band: number, start: number, end: number): number {
  const values: number[] = []
  for (let index = 0; index < envelopes.times.length; index += 1) {
    if (envelopes.times[index] >= start && envelopes.times[index] < end) values.push(envelopes.bands[band][index])
  }
  return median(values)
}

async function bandEnvelopes(samples: Float32Array, sampleRate: number, onProgress: (value: number) => void): Promise<Envelopes> {
  const fftSize = 2048
  const hop = 512
  const frameCount = Math.max(1, 1 + Math.floor((samples.length - fftSize) / hop))
  const times = Array.from({ length: frameCount }, (_, index) => (index * hop + fftSize / 2) / sampleRate)
  const bands = Array.from({ length: 4 }, () => new Float64Array(frameCount))
  const fft = new FFT(fftSize)
  const window = new Float32Array(fftSize)
  const frame = new Float32Array(fftSize)
  const spectrum: number[] = Array(fftSize).fill(0)
  for (let index = 0; index < fftSize; index += 1) window[index] = 0.5 * (1 - Math.cos(2 * Math.PI * index / (fftSize - 1)))
  const nyquist = sampleRate / 2
  const ranges = [[0, nyquist], [20, 160], [160, 2000], [2000, Math.min(10000, nyquist)]]
  const masks = ranges.map(([low, high]) => Array.from({ length: fftSize / 2 + 1 }, (_, bin) => {
    const frequency = bin * sampleRate / fftSize
    return frequency >= low && frequency < high
  }))

  for (let frameIndex = 0; frameIndex < frameCount; frameIndex += 1) {
    const start = frameIndex * hop
    for (let index = 0; index < fftSize; index += 1) frame[index] = (samples[start + index] ?? 0) * window[index]
    fft.realTransform(spectrum, frame as unknown as number[])
    for (let band = 0; band < 4; band += 1) {
      let power = 0
      let count = 0
      for (let bin = 0; bin <= fftSize / 2; bin += 1) {
        if (!masks[band][bin]) continue
        const real = spectrum[bin * 2]
        const imaginary = spectrum[bin * 2 + 1]
        power += real * real + imaginary * imaginary
        count += 1
      }
      bands[band][frameIndex] = 10 * Math.log10(power / Math.max(1, count) + 1e-12)
    }
    if (frameIndex % 384 === 0) {
      onProgress(25 + Math.round(frameIndex / frameCount * 45))
      await pause()
    }
  }

  const width = Math.max(1, Math.round(0.12 * sampleRate / hop))
  bands.forEach((band) => {
    const original = new Float64Array(band)
    for (let index = 0; index < band.length; index += 1) {
      let sum = 0
      let count = 0
      for (let offset = -Math.floor(width / 2); offset <= Math.floor(width / 2); offset += 1) {
        const target = index + offset
        if (target >= 0 && target < band.length) {
          sum += original[target]
          count += 1
        }
      }
      band[index] = sum / count
    }
  })
  return { times, bands }
}

function scoreCandidates(envelopes: Envelopes, candidates: number[], preWindow: number, postWindow: number): DropCandidate[] {
  const duration = envelopes.times[envelopes.times.length - 1]
  const globalLevel = median(Array.from(envelopes.bands[0]))
  const scored: DropCandidate[] = []
  candidates.forEach((position) => {
    if (position - preWindow < 0 || position + postWindow > duration) return
    const pre = [0, 1, 2, 3].map((band) => windowMedian(envelopes, band, position - preWindow, position - 0.08))
    const post = [0, 1, 2, 3].map((band) => windowMedian(envelopes, band, position + 0.04, position + postWindow))
    if ([...pre, ...post].some((value) => !Number.isFinite(value))) return
    const rises = post.map((value, index) => value - pre[index])
    const postLevel = post[0] - globalLevel
    const score = 0.42 * rises[1] + 0.30 * rises[0] + 0.16 * rises[2] + 0.12 * rises[3] + 0.08 * postLevel
    scored.push({ position, score })
  })
  return scored
}

function scoreOnsets(envelopes: Envelopes, candidates: number[], window: number): Map<number, number> {
  const result = new Map<number, number>()
  const duration = envelopes.times[envelopes.times.length - 1]
  candidates.forEach((position) => {
    if (position - window < 0 || position + window > duration) return
    const pre = [0, 1, 2, 3].map((band) => windowMedian(envelopes, band, position - window, position - 0.04))
    const post = [0, 1, 2, 3].map((band) => windowMedian(envelopes, band, position + 0.04, position + window))
    if ([...pre, ...post].some((value) => !Number.isFinite(value))) return
    const rises = post.map((value, index) => value - pre[index])
    result.set(position, 0.45 * rises[1] + 0.30 * rises[0] + 0.15 * rises[2] + 0.10 * rises[3])
  })
  return result
}

function earliestDropInPhrases(scored: DropCandidate[], separation: number, onsets?: Map<number, number>): DropCandidate[] {
  const ranked = [...scored].sort((a, b) => b.score - a.score)
  if (separation <= 0) return ranked
  const phrases: DropCandidate[] = []
  const used = new Set<number>()
  ranked.forEach((peak) => {
    const threshold = Math.max(0.5, peak.score * 0.65)
    let early = scored.filter((candidate) => Math.abs(candidate.position - peak.position) <= separation && candidate.score >= threshold)
    if (onsets) {
      const available = early.filter((candidate) => onsets.has(candidate.position))
      if (available.length) {
        const strongest = Math.max(...available.map((candidate) => onsets.get(candidate.position) ?? -Infinity))
        early = available.filter((candidate) => (onsets.get(candidate.position) ?? -Infinity) >= Math.max(0.25, strongest * 0.45))
      }
    }
    if (!early.length) return
    const position = Math.min(...early.map((candidate) => candidate.position))
    if (used.has(position)) return
    used.add(position)
    phrases.push({ position, score: peak.score })
  })
  return phrases
}

function chooseDropPair(scored: DropCandidate[], minGap: number, separation = 0, onsets?: Map<number, number>): { first: DropCandidate; second: DropCandidate | null } {
  if (!scored.length) throw new Error('No usable transitions were found. Check the beat grid and track length.')
  const separated = earliestDropInPhrases(scored, separation, onsets).slice(0, 48)
  let best: { first: DropCandidate; second: DropCandidate } | null = null
  let bestScore = -Infinity
  separated.forEach((first) => separated.forEach((second) => {
    if (second.position - first.position < minGap) return
    if (first.score + second.score > bestScore) {
      best = { first, second }
      bestScore = first.score + second.score
    }
  }))
  if (!best) return { first: separated[0], second: null }
  const pair = best as { first: DropCandidate; second: DropCandidate }
  if (pair.second.score < Math.max(0.65, pair.first.score * 0.22)) return { first: pair.first, second: null }
  return pair
}

function detectPhaseRegions(envelopes: Envelopes, candidates: number[], beatLength: number): PhaseRegion[] {
  const duration = envelopes.times[envelopes.times.length - 1]
  const highFlux = new Float64Array(envelopes.times.length)
  for (let index = 1; index < highFlux.length; index += 1) highFlux[index] = Math.max(0, envelopes.bands[3][index] - envelopes.bands[3][index - 1])
  const positions: number[] = []
  const activities: number[] = []
  const bassLevels: number[] = []
  const segmentLength = 8 * beatLength
  candidates.forEach((position) => {
    if (position + segmentLength > duration) return
    const selected: number[] = []
    const bass: number[] = []
    for (let index = 0; index < envelopes.times.length; index += 1) {
      if (envelopes.times[index] >= position && envelopes.times[index] < position + segmentLength) {
        selected.push(highFlux[index])
        bass.push(envelopes.bands[1][index])
      }
    }
    if (selected.length < 3) return
    positions.push(position)
    activities.push(selected.reduce((sum, value) => sum + value, 0) / selected.length)
    bassLevels.push(median(bass))
  })
  if (!positions.length) return []
  const activityThreshold = Math.max(0.08, percentile(activities, 0.70) * 0.45)
  const bassThreshold = percentile(bassLevels, 0.55)
  const active = positions.map((_, index) => activities[index] >= activityThreshold && bassLevels[index] >= bassThreshold)
  const phases: PhaseRegion[] = []
  let start: number | null = null
  let last: number | null = null
  const finish = () => {
    if (start === null || last === null) return
    const region = { start: positions[start], end: positions[last] + segmentLength }
    if (region.end - region.start >= 32 * beatLength) phases.push(region)
  }
  positions.forEach((position, index) => {
    if (!active[index]) return
    if (start === null) start = index
    else if (last !== null && position - positions[last] > 48 * beatLength) {
      finish()
      start = index
    }
    last = index
  })
  finish()
  return phases
}

function waveform(samples: Float32Array, envelopes: Envelopes, duration: number): WaveformBin[] {
  const count = Math.min(1800, Math.max(300, Math.round(duration * 5)))
  const bassScale = Math.max(1, Math.abs(percentile(Array.from(envelopes.bands[1]), 0.9)))
  return Array.from({ length: count }, (_, bin) => {
    const start = Math.floor(bin / count * samples.length)
    const end = Math.max(start + 1, Math.floor((bin + 1) / count * samples.length))
    let peak = 0
    for (let index = start; index < end; index += 1) peak = Math.max(peak, Math.abs(samples[index]))
    const time = (bin + 0.5) / count * duration
    let envelopeIndex = 0
    while (envelopeIndex < envelopes.times.length - 1 && envelopes.times[envelopeIndex] < time) envelopeIndex += 1
    const levels = [1, 2, 3].map((band) => Math.max(0, Math.min(1, (envelopes.bands[band][envelopeIndex] + 70) / 70)))
    const bass = levels[0]
    return { peak, bass, mid: levels[1], high: levels[2], ...(bassScale < -100 ? { bass: 0 } : {}) }
  })
}

export async function analyzeAudio(file: File, grid: Beat[], onProgress: (value: number) => void): Promise<{ result: AnalysisResult; drops: [number, number | null] }> {
  onProgress(5)
  const context = new AudioContext()
  let decoded: AudioBuffer
  try {
    decoded = await context.decodeAudioData(await file.arrayBuffer())
  } finally {
    await context.close()
  }
  onProgress(15)
  const targetRate = 22050
  let samples: Float32Array
  let sampleRate = targetRate
  try {
    const offline = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * targetRate)), targetRate)
    const source = offline.createBufferSource()
    source.buffer = decoded
    source.connect(offline.destination)
    source.start()
    samples = (await offline.startRendering()).getChannelData(0)
  } catch {
    sampleRate = decoded.sampleRate
    samples = new Float32Array(decoded.length)
    for (let channel = 0; channel < decoded.numberOfChannels; channel += 1) {
      const data = decoded.getChannelData(channel)
      for (let index = 0; index < data.length; index += 1) samples[index] += data[index] / decoded.numberOfChannels
    }
  }
  const duration = samples.length / sampleRate
  const candidates = grid.filter((beat) => beat.downbeat && beat.position <= duration * 0.88).map((beat) => beat.position)
  if (candidates.length < 2) throw new Error('Not enough beat grid data for the analysis.')
  const intervals = grid.slice(1).map((beat, index) => beat.position - grid[index].position).filter((value) => value > 0)
  const beatLength = median(intervals)
  const envelopes = await bandEnvelopes(samples, sampleRate, onProgress)
  onProgress(76)
  const preWindow = Math.max(4, 16 * beatLength)
  const scored = scoreCandidates(envelopes, candidates, preWindow, Math.max(4, 16 * beatLength))
  const phases = detectPhaseRegions(envelopes, candidates, beatLength)
  let pair: { first: DropCandidate; second: DropCandidate | null }
  const phaseScored: DropCandidate[] = []
  phases.forEach((phase) => {
    const nearby = scored.filter((candidate) => candidate.position >= phase.start - 0.01 && candidate.position <= phase.start + 64 * beatLength)
    if (!nearby.length) return
    const best = Math.max(...nearby.map((candidate) => candidate.score))
    const early = nearby.filter((candidate) => candidate.score >= best - 0.20 * Math.abs(best))
    phaseScored.push(early.reduce((first, candidate) => candidate.position < first.position ? candidate : first))
  })
  if (phaseScored.length) pair = chooseDropPair(phaseScored, 64 * beatLength)
  else {
    const onsets = scoreOnsets(envelopes, candidates, Math.max(0.12, Math.min(0.75, preWindow / 8)))
    pair = chooseDropPair(scored, 64 * beatLength, 32 * beatLength, onsets)
  }
  onProgress(92)
  const result: AnalysisResult = {
    duration,
    waveform: waveform(samples, envelopes, duration),
    candidates: [...scored].sort((a, b) => b.score - a.score).slice(0, 32),
    phases,
  }
  onProgress(100)
  return { result, drops: [pair.first.position, pair.second?.position ?? null] }
}
