import { useCallback, useEffect, useState } from 'react'
import { X } from 'lucide-react'
import type { NormalizeMode, Session, Settings, SettingsPatch, WidgetAnchor, WidgetOptions } from '@shared/types'
import { WIDGET_ANCHORS } from '@shared/types'
import type { ServerProbe } from '@shared/subsonic/client'
import { useSessionStore, useSettings } from '@renderer/shared/sessionStore'
import { GhostButton, PageTitle, SectionHeader, Spinner } from '../components/ui'

const field =
  'w-full rounded-md border border-white/10 bg-white/[0.06] px-3 py-2 text-sm text-ink outline-none transition focus:border-accent focus:bg-white/[0.08]'

/**
 * Alternate URLs for the same library (LAN, VPN, public). Sonora pings them all and uses
 * whichever answers first, switching automatically when the one in use stops responding.
 */
function Connections({ session }: { session: Session }) {
  const servers = session.servers ?? [session.server]
  const [probes, setProbes] = useState<ServerProbe[]>()
  const [busy, setBusy] = useState(false)
  const [url, setUrl] = useState('')

  const test = useCallback(async (): Promise<void> => {
    setBusy(true)
    try {
      setProbes(await window.sonora.auth.probe())
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(() => {
    void test()
  }, [test, session.servers?.join(',')])

  const save = async (next: string[]): Promise<void> => {
    await window.sonora.auth.setServers(next)
    void test()
  }

  return (
    <section className="mb-8">
      <SectionHeader
        title="Connections"
        action={
          <div className="flex items-center gap-2">
            {busy && <Spinner className="h-4 w-4" />}
            <GhostButton onClick={() => void window.sonora.auth.reselect().then(test)} disabled={busy}>
              Use fastest
            </GhostButton>
          </div>
        }
      />
      <p className="mb-3 px-3 text-xs text-ink-3">
        Several addresses for the same server. The fastest one that answers is used, and Sonora switches over on its
        own when it stops responding.
      </p>
      <ul className="mb-3">
        {servers.map((s) => {
          const probe = probes?.find((p) => p.server === s)
          const active = s === session.server
          return (
            <li key={s} className="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-white/[0.04]">
              <span
                className={`h-2 w-2 shrink-0 rounded-full ${
                  probe === undefined ? 'bg-white/25' : probe.ok ? 'bg-emerald-400' : 'bg-red-400'
                }`}
                title={probe?.error ?? (probe?.ok ? 'Reachable' : undefined)}
              />
              <span className={`min-w-0 flex-1 truncate text-sm ${active ? 'font-semibold' : 'text-ink-2'}`}>{s}</span>
              {probe?.ok && <span className="shrink-0 text-xs text-ink-3">{probe.ms} ms</span>}
              {active ? (
                <span className="shrink-0 text-xs font-semibold text-accent">In use</span>
              ) : (
                <button
                  className="shrink-0 text-xs text-ink-2 hover:text-ink"
                  onClick={() => void window.sonora.auth.selectServer(s)}
                >
                  Use
                </button>
              )}
              <button
                className="shrink-0 rounded p-1 text-ink-3 hover:bg-white/10 hover:text-ink disabled:opacity-30"
                title="Remove"
                disabled={servers.length < 2}
                onClick={() => void save(servers.filter((x) => x !== s))}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </li>
          )
        })}
      </ul>
      <form
        className="flex items-center gap-2 px-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (!url.trim()) return
          void save([...servers, url])
          setUrl('')
        }}
      >
        <input
          className={field}
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://music.example.com"
        />
        <GhostButton disabled={!url.trim()}>Add</GhostButton>
      </form>
    </section>
  )
}

function Toggle({
  label,
  description,
  checked,
  onChange
}: {
  label: string
  description?: string
  checked: boolean
  onChange: (v: boolean) => void
}) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-6 rounded-md px-3 py-3 hover:bg-white/[0.04]">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description && <div className="text-xs text-ink-2">{description}</div>}
      </div>
      <button
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative h-5 w-10 shrink-0 rounded-full border transition ${
          checked ? 'border-accent bg-accent' : 'border-white/30 bg-transparent'
        }`}
      >
        <span
          className={`absolute top-1/2 h-3 w-3 -translate-y-1/2 rounded-full transition-all ${
            checked ? 'left-[22px] bg-black' : 'left-[3px] bg-ink-2'
          }`}
        />
      </button>
    </label>
  )
}

/**
 * The work area as a 3x2 grid of slots, each drawn as the little bar the widget will become.
 * Reads faster than a dropdown, since the choice is about a place on screen.
 */
function AnchorPicker({ value, onChange }: { value: WidgetAnchor; onChange: (v: WidgetAnchor) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-md px-3 py-3">
      <div>
        <div className="text-sm font-medium">Position</div>
        <div className="text-xs text-ink-2">
          {WIDGET_ANCHORS.find((a) => a.value === value)?.label} of the screen, clear of the taskbar.
        </div>
      </div>
      <div className="grid h-[76px] w-[132px] shrink-0 grid-cols-3 grid-rows-2 gap-1 rounded-md border border-white/10 bg-black/40 p-1">
        {WIDGET_ANCHORS.map((a) => {
          const active = a.value === value
          return (
            <button
              key={a.value}
              title={a.label}
              aria-label={a.label}
              aria-pressed={active}
              onClick={() => onChange(a.value)}
              className={`flex items-center justify-center rounded-sm transition ${
                active ? 'bg-accent/20' : 'hover:bg-white/10'
              }`}
            >
              <span className={`h-1.5 w-7 rounded-full ${active ? 'bg-accent' : 'bg-white/25'}`} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/** Everything about the taskbar widget except whether it is shown at all. */
function TaskbarWidgetSettings({ value, onChange }: { value: WidgetOptions; onChange: (p: Partial<WidgetOptions>) => void }) {
  return (
    <section className="mb-8">
      <SectionHeader title="Taskbar widget" />
      <AnchorPicker value={value.anchor} onChange={(anchor) => onChange({ anchor })} />
      <Toggle
        label="Compact view"
        description="A shorter bar with just the title, for when it should stay out of the way"
        checked={value.compact}
        onChange={(compact) => onChange({ compact })}
      />
      <Toggle
        label="Audio visualiser"
        description="Live frequency bars behind the track details"
        checked={value.visualizer}
        onChange={(visualizer) => onChange({ visualizer })}
      />
      <Toggle
        label="Album art"
        description="Cover thumbnail on the left; click it to open Sonora"
        checked={value.cover}
        onChange={(cover) => onChange({ cover })}
      />
      <Toggle
        label="Progress bar"
        description="Thin line along the bottom edge showing how far into the track you are"
        checked={value.progress}
        onChange={(progress) => onChange({ progress })}
      />
      <Toggle
        label="Elapsed time"
        description="Show the position and length next to the controls"
        checked={value.elapsed}
        onChange={(elapsed) => onChange({ elapsed })}
      />
      <label className="flex items-center justify-between gap-6 px-3 py-3">
        <div>
          <div className="text-sm font-medium">Opacity</div>
          <div className="text-xs text-ink-2">{Math.round(value.opacity * 100)}%</div>
        </div>
        <input
          type="range"
          className="range w-40"
          min={35}
          max={100}
          step={5}
          value={Math.round(value.opacity * 100)}
          onChange={(e) => onChange({ opacity: Number(e.target.value) / 100 })}
        />
      </label>
    </section>
  )
}

const NORMALIZE_MODES: { value: NormalizeMode; label: string }[] = [
  { value: 'off', label: 'Off' },
  { value: 'album', label: 'Per album' },
  { value: 'track', label: 'Per track' }
]

function NormalizeSetting({ value, onChange }: { value: NormalizeMode; onChange: (v: NormalizeMode) => void }) {
  return (
    <div className="flex items-center justify-between gap-6 rounded-md px-3 py-3">
      <div>
        <div className="text-sm font-medium">Volume normalisation</div>
        <div className="text-xs text-ink-2">
          {value === 'off'
            ? 'Tracks play at their original loudness.'
            : value === 'album'
              ? 'Levels loudness between albums while keeping each album\u2019s own quiet and loud moments.'
              : 'Levels every track to the same loudness, even within an album.'}{' '}
          Uses the ReplayGain tags from your server; untagged tracks are left alone.
        </div>
      </div>
      <div className="flex shrink-0 rounded-md border border-white/10 p-0.5">
        {NORMALIZE_MODES.map((m) => (
          <button
            key={m.value}
            aria-pressed={value === m.value}
            onClick={() => onChange(m.value)}
            className={`rounded px-2.5 py-1 text-xs transition ${
              value === m.value ? 'bg-accent font-semibold text-black' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>
    </div>
  )
}

/** Disk budget for downloaded songs, plus what is on disk right now. */
function SongCache({ maxGb, onChange }: { maxGb: number; onChange: (v: number) => void }) {
  const [used, setUsed] = useState<{ bytes: number; count: number }>()
  const refresh = useCallback((): void => {
    void window.sonora.cache.stats().then(setUsed)
  }, [])
  useEffect(refresh, [refresh])

  return (
    <section className="mb-8">
      <SectionHeader
        title="Song cache"
        action={
          <GhostButton onClick={() => void window.sonora.cache.clear().then(refresh)}>Clear cache</GhostButton>
        }
      />
      <p className="mb-3 px-3 text-xs text-ink-3">
        Songs you play are kept on disk and reused next time. Playback starts streaming straight away and moves over
        to the local copy as soon as it has downloaded. Once the limit is reached, the songs played longest ago are
        deleted first.
      </p>
      <label className="flex items-center justify-between gap-6 px-3 py-3">
        <div>
          <div className="text-sm font-medium">Disk limit</div>
          <div className="text-xs text-ink-2">
            {maxGb === 0 ? 'Off \u2014 nothing is kept on disk' : `${maxGb} GB`}
            {used && ` \u00b7 ${(used.bytes / 1024 ** 3).toFixed(2)} GB used by ${used.count} songs`}
          </div>
        </div>
        <input
          type="range"
          className="range w-40"
          min={0}
          max={50}
          step={1}
          value={maxGb}
          onChange={(e) => onChange(Number(e.target.value))}
          onMouseUp={refresh}
        />
      </label>
    </section>
  )
}

export function SettingsView() {
  const settings = useSettings()
  const session = useSessionStore((s) => s.session)
  const [info, setInfo] = useState<{ version: string; platform: string }>()
  useEffect(() => {
    void window.sonora.app.info().then(setInfo)
  }, [])

  const update = (patch: SettingsPatch): void => {
    void window.sonora.settings.update(patch)
  }
  const widget = (key: keyof Settings['widgets'], value: boolean): void =>
    update({ widgets: { ...settings.widgets, [key]: value } })

  return (
    <div className="max-w-2xl">
      <PageTitle title="Settings" subtitle={`Signed in as ${session?.username} · ${session?.server}`} />

      <section className="mb-8">
        <SectionHeader title="Widgets" />
        <Toggle
          label="Taskbar widget"
          description="Controls and an audio visualiser pinned to an edge of the screen, clear of the taskbar"
          checked={settings.widgets.taskbar}
          onChange={(v) => widget('taskbar', v)}
        />
        <Toggle
          label="Mini player"
          description="Draggable always-on-top player; its position is remembered"
          checked={settings.widgets.mini}
          onChange={(v) => widget('mini', v)}
        />
        <Toggle
          label="Track change toasts"
          description="Show a Fluent-style card in the corner whenever a new track starts"
          checked={settings.widgets.toast}
          onChange={(v) => widget('toast', v)}
        />
        <label className="flex items-center justify-between gap-6 px-3 py-3">
          <div>
            <div className="text-sm font-medium">Toast duration</div>
            <div className="text-xs text-ink-2">{(settings.toastDurationMs / 1000).toFixed(1)} seconds</div>
          </div>
          <input
            type="range"
            className="range w-40"
            min={1500}
            max={8000}
            step={250}
            value={settings.toastDurationMs}
            onChange={(e) => update({ toastDurationMs: Number(e.target.value) })}
          />
        </label>
      </section>

      {settings.widgets.taskbar && (
        <TaskbarWidgetSettings value={settings.widget} onChange={(patch) => update({ widget: patch })} />
      )}

      <section className="mb-8">
        <SectionHeader title="Playback" />
        <NormalizeSetting value={settings.normalize} onChange={(normalize) => update({ normalize })} />
      </section>

      <SongCache maxGb={settings.cacheMaxGb} onChange={(cacheMaxGb) => update({ cacheMaxGb })} />

      <section className="mb-8">
        <SectionHeader title="Behaviour" />
        <Toggle
          label="Close to tray"
          description="Closing the main window keeps Sonora playing in the system tray"
          checked={settings.closeToTray}
          onChange={(v) => update({ closeToTray: v })}
        />
        <Toggle
          label="Media keys"
          description="Control playback with the keyboard's play/pause, next and previous keys"
          checked={settings.mediaKeys}
          onChange={(v) => update({ mediaKeys: v })}
        />
        <Toggle
          label="Start on system startup"
          description="Launch Sonora minimised to the tray when you sign in"
          checked={settings.autoLaunch}
          onChange={(v) => update({ autoLaunch: v })}
        />
      </section>

      {session && <Connections session={session} />}

      <section className="mb-8">
        <SectionHeader title="Account" />
        <div className="flex items-center gap-3 px-3">
          <GhostButton onClick={() => void window.sonora.auth.logout()}>Sign out</GhostButton>
          <span className="text-xs text-ink-3">Removes the stored token from the Windows credential store.</span>
        </div>
      </section>

      <div className="px-3 text-xs text-ink-3">
        Sonora {info?.version ?? ''} · {info?.platform ?? ''}
      </div>
    </div>
  )
}
