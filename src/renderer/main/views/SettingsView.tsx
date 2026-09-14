import { useEffect, useState } from 'react'
import type { Settings } from '@shared/types'
import { useSessionStore, useSettings } from '@renderer/shared/sessionStore'
import { GhostButton, PageTitle, SectionHeader } from '../components/ui'

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

export function SettingsView() {
  const settings = useSettings()
  const session = useSessionStore((s) => s.session)
  const [info, setInfo] = useState<{ version: string; platform: string }>()
  useEffect(() => {
    void window.sonora.app.info().then(setInfo)
  }, [])

  const update = (patch: Partial<Settings>): void => {
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
          description="Compact controls and audio visualiser pinned above the taskbar, next to the system tray"
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
          label="Start with Windows"
          description="Launch Sonora minimised to the tray when you sign in"
          checked={settings.autoLaunch}
          onChange={(v) => update({ autoLaunch: v })}
        />
      </section>

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
