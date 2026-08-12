import { useState } from 'react'
import { Highlight, themes } from 'prism-react-renderer'

const tabs = [
  { key: 'demo', label: '效果预览' },
  { key: 'code', label: '可复用代码' },
  { key: 'usage', label: '调用方法' },
]

function CodeBlock({ code }) {
  const [copied, setCopied] = useState(false)

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch {
      setCopied(false)
    }
  }

  return (
    <div className="relative">
      <button
        onClick={copyCode}
        className="absolute right-3 top-3 z-10 rounded-lg border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-gray-300 transition hover:border-blue-400/50 hover:text-white"
      >
        {copied ? '已复制 ✓' : '复制代码'}
      </button>
      <div className="overflow-x-auto rounded-xl bg-[#0d1117] p-5">
        <Highlight theme={themes.oneDark} code={code} language="jsx">
          {({ style, tokens, getLineProps, getTokenProps }) => (
            <pre
              className="min-w-max text-[13px] leading-relaxed"
              style={{ ...style, background: 'transparent' }}
            >
              {tokens.map((line, i) => (
                <div key={i} {...getLineProps({ line })}>
                  <span className="mr-4 inline-block w-4 select-none text-right text-gray-600">
                    {i + 1}
                  </span>
                  {line.map((token, key) => (
                    <span key={key} {...getTokenProps({ token })} />
                  ))}
                </div>
              ))}
            </pre>
          )}
        </Highlight>
      </div>
    </div>
  )
}

export default function EffectShowcase({ title, description, tags, demo, code, usage }) {
  const [active, setActive] = useState('demo')

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-6 py-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{title}</h3>
          <p className="mt-1 text-sm text-gray-400">{description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {tags.map((tag) => (
            <span
              key={tag}
              className="rounded-full border border-blue-400/30 bg-blue-500/10 px-3 py-1 text-xs text-blue-300"
            >
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10 px-6 pt-3">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActive(tab.key)}
            className={`rounded-t-lg px-4 py-2 text-sm transition-colors ${
              active === tab.key
                ? 'bg-white/10 font-medium text-white'
                : 'text-gray-400 hover:text-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content */}
      <div className="min-h-[360px] p-6">
        {active === 'demo' && (
          <div className="flex min-h-[312px] items-center justify-center">{demo}</div>
        )}

        {active === 'code' && <CodeBlock code={code} />}

        {active === 'usage' && (
          <ul className="space-y-4">
            {usage.map((step, i) => (
              <li key={i} className="flex gap-3 text-sm leading-relaxed text-gray-300">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-blue-500/20 text-xs font-bold text-blue-300">
                  {i + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}