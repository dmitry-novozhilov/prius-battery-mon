import { useEffect, useRef, useState } from 'preact/hooks';
import { cellColor } from '../ntc';

const T_MIN = 0;
const T_MAX = 50;
const STEP = 5; // candidate ticks every 5°C — 11 candidates total

export function Legend() {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const [visibleStep, setVisibleStep] = useState(STEP);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      const width = entry.contentRect.width;
      // Each label ~ 36px including breathing room.
      const fits = Math.max(2, Math.floor(width / 36));
      // Find a step that yields <= `fits` labels and is a multiple of 5.
      for (const s of [5, 10, 25, 50]) {
        const ticks = Math.floor((T_MAX - T_MIN) / s) + 1;
        if (ticks <= fits) { setVisibleStep(s); return; }
      }
      setVisibleStep(50);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const ticks: number[] = [];
  for (let t = T_MIN; t <= T_MAX; t += visibleStep) ticks.push(t);

  const gradient = Array.from({ length: 11 }, (_, i) => {
    const t = i * 5;
    return `${cellColor(t)} ${i * 10}%`;
  }).join(', ');

  return (
    <div class="legend" ref={wrapRef}>
      <div class="legend-bar" style={{ background: `linear-gradient(to right, ${gradient})` }} />
      <div class="legend-labels">
        {ticks.map((t) => (
          <span style={{ left: `${((t - T_MIN) / (T_MAX - T_MIN)) * 100}%` }}>{t}°</span>
        ))}
      </div>
    </div>
  );
}
