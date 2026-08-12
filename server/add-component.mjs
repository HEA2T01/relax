import { spawn } from 'node:child_process'
import { readFile, writeFile, readdir, mkdir } from 'node:fs/promises'
import path from 'node:path'

const ROOT = path.resolve(import.meta.dirname, '..')
const SRC_COMPONENTS = path.join(ROOT, 'src', 'components')
const MANIFEST_PATH = path.join(ROOT, 'src', 'data', 'showcase.json')
const TIMEOUT_MS = 5 * 60 * 1000
const MAX_BODY = 8 * 1024

const REGISTRY_ALLOWLIST = [
  'aceternity',
  'react-bits',
  '20mhz',
  'magicui',
  'neobrutalism',
  'motion-primitives',
  'shadcn',
  'ui',
]

const ITEM_RE = /^@[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/
const COMMAND_RE = /^npx\s+shadcn(?:@latest)?\s+add\s+(.+)$/i

let busy = false

function parseCommand(raw) {
  const cmd = (raw || '').trim()
  let items
  if (/^npx\s+/i.test(cmd)) {
    const m = cmd.match(COMMAND_RE)
    if (!m) return null
    items = m[1].split(',').map((s) => s.trim())
  } else {
    items = cmd.split(',').map((s) => s.trim())
  }
  items = items.filter(Boolean)
  if (items.length === 0) return null
  for (const it of items) {
    if (!ITEM_RE.test(it)) return null
    const registry = it.slice(1).split('/')[0]
    if (!REGISTRY_ALLOWLIST.includes(registry)) return null
  }
  return items
}

async function walk(dir) {
  const out = []
  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return out
  }
  for (const e of entries) {
    const full = path.join(dir, e.name)
    if (e.isDirectory()) {
      out.push(...(await walk(full)))
    } else {
      out.push(full)
    }
  }
  return out
}

function humanizeTitle(file) {
  let base = file.replace(/\.(jsx?|tsx?)$/, '')
  base = base.replace(/-demo(-\d+)?$/, '')
  base = base.replace(/^@[\w-]+\//, '')
  return base
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase())
}

function extractSampleCode(src) {
  const m = src.match(/return\s*\(\s*([\s\S]*?)\n\s*\)\s*;/)
  if (!m) return null
  const lines = m[1].split('\n')
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => (l.match(/^\s*/) || [''])[0].length)
  const min = indents.length ? Math.min(...indents) : 0
  return lines.map((l) => l.slice(min)).join('\n').trim()
}

function parseProps(uiSrc) {
  const m = uiSrc.match(/\(\{\s*([\s\S]*?)\s*\}\)\s*=>/)
  if (!m) return []
  return m[1]
    .split('\n')
    .map((line) => line.trim().replace(/,$/, ''))
    .filter((line) => line && line !== '')
    .map((line) => {
      const p = line.match(/^([A-Za-z_$][\w$]*)\s*=\s*(.+)$/)
      return p ? { name: p[1], def: p[2] } : { name: line.replace(/^\.{3}/, ''), def: '' }
    })
}

function findExportName(uiSrc) {
  const m =
    uiSrc.match(/export\s+(?:default\s+)?(?:function|const)\s+([A-Za-z_$][\w$]*)/) ||
    uiSrc.match(/export\s+default\s+([A-Za-z_$][\w$]*)\s*;/)
  return m ? m[1] : null
}

const DEP_READABLE = {
  motion: 'Framer Motion',
  'framer-motion': 'Framer Motion',
  three: 'Three.js',
  postprocessing: 'Postprocessing',
  'react-icons': 'React Icons',
  lucide: 'Lucide',
}

function detectDeps(src) {
  const deps = []
  for (const key of Object.keys(DEP_READABLE)) {
    if (src.includes(`from '${key}'`) || src.includes(`from "${key}"`)) {
      deps.push(DEP_READABLE[key])
    }
  }
  return deps
}

