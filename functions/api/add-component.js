// Cloudflare Pages Function: 一键添加效果组件（GitHub 桥接版）
// 流程：解析命令 -> 抓注册表 JSON -> 生成组件文件/卡片 -> GitHub API 提交 -> 自动重新构建部署
// 需要环境变量（Cloudflare Pages > Settings > Environment variables 或 wrangler pages secret）：
//   GH_TOKEN（仓库写入权限的 GitHub PAT）
//   GH_OWNER（GitHub 用户名/组织）
//   GH_REPO（GitHub 仓库名）
//   GH_BRANCH（可选，默认 main）

const MAX_BODY = 8 * 1024

function b64decode(b64) {
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

function b64encode(str) {
  const bytes = new TextEncoder().encode(str)
  let bin = ''
  bytes.forEach((b) => {
    bin += String.fromCharCode(b)
  })
  return btoa(bin)
}

const REGISTRY_ALLOWLIST = [
  'aceternity',
  'react-bits',
  '20mhz',
  'magicui',
  'neobrutalism',
  'motion-primitives',
]

const REGISTRY_URLS = {
  'react-bits': (name) => `https://reactbits.dev/r/${name}.json`,
  aceternity: (name) => `https://ui.aceternity.com/registry/${name}.json`,
  '20mhz': (name) => `https://raw.githubusercontent.com/20mhz/20mhz/main/registry/${name}.json`,
  magicui: (name) => `https://magicui.design/r/${name}.json`,
  'motion-primitives': (name) => `https://motion-primitives.com/registry/${name}.json`,
  neobrutalism: (name) => `https://registry.neobrutalism.dev/r/${name}.json`,
}

const ITEM_RE = /^@[A-Za-z0-9_-]+\/[A-Za-z0-9._-]+$/
const COMMAND_RE = /^npx\s+shadcn(?:@latest)?\s+add\s+(.+)$/i
const DEMO_IMG =
  'https://images.unsplash.com/photo-1441974231531-c6227db76b6e?q=80&w=1200&auto=format&fit=crop'

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
  gsap: 'GSAP',
  'lottie-react': 'Lottie',
  zustand: 'Zustand',
  swiper: 'Swiper',
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

async function fetchRegistryJson(item) {
  const reg = item.slice(1).split('/')[0]
  const name = item.slice(item.indexOf('/') + 1)
  const buildUrl = REGISTRY_URLS[reg]
  if (!buildUrl) throw new Error(`注册源 ${reg} 暂不支持`)
  const url = buildUrl(name)
  const res = await fetch(url, {
    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; task-deployer)' },
    signal: AbortSignal.timeout(30000),
  })
  if (!res.ok) {
    throw new Error(`注册表 ${url} 返回 ${res.status}`)
  }
  return res.json()
}

function buildDemoContent(uiFilePath, uiSrc) {
  const exportName = findExportName(uiSrc)
  if (!exportName) return null
  const props = parseProps(uiSrc)
  const hasMediaProp = props.some((p) => ['src', 'image', 'cover', 'videoSrc'].includes(p.name))
  const rel = uiFilePath
    .replace(/^src\/components\//, '')
    .replace(/\.(jsx?|tsx?)$/, '')
  const importPath = rel.startsWith('ui/') ? `../ui/${rel.slice(3)}` : `./${rel}`
  const lines = [`import ${exportName} from '${importPath}';`, '', `export default function ${exportName}Demo() {`, '  return (', `    <${exportName}`]
  if (hasMediaProp) {
    lines.push(`      src="${DEMO_IMG}"`)
  }
  lines.push('    />')
  lines.push('  );')
  lines.push('}')
  return lines.join('\n')
}

function buildCard(items, command, files) {
  const toRel = (p) => p.replace(/^src\/components\//, '')
  const jsxFiles = files.filter((f) => /\.(jsx?|tsx?)$/.test(f.path))
  const demoFile = jsxFiles.find((f) => /-demo[\w-]*\.(jsx?|tsx?)$/.test(f.path)) || jsxFiles[0]
  const uiFile = jsxFiles.find((f) => f.path.includes('/ui/'))
  if (!demoFile && !uiFile) return null

  const demoPath = demoFile ? demoFile.path : null
  const uiPath = uiFile ? uiFile.path : null
  const uiSrc = (uiPath ? uiFile.content : demoPath ? demoFile.content : '') || ''
  const demoSrc = demoPath ? demoFile.content : uiSrc
  const demoName = demoPath ? demoPath.split('/').pop() : null
  const uiName = uiPath ? uiPath.split('/').pop() : null
  const exportName = findExportName(uiSrc) || humanizeTitle(demoName || uiName).replace(/\s+/g, '')
  const props = parseProps(uiSrc)
  const deps = detectDeps(uiSrc)
  const code = extractSampleCode(demoSrc) || `<${exportName} />`

  const demoRel = demoPath ? toRel(demoPath) : uiPath ? toRel(uiPath) : null
  const idBase = (demoRel || uiName || '').replace(/\.(jsx?|tsx?)$/, '').replace(/\//g, '-')
  const titleBase = (demoName || uiName || '').replace(/\.(jsx?|tsx?)$/, '')

  return {
    id: idBase,
    title: humanizeTitle(titleBase),
    description: `${registryDisplay(items)} · 通过网页一键添加的组件卡片`,
    tags: [registryDisplay(items), ...deps, '自动添加'],
    demo: demoRel,
    code,
    usage: [
      `安装：${command}`,
      `核心组件 src/components/${demoRel}，导出 ${exportName}，可独立复用。`,
      props.length
        ? `主要 props：${props.slice(0, 6).map((p) => `${p.name}${p.def ? `（默认 ${p.def}）` : ''}`).join('、')}${props.length > 6 ? ' 等' : ''}。`
        : '组件使用默认 props 即可工作。',
      ...(deps.length ? [`依赖：${deps.join('、')}，构建时自动安装。`] : []),
      '预览基于官方 demo；「可复用代码」为从 demo 提取的调用示例。',
    ],
  }
}

function gh(owner, repo, token) {
  const base = `https://api.github.com/repos/${owner}/${repo}`
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'User-Agent': 'task-deployer',
    'X-GitHub-Api-Version': '2022-11-28',
  }
  return {
    async get(path) {
      const res = await fetch(`${base}${path}`, { headers, signal: AbortSignal.timeout(30000) })
      if (!res.ok) throw new Error(`GitHub GET ${path} -> ${res.status}`)
      return res.json()
    },
    async put(path, body) {
      const res = await fetch(`${base}${path}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(60000),
      })
      if (!res.ok) {
        const detail = await res.text().catch(() => '')
        throw new Error(`GitHub PUT ${path} -> ${res.status} ${detail.slice(0, 200)}`)
      }
      return res.json()
    },
  }
}

function registryToPath(regPath) {
  const parts = regPath.replace(/\\/g, '/').split('/')
  if (parts[0] === 'ui') return `src/components/ui/${parts.slice(1).join('/')}`
  return `src/components/${parts.join('/')}`
}

async function run(env, command) {
  const lines = []
  const write = (s) => lines.push(s)

  let items
  try {
    const parsed = JSON.parse(command)
    items = parseCommand(parsed.command)
  } catch {
    items = null
  }
  if (!items) {
    return {
      status: 400,
      body: '命令格式不合法：仅支持形如 npx shadcn@latest add @注册源/组件名（aceternity / react-bits / 20mhz / magicui / neobrutalism / motion-primitives），可逗号分隔多个。',
    }
  }

  const token = env.GH_TOKEN || env.GITHUB_TOKEN
  const owner = env.GH_OWNER
  const repo = env.GH_REPO
  const branch = env.GH_BRANCH || 'main'

  if (!token || !owner || !repo) {
    return {
      status: 500,
      body: '服务器缺少环境变量：GH_TOKEN / GH_OWNER / GH_REPO。请先在 Cloudflare Pages 项目设置中配置。',
    }
  }

  try {
    write(`▶ 开始添加：${items.join(', ')}\n`)
    const api = gh(owner, repo, token)

    // 1. 抓取注册表
    const filesToWrite = []
    const allDeps = new Set()
    for (const item of items) {
      write(`· 拉取注册表 ${item}…\n`)
      const meta = await fetchRegistryJson(item)
      const regFiles = meta.files || []
      if (!regFiles.length) throw new Error(`注册表条目 ${item} 没有文件`)
      for (const f of regFiles) {
        filesToWrite.push({ path: registryToPath(f.path), content: f.content })
      }
      for (const d of meta.dependencies || []) allDeps.add(d)
    }

    // 2. 需要生成 demo 包装的组件（无官方 -demo 文件时）
    const hasOfficialDemo = filesToWrite.some((f) => /-demo[\w-]*\.(jsx?|tsx?)$/.test(f.path))
    if (!hasOfficialDemo) {
      const uiFile = filesToWrite.find((f) => /\/ui\//.test(f.path)) || filesToWrite[0]
      if (uiFile) {
        const demoContent = buildDemoContent(uiFile.path, uiFile.content)
        if (demoContent) {
          const base = uiFile.path.split('/').pop().replace(/\.(jsx?|tsx?)$/, '')
          filesToWrite.push({
            path: `src/components/${base}-demo.jsx`,
            content: demoContent,
          })
        }
      }
    }

    // 3. 生成卡片并更新 showcase.json
    const entry = buildCard(items, `npx shadcn@latest add ${items.join(', ')}`, filesToWrite)
    if (!entry) throw new Error('无法从注册表生成组件卡片')
    const existing = await api.get('/contents/src/data/showcase.json?ref=' + branch)
    const manifest = JSON.parse(b64decode(existing.content))
    if (!manifest.entries) manifest.entries = []
    const idx = manifest.entries.findIndex((e) => e.id === entry.id)
    if (idx >= 0) manifest.entries[idx] = entry
    else manifest.entries.push(entry)
    const manifestJson = JSON.stringify(manifest, null, 2) + '\n'
    filesToWrite.push({
      path: 'src/data/showcase.json',
      content: manifestJson,
      sha: existing.sha,
    })

    // 4. 更新 package.json 依赖
    if (allDeps.size) {
      const pkg = await api.get('/contents/package.json?ref=' + branch)
        const pkgJson = JSON.parse(b64decode(pkg.content))
      pkgJson.dependencies = pkgJson.dependencies || {}
      let changed = false
      for (const d of allDeps) {
        if (!pkgJson.dependencies[d]) {
          pkgJson.dependencies[d] = 'latest'
          changed = true
        }
      }
      if (changed) {
        filesToWrite.push({
          path: 'package.json',
          content: JSON.stringify(pkgJson, null, 2) + '\n',
          sha: pkg.sha,
        })
      }
    }

    // 5. 提交前为已存在文件补充 sha（否则更新会 409）
    for (const f of filesToWrite) {
      if (f.sha) continue
      try {
        const existing = await api.get(
          `/contents/${encodeURIComponent(f.path)}?ref=${branch}`
        )
        f.sha = existing.sha
      } catch (e) {
        if (!/-> 404/.test(String(e.message))) throw e
      }
    }

    // 6. 逐个提交文件
    write(`· 提交 ${filesToWrite.length} 个文件到 GitHub（${owner}/${repo}@${branch}）…\n`)
    for (const f of filesToWrite) {
      const body = {
        message: `add-component: ${items.join(', ')}`,
          content: b64encode(f.content),
      }
      if (f.sha) body.sha = f.sha
      await api.put(
        `/contents/${encodeURIComponent(f.path).replace(/%2F/g, '/')}?ref=${branch}`,
        body
      )
    }

    write(`\n✅ 已提交，Cloudflare Pages 正在自动重新构建部署（约 1~2 分钟）。\n`)
    write(`刷新页面后即可看到新卡片「${entry.title}」。\n`)
  } catch (e) {
    write(`\n❌ 添加失败：${e.message}\n`)
    write(`提示：若为 GitHub 提交错误，请检查 GH_TOKEN 是否有效且具备 ${owner}/${repo} 仓库写入权限。\n`)
  }
  return { status: 200, body: lines.join('') }
}

export async function onRequestPost(context) {
  const { request, env } = context
  try {
    const text = await request.text()
    if (text.length > MAX_BODY) {
      return new Response('请求体过大', { status: 413 })
    }
    const { status, body } = await run(env, text)
    return new Response(body, {
      status,
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    })
  } catch (e) {
    return new Response(`函数内部错误：${e.message}\n${(e.stack || '').slice(0, 1000)}`, {
      status: 500,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
    })
  }
}
