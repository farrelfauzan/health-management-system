import { useEffect, useRef, useState } from 'react';

import { BRAND_STATIC_WAVE_PATHS } from '#lib/brand/brand-static-wave-paths';
import type { BrandWaveNoise } from '#lib/brand/brand-wave-noise';
import { BRAND_WAVE_BUNDLES } from '#lib/brand/brand-wave-bundles';
import { buildBrandWavePath } from '#lib/brand/build-brand-wave-path';
import { createBrandWaveNoise } from '#lib/brand/create-brand-wave-noise';
import { sampleBrandWaveHeights } from '#lib/brand/sample-brand-wave-heights';

type MotionState = {
  energy: number;
  from: number;
  target: number;
  startedAt: number;
  duration: number;
  seconds: number;
  lastFrame: number;
};

const RISE_MS = 700;
const SETTLE_MS = 900;
const MAX_FRAME_SECONDS = 0.05;

function easeInOutSine(progress: number): number {
  return -(Math.cos(Math.PI * progress) - 1) / 2;
}

function isReducedMotion(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

function advanceMotion(motion: MotionState, now: number): number {
  const progress = Math.min(1, (now - motion.startedAt) / motion.duration);
  motion.seconds += Math.min(MAX_FRAME_SECONDS, Math.max(0, (now - motion.lastFrame) / 1000));
  motion.lastFrame = now;
  motion.energy = motion.from + (motion.target - motion.from) * easeInOutSine(progress);
  return progress;
}

function buildFramePaths(motion: MotionState, noise: BrandWaveNoise): string[] {
  const heights = sampleBrandWaveHeights(noise, motion.seconds);
  return BRAND_WAVE_BUNDLES.map((bundle, index) =>
    buildBrandWavePath({ bundle, energy: motion.energy, heights: heights[index] }),
  );
}

/**
 * The ribbon paths of a MetaKlinik mark that comes alive while `isListening`:
 * it eases from the calm ring into a softly, randomly bulging wave in 0.7 s,
 * and settles back in 0.9 s once `isListening` turns off. The centre never
 * moves. With reduced motion the mark stays in its calm, static form.
 */
export function useBrandWaveMotion(isListening: boolean): readonly string[] {
  const [paths, setPaths] = useState<readonly string[]>(BRAND_STATIC_WAVE_PATHS);
  const noiseRef = useRef<BrandWaveNoise | null>(null);
  const motionRef = useRef<MotionState>({
    energy: 0,
    from: 0,
    target: 0,
    startedAt: 0,
    duration: RISE_MS,
    seconds: 0,
    lastFrame: 0,
  });
  useEffect(() => {
    const motion = motionRef.current;
    if (isReducedMotion() || (!isListening && motion.energy === 0)) {
      return undefined;
    }
    noiseRef.current ??= createBrandWaveNoise(BRAND_WAVE_BUNDLES.length);
    const noise = noiseRef.current;
    const now = performance.now();
    Object.assign(motion, {
      from: motion.energy,
      target: isListening ? 1 : 0,
      startedAt: now,
      lastFrame: now,
      duration: isListening ? RISE_MS : SETTLE_MS,
    });
    let frame = 0;
    const tick = (time: number): void => {
      const progress = advanceMotion(motion, time);
      if (!isListening && progress === 1) {
        motion.energy = 0;
        setPaths(BRAND_STATIC_WAVE_PATHS);
        return;
      }
      setPaths(buildFramePaths(motion, noise));
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [isListening]);
  return paths;
}
