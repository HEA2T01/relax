import { lazy, Suspense, Component, useState } from 'react'
import PixelBlast from './components/PixelBlast'
import { EncryptedText } from './components/ui/encrypted-text.jsx'
import EffectShowcase from './components/EffectShowcase'
import AddComponentPanel from './components/AddComponentPanel'
import showcase from './data/showcase.json'

const MANIFEST = showcase.entries || []

const demoModules = import.meta.glob('./components/**/*.jsx')

const demoLoaders = {}
for (const entry of MANIFEST) {
  if (entry.demo) {
    const modulePath = `./components/${entry.demo}`
    const loader = demoModules[modulePath]
    if (loader) {
      demoLoaders[entry.id] = lazy(loader)
    }
  }
}

class DemoBoundary extends Component {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
          预览加载失败，请检查该组件是否缺少依赖或配置
        </div>
      )
    }
    return this.props.children
  }
}

function EffectPreview({ id }) {
  const Demo = demoLoaders[id]
  if (!Demo) {
    return (
      <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
        该组件没有可预览的官方 demo
      </div>
    )
  }
  return (
    <DemoBoundary>
      <Suspense
        fallback={
          <div className="flex min-h-[200px] items-center justify-center text-sm text-gray-500">
            加载中…
          </div>
        }
      >
        <Demo />
      </Suspense>
    </DemoBoundary>
  )
}

const navLinks = ['首页', '组件分享', '关于']

export default function App() {
  const [active, setActive] = useState('首页')

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-[#06080f] text-gray-100">
      {/* Background PixelBlast */}
      <div className="fixed inset-0 z-0 flex items-start justify-center overflow-hidden">
        <div style={{ width: '1080px', height: '1080px', position: 'relative' }}>
          <PixelBlast
            variant="square"
            pixelSize={3}
            color="#3B82F6"
            patternScale={2}
            patternDensity={1}
            enableRipples
            rippleSpeed={0.3}
            rippleThickness={0.1}
            rippleIntensityScale={1}
            speed={0.5}
            transparent
            edgeFade={0.5}
          />
        </div>
      </div>

      {/* 渐晕遮罩，让内容更可读 */}
      <div className="pointer-events-none fixed inset-0 z-0 bg-[radial-gradient(ellipse_at_center,transparent_40%,#06080f_100%)]" />

      <header className="relative z-10 mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-500/20 text-lg">
            <span className="font-bold text-blue-400">&lt;/&gt;</span>
          </div>
          <span className="text-lg font-semibold tracking-tight">前端学习分享站</span>
        </div>
        <nav className="hidden items-center gap-8 sm:flex">
          {navLinks.map((item) => (
            <button
              key={item}
              onClick={() => setActive(item)}
              className={`text-sm transition-colors ${
                active === item
                  ? 'font-medium text-blue-400'
                  : 'text-gray-400 hover:text-gray-200'
              }`}
            >
              {item}
            </button>
          ))}
        </nav>
      </header>

      {/* Hero */}
      <section className="relative z-10 mx-auto max-w-4xl px-6 pt-20 pb-16 text-center sm:pt-28">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-500/10 px-4 py-1.5 text-xs text-blue-300">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-blue-400" />
          记录每一次前端学习与实践
        </div>
        <h1 className="text-4xl font-bold leading-tight tracking-tight sm:text-6xl">
          <EncryptedText
            text="Hello, 我是 "
            revealDelayMs={80}
            revealedClassName="text-white"
            encryptedClassName="text-gray-500"
          />
          <EncryptedText
            text="前端学习者"
            revealDelayMs={80}
            className="text-blue-400"
            revealedClassName="text-blue-400"
            encryptedClassName="text-blue-600/40"
          />
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-base leading-relaxed text-gray-400 sm:text-lg">
          <EncryptedText
            text="这里是我前端学习之路的分享站：记录知识笔记、沉淀组件实践、展示有趣的效果。用代码说话，让每一滴积累都有回响。"
            revealDelayMs={40}
            encryptedClassName="text-gray-600"
            revealedClassName="text-gray-300"
          />
        </p>
        <div className="mt-8 flex items-center justify-center gap-4">
          <a
            href="#effects"
            className="rounded-lg bg-blue-500 px-6 py-3 text-sm font-medium text-white transition hover:bg-blue-400"
          >
            开始浏览
          </a>
          <a
            href="#about"
            className="rounded-lg border border-gray-700 px-6 py-3 text-sm font-medium text-gray-300 transition hover:border-gray-500 hover:text-white"
          >
            了解更多
          </a>
        </div>
      </section>

      {/* 一键添加组件 */}
      <section id="add" className="relative z-10 mx-auto max-w-5xl scroll-mt-20 px-6 pb-24">
        <div className="mb-8 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">添加新效果</h2>
          <p className="mt-3 text-gray-400">
            输入 shadcn 命令，卡片自动生成并出现在下方列表
          </p>
        </div>
        <AddComponentPanel />
      </section>

      {/* 组件效果示例 */}
      <section id="effects" className="relative z-10 mx-auto max-w-5xl scroll-mt-20 px-6 pb-24">
        <div className="mb-12 text-center">
          <h2 className="text-2xl font-bold sm:text-3xl">组件效果示例</h2>
          <p className="mt-3 text-gray-400">
            每个效果都附「可复用代码」与「调用方法」，点击标签页查看
          </p>
        </div>

        <div className="grid gap-10">
          {MANIFEST.map((entry) => (
            <div key={entry.id}>
              <EffectShowcase
                title={entry.title}
                description={entry.description}
                tags={entry.tags || []}
                demo={<EffectPreview id={entry.id} />}
                code={entry.code}
                usage={entry.usage || []}
              />
            </div>
          ))}
        </div>
      </section>

      {/* 关于 */}
      <section id="about" className="relative z-10 mx-auto max-w-4xl scroll-mt-20 px-6 pb-24 text-center">
        <h2 className="text-2xl font-bold sm:text-3xl">关于本站</h2>
        <p className="mx-auto mt-4 max-w-2xl text-gray-400">
          一个前端学习者的分享空间：组件实践、效果源码、学习笔记。
          所有示例均附可复用代码与调用说明，方便直接搬运到自己的项目里。
        </p>
      </section>

      {/* Footer */}
      <footer className="relative z-10 border-t border-white/10 py-8 text-center text-sm text-gray-500">
        © {new Date().getFullYear()} 前端学习分享站 · Powered by
        React + Vite + Three.js
      </footer>
    </div>
  )
}