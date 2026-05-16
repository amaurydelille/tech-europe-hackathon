"use client";

import { useRef, useEffect } from "react";

export type WaveMode = "listening" | "thinking" | "ai";

interface Layer {
  color: string;
  ampBase: number;
  freqMult: number;
  speed: number;
  lineWidth: number;
  opacity: number;
  yOff: number;
}

const LAYERS: Record<WaveMode, Layer[]> = {
  listening: [
    { color: "#14110D", ampBase: 28, freqMult: 1.00, speed: 0.0018, lineWidth: 2.0, opacity: 0.95, yOff: 0   },
    { color: "#14110D", ampBase: 22, freqMult: 0.85, speed: 0.0014, lineWidth: 1.5, opacity: 0.60, yOff: 8   },
    { color: "#6B655D", ampBase: 18, freqMult: 1.20, speed: 0.0020, lineWidth: 1.5, opacity: 0.50, yOff: -10 },
    { color: "#B89968", ampBase: 14, freqMult: 1.40, speed: 0.0016, lineWidth: 1.0, opacity: 0.55, yOff: 14  },
  ],
  thinking: [
    { color: "#14110D", ampBase: 7,  freqMult: 1.00, speed: 0.0009, lineWidth: 2.0, opacity: 0.55, yOff: 0   },
    { color: "#14110D", ampBase: 5,  freqMult: 0.85, speed: 0.0007, lineWidth: 1.5, opacity: 0.30, yOff: 8   },
    { color: "#6B655D", ampBase: 4,  freqMult: 1.20, speed: 0.0009, lineWidth: 1.5, opacity: 0.25, yOff: -10 },
    { color: "#B89968", ampBase: 3,  freqMult: 1.40, speed: 0.0008, lineWidth: 1.0, opacity: 0.35, yOff: 14  },
  ],
  ai: [
    { color: "#B89968", ampBase: 24, freqMult: 1.00, speed: 0.0016, lineWidth: 2.0, opacity: 1.00, yOff: 0   },
    { color: "#8E7340", ampBase: 20, freqMult: 0.85, speed: 0.0018, lineWidth: 1.5, opacity: 0.55, yOff: 8   },
    { color: "#C9A86A", ampBase: 14, freqMult: 1.20, speed: 0.0014, lineWidth: 1.5, opacity: 0.40, yOff: -10 },
    { color: "#B89968", ampBase: 10, freqMult: 1.40, speed: 0.0020, lineWidth: 1.0, opacity: 0.30, yOff: 14  },
  ],
};

const H = 160;

export function Waveform({ mode, amplitude = 0.8 }: { mode: WaveMode; amplitude?: number }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phasesRef = useRef([0, 0.8, 1.6, 2.4]);
  const modeRef = useRef(mode);
  const ampRef = useRef(amplitude);

  useEffect(() => { modeRef.current = mode; }, [mode]);
  useEffect(() => { ampRef.current = amplitude; }, [amplitude]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    let W = canvas.offsetWidth || 360;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    const ctx = canvas.getContext("2d")!;
    ctx.scale(dpr, dpr);

    let last = performance.now();
    let raf: number;

    function draw(now: number) {
      const dt = now - last;
      last = now;

      const layers = LAYERS[modeRef.current];
      const phases = phasesRef.current;
      const cy = H / 2;
      // scale amplitude: even at 0, keep a minimum breath
      const audioScale = 0.35 + ampRef.current * 0.65;

      ctx.clearRect(0, 0, W, H);

      layers.forEach((layer, i) => {
        phases[i] += layer.speed * dt;

        const amp = layer.ampBase * audioScale;

        ctx.beginPath();
        ctx.strokeStyle = layer.color;
        ctx.lineWidth = layer.lineWidth;
        ctx.globalAlpha = layer.opacity;
        ctx.lineJoin = "round";
        ctx.lineCap = "round";

        for (let x = 0; x <= W; x += 1) {
          const y =
            cy +
            layer.yOff +
            Math.sin(x * 0.01667 * layer.freqMult + phases[i]) * amp +
            Math.sin(x * 0.04 * layer.freqMult * 1.7 + phases[i]) * amp * 0.25;

          if (x === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }

        ctx.stroke();
        ctx.globalAlpha = 1;
      });

      raf = requestAnimationFrame(draw);
    }

    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ width: "100%", height: H, display: "block" }}
      aria-hidden
    />
  );
}
