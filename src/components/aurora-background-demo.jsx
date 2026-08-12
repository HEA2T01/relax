import { AuroraBackground } from './ui/aurora-background';

export default function AuroraBackgroundDemo() {
  return (
    <AuroraBackground className="h-80 w-full overflow-hidden" showRadialGradient={false}>
      <div className="px-6 text-center">
        <p className="text-xl font-bold text-white">Aurora Background</p>
        <p className="mt-2 text-sm text-neutral-300">动态极光渐变背景，适合作为 Hero 区块</p>
      </div>
    </AuroraBackground>
  );
}
