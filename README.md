# Sonora

A Spotify-like desktop client for [Navidrome](https://www.navidrome.org/) (and other Subsonic/OpenSubsonic servers), built with Electron, React and TypeScript. Includes synced lyrics, Fluent 2 style track-change toasts, a floating mini-player and a taskbar-area widget with a live audio visualiser.

## Requirements

- Windows 10/11 or Linux (X11 or Wayland). The floating widgets are tuned for the Windows 11 taskbar; on Linux they sit at the edge of the work area, and the tray needs an AppIndicator/StatusNotifier host (GNOME needs an extension such as AppIndicator Support)
- [Bun](https://bun.sh) 1.1+ as package manager / script runner (Electron itself still runs on its bundled Node)
- A Navidrome server (or run the bundled mock server, see below)

## Scripts

| Command | What it does |
|---|---|
| `bun install` | Install dependencies (Electron is downloaded by its postinstall; it is in `trustedDependencies`) |
| `bun run dev` | Start Electron with Vite HMR for all renderer windows |
| `bun run build` | Production build into `out/` |
| `bun run start` | Run the production build |
| `bun run typecheck` | Type-check main/preload/shared/scripts and the renderer |
| `bun test` | Unit tests (lyrics parser) |
| `bun run mock` | Start a mock OpenSubsonic server on `http://localhost:4599` (any username/password) |
| `bun run api:test -- --server URL --user U --pass P` | Phase 1 check: exercise the API client with no UI |
| `bun run smoke` | End-to-end IPC/playback check over the DevTools protocol (see below) |
| `bun run icons` | Regenerate `resources/icon.png` and tray icons |
| `bun run dist` | Build an installer for the current platform in `release/` (NSIS on Windows, AppImage + deb on Linux) |
| `bun run dist:dir` | Build an unpacked app folder in `release/win-unpacked/` or `release/linux-unpacked/` |

> If you launch Electron from inside another Electron app's terminal (VS Code, T3 Code, ...), make sure `ELECTRON_RUN_AS_NODE` is not set in the environment, otherwise Electron starts as plain Node.

## Architecture

**Only one place ever touches the `<audio>` element.** A hidden "audio host" window (`src/renderer/host`) owns playback, the queue, volume and a Web Audio `AnalyserNode`. Every visible window is a pure display layer:

```
                       commands (play/pause/seek/setQueue/...)
  main UI ─────┐                                            ┌──▶ audio host (hidden)
  mini-player ─┼──▶ preload bridge ──▶ ipcMain relay ───────┤      <audio> + AnalyserNode
  taskbar widget┘        ▲                 │                └──◀ emits events
  toast                  └─────────────────┘
                 events (trackChanged, positionUpdate, playStateChanged,
                         queueChanged, volumeChanged, modeChanged, audioFrame)
```

- `src/shared/types.ts`: the full event/command contract (`PlayerEvents`, `PlayerCommands`, `PlayerState`).
- `src/main/ipc.ts`: relays host events to every window, caches the latest state so new windows hydrate instantly, forwards commands to the host, and streams `audioFrame` only to windows that asked for it.
- `src/preload/index.ts`: `window.sonora` (`player.on/command/getState/wantFrames`, `auth`, `settings`, `window`, `toast`).
- `src/renderer/shared/playerStore.ts`: `usePlayerState()` (Zustand) and `player.*` command helpers used by every window.

### Windows

| Window | Purpose |
|---|---|
| `main` | Library UI: sidebar, home, albums, artists, playlists, favorites, search, queue panel, lyrics, settings |
| `host` | Hidden audio host (`show: false`, background throttling off) |
| `toast` | Frameless, transparent, click-through, always-on-top card that animates in on `trackChanged` (single reused window) |
| `mini` | Draggable always-on-top mini-player, position remembered in settings |
| `widget` | "Taskbar" widget: acrylic flyout pinned to the bottom-right of the work area, right above the taskbar, with a canvas visualiser fed by `audioFrame` at ~30fps |

On Linux the tray icon has no left-click handler (most desktops only open the context menu), so use the menu's **Show Sonora** entry.

Windows does not allow third-party apps to inject controls into the taskbar itself; the widget is a small always-on-top window positioned next to the system tray, which is the same approach FluentFlyout uses.

### Credentials

The password is used once to derive the Subsonic `token = md5(password + salt)`. Only `{server, username, token, salt}` is stored, encrypted with Electron's `safeStorage` (DPAPI on Windows, libsecret on Linux; without a keyring the derived token is stored unencrypted and a warning is logged). The plain password is never persisted. `keytar` was not used because it is archived and has no prebuilt binaries for current Electron versions.

### CORS and the visualiser

`AnalyserNode` needs the stream response to be CORS-readable. Navidrome already sends `Access-Control-Allow-Origin: *` on `/rest`; for servers that do not, `src/main/index.ts` rewrites the header on responses from the configured server only.

### Lyrics

`getLyricsBySongId` (OpenSubsonic structured lyrics, synced preferred) with a fallback to the legacy `getLyrics` text endpoint, parsed as LRC/SRT/plain. The lyrics view extrapolates the playback position between 250ms `positionUpdate` events on every animation frame, so the highlighted line tracks the audio closely.

## Development without a server

```
bun run mock            # terminal 1: mock server on :4599 with synthetic audio, art and synced lyrics
bun run dev             # terminal 2
```

Sign in with `http://localhost:4599`, any username and password.

## Smoke test

```
bun run mock
bun run build && ./node_modules/.bin/electron . --remote-debugging-port=9222
bun run smoke           # signs in to the mock, plays, checks state from another window, then signs out
```

## Keyboard

- `Space` play/pause, `Ctrl+←/→` previous/next, `Ctrl+↑/↓` volume (main window)
- Media keys (global, can be disabled in Settings)
