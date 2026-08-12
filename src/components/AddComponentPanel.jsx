import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

const SAMPLE = 'npx shadcn@latest add @aceternity/encrypted-text-demo-2'

export default function AddComponentPanel() {
  const [command, setCommand] = useState('')
  const [status, setStatus] = useState('idle')
  const [logs, setLogs] = useState('')
  const [offscreen, setOffscreen] = useState(false)
  const [floatOpen, setFloatOpen] = useState(false)
  const logRef = useRef(null)
  const panelRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    const el = panelRef.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => {
        const out = !entry.isIntersecting
        setOffscreen(out)
        if (!out) setFloatOpen(false)
      },
      { threshold: 0 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])

  const running = status === 'running'

  const run = async () => {
    if (!command.trim() || running) return
    setStatus('running')
    setLogs('')
    try {
      const res = await fetch('/api/add-component', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ command: command.trim() }),
      })
      if (!res.ok) {
        setLogs(await res.text())
        setStatus('error')
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let text = ''
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        text += decoder.decode(value, { stream: true })
        setLogs(text)
        if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
      }
      setStatus(text.includes('✅') ? 'done' : text.includes('❌') || text.includes('⚠️') ? 'error' : 'idle')
    } catch (e) {
      setLogs(String(e))
      setStatus('error')
    }
  }

  const statusLabel =
    status === 'running'
      ? '执行中…'
      : status === 'done'
        ? '已完成'
        : status === 'error'
          ? '失败'
          : '就绪'

  const statusStyle = {
    idle: 'border-gray-700 bg-black/40 text-gray-400',
    running: 'border-blue-400/50 bg-blue-500/10 text-blue-300',
    done: 'border-emerald-500/50 bg-emerald-500/10 text-emerald-300',
    error: 'border-red-500/50 bg-red-500/10 text-red-300',
  }

  return (
    <div ref={panelRef} className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold text-white">一键添加效果组件</h3>
          <p className="mt-1 text-sm text-gray-400">
            输入 shadcn 命令即可自动安装，并生成带预览、可复用代码与调用方法的卡片（仅开发环境可用）
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full border px-3 py-1 text-xs ${
              statusStyle[status]
            }`}
          >
            {status === 'running'
              ? '执行中…'
              : status === 'done'
                ? '已完成'
                : status === 'error'
                  ? '失败'
                  : '就绪'}
          </span>
          <span className="rounded-full border border-white/10 bg-black/40 px-3 py-1 text-xs text-gray-500">
            开发工具
          </span>
        </div>
      </div>

      <div className="space-y-4 p-6">
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && run()}
            placeholder={SAMPLE}
            spellCheck={false}
            className="flex-1 rounded-lg border border-gray-700 bg-black/40 px-4 py-3 font-mono text-sm text-gray-200 placeholder-gray-600 outline-none transition focus:border-blue-400/60"
          />
          <button
            onClick={run}
            disabled={running || !command.trim()}
            className="rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {running ? '执行中…' : '安装并生成卡片'}
          </button>
        </div>
        <p className="text-xs text-gray-500">
          示例：{SAMPLE}（支持逗号分隔一次添加多个）
        </p>

        {logs && (
          <pre
            ref={logRef}
            className="max-h-64 overflow-auto whitespace-pre-wrap rounded-xl bg-black/50 p-4 font-mono text-xs leading-relaxed text-gray-300"
          >
            {logs}
          </pre>
        )}
      </div>

      {offscreen &&
        createPortal(
          floatOpen ? (
            <div className="fixed bottom-6 right-6 z-50 w-[min(92vw,26rem)] overflow-hidden rounded-2xl border border-white/10 bg-black/80 shadow-2xl shadow-black/60 backdrop-blur-md">
              <div className="flex items-center gap-3 border-b border-white/10 px-4 py-2">
                <span className={`h-2 w-2 rounded-full ${statusStyle[status].split(' ')[1]}`} />
                <span className="text-xs text-gray-300">{statusLabel}</span>
                <button
                  onClick={() => setFloatOpen(false)}
                  className="ml-auto text-gray-500 transition hover:text-white"
                  title="收起为悬浮球"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 4v16M4 12h16" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>
              <div className="flex gap-2 p-3">
                <input
                  value={command}
                  onChange={(e) => setCommand(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && run()}
                  placeholder={SAMPLE}
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-lg border border-gray-700 bg-black/40 px-3 py-2 font-mono text-xs text-gray-200 placeholder-gray-600 outline-none transition focus:border-blue-400/60"
                />
                <button
                  onClick={run}
                  disabled={running || !command.trim()}
                  className="shrink-0 rounded-lg bg-blue-500 px-4 py-2 text-xs font-medium text-white transition hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {running ? '执行中…' : '安装'}
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setFloatOpen(true)}
              className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-blue-500 text-white shadow-xl shadow-blue-500/30 transition hover:scale-110 hover:bg-blue-400"
              title="添加效果组件"
              aria-label="打开添加组件输入框"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                <path d="M12 5v14M5 12h14" />
              </svg>
            </button>
          ),
          document.body
        )}
    </div>
  )
}