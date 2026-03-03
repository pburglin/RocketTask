import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, KeyboardEvent } from 'react'
import { AnimatePresence, motion } from 'framer-motion'
import { useLiveQuery } from 'dexie-react-hooks'
import { CheckCircle2, Pause, Pencil, Play } from 'lucide-react'
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
import { generateWeeklyReport, tasksToCsv } from './lib/reporting'
import {
  defaultTaskQuery,
  filterAndSortTasks,
  normalizeLabel,
  parseLabelsInput,
  type TaskQuery,
} from './lib/taskQuery'

type AuthState = 'loading' | 'setup' | 'locked' | 'ready'

const STATUSES: TaskStatus[] = ['todo', 'in_progress', 'done']
const QUICK_LABELS = ['urgent', 'follow-up', 'bug', 'feature', 'blocked', 'meeting']

function App() {
  const [authState, setAuthState] = useState<AuthState>('loading')
  const [password, setPassword] = useState('')
  const [authError, setAuthError] = useState('')
  const [key, setKey] = useState<CryptoKey | null>(null)

  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [labelsInput, setLabelsInput] = useState('')
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null)

  const [taskQuery, setTaskQuery] = useState<TaskQuery>(defaultTaskQuery)
  const [descriptionByTask, setDescriptionByTask] = useState<Record<number, string>>({})
  const [weeklyReportText, setWeeklyReportText] = useState('')

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
      const saltSetting = await db.settings.get('auth.salt')
      const hashSetting = await db.settings.get('auth.hash')
      setAuthState(saltSetting && hashSetting ? 'locked' : 'setup')
    })()
  }, [])

  useEffect(() => {
    if (!key || tasks.length === 0) {
      return
    }

    let cancelled = false

    void (async () => {
      const entries = await Promise.all(
        tasks.map(async (task) => {
          if (!task.id || !task.descriptionCiphertext) return [task.id ?? 0, ''] as const
          try {
            return [task.id, await decryptText(task.descriptionCiphertext, key)] as const
          } catch {
            return [task.id, '[Unable to decrypt]'] as const
          }
        }),
      )

      if (!cancelled) {
        setDescriptionByTask(Object.fromEntries(entries))
      }
    })()

    return () => {
      cancelled = true
    }
  }, [key, tasks])

  const filteredTasks = useMemo(
    () => filterAndSortTasks(tasks, taskQuery, { descriptionByTaskId: descriptionByTask }),
    [descriptionByTask, taskQuery, tasks],
  )

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
    setTitle('')
    setDescription('')
    setLabelsInput('')
  }

  async function submitTask(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (!key || !title.trim()) return

    const now = new Date().toISOString()
    const cipherText = description.trim() ? await encryptText(description.trim(), key) : undefined

    if (editingTaskId) {
      const existingTask = tasks.find((task) => task.id === editingTaskId)
      const nextStatus = existingTask?.status ?? 'todo'
      await db.tasks.update(editingTaskId, {
        title: title.trim(),
        descriptionCiphertext: cipherText,
        tags: parseLabelsInput(labelsInput),
        status: nextStatus,
        updatedAt: now,
      })
      resetTaskForm()
      return
    }

    await db.tasks.add({
      title: title.trim(),
      descriptionCiphertext: cipherText,
      tags: parseLabelsInput(labelsInput),
      status: 'todo',
      createdAt: now,
      updatedAt: now,
    })

    resetTaskForm()
  }

  function startEditTask(task: Task) {
    setEditingTaskId(task.id ?? null)
    setTitle(task.title)
    setDescription((task.id && descriptionByTask[task.id]) || '')
    setLabelsInput(task.tags.join(', '))
  }

  async function closeAnyRunningLog() {
    const runningLog = await db.timeLogs.filter((log) => !log.endedAt).first()
    if (!runningLog?.id) return

    const endedAt = new Date().toISOString()
    const durationSeconds = Math.max(
      0,
      Math.floor((new Date(endedAt).getTime() - new Date(runningLog.startedAt).getTime()) / 1000),
    )

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

    if (activeTaskId === task.id) {
      await closeAnyRunningLog()
    }

    await db.tasks.update(task.id, { status: 'done', updatedAt: new Date().toISOString() })
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

  function exportFilteredCsv() {
    const csv = tasksToCsv(filteredTasks, descriptionByTask)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `task-report-${new Date().toISOString().slice(0, 10)}.csv`
    anchor.click()
    URL.revokeObjectURL(url)
  }

  function generateCurrentWeeklyReport() {
    const report = generateWeeklyReport(filteredTasks, timeLogs, descriptionByTask)
    setWeeklyReportText(report.text)
  }

  if (authState === 'loading') {
    return <div className="mx-auto min-h-screen max-w-xl p-6 text-slate-200">Loading…</div>
  }

  if (authState !== 'ready') {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-xl items-center p-6">
        <section className="w-full rounded-2xl border border-slate-700 bg-slate-900 p-6 shadow-2xl shadow-black/30">
          <h1 className="text-2xl font-semibold text-slate-100">Task Reporter</h1>
          <p className="mt-2 text-sm text-slate-400">
            {authState === 'setup'
              ? 'Set a local password to protect encrypted task notes.'
              : 'Unlock with your password.'}
          </p>

          <form className="mt-5 space-y-3" onSubmit={handleAuthSubmit}>
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder="Password"
            />
            {authError ? <p className="text-sm text-rose-400">{authError}</p> : null}
            <button
              className="w-full rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-900 transition hover:bg-cyan-400"
              type="submit"
            >
              {authState === 'setup' ? 'Create password' : 'Unlock'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="mx-auto min-h-screen w-full max-w-4xl p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-slate-100">Task Reporter MVP</h1>
        <p className="text-sm text-slate-400">Universal filters power tasks, widgets, reports, and exports.</p>
      </header>

      <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <form className="space-y-3" onSubmit={submitTask}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              {editingTaskId ? 'Edit Task' : 'Create Task'}
            </h2>
            {editingTaskId ? (
              <button
                type="button"
                className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:border-rose-500"
                onClick={resetTaskForm}
              >
                Cancel Edit
              </button>
            ) : null}
          </div>

          <input
            className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            placeholder="Task title"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
          />
          <textarea
            className="h-24 w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            placeholder="Optional private notes (encrypted)"
            value={description}
            onChange={(event) => setDescription(event.target.value)}
          />

          <div className="space-y-2">
            <input
              className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
              placeholder="Labels (comma separated): urgent, bug"
              value={labelsInput}
              onChange={(event) => setLabelsInput(event.target.value)}
              onKeyDown={onLabelsInputKeyDown}
            />
            <div className="flex flex-wrap gap-2">
              {QUICK_LABELS.map((label) => (
                <button
                  key={label}
                  className="rounded-full border border-slate-600 px-2 py-1 text-xs text-slate-300 hover:border-cyan-500"
                  type="button"
                  onClick={() => {
                    const next = new Set(parseLabelsInput(labelsInput))
                    next.add(label)
                    setLabelsInput(Array.from(next).join(', '))
                  }}
                >
                  + {label}
                </button>
              ))}
            </div>
          </div>

          <button
            className="rounded-lg bg-cyan-500 px-4 py-2 font-medium text-slate-900 transition hover:bg-cyan-400"
            type="submit"
          >
            {editingTaskId ? 'Save task changes' : 'Add task'}
          </button>
        </form>
      </section>

      <section className="mb-6 rounded-2xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-400">Universal Filters</h2>
        <div className="grid gap-3 md:grid-cols-4">
          <input
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500 md:col-span-2"
            placeholder="Search title, description, labels, status, dates"
            value={taskQuery.searchText}
            onChange={(event) => setTaskQuery((current) => ({ ...current, searchText: event.target.value }))}
          />

          <select
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            value={taskQuery.sortBy}
            onChange={(event) =>
              setTaskQuery((current) => ({ ...current, sortBy: event.target.value as TaskQuery['sortBy'] }))
            }
          >
            <option value="updatedAt">Sort: Updated</option>
            <option value="createdAt">Sort: Created</option>
            <option value="title">Sort: Title</option>
            <option value="status">Sort: Status</option>
          </select>

          <select
            className="rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100 outline-none focus:border-cyan-500"
            value={taskQuery.sortDirection}
            onChange={(event) =>
              setTaskQuery((current) => ({
                ...current,
                sortDirection: event.target.value as TaskQuery['sortDirection'],
              }))
            }
          >
            <option value="desc">Direction: Desc</option>
            <option value="asc">Direction: Asc</option>
          </select>
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {STATUSES.map((status) => {
            const enabled = taskQuery.statuses.includes(status)
            return (
              <button
                key={status}
                type="button"
                className={`rounded-full border px-2 py-1 text-xs ${
                  enabled
                    ? 'border-cyan-500 bg-cyan-500/20 text-cyan-200'
                    : 'border-slate-600 text-slate-300 hover:border-cyan-500'
                }`}
                onClick={() => toggleStatusFilter(status)}
              >
                {status.replace('_', ' ')}
              </button>
            )
          })}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {availableLabels.map((label) => {
            const enabled = taskQuery.labels.includes(label)
            return (
              <button
                key={label}
                type="button"
                className={`rounded-full border px-2 py-1 text-xs ${
                  enabled
                    ? 'border-emerald-500 bg-emerald-500/20 text-emerald-200'
                    : 'border-slate-600 text-slate-300 hover:border-emerald-500'
                }`}
                onClick={() => toggleLabelFilter(label)}
              >
                #{label}
              </button>
            )
          })}
        </div>

        {(taskQuery.searchText || taskQuery.statuses.length > 0 || taskQuery.labels.length > 0) && (
          <button
            type="button"
            className="mt-3 rounded-lg border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:border-rose-500"
            onClick={() => setTaskQuery(defaultTaskQuery)}
          >
            Reset filters
          </button>
        )}
      </section>

      <section className="mb-6 grid gap-3 md:grid-cols-4">
        <MetricCard label="Visible tasks" value={String(filteredTasks.length)} />
        <MetricCard label="Todo" value={String(filteredTasks.filter((task) => task.status === 'todo').length)} />
        <MetricCard
          label="In progress"
          value={String(filteredTasks.filter((task) => task.status === 'in_progress').length)}
        />
        <MetricCard label="Done" value={String(filteredTasks.filter((task) => task.status === 'done').length)} />
      </section>

      <section className="space-y-3">
        <AnimatePresence mode="popLayout">
          {filteredTasks.map((task) => (
            <motion.article
              key={task.id}
              layout
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="rounded-xl border border-slate-700 bg-slate-900 p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-medium text-slate-100">{task.title}</h2>
                  <p className="text-xs uppercase tracking-wide text-slate-500">{task.status.replace('_', ' ')}</p>
                  {task.tags.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {task.tags.map((label) => (
                        <span
                          key={`${task.id}-${label}`}
                          className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-300"
                        >
                          #{label}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-violet-500"
                    onClick={() => startEditTask(task)}
                    type="button"
                    title="Edit task"
                  >
                    <Pencil size={16} />
                  </button>
                  <button
                    className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-cyan-500"
                    onClick={() => void toggleTaskTimer(task)}
                    type="button"
                    title={activeTaskId === task.id ? 'Pause timer' : 'Start timer'}
                  >
                    {activeTaskId === task.id ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    className="rounded-lg border border-slate-700 p-2 text-slate-300 hover:border-emerald-500"
                    onClick={() => void markDone(task)}
                    type="button"
                    title="Mark done"
                  >
                    <CheckCircle2 size={16} />
                  </button>
                </div>
              </div>

              {task.id && descriptionByTask[task.id] ? (
                <div className="mt-3 text-sm text-slate-300">
                  <p>{descriptionByTask[task.id]}</p>
                </div>
              ) : null}
            </motion.article>
          ))}
        </AnimatePresence>
      </section>

      <section className="mt-6 rounded-xl border border-slate-700 bg-slate-900 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="font-medium text-slate-100">Weekly Report + Export</h3>
            <p className="text-sm text-slate-400">
              Weekly report and CSV both use the exact visible filtered/sorted task set.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className="rounded-lg border border-cyan-500 px-3 py-2 text-sm font-medium text-cyan-100 hover:bg-cyan-500/20"
              onClick={generateCurrentWeeklyReport}
            >
              Generate weekly report
            </button>
            <button
              type="button"
              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-medium text-slate-900 hover:bg-emerald-400"
              onClick={exportFilteredCsv}
            >
              Export visible as CSV
            </button>
          </div>
        </div>

        {weeklyReportText ? (
          <div className="mt-3 rounded-lg border border-slate-700 bg-slate-950/60 p-3">
            <textarea
              readOnly
              value={weeklyReportText}
              className="h-48 w-full resize-y bg-transparent text-sm text-slate-200 outline-none"
            />
          </div>
        ) : null}
      </section>

      {activeLog ? (
        <footer className="mt-6 rounded-lg border border-cyan-500/40 bg-cyan-500/10 p-3 text-sm text-cyan-100">
          Timer running since {new Date(activeLog.startedAt).toLocaleTimeString()} (persists across refresh).
        </footer>
      ) : null}
    </main>
  )
}

function MetricCard({ label, value }: { label: string; value: string }) {
  return (
    <article className="rounded-xl border border-slate-700 bg-slate-900 p-3">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-100">{value}</p>
    </article>
  )
}

export default App
