import { useEffect, useRef, useState } from "react";

/* =========================================================================
   LivePerception — connects to the UPE FastAPI YOLO backend over WebSocket
   and renders the real video frame + real detection boxes on a canvas.

   Backend:  uvicorn main:app --port 8000   (see upe-backend/)
   Stream:   ws://localhost:8000/ws/perception
   ========================================================================= */

const C = { mint: "#4ff0c0", cyan: "#3fd0ff", amber: "#ffb648", red: "#ff5470", violet: "#c08bff" };

interface Det { id: number | null; label: string; conf: number; cx: number; cy: number; w: number; h: number; tone: "ok" | "warn" | "danger"; }
interface Frame { type: string; frame: number; fps: number; jpeg: string | null; detections: Det[]; risk: "LOW" | "MEDIUM" | "HIGH"; counts: Record<string, number>; backend: string; }

const tone = (t: Det["tone"]) => (t === "ok" ? C.mint : t === "warn" ? C.amber : C.red);

function useLiveFeed(url: string) {
  const [connected, setConnected] = useState(false);
  const latest = useRef<Frame | null>(null);
  const [meta, setMeta] = useState<{ fps: number; risk: Frame["risk"]; counts: Record<string, number>; backend: string; frame: number }>({ fps: 0, risk: "LOW", counts: {}, backend: "–", frame: 0 });
  useEffect(() => {
    let ws: WebSocket | null = null, stop = false, retry: number;
    const connect = () => {
      try { ws = new WebSocket(url); } catch { return; }
      ws.onopen = () => setConnected(true);
      ws.onmessage = (e) => {
        const d: Frame = JSON.parse(e.data);
        if (d.type === "frame") { latest.current = d; setMeta({ fps: d.fps, risk: d.risk, counts: d.counts, backend: d.backend, frame: d.frame }); }
      };
      ws.onclose = () => { setConnected(false); if (!stop) retry = window.setTimeout(connect, 1500); };
      ws.onerror = () => ws && ws.close();
    };
    connect();
    return () => { stop = true; clearTimeout(retry); ws && ws.close(); };
  }, [url]);
  return { connected, latest, meta };
}

/* default order: explicit prop → Vite env var → localhost */
const DEFAULT_WS =
  (import.meta as any)?.env?.VITE_UPE_WS ||
  "ws://localhost:8000/ws/perception";

