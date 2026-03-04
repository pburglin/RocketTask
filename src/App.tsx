import { useEffect, useMemo, useRef, useState } from 'react'
import type { ChangeEvent, FormEvent, KeyboardEvent, ReactNode } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { BarChart3, CheckCircle2, ClipboardList, Filter, Info, Pause, Pencil, Play, PlusCircle, Settings, Sparkles } from 'lucide-react'
import { db, type Task, type TaskStatus } from './lib/db'
import {
  cryptoConstants,
  decodeSalt,
  decryptText,
  deriveAesKey,
  encodeSalt,
  encryptText,
  hashPassword,
  randomBytes,
} from './lib/crypto'
import { generateWeeklyReport } from './lib/reporting'
import { parseJiraText } from './lib/jira'
import { rewriteTaskText } from './lib/ai'
import {
  defaultTaskQuery,
  filterAndSortTasks,
  normalizeLabel,
  parseLabelsInput,
  parseStakeholdersInput,
  type TaskQuery,
} from './lib/taskQuery'

type AuthState = 'loading' | 'setup' | 'locked' | 'ready'

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>
}

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done']
const ENCRYPTION_AVAILABLE =
  typeof window !== 'undefined' && typeof window.crypto !== 'undefined' && !!window.crypto.subtle && window.isSecureContext

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [key, setKey] = useState<CryptoKey | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [labelsInput, setLabelsInput] = useState('')
  const [stakeholdersInput, setStakeholdersInput] = useState('')
  const [deadline, setDeadline] = useState('')
  const [nextCheckpoint, setNextCheckpoint] = useState('')
  const [nextAction, setNextAction] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)

  const [taskQuery, setTaskQuery] = useState<TaskQuery>(defaultTaskQuery)
  const [queryHydrated, setQueryHydrated] = useState(false)
  const [descriptionByTask, setDescriptionByTask] = useState<Record<number, string>>({})
  const [weeklyReportText, setWeeklyReportText] = useState('')
  const [reportPeriod, setReportPeriod] = useState<'week' | 'month' | 'quarter' | 'year'>('week')

  const [aiApiKey, setAiApiKey] = useState('')
  const [aiModel, setAiModel] = useState('nvidia /nemotron-3-nano-30b-a3b:free')
  const [aiBusy, setAiBusy] = useState(false)
  const [aiError, setAiError] = useState('')

  const [jiraImportInput, setJiraImportInput] = useState('')
  const [jiraImportMessage, setJiraImportMessage] = useState('')
  const [settingsMessage, setSettingsMessage] = useState('')
  const importFileRef = useRef<HTMLInputElement | null>(null)
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<InstallPromptEvent | null>(null)
  const [isInstalled, setIsInstalled] = useState(false)
  const [installMessage, setInstallMessage] = useState('')

  const [alertEnabled, setAlertEnabled] = useState(true)
  const [activePanel, setActivePanel] = useState<'create' | 'filter' | 'settings' | 'reports' | 'about' | null>(null)
  const [trackedMinutesInput, setTrackedMinutesInput] = useState('0')
  const [tickNowMs, setTickNowMs] = useState(Date.now())

  const tasks = useLiveQuery(() => db.tasks.toArray(), [], [])
  const timeLogs = useLiveQuery(() => db.timeLogs.toArray(), [], [])

  const activeLog = useLiveQuery(async () => db.timeLogs.filter((log) => !log.endedAt).first(), [], null)
  const activeTaskId = activeLog?.taskId ?? null

  const availableLabels = useMemo(
    () => Array.from(new Set(tasks.flatMap((task) => task.tags.map(normalizeLabel)))).sort(),
    [tasks],
  )

  useEffect(() => {
    void (async () => {
      await db.ensureTaskDefaults()

      if (!ENCRYPTION_AVAILABLE) {
        setAuthState('ready')
      }

      const saltSetting = await db.settings.get('auth.salt')
      const hashSetting = await db.settings.get('auth.hash')
      const savedKey = await db.settings.get('ai.apiKey')
      const savedModel = await db.settings.get('ai.model')
      const alerts = await db.settings.get('alerts.enabled')
      const savedQuery = await db.settings.get('task.query')

      setAiApiKey(savedKey?.value ?? '')
      setAiModel(savedModel?.value ?? 'nvidia /nemotron-3-nano-30b-a3b:free')
      setAlertEnabled(alerts?.value !== 'false')

      if (savedQuery?.value) {
        try {
          const parsed = JSON.parse(savedQuery.value) as TaskQuery
          setTaskQuery({ ...defaultTaskQuery, ...parsed })
        } catch {
          // ignore invalid persisted query
        }
      }

      if (ENCRYPTION_AVAILABLE) {
        setAuthState(saltSetting && hashSetting ? 'locked' : 'setup')
      }

      setQueryHydrated(true)
    })()
  }, [])

  useEffect(() => {
    if (tasks.length === 0) return
    let cancelled = false

    void (async () => {
      const entries = await Promise.all(
        tasks.map(async (task) => {
          if (!task.id || !task.descriptionCiphertext) return [task.id ?? 0, ''] as const

          if (task.descriptionCiphertext.startsWith('plain:')) {
            return [task.id, decodeURIComponent(task.descriptionCiphertext.slice(6))] as const
          }

          if (!key) {
            return [task.id, '[Encrypted note: open in secure context to decrypt]'] as const
          }

          try {
            return [task.id, await decryptText(task.descriptionCiphertext, key)] as const
          } catch {
            return [task.id, '[Unable to decrypt]'] as const
          }
        }),
      )

      if (!cancelled) setDescriptionByTask(Object.fromEntries(entries))
    })()

    return () => {
      cancelled = true
    }
  }, [key, tasks])

  useEffect(() => {
    const overdueCount = tasks.filter((task) => task.status !== 'done' && task.deadline && new Date(task.deadline) < new Date()).length
    if (!alertEnabled || overdueCount === 0) return

    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate?.([150, 80, 150])
    }

    try {
      const context = new AudioContext()
      const oscillator = context.createOscillator()
      oscillator.type = 'sine'
      oscillator.frequency.value = 880
      oscillator.connect(context.destination)
      oscillator.start()
      oscillator.stop(context.currentTime + 0.1)
    } catch {
      // Ignore audio errors in unsupported environments.
    }
  }, [alertEnabled, tasks])

  useEffect(() => {
    if (!activeLog) return
    const id = window.setInterval(() => setTickNowMs(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [activeLog])

  useEffect(() => {
    if (!queryHydrated) return
    void db.settings.put({ key: 'task.query', value: JSON.stringify(taskQuery) })
  }, [queryHydrated, taskQuery])

  useEffect(() => {
    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstalled(true)
    }

    const onBeforeInstallPrompt = (event: Event) => {
      event.preventDefault()
      setDeferredInstallPrompt(event as InstallPromptEvent)
    }
    const onInstalled = () => {
      setIsInstalled(true)
      setDeferredInstallPrompt(null)
    }

    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener)
    window.addEventListener('appinstalled', onInstalled)

    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt as EventListener)
      window.removeEventListener('appinstalled', onInstalled)
    }
  }, [])

  const filteredTasks = useMemo(
    () => filterAndSortTasks(tasks, taskQuery, { descriptionByTaskId: descriptionByTask }),
    [descriptionByTask, taskQuery, tasks],
  )

  const taskTrackedSeconds = useMemo(() => {
    const map: Record<number, number> = {}
    for (const log of timeLogs) {
      const endedSeconds = log.durationSeconds ?? 0
      const runningSeconds = !log.endedAt ? Math.max(0, Math.floor((tickNowMs - new Date(log.startedAt).getTime()) / 1000)) : 0
      map[log.taskId] = (map[log.taskId] ?? 0) + endedSeconds + runningSeconds
    }
    return map
  }, [timeLogs, tickNowMs])

  const reportInsights = useMemo(() => {
    const statusCounts = {
      todo: filteredTasks.filter((t) => t.status === 'todo').length,
      in_progress: filteredTasks.filter((t) => t.status === 'in_progress').length,
      done: filteredTasks.filter((t) => t.status === 'done').length,
    }

    const topTimeTasks = filteredTasks
      .map((task) => ({
        id: task.id ?? 0,
        title: task.title,
        seconds: task.id ? taskTrackedSeconds[task.id] ?? 0 : 0,
      }))
      .filter((item) => item.seconds > 0)
      .sort((a, b) => b.seconds - a.seconds)
      .slice(0, 5)

    const days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date()
      d.setDate(d.getDate() - (6 - i))
      d.setHours(0, 0, 0, 0)
      return d
    })

    const trend = days.map((d) => {
      const key = d.toISOString().slice(0, 10)
      const closed = filteredTasks.filter((t) => t.status === 'done' && t.updatedAt.slice(0, 10) === key).length
      const opened = filteredTasks.filter((t) => t.createdAt.slice(0, 10) === key).length
      return { key, opened, closed }
    })

    return { statusCounts, topTimeTasks, trend }
  }, [filteredTasks, taskTrackedSeconds])

  async function handleAuthSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAuthError('')

    try {
      if (password.length < 6) {
        setAuthError('Use at least 6 characters.')
        return
      }

      const saltSetting = await db.settings.get('auth.salt')
      const hashSetting = await db.settings.get('auth.hash')

      if (!saltSetting || !hashSetting) {
        const salt = randomBytes(cryptoConstants.SALT_BYTES)
        const passwordHash = await hashPassword(password, salt)

        await db.settings.bulkPut([
          { key: 'auth.salt', value: encodeSalt(salt) },
          { key: 'auth.hash', value: passwordHash },
        ])

        const derivedKey = await deriveAesKey(password, salt)
        setKey(derivedKey)
        setAuthState('ready')
        setPassword('')
        return
      }

      const salt = decodeSalt(saltSetting.value)
      const candidateHash = await hashPassword(password, salt)
      if (candidateHash !== hashSetting.value) {
        setAuthError('Incorrect password.')
        return
      }

      const derivedKey = await deriveAesKey(password, salt)
      setKey(derivedKey)
      setAuthState('ready')
      setPassword('')
    } catch {
      setAuthError('Authentication failed. Please try again.')
    }
  }

  function resetTaskForm() {
    setEditingTaskId(null)
    setTrackedMinutesInput('0')
    setTitle('')
    setDescription('')
    setLabelsInput('')
    setStakeholdersInput('')
    setDeadline('')
    setNextCheckpoint('')
    setNextAction('')
    setAiError('')
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!title.trim()) return

    const now = new Date().toISOString()
    const cipherText = description.trim()
      ? key
        ? await encryptText(description.trim(), key)
        : `plain:${encodeURIComponent(description.trim())}`
      : undefined

    const payload = {
      title: title.trim(),
      descriptionCiphertext: cipherText,
      tags: parseLabelsInput(labelsInput),
      stakeholders: parseStakeholdersInput(stakeholdersInput),
      deadline: deadline || undefined,
      nextCheckpoint: nextCheckpoint || undefined,
      nextAction: nextAction.trim() || undefined,
      updatedAt: now,
    }

    if (editingTaskId) {
      const existingTask = tasks.find((task) => task.id === editingTaskId)
      await db.tasks.update(editingTaskId, { ...payload, status: existingTask?.status ?? 'todo' })

      const currentSeconds = taskTrackedSeconds[editingTaskId] ?? 0
      const desiredSeconds = Math.max(0, Math.floor((Number(trackedMinutesInput) || 0) * 60))
      const deltaSeconds = desiredSeconds - currentSeconds
      if (deltaSeconds !== 0) {
        await db.timeLogs.add({
          taskId: editingTaskId,
          startedAt: now,
          endedAt: now,
          durationSeconds: deltaSeconds,
        })
      }

      resetTaskForm()
      setActivePanel(null)
      return
    }

    await db.tasks.add({
      ...payload,
      status: 'todo',
      createdAt: now,
    })

    resetTaskForm()
    setActivePanel(null)
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id ?? null)
    const trackedSeconds = task.id ? taskTrackedSeconds[task.id] ?? 0 : 0
    setTrackedMinutesInput(String(Math.round(trackedSeconds / 60)))
    setTitle(task.title)
    setDescription((task.id && descriptionByTask[task.id]) || '')
    setLabelsInput(task.tags.join(', '))
    setStakeholdersInput((task.stakeholders ?? []).join(', '))
    setDeadline(task.deadline ? task.deadline.slice(0, 10) : '')
    setNextCheckpoint(task.nextCheckpoint ? task.nextCheckpoint.slice(0, 10) : '')
    setNextAction(task.nextAction ?? '')
  }

  async function deleteEditingTask() {
    if (!editingTaskId) return
    await db.timeLogs.where('taskId').equals(editingTaskId).delete()
    await db.tasks.delete(editingTaskId)
    resetTaskForm()
    setActivePanel(null)
  }

  async function closeAnyRunningLog() {
    const runningLog = await db.timeLogs.filter((log) => !log.endedAt).first()
    if (!runningLog?.id) return

    const endedAt = new Date().toISOString()
    const durationSeconds = Math.max(0, Math.floor((new Date(endedAt).getTime() - new Date(runningLog.startedAt).getTime()) / 1000))

    await db.timeLogs.update(runningLog.id, { endedAt, durationSeconds })
    await db.tasks.update(runningLog.taskId, { status: 'todo', updatedAt: endedAt })
  }

  async function toggleTaskTimer(task: Task) {
    if (!task.id) return

    if (activeTaskId === task.id) {
      await closeAnyRunningLog()
      return
    }

    await closeAnyRunningLog()

    const startedAt = new Date().toISOString()
    await db.timeLogs.add({ taskId: task.id, startedAt })
    await db.tasks.update(task.id, { status: 'in_progress', updatedAt: startedAt })
  }

  async function markDone(task: Task) {
    if (!task.id) return
    if (activeTaskId === task.id) await closeAnyRunningLog()
    await db.tasks.update(task.id, { status: 'done', updatedAt: new Date().toISOString() })
  }

  async function runAiRewrite() {
    setAiBusy(true)
    setAiError('')
    try {
      const rewritten = await rewriteTaskText(description, {
        apiKey: aiApiKey || undefined,
        model: aiModel,
      })
      setDescription(rewritten)
      await db.settings.bulkPut([
        { key: 'ai.apiKey', value: aiApiKey },
        { key: 'ai.model', value: aiModel },
      ])
    } catch (error) {
      setAiError(error instanceof Error ? error.message : 'AI rewrite failed')
    } finally {
      setAiBusy(false)
    }
  }

  async function importJiraTasks() {
    const parsed = parseJiraText(jiraImportInput)
    if (parsed.length === 0) {
      setJiraImportMessage('No tasks found to import.')
      return
    }

    const now = new Date().toISOString()
    for (const item of parsed) {
      const encrypted = item.description
        ? key
          ? await encryptText(item.description, key)
          : `plain:${encodeURIComponent(item.description)}`
        : undefined
      await db.tasks.add({
        title: item.title,
        descriptionCiphertext: encrypted,
        tags: item.labels,
        stakeholders: [],
        status: 'todo',
        createdAt: now,
        updatedAt: now,
      })
    }

    setJiraImportMessage(`Imported ${parsed.length} Jira task(s).`)
    setJiraImportInput('')
  }

  function toggleStatusFilter(status: TaskStatus) {
    setTaskQuery((current) => {
      const enabled = current.statuses.includes(status)
      return {
        ...current,
        statuses: enabled ? current.statuses.filter((item) => item !== status) : [...current.statuses, status],
      }
    })
  }

  function toggleLabelFilter(label: string) {
    const normalized = normalizeLabel(label)
    setTaskQuery((current) => {
      const enabled = current.labels.includes(normalized)
      return {
        ...current,
        labels: enabled ? current.labels.filter((item) => item !== normalized) : [...current.labels, normalized],
      }
    })
  }

  function onLabelsInputKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== 'Enter' && event.key !== ',') return
    event.preventDefault()
    const next = parseLabelsInput(labelsInput)
    if (next.length === 0) return
    setLabelsInput(next.join(', ') + ', ')
  }

  async function exportAllDataJson() {
    const allTasks = await db.tasks.toArray()
    const allTimeLogs = await db.timeLogs.toArray()
    const allSettings = await db.settings.toArray()

    const payload = {
      schemaVersion: 1,
      app: 'RocketTask',
      exportedAt: new Date().toISOString(),
      data: {
        tasks: allTasks,
        timeLogs: allTimeLogs,
        settings: allSettings,
      },
    }

    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `rockettask-backup-${new Date().toISOString().slice(0, 10)}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setSettingsMessage(`Exported ${allTasks.length} tasks, ${allTimeLogs.length} logs, ${allSettings.length} settings.`)
  }

  function validateImportPayload(payload: unknown): payload is {
    schemaVersion: number
    data: { tasks: Task[]; timeLogs: Array<{ taskId: number; startedAt: string; endedAt?: string; durationSeconds?: number }>; settings: Array<{ key: string; value: string }> }
  } {
    if (!payload || typeof payload !== 'object') return false
    const root = payload as Record<string, unknown>
    if (typeof root.schemaVersion !== 'number') return false
    if (!root.data || typeof root.data !== 'object') return false

    const data = root.data as Record<string, unknown>
    if (!Array.isArray(data.tasks) || !Array.isArray(data.timeLogs) || !Array.isArray(data.settings)) return false

    const tasksValid = data.tasks.every((item) => {
      if (!item || typeof item !== 'object') return false
      const t = item as Record<string, unknown>
      return (
        typeof t.title === 'string' &&
        Array.isArray(t.tags) &&
        typeof t.status === 'string' &&
        typeof t.createdAt === 'string' &&
        typeof t.updatedAt === 'string'
      )
    })

    const logsValid = data.timeLogs.every((item) => {
      if (!item || typeof item !== 'object') return false
      const l = item as Record<string, unknown>
      return typeof l.taskId === 'number' && typeof l.startedAt === 'string'
    })

    const settingsValid = data.settings.every((item) => {
      if (!item || typeof item !== 'object') return false
      const s = item as Record<string, unknown>
      return typeof s.key === 'string' && typeof s.value === 'string'
    })

    return tasksValid && logsValid && settingsValid
  }

  async function onImportAllDataJson(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    try {
      const text = await file.text()
      const parsed = JSON.parse(text) as unknown

      if (!validateImportPayload(parsed)) {
        setSettingsMessage('Import failed: invalid or incompatible backup JSON format.')
        return
      }

      const payload = parsed
      await db.transaction('rw', db.tasks, db.timeLogs, db.settings, async () => {
        await db.tasks.clear()
        await db.timeLogs.clear()
        await db.settings.clear()
        await db.tasks.bulkAdd(payload.data.tasks)
        await db.timeLogs.bulkAdd(payload.data.timeLogs)
        await db.settings.bulkAdd(payload.data.settings)
      })

      setSettingsMessage(`Import complete: ${payload.data.tasks.length} tasks restored.`)
    } catch (error) {
      setSettingsMessage(`Import failed: ${error instanceof Error ? error.message : 'unknown error'}`)
    } finally {
      event.target.value = ''
    }
  }

  async function installPwa() {
    const promptEvent = deferredInstallPrompt
    if (!promptEvent) {
      setInstallMessage('Install prompt not available on this browser/context yet. Use browser menu → Add to Home Screen.')
      return
    }

    await promptEvent.prompt()
    setInstallMessage('Install prompt opened. Follow your browser steps.')
    setDeferredInstallPrompt(null)
  }

  function generateReport(period: 'week' | 'month' | 'quarter' | 'year') {
    setReportPeriod(period)

    const now = new Date()
    const start = new Date(now)
    if (period === 'week') start.setDate(now.getDate() - 7)
    if (period === 'month') start.setMonth(now.getMonth() - 1)
    if (period === 'quarter') start.setMonth(now.getMonth() - 3)
    if (period === 'year') start.setFullYear(now.getFullYear() - 1)

    const scopedLogs = timeLogs.filter((log) => new Date(log.startedAt) >= start)
    const report = generateWeeklyReport(filteredTasks, scopedLogs, descriptionByTask, now)

    const header = `Report Period: ${period.toUpperCase()}\nFrom: ${start.toLocaleDateString()} To: ${now.toLocaleDateString()}\n\n`
    setWeeklyReportText(header + report.text)
  }

  function emailReport() {
    if (!weeklyReportText.trim()) {
      setWeeklyReportText('Generate a report first, then email it.')
      return
    }

    const subject = encodeURIComponent(`RocketTask ${reportPeriod} report`)
    const body = encodeURIComponent(weeklyReportText)
    window.location.href = `mailto:?subject=${subject}&body=${body}`
  }

  async function toggleAlerts(value: boolean) {
    setAlertEnabled(value)
    await db.settings.put({ key: 'alerts.enabled', value: String(value) })
  }

  if (authState === 'loading') return <div className="mx-auto min-h-screen max-w-xl p-6 text-slate-200">Loading…</div>

  if (authState !== 'ready') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center p-6">
        <section className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/30">
          <h1 className="text-2xl font-semibold text-slate-100">RocketTask</h1>
          <p className="mt-2 text-sm text-slate-400">{authState === 'setup' ? 'Set a local password.' : 'Unlock with your password.'}</p>
          <form className="mt-5 space-y-3" onSubmit={handleAuthSubmit}>
            <input className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Password" />
            {authError ? <p className="text-sm text-rose-400">{authError}</p> : null}
            <button className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-900" type="submit">{authState === 'setup' ? 'Create password' : 'Unlock'}</button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-5xl p-4 pb-36 sm:p-6 sm:pb-40">
      <header className="mb-4">
        <h1 className="flex items-center gap-2 text-2xl font-semibold text-slate-100"><ClipboardList size={24} /> RocketTask</h1>
        <p className="text-sm text-slate-400">Fast, focused, mobile-friendly task execution.</p>
        {!ENCRYPTION_AVAILABLE ? (
          <p className="mt-2 text-xs text-amber-300">Running in non-secure context (HTTP on LAN). Notes are stored in browser storage in non-WebCrypto mode.</p>
        ) : null}
      </header>

      <section className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <MetricCard label="Visible" value={String(filteredTasks.length)} />
        <MetricCard label="Todo" value={String(filteredTasks.filter((task) => task.status === 'todo').length)} />
        <MetricCard label="In progress" value={String(filteredTasks.filter((task) => task.status === 'in_progress').length)} />
        <MetricCard label="Done" value={String(filteredTasks.filter((task) => task.status === 'done').length)} />
      </section>

      <section className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredTasks.map((task) => (
            <motion.article key={task.id} layout initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-xl border border-slate-700 bg-slate-900 p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium text-slate-100">{task.title}</h2>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{task.status.replace('_', ' ')} {task.deadline ? `• due ${new Date(task.deadline).toLocaleDateString()}` : ''}</p>
                  {((task.id ? taskTrackedSeconds[task.id] ?? 0 : 0) > 0 || activeTaskId === task.id) ? (
                    <p className="mt-1 text-xs text-cyan-200">{activeTaskId === task.id ? 'Active timer: ' : 'Tracked: '}{formatDurationHms(task.id ? taskTrackedSeconds[task.id] ?? 0 : 0)}</p>
                  ) : null}
                  {task.tags.length > 0 ? <div className="mt-2 flex flex-wrap gap-2">{task.tags.map((label) => <span key={`${task.id}-${label}`} className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300">#{label}</span>)}</div> : null}
                </div>
                <div className="flex items-center gap-2">
                  <button className="rounded-lg border border-slate-700 p-2 text-slate-300" onClick={() => { startEditTask(task); setActivePanel('create') }} type="button" title="Edit task"><Pencil size={16} /></button>
                  <button className="rounded-lg border border-slate-700 p-2 text-slate-300" onClick={() => void toggleTaskTimer(task)} type="button" title={activeTaskId === task.id ? 'Pause timer' : 'Start timer'}>{activeTaskId === task.id ? <Pause size={16} /> : <Play size={16} />}</button>
                  <button className="rounded-lg border border-slate-700 p-2 text-slate-300" onClick={() => void markDone(task)} type="button" title="Mark done"><CheckCircle2 size={16} /></button>
                </div>
              </div>
              {task.id && descriptionByTask[task.id] ? <p className="mt-3 text-sm text-slate-300">{descriptionByTask[task.id]}</p> : null}
              {(((task.stakeholders ?? []).length > 0) || task.nextAction || task.nextCheckpoint) ? <p className="mt-2 text-xs text-slate-400">{(task.stakeholders ?? []).length ? `Stakeholders: ${(task.stakeholders ?? []).join(', ')}. ` : ''}{task.nextCheckpoint ? `Next checkpoint: ${new Date(task.nextCheckpoint).toLocaleDateString()}. ` : ''}{task.nextAction ? `Next: ${task.nextAction}` : ''}</p> : null}
            </motion.article>
          ))}
        </AnimatePresence>
      </section>

      {activeLog ? <footer className="mt-4 rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 text-sm text-cyan-100">Active timer: {formatDurationHms(Math.max(0, Math.floor((tickNowMs - new Date(activeLog.startedAt).getTime()) / 1000)))}</footer> : null}

      {activePanel ? (
        <section className="fixed inset-x-0 bottom-16 z-40 mx-auto w-full max-w-5xl border-t border-slate-700 bg-slate-950/95 p-4 backdrop-blur">
          {activePanel === 'create' ? (
            <form className="space-y-3" onSubmit={submitTask}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">{editingTaskId ? 'Edit Task' : 'Create Task'}</h2>
              <input className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" placeholder="Task title" value={title} onChange={(event) => setTitle(event.target.value)} />
              <textarea className="h-20 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" placeholder="Encrypted notes" value={description} onChange={(event) => setDescription(event.target.value)} />
              <div className="flex gap-2">
                {aiApiKey.trim() ? (
                  <button type="button" onClick={() => void runAiRewrite()} disabled={aiBusy || !description.trim()} className="inline-flex items-center gap-2 rounded-lg border border-violet-500 px-3 py-2 text-sm text-violet-100 disabled:opacity-50"><Sparkles size={14} /> {aiBusy ? 'Rewriting…' : 'AI rewrite'}</button>
                ) : null}
                {aiError ? <p className="text-xs text-rose-400">{aiError}</p> : null}
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" placeholder="Labels (comma separated)" value={labelsInput} onChange={(event) => setLabelsInput(event.target.value)} onKeyDown={onLabelsInputKeyDown} />
                <input className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" placeholder="Stakeholders (comma separated)" value={stakeholdersInput} onChange={(event) => setStakeholdersInput(event.target.value)} />
                <label className="min-w-0 space-y-1 overflow-hidden text-xs text-slate-300"><span className="block">Deadline</span><input className="block w-full min-w-0 max-w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" type="date" value={deadline} onChange={(event) => setDeadline(event.target.value)} /></label>
                <label className="min-w-0 space-y-1 overflow-hidden text-xs text-slate-300"><span className="block">Next checkpoint</span><input className="block w-full min-w-0 max-w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-sm text-slate-100" type="date" value={nextCheckpoint} onChange={(event) => setNextCheckpoint(event.target.value)} /></label>
              </div>
              <input className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" placeholder="Suggested next action" value={nextAction} onChange={(event) => setNextAction(event.target.value)} />
              {editingTaskId ? <label className="space-y-1 text-xs text-slate-300"><span className="block">Tracked time correction (minutes)</span><input className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" type="number" min={0} value={trackedMinutesInput} onChange={(event) => setTrackedMinutesInput(event.target.value)} /></label> : null}
              <div className="flex gap-2"><button className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-900" type="submit">{editingTaskId ? 'Save changes' : 'Add task'}</button>{editingTaskId ? <button type="button" className="rounded-lg border border-rose-500 px-4 py-2 text-rose-300" onClick={() => void deleteEditingTask()}>Delete</button> : null}<button type="button" className="rounded-lg border border-slate-600 px-4 py-2 text-slate-200" onClick={() => { resetTaskForm(); setActivePanel(null) }}>Close</button></div>
            </form>
          ) : null}

          {activePanel === 'filter' ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">FILTER & SORT</h2>
              <div className="grid gap-3 md:grid-cols-4">
                <input className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 md:col-span-2" placeholder="Search title, description, labels, stakeholders, dates, next action" value={taskQuery.searchText} onChange={(event) => setTaskQuery((current) => ({ ...current, searchText: event.target.value }))} />
                <select className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" value={taskQuery.sortBy} onChange={(event) => setTaskQuery((current) => ({ ...current, sortBy: event.target.value as TaskQuery['sortBy'] }))}><option value="updatedAt">Sort: Updated</option><option value="createdAt">Sort: Created</option><option value="title">Sort: Title</option><option value="status">Sort: Status</option><option value="deadline">Sort: Deadline</option><option value="nextCheckpoint">Sort: Next checkpoint</option><option value="nextAction">Sort: Next action</option></select>
                <select className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" value={taskQuery.sortDirection} onChange={(event) => setTaskQuery((current) => ({ ...current, sortDirection: event.target.value as TaskQuery['sortDirection'] }))}><option value="desc">Direction: Desc</option><option value="asc">Direction: Asc</option></select>
              </div>
              <div className="flex flex-wrap gap-2">{STATUSES.map((status) => <button key={status} type="button" className={`rounded-full border px-2 py-1 text-xs ${taskQuery.statuses.includes(status) ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200' : 'border-slate-600 text-slate-300'}`} onClick={() => toggleStatusFilter(status)}>{status.replace('_', ' ')}</button>)}</div>
              <div className="flex flex-wrap gap-2">{availableLabels.map((label) => <button key={label} type="button" className={`rounded-full border px-2 py-1 text-xs ${taskQuery.labels.includes(label) ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200' : 'border-slate-600 text-slate-300'}`} onClick={() => toggleLabelFilter(label)}>#{label}</button>)}</div>
            </div>
          ) : null}

          {activePanel === 'settings' ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">SETTINGS</h2>
              <div className="grid gap-3 md:grid-cols-2">
                <input className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" placeholder="AI API key (optional)" value={aiApiKey} onChange={(event) => setAiApiKey(event.target.value)} />
                <input className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" placeholder="AI model" value={aiModel} onChange={(event) => setAiModel(event.target.value)} />
              </div>
              <textarea className="h-24 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100" placeholder="Paste Jira text or CSV (Summary,Labels,Description...)" value={jiraImportInput} onChange={(event) => setJiraImportInput(event.target.value)} />
              <div className="flex items-center gap-2"><button type="button" className="rounded-lg border border-amber-500 px-3 py-2 text-sm text-amber-100" onClick={() => void importJiraTasks()}>Import Jira tasks</button>{jiraImportMessage ? <p className="text-sm text-emerald-300">{jiraImportMessage}</p> : null}</div>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-100" onClick={() => void exportAllDataJson()}>Export all data (JSON)</button>
                <button type="button" className="rounded-lg border border-indigo-500 px-3 py-2 text-sm text-indigo-100" onClick={() => importFileRef.current?.click()}>Import all data (JSON)</button>
                <input ref={importFileRef} type="file" accept="application/json" className="hidden" onChange={onImportAllDataJson} />
              </div>
              {settingsMessage ? <p className="text-sm text-emerald-300">{settingsMessage}</p> : null}
            </div>
          ) : null}

          {activePanel === 'reports' ? (
            <div className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">Reports</h2>
              <div className="flex flex-wrap gap-2">
                <button type="button" className="rounded-lg border border-cyan-500 px-3 py-2 text-xs font-medium text-cyan-100" onClick={() => generateReport('week')}>Week</button>
                <button type="button" className="rounded-lg border border-cyan-500 px-3 py-2 text-xs font-medium text-cyan-100" onClick={() => generateReport('month')}>Month</button>
                <button type="button" className="rounded-lg border border-cyan-500 px-3 py-2 text-xs font-medium text-cyan-100" onClick={() => generateReport('quarter')}>Quarter</button>
                <button type="button" className="rounded-lg border border-cyan-500 px-3 py-2 text-xs font-medium text-cyan-100" onClick={() => generateReport('year')}>Year</button>
                <button type="button" className="rounded-lg bg-emerald-500 px-3 py-2 text-xs font-medium text-slate-900" onClick={emailReport}>Email Report</button>
                <button type="button" className={`rounded-lg border px-3 py-2 text-xs ${alertEnabled ? 'border-rose-500 text-rose-200' : 'border-slate-600 text-slate-300'}`} onClick={() => void toggleAlerts(!alertEnabled)}>{alertEnabled ? 'Alerts on' : 'Alerts off'}</button>
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="mb-2 text-xs uppercase text-slate-400">Status mix</p>
                  {(['todo', 'in_progress', 'done'] as const).map((s) => {
                    const total = Math.max(1, filteredTasks.length)
                    const value = reportInsights.statusCounts[s]
                    const width = Math.round((value / total) * 100)
                    return <div key={s} className="mb-2"><div className="mb-1 flex justify-between text-xs text-slate-300"><span>{s.replace('_', ' ')}</span><span>{value}</span></div><div className="h-2 rounded bg-slate-800"><div className="h-2 rounded bg-cyan-500" style={{ width: `${width}%` }} /></div></div>
                  })}
                </div>
                <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                  <p className="mb-2 text-xs uppercase text-slate-400">Top time tasks</p>
                  {reportInsights.topTimeTasks.length === 0 ? <p className="text-xs text-slate-500">No tracked time yet.</p> : reportInsights.topTimeTasks.map((t) => {
                    const max = Math.max(...reportInsights.topTimeTasks.map((x) => x.seconds), 1)
                    const width = Math.round((t.seconds / max) * 100)
                    return <div key={t.id} className="mb-2"><div className="mb-1 flex justify-between text-xs text-slate-300"><span className="truncate pr-2">{t.title}</span><span>{formatDurationHms(t.seconds)}</span></div><div className="h-2 rounded bg-slate-800"><div className="h-2 rounded bg-emerald-500" style={{ width: `${width}%` }} /></div></div>
                  })}
                </div>
              </div>

              <div className="rounded-lg border border-slate-700 bg-slate-900/60 p-3">
                <p className="mb-2 text-xs uppercase text-slate-400">Opened vs Closed (last 7 days)</p>
                <div className="grid grid-cols-7 gap-1">
                  {reportInsights.trend.map((d) => {
                    const max = Math.max(1, ...reportInsights.trend.map((x) => Math.max(x.opened, x.closed)))
                    const openH = Math.max(2, Math.round((d.opened / max) * 40))
                    const closedH = Math.max(2, Math.round((d.closed / max) * 40))
                    return <div key={d.key} className="flex flex-col items-center gap-1"><div className="flex h-12 items-end gap-1"><div className="w-2 rounded bg-amber-500" style={{ height: `${openH}px` }} /><div className="w-2 rounded bg-emerald-500" style={{ height: `${closedH}px` }} /></div><span className="text-[10px] text-slate-500">{d.key.slice(5)}</span></div>
                  })}
                </div>
              </div>

              {weeklyReportText ? <textarea readOnly value={weeklyReportText} className="h-48 w-full resize-y rounded-lg border border-slate-700 bg-slate-950/60 p-3 text-sm text-slate-200" /> : null}
            </div>
          ) : null}

          {activePanel === 'about' ? (
            <div className="space-y-2 text-sm text-slate-300">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-300">About</h2>
              <p><strong>Mission:</strong> Build consistent momentum with a lightweight agile task flow — capture fast, execute clearly, report confidently.</p>
              <p>This is a simple agile task tool focused on speed, clarity, and daily progress.</p>
              <p>Privacy by design: we do not store your data on servers. All data stays in your browser storage (secure form when WebCrypto context is available).</p>
              <p>AI tip: you can create a free token at <strong>openrouter.ai</strong> and use a free model for AI assist. Even though RocketTask does not log/store your key, this is often safer than using a paid key.</p>
              <div className="flex flex-wrap items-center gap-2">
                <button type="button" className="rounded-lg border border-cyan-500 px-3 py-2 text-sm text-cyan-100" onClick={() => void installPwa()}>
                  Install RocketTask
                </button>
                {isInstalled ? <span className="text-emerald-300">Installed ✅</span> : null}
              </div>
              {installMessage ? <p className="text-xs text-cyan-200">{installMessage}</p> : null}
              <p>PWA tip (iPhone Safari): tap <strong>Share</strong> → <strong>Add to Home Screen</strong>. Safari usually does not show the install prompt button automatically like Chrome does.</p>
              <p>Vibe-coded from a phone by <strong>Pedro Burglin</strong>.</p>
            </div>
          ) : null}
        </section>
      ) : null}

      <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-slate-700 bg-slate-950/95 backdrop-blur">
        <div className="mx-auto grid w-full max-w-5xl grid-cols-5 gap-1 p-2">
          <FooterButton label="Create" active={activePanel === 'create'} onClick={() => setActivePanel((v) => (v === 'create' ? null : 'create'))} icon={<PlusCircle size={16} />} />
          <FooterButton label="Filter" active={activePanel === 'filter'} onClick={() => setActivePanel((v) => (v === 'filter' ? null : 'filter'))} icon={<Filter size={16} />} />
          <FooterButton label="Settings" active={activePanel === 'settings'} onClick={() => setActivePanel((v) => (v === 'settings' ? null : 'settings'))} icon={<Settings size={16} />} />
          <FooterButton label="Reports" active={activePanel === 'reports'} onClick={() => setActivePanel((v) => (v === 'reports' ? null : 'reports'))} icon={<BarChart3 size={16} />} />
          <FooterButton label="About" active={activePanel === 'about'} onClick={() => setActivePanel((v) => (v === 'about' ? null : 'about'))} icon={<Info size={16} />} />
        </div>
      </nav>
    </main>
  )
}

function formatDurationHms(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds)
  const hours = Math.floor(safe / 3600)
  const minutes = Math.floor((safe % 3600) / 60)
  const seconds = safe % 60
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

function FooterButton({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-center justify-center rounded-lg px-2 py-1 text-xs ${
        active ? 'bg-cyan-500/20 text-cyan-200' : 'text-slate-300'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return <article className="rounded-xl border border-slate-700 bg-slate-900 p-3"><p className="text-xs uppercase tracking-wide text-slate-500">{label}</p><p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p></article>
}

export default App