function registryDisplay(items) {
  const reg = items[0].slice(1).split('/')[0]
  return reg
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

async function buildEntry(items, command, newFiles, demoGenerated) {
  const demoFile =
    newFiles.find((f) => /-demo[\w-]*\.(jsx?|tsx?)$/.test(f)) ||
    newFiles.find((f) => !/components[\\/]ui[\\/]/.test(f) && /\.(jsx?|tsx?)$/.test(f))
  const uiFiles = newFiles.filter((f) => /components[\\/]ui[\\/].+\.(jsx?|tsx?)$/.test(f))
  const demoPath = demoFile || null
  const demoRel = demoPath
    ? path.relative(SRC_COMPONENTS, demoPath).replace(/\\/g, '/')
    : null
  const demoName = demoRel ? path.basename(demoRel) : null
  const uiName = uiFiles.length ? path.basename(uiFiles[0]) : demoName

  if (!demoName && !uiName) return null

  let demoSrc = ''
  let uiSrc = ''
  if (demoPath) {
    try {
      demoSrc = await readFile(demoPath, 'utf8')
    } catch {
      demoSrc = ''
    }
  }
  if (uiFiles.length) {
    try {
      uiSrc = await readFile(path.join(SRC_COMPONENTS, 'ui', uiName), 'utf8')
    } catch {
      uiSrc = ''
    }
  }
  if (!uiSrc) uiSrc = demoSrc || uiSrc

  const hasUiLayer = uiFiles.length > 0 && uiSrc !== demoSrc

  const exportName = findExportName(uiSrc) || humanizeTitle(demoName || uiName).replace(/\s+/g, '')
  const props = parseProps(uiSrc)
  const deps = detectDeps(uiSrc)
  const code = extractSampleCode(demoSrc) || `<${exportName} />`

  const componentPath = hasUiLayer
    ? `src/components/ui/${uiName}`
    : `src/components/${demoRel}`

  const usage = [
    `安装：${command}`,
    `核心组件 ${componentPath}，导出 ${exportName}，可独立复用。`,
    props.length
      ? `主要 props：${props.slice(0, 6).map((p) => `${p.name}${p.def ? `（默认 ${p.def}）` : ''}`).join('、')}${props.length > 6 ? ' 等' : ''}。`
      : '组件使用默认 props 即可工作。',
  ]
  if (deps.length) usage.push(`依赖：${deps.join('、')}，已自动安装。`)
  usage.push('预览基于官方 demo；「可复用代码」为从 demo 提取的调用示例。')

  const entryId = demoGenerated
    ? (uiName || demoName || uiName)
        .replace(/\.(jsx?|tsx?)$/, '')
        .replace(/-demo[\w-]*$/i, '')
        .replace(/[\\/]/g, '-')
    : (demoRel || uiName).replace(/\.(jsx?|tsx?)$/, '').replace(/[\\/]/g, '-')

  return {
    id: entryId,
    title: humanizeTitle(
      demoGenerated
        ? (uiName || demoName).replace(/\.(jsx?|tsx?)$/, '').replace(/-demo[\w-]*$/i, '')
        : demoName || uiName
    ),
    description: `${registryDisplay(items)} · 通过网页一键添加的组件卡片`,
    tags: [registryDisplay(items), ...deps, '自动添加'],
    demo: demoRel,
    code,
    usage,
  }
}

async function appendManifest(entry) {
  const raw = await readFile(MANIFEST_PATH, 'utf8')
  const manifest = JSON.parse(raw)
  if (!manifest.entries) manifest.entries = []
  const idx = manifest.entries.findIndex((e) => e.id === entry.id)
  if (idx >= 0) {
    manifest.entries[idx] = entry
    await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
    return false
  }
  manifest.entries.push(entry)
  await writeFile(MANIFEST_PATH, JSON.stringify(manifest, null, 2), 'utf8')
  return true
}

const REGISTRY_URLS = {
  'react-bits': (name) => `https://reactbits.dev/r/${name}.json`,
  aceternity: (name) => `https://ui.aceternity.com/registry/${name}.json`,
}

async function fetchRegistryItem(item) {
  const [scope, name] = [item.slice(0, item.indexOf('/')), item.slice(item.indexOf('/') + 1)]
  const reg = scope.slice(1)
  const buildUrl = REGISTRY_URLS[reg]
  if (!buildUrl) return null
  const url = buildUrl(name)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    const err = new Error(`HTTP ${res.status}`)
    err.status = res.status
    throw err
  }
  return res.json()
}

function writePathFor(regPath) {
  const parts = regPath.replace(/\\/g, '/').split('/')
  if (parts[0] === 'ui') {
    return path.join(SRC_COMPONENTS, 'ui', ...parts.slice(1))
  }
  return path.join(SRC_COMPONENTS, ...parts)
}

function runNpmInstall(deps) {
  return new Promise((resolve) => {
    const isWin = process.platform === 'win32'
    const child = isWin
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', `npm install ${deps.join(' ')}`], {
          cwd: ROOT,
          env: { ...process.env },
          windowsHide: true,
        })
      : spawn('npm', ['install', ...deps], { cwd: ROOT })

    let output = ''
    const timer = setTimeout(() => child.kill('SIGKILL'), TIMEOUT_MS)
    const onData = (chunk) => {
      const s = chunk.toString().replace(ANSI_SGR, '').replace(ESC, '')
      output += s
      if (onStream) onStream(s)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)
    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code, output })
    })
  })
}