export default function LivePerception({ url }: { url?: string }) {
  const [wsUrl, setWsUrl] = useState(url || DEFAULT_WS);
  const [draft, setDraft] = useState(wsUrl);
  const { connected, latest, meta } = useLiveFeed(wsUrl);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const lastJpeg = useRef<string | null>(null);

  const isHttps = typeof window !== "undefined" && window.location.protocol === "https:";
  const insecure = isHttps && wsUrl.startsWith("ws://"); // mixed-content will be blocked

  useEffect(() => {
    const cv = canvasRef.current; if (!cv) return;
    const ctx = cv.getContext("2d")!;
    let raf = 0;
    const draw = () => {
      const W = cv.width, H = cv.height;
      const f = latest.current;
      // paint frame jpeg if present
      if (f?.jpeg && f.jpeg !== lastJpeg.current) {
        lastJpeg.current = f.jpeg;
        const im = new Image();
        im.onload = () => { imgRef.current = im; };
        im.src = `data:image/jpeg;base64,${f.jpeg}`;
      }
      ctx.fillStyle = "#05080d"; ctx.fillRect(0, 0, W, H);
      if (imgRef.current) ctx.drawImage(imgRef.current, 0, 0, W, H);
      // boxes (normalised → canvas)
      f?.detections?.forEach((d) => {
        const x = (d.cx - d.w / 2) * W, y = (d.cy - d.h / 2) * H, w = d.w * W, h = d.h * H;
        const col = tone(d.tone);
        ctx.strokeStyle = col; ctx.lineWidth = 2; ctx.strokeRect(x, y, w, h);
        const label = `${d.label}${d.id != null ? ` #${d.id}` : ""} ${(d.conf * 100) | 0}%`;
        ctx.font = "600 11px ui-monospace, monospace";
        const tw = ctx.measureText(label).width + 8;
        ctx.fillStyle = col; ctx.fillRect(x, y - 14, tw, 13);
        ctx.fillStyle = "#04121b"; ctx.fillText(label, x + 4, y - 4);
      });
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [latest]);

  const riskColor = meta.risk === "HIGH" ? C.red : meta.risk === "MEDIUM" ? C.amber : C.mint;
  const real = meta.backend.startsWith("yolo");

  return (
    <div className="w-full">
      {/* connection control */}
      <div className="flex flex-wrap items-center gap-2 mb-3">
        <span className="text-[10px] uppercase tracking-[0.18em] text-slate-500 shrink-0">Backend</span>
        <input value={draft} onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") setWsUrl(draft.trim()); }}
          placeholder="ws://localhost:8000/ws/perception"
          className="flex-1 min-w-[220px] bg-[#0a141b] border border-[#1d3444] rounded-lg px-3 py-1.5 text-[11px] font-mono text-slate-200 outline-none focus:border-[#4ff0c0]" />
        <button onClick={() => setWsUrl(draft.trim())}
          className="px-4 py-1.5 rounded-lg text-[11px] font-bold" style={{ background: C.mint, color: "#04121b" }}>Connect</button>
      </div>
      {insecure && (
        <div className="mb-3 px-3 py-2 rounded-lg text-[11px] font-mono border" style={{ borderColor: C.amber + "55", color: C.amber, background: C.amber + "12" }}>
          ⚠ This page is HTTPS but the backend URL is <code>ws://</code>. Browsers block that (mixed content).
          Use a <code>wss://</code> backend (e.g. Render/Railway), or run the frontend locally over http.
        </div>
      )}
      <div className="relative rounded-2xl overflow-hidden border bg-black" style={{ aspectRatio: "16/9", borderColor: connected ? "#16303f" : C.red + "66", boxShadow: `0 0 50px ${C.mint}1a` }}>
        <canvas ref={canvasRef} width={880} height={495} className="block w-full h-full" />
        {/* HUD */}
        <div className="absolute top-3 left-3 flex flex-col gap-1.5 pointer-events-none">
          <span className="px-2.5 py-1 rounded-md font-mono text-[10px] border flex items-center gap-1.5" style={{ color: connected ? C.mint : C.red, borderColor: (connected ? C.mint : C.red) + "44", background: (connected ? C.mint : C.red) + "12" }}>
            <span className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: connected ? C.mint : C.red }} />{connected ? "LIVE · CONNECTED" : "DISCONNECTED"}
          </span>
          <span className="px-2.5 py-1 rounded-md font-mono text-[10px] border" style={{ color: real ? C.mint : C.amber, borderColor: (real ? C.mint : C.amber) + "44", background: (real ? C.mint : C.amber) + "12" }}>
            {real ? `YOLO LIVE · ${meta.backend.split(":")[1] || ""}` : "BACKEND: " + meta.backend}
          </span>
        </div>
        <div className="absolute top-3 right-3 flex flex-col items-end gap-1.5 pointer-events-none font-mono text-[10px]">
          <span className="px-2.5 py-1 rounded-md border" style={{ color: C.cyan, borderColor: C.cyan + "44", background: C.cyan + "12" }}>FRAME {String(meta.frame).padStart(4, "0")}</span>
          <span className="px-2.5 py-1 rounded-md border" style={{ color: C.mint, borderColor: C.mint + "44", background: C.mint + "12" }}>FPS {meta.fps}</span>
          <span className="px-2.5 py-1 rounded-md border" style={{ color: riskColor, borderColor: riskColor + "44", background: riskColor + "12" }}>RISK: {meta.risk}</span>
        </div>
        {!connected && (
          <div className="absolute inset-0 grid place-items-center bg-black/70">
            <div className="text-center">
              <div className="font-mono text-sm tracking-widest mb-2" style={{ color: C.red }}>BACKEND NOT REACHABLE</div>
              <div className="font-mono text-[11px] text-slate-400">start it with:</div>
              <code className="mt-1 inline-block px-3 py-1.5 rounded bg-black/60 border border-[#1d3444] text-[11px]" style={{ color: C.mint }}>cd upe-backend &amp;&amp; uvicorn main:app --port 8000</code>
            </div>
          </div>
        )}
      </div>
      {/* counts */}
      <div className="flex flex-wrap gap-2 mt-3">
        {Object.entries(meta.counts).map(([k, v]) => (
          <span key={k} className="px-3 py-1.5 rounded-lg font-mono text-[11px] border border-[#16303f] bg-black/40 text-slate-300">{k}: <span style={{ color: C.cyan }}>{v}</span></span>
        ))}
        {Object.keys(meta.counts).length === 0 && <span className="text-xs text-slate-600 italic">no detections yet</span>}
      </div>
      <div className="mt-2 text-[11px] text-slate-500">
        Real-time stream from the YOLOv8 backend. When the backend loads COCO weights, detections are live model output;
        PPE classes require custom-trained weights (set <code className="text-slate-400">UPE_WEIGHTS</code>).
      </div>
    </div>
  );
}
