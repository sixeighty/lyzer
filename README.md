# LYZER

LYZER analyzes music locally and creates editable Hot Cues for rekordbox playlists.

It detects musical phases and likely drop positions, places preparation cues on the rekordbox beat grid, and lets you refine every cue in an interactive waveform editor before exporting a new rekordbox XML.

## Features

- rekordbox XML playlist import
- Local audio decoding and phrase-based drop detection
- RGB waveform with playback, zoom and beat-grid snapping
- Normal and double-time grids
- Draggable Hot Cues with configurable colors
- Presets for Drum & Bass, House, Techno, Hip-Hop and Open Format
- Batch analysis for complete playlists
- Export to a new XML while preserving manual Hot Cues, Memory Cues and loops
- Cross-platform desktop builds and browser use
- No account, telemetry or server-side audio processing

## Privacy

XML files and audio are processed on your device. They are not uploaded by LYZER.

LYZER never modifies the selected XML directly. It creates a new XML containing only newly generated `AUTO:` Hot Cues. Existing manual Hot Cues, Memory Cues and loops remain untouched; occupied Hot Cue slots are skipped.

## Quick start

### From rekordbox to LYZER

1. In rekordbox, choose **File → Export Collection in xml format**.
2. Select one playlist or your full collection.
3. Open LYZER and choose the exported XML.
4. Add the matching audio files or select their parent folder. LYZER matches tracks by filename.
5. Analyze one track or the whole playlist.
6. Check and adjust the cues.
7. Export the LYZER XML.

### Back to rekordbox

1. In rekordbox, choose **File → Import → Import Rekordbox XML**.
2. Select the LYZER XML.
3. rekordbox updates the matching collection entries with the new Hot Cues.

## Development

Requirements: Node.js 24 or newer and npm.

```bash
npm ci
npm run dev
```

Build the web app:

```bash
npm run build
```

Run the desktop app locally:

```bash
npm run start
```

Create local desktop packages:

```bash
npm run desktop:mac
npm run desktop:win
npm run desktop:linux
```

## GitHub builds

The GitHub Actions workflow builds unsigned desktop installers for:

- macOS: Intel and Apple Silicon
- Windows: Intel and ARM64
- Linux: AppImage and Debian packages for Intel and ARM64

Finished installers are available as workflow artifacts.

## Project structure

```text
app/
  electron/       Desktop entry point
  src/            React application
  public/         Static assets
```

## License

MIT. See [LICENSE](LICENSE).