const DEMO_IMG =
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1200&auto=format&fit=crop'

function propsContain(src, names) {
  const parsed = parseProps(src)
  const set = new Set(parsed.map((p) => p.name))
  return names.filter((n) => set.has(n))
}

function taskConfigFor(exportName, uiSrc) {
  const props = parseProps(uiSrc)
  const def = (name) => {
    const p = props.find((x) => x.name === name)
    return p ? p.def : null
  }
  const needs = propsContain(uiSrc, ['src', 'image', 'imageSrc', 'cover', 'video', 'videoSrc'])
  const extra = {}
  if (needs.includes('src') && (!def('src') || def('src') === "''" || def('src') === '""')) {
    extra.src = DEMO_IMG
  }
  if (needs.includes('image') && extra.src === undefined) extra.image = DEMO_IMG
  if (needs.includes('cover') && extra.src === undefined) extra.cover = DEMO_IMG
  return { exportName, props, extra }
}

async function writePreviewDemo(uiFiles, items) {
  if (!uiFiles.length) return null
  const uiPath = uiFiles[0]
  const uiSrc = await readFile(uiPath, 'utf8')
  const exportName = findExportName(uiSrc)
  if (!exportName) return null
  const cfg = taskConfigFor(exportName, uiSrc)
  const rel = path
    .relative(SRC_COMPONENTS, uiPath)
    .replace(/\\/g, '/')
  const importPath = `./${rel.replace(/\.tsx?$/, '')}`
  const demoName = `${path.basename(uiPath).replace(/\.(jsx?|tsx?)$/, '')}-demo.jsx`
  const target = path.join(SRC_COMPONENTS, demoName)
  const extraLines = Object.entries(cfg.extra)
    .map(([k, v]) => `      ${k}="${v}"`)
    .join('\n')
  const content = `import ${exportName} from '${importPath}';\n\nexport default function ${exportName}Demo() {\n  return (\n    <${exportName}\n${extraLines ? `${extraLines}\n` : ''}    />\n  );\n}\n`
  await writeFile(target, content, 'utf8')
  return target
}

async function manualInstall(items) {
  const plan = []
  for (const item of items) {
    const meta = await fetchRegistryItem(item)
    if (!meta) throw new Error(`注册源 ${item.split('/')[0]} 不支持手动安装回退`)
    plan.push({ item, meta })
  }
  const written = []
  const allDeps = new Set()
  const uiFiles = []
  for (const { item, meta } of plan) {
    const files = meta.files || []
    if (files.length === 0) {
      throw new Error(`注册表条目 ${item} 没有可写的文件`)
    }
    for (const f of files) {
      const target = writePathFor(f.path)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, f.content, 'utf8')
      written.push(target)
      const isUi = /\/ui\//.test(f.path.replace(/\\/g, '/'))
      if (!isUi && /\.(jsx?|tsx?)$/.test(f.path)) uiFiles.push(target)
    }
    for (const d of meta.dependencies || []) allDeps.add(d)
  }
  if (allDeps.size > 0) {
    const depList = [...allDeps]
    if (onStream) onStream(`\n▶ 手动安装依赖：${depList.join(', ')}\n`)
    const r = await runNpmInstall(depList)
    if (r.code !== 0) {
      throw new Error('依赖安装失败，请查看上方日志。')
    }
  }
  return { written, uiFiles }
}

const ANSI_SGR = new RegExp(String.fromCharCode(0x1b) + '\\[[0-9;]*[A-Za-z]', 'g')
const ESC = new RegExp(String.fromCharCode(0x1b), 'g')

function runCommand(items) {
  return new Promise((resolve) => {
    const tag = 'latest'
    const args = items.join(' ')
    const full = `npx shadcn@${tag} add ${args}`
    const isWin = process.platform === 'win32'
    const child = isWin
      ? spawn(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', full], {
          cwd: ROOT,
          env: { ...process.env, npm_config_yes: 'true', FORCE_COLOR: '0' },
          windowsHide: true,
        })
      : spawn('npx', ['shadcn@latest', 'add', ...items], {
          cwd: ROOT,
          env: { ...process.env, npm_config_yes: 'true', FORCE_COLOR: '0' },
        })

    let output = ''
    let killed = false
    const timer = setTimeout(() => {
      killed = true
      child.kill('SIGKILL')
    }, TIMEOUT_MS)

    const onData = (chunk) => {
      const s = chunk.toString().replace(ANSI_SGR, '').replace(ESC, '')
      output += s
      if (onStream) onStream(s)
    }
    child.stdout.on('data', onData)
    child.stderr.on('data', onData)

    child.on('close', (code) => {
      clearTimeout(timer)
      resolve({ code: killed ? -1 : code, output, killed })
    })
  })
}

let onStream = null

function createAddComponentApi() {
  return {
    name: 'add-component-api',
    configureServer(server) {
      server.middlewares.use('/api/add-component', async (req, res) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          res.end('Method Not Allowed')
          return
        }
        let body = ''
        req.on('data', (d) => {
          body += d
          if (body.length > MAX_BODY) req.destroy()
        })
        req.on('end', async () => {
          let parsed
          try {
            parsed = JSON.parse(body)
          } catch {
            res.statusCode = 400
            res.end('请求体必须是 JSON（{\n  "command": "npx shadcn@latest add @aceternity/xxx-demo"\n}）')
            return
          }
          const items = parseCommand(parsed.command)
          if (!items) {
            res.statusCode = 400
            res.end(
              '命令格式不合法：仅支持形如 npx shadcn@latest add @注册源/组件名 的指令，且仅限白名单注册源（aceternity / react-bits / 20mhz / magicui / neobrutalism / motion-primitives 等），可同时添加多个（逗号分隔）。'
            )
            return
          }
          if (busy) {
            res.statusCode = 409
            res.end('已有组件安装任务在执行中，请稍候。')
            return
          }
          busy = true

          res.writeHead(200, {
            'Content-Type': 'text/plain; charset=utf-8',
            'Cache-Control': 'no-store',
            'Transfer-Encoding': 'chunked',
          })

          const before = await walk(SRC_COMPONENTS)
          res.write(`▶ 开始执行：npx shadcn@latest add ${items.join(', ')}\n`)
          onStream = (s) => {
            if (!res.writableEnded) res.write(s)
          }
          const result = await runCommand(items)
          onStream = null

          if (result.killed) {
            res.write('\n❌ 安装超时（5 分钟），已终止。\n')
            res.end()
          } else if (result.code !== 0) {
            res.write('\n⚠️ CLI 安装失败，尝试手动回退安装…\n')
            onStream = (s) => {
              if (!res.writableEnded) res.write(s)
            }
            try {
              const { written, uiFiles } = await manualInstall(items)
              const demoFile = await writePreviewDemo(uiFiles, items)
              if (demoFile) written.push(demoFile)
              onStream = null
              const newFiles = written.filter((f) => /\.(jsx?|tsx?)$/.test(f))
              if (newFiles.length === 0) {
                res.write('\n❌ 手动安装未生成可用组件文件。\n')
                res.end()
              } else {
                const entry = await buildEntry(
                  items,
                  `npx shadcn@latest add ${items.join(', ')}`,
                  newFiles,
                  Boolean(demoFile)
                )
                if (!entry) {
                  res.write('\n❌ 无法解析新组件，请手动检查 src/components。\n')
                  res.end()
                } else {
                  const added = await appendManifest(entry)
                  res.write(
                    `\n✅ 手动安装成功，已生成卡片「${entry.title}」${added ? '' : '（已存在，更新了内容）'}，刷新页面即可看到新效果。\n`
                  )
                  res.end()
                }
              }
            } catch (e) {
              onStream = null
              res.write(`\n❌ 手动回退安装失败：${e.message}（原始 CLI 错误见上方日志）。\n`)
              res.end()
            }
          } else {
            const after = await walk(SRC_COMPONENTS)
            const newFiles = after.filter(
              (f) => !before.includes(f) && /\.(jsx?|tsx?)$/.test(f)
            )
            if (newFiles.length === 0) {
              res.write('\n⚠️ 未检测到新文件（组件可能已存在）。\n')
              res.end()
            } else {
              const entry = await buildEntry(items, `npx shadcn@latest add ${items.join(', ')}`, newFiles)
              if (!entry) {
                res.write('\n⚠️ 无法解析新组件，请手动检查 src/components。\n')
                res.end()
              } else {
                const added = await appendManifest(entry)
                res.write(
                  `\n✅ 完成，已生成卡片「${entry.title}」${added ? '' : '（已存在，更新了内容）'}，刷新页面即可看到新效果。\n`
                )
                res.end()
              }
            }
          }
          busy = false
        })
      })
    },
  }
}

export default createAddComponentApi