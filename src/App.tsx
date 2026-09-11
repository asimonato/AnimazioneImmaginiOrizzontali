import { useEffect, useRef, useState } from "react";
import svgPaths from "@/imports/SuMisura/svg-a149wj0gqb";
import r1_1 from "@/imports/SuMisura/row-1_1.jpg";
import r1_2 from "@/imports/SuMisura/row-1_2.jpg";
import r1_3 from "@/imports/SuMisura/row-1_3.jpg";
import r1_4 from "@/imports/SuMisura/row-1_4.jpg";
import r1_5 from "@/imports/SuMisura/row-1_5.jpg";
import r2_1 from "@/imports/SuMisura/row-2_1.jpg";
import r2_2 from "@/imports/SuMisura/row-2_2.jpg";
import r2_3 from "@/imports/SuMisura/row-2_3.jpg";
import r2_4 from "@/imports/SuMisura/row-2_4.jpg";
import r2_5 from "@/imports/SuMisura/row-2_5.jpg";
import r3_1 from "@/imports/SuMisura/row-3_1.jpg";
import r3_2 from "@/imports/SuMisura/row-3_2.jpg";
import r3_3 from "@/imports/SuMisura/row-3_3.jpg";
import r3_4 from "@/imports/SuMisura/row-3_4.jpg";
import r3_5 from "@/imports/SuMisura/row-3_5.jpg";

// ─── Base design values at 1920 px ───────────────────────────────────────────
const BASE_W      = 1920;
const BASE_IMG_H  = 384;
const BASE_ROW1_Y = 121;
const BASE_ROW2_Y = 657;
const BASE_ROW3_Y = 1176;
const BASE_FRAME_H = 1680;
const BASE_GAP13  = 477;
const BASE_GAP2   = 930;
const BASE_MASK_L = 495;   // white-mask left edge
const BASE_VM     = 960;   // horizontal midpoint

// Natural widths at h=384 px (measured from JPEG headers, aspect-ratio exact)
const BASE_R1W = [384, 586, 384, 271, 578];
const BASE_R2W = [578, 384, 271, 578, 384];
const BASE_R3W = [384, 384, 578, 271, 578];

const R1_SRCS = [r1_1, r1_2, r1_3, r1_4, r1_5];
const R2_SRCS = [r2_1, r2_2, r2_3, r2_4, r2_5];
const R3_SRCS = [r3_1, r3_2, r3_3, r3_4, r3_5];

// ─── Physics constants (scale-independent ratios) ────────────────────────────
const FRICTION      = 0.94;
const SCROLL_FACTOR = 0.18; // multiplied by scale at call site
const MAX_VEL_BASE  = 28;   // px at 1920 px; scaled at call site
const LERP_RATE     = 0.10;
const SNAP_DONE_BASE = 0.08; // px at 1920 px; scaled at call site
const WHEEL_IDLE_MS = 220;

// ─── Helpers ─────────────────────────────────────────────────────────────────
interface ImgDef { src: string; w: number }

function wrapN(v: number, p: number) { return ((v % p) + p) % p; }

function shortDelta(cur: number, tgt: number, p: number) {
  const fwd = ((tgt - cur) % p + p) % p;
  return fwd <= p / 2 ? fwd : fwd - p;
}

function nearestSnap(offset: number, snaps: number[], period: number) {
  let best = snaps[0], bestDist = Infinity;
  for (const s of snaps) {
    const d = Math.abs(shortDelta(offset, s, period));
    if (d < bestDist) { bestDist = d; best = s; }
  }
  return best;
}

function stripStarts(imgs: ImgDef[], gap: number) {
  const out = [0];
  for (let i = 1; i < imgs.length; i++) out.push(out[i - 1] + imgs[i - 1].w + gap);
  return out;
}

function safeScale(raw: number) {
  return Math.max(0.15, Math.min(3, isFinite(raw) && raw > 0 ? raw : 1));
}

// ─── Layout — all pixel values derived from scale = viewportW / 1920 ─────────
interface Layout {
  scale: number;
  imgH: number;
  row1Y: number; row2Y: number; row3Y: number;
  frameH: number;
  gap13: number; gap2: number;
  maskL: number; maskW: number;
  r1: ImgDef[]; r2: ImgDef[]; r3: ImgDef[];
  P1: number; P2: number; P3: number;
  SNAPS1: number[]; SNAPS2: number[]; SNAPS3: number[];
  INIT_O1: number; INIT_O2: number; INIT_O3: number;
}

function computeLayout(scale: number): Layout {
  const gap13 = BASE_GAP13 * scale;
  const gap2  = BASE_GAP2  * scale;
  const vm    = BASE_VM    * scale;
  const maskL = BASE_MASK_L * scale;

  const r1 = R1_SRCS.map((src, i) => ({ src, w: BASE_R1W[i] * scale }));
  const r2 = R2_SRCS.map((src, i) => ({ src, w: BASE_R2W[i] * scale }));
  const r3 = R3_SRCS.map((src, i) => ({ src, w: BASE_R3W[i] * scale }));

  const P1 = r1.reduce((s, img) => s + img.w + gap13, 0);
  const P2 = r2.reduce((s, img) => s + img.w + gap2,  0);
  const P3 = r3.reduce((s, img) => s + img.w + gap13, 0);

  const r1s = stripStarts(r1, gap13);
  const r2s = stripStarts(r2, gap2);
  const r3s = stripStarts(r3, gap13);

  // Rows 1 & 3: snap when image centre lands at viewport midpoint vm
  const SNAPS1 = r1s.map((st, i) => wrapN(st + r1[i].w / 2 - vm, P1));
  const SNAPS3 = r3s.map((st, i) => wrapN(st + r3[i].w / 2 - vm, P3));

  // Row 2: snap when left-image right edge sits at maskL
  // (next image left edge automatically lands at maskL + gap2 = maskL + maskW)
  const SNAPS2 = r2s.map((st, i) => wrapN(st + r2[i].w - maskL, P2));

  // Initial offsets: row-1_2 centred, row-3_3 centred, row-2_1 in design position
  const INIT_O1 = SNAPS1[1];
  const INIT_O2 = SNAPS2[0];
  const INIT_O3 = SNAPS3[2];

  return {
    scale,
    imgH:  BASE_IMG_H   * scale,
    row1Y: BASE_ROW1_Y  * scale,
    row2Y: BASE_ROW2_Y  * scale,
    row3Y: BASE_ROW3_Y  * scale,
    frameH: BASE_FRAME_H * scale,
    gap13, gap2,
    maskL, maskW: gap2,
    r1, r2, r3,
    P1, P2, P3,
    SNAPS1, SNAPS2, SNAPS3,
    INIT_O1, INIT_O2, INIT_O3,
  };
}

// ─── Strip ───────────────────────────────────────────────────────────────────
function Strip({ imgs, gap, imgH }: { imgs: ImgDef[]; gap: number; imgH: number }) {
  const period = imgs.reduce((s, img) => s + img.w + gap, 0);
  const reps = period > 0
    ? Math.min(30, Math.max(3, Math.ceil((BASE_W * 2 + period) / period) + 1))
    : 3;
  return (
    <>
      {Array.from({ length: reps }, (_, ri) =>
        imgs.map((img, ii) => (
          <img
            key={`${ri}-${ii}`}
            src={img.src}
            alt=""
            style={{
              width: img.w,
              height: imgH,
              marginRight: gap,
              flexShrink: 0,
              display: "block",
            }}
          />
        ))
      )}
    </>
  );
}

// ─── Text overlay ─────────────────────────────────────────────────────────────
function TextOverlay({ s }: { s: number }) {
  const px = (n: number) => n * s;
  return (
    <div style={{
      position: "absolute",
      top: px(BASE_ROW2_Y), left: px(515),
      width: px(891), height: px(399),
      overflow: "hidden", zIndex: 2, pointerEvents: "none",
    }}>
      <p style={{
        position: "absolute", top: px(16), left: "50%",
        transform: "translateX(-50%)",
        fontFamily: '"Jost", sans-serif',
        fontSize: px(60), lineHeight: `${px(72)}px`,
        fontWeight: 400, color: "#575756",
        textAlign: "center", width: px(889),
        whiteSpace: "pre-wrap", margin: 0,
      }}>
        {"DESIGN \n"}PERSONALIZZATO
      </p>

      <p style={{
        position: "absolute", top: px(186), left: "50%",
        transform: "translateX(-50%)",
        fontFamily: '"Jost", sans-serif',
        fontSize: px(30), lineHeight: `${px(40)}px`,
        fontWeight: 400, color: "#575756",
        textAlign: "center", width: px(890), whiteSpace: "pre-wrap", margin: 0,
      }}>
        {`Progettata dal tuo architetto e ingegnerizzata da Wolf Haus.\nCostruita esattamente come l'hai pensata.`}
      </p>

      <div style={{
        position: "absolute", top: px(347), left: px(314),
        width: px(286), height: px(36),
        display: "flex", alignItems: "center",
        pointerEvents: "auto", cursor: "pointer",
      }}>
        <div style={{ display: "flex", gap: px(8), alignItems: "flex-end", paddingBottom: px(8) }}>
          <div style={{ display: "flex", flexDirection: "column", gap: px(5) }}>
            <span style={{
              fontFamily: '"Jost", sans-serif',
              fontSize: px(30), lineHeight: `${px(40)}px`,
              fontWeight: 400, color: "#575756", whiteSpace: "nowrap",
            }}>
              Hai già un progetto?
            </span>
            <div style={{ height: 1, backgroundColor: "#575756" }} />
          </div>
          <div style={{
            flexShrink: 0, width: px(21.405), height: px(24),
            marginBottom: px(3),
          }}>
            <svg
              width={px(21.9054)} height={px(24.5749)}
              viewBox="0 0 21.9054 24.5749" fill="none"
            >
              <path d="M0 12.2875H21.4054" stroke="#575756" strokeLinejoin="round" />
              <path d={svgPaths.p3734a680} stroke="#575756" strokeLinejoin="round" />
            </svg>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── App ─────────────────────────────────────────────────────────────────────
export default function App() {
  const [scale, setScale] = useState(() => safeScale(window.innerWidth / BASE_W));
  const layoutRef = useRef<Layout>(computeLayout(safeScale(window.innerWidth / BASE_W)));

  const r1El = useRef<HTMLDivElement>(null);
  const r2El = useRef<HTMLDivElement>(null);
  const r3El = useRef<HTMLDivElement>(null);

  const vel        = useRef(0);
  const o1         = useRef(layoutRef.current.INIT_O1);
  const o2         = useRef(layoutRef.current.INIT_O2);
  const o3         = useRef(layoutRef.current.INIT_O3);
  const isSnapping = useRef(false);
  const snap1      = useRef(layoutRef.current.INIT_O1);
  const snap2      = useRef(layoutRef.current.INIT_O2);
  const snap3      = useRef(layoutRef.current.INIT_O3);
  const raf        = useRef<number | null>(null);
  const idleTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const apply = () => {
      if (r1El.current) r1El.current.style.transform = `translateX(${-o1.current}px)`;
      if (r2El.current) r2El.current.style.transform = `translateX(${-o2.current}px)`;
      if (r3El.current) r3El.current.style.transform = `translateX(${-o3.current}px)`;
    };

    apply();

    const snapStep = (o: React.MutableRefObject<number>, tgt: number, p: number) => {
      const d = shortDelta(o.current, tgt, p);
      o.current = wrapN(o.current + d * LERP_RATE, p);
      return d;
    };

    const tick = () => {
      const L = layoutRef.current;

      if (isSnapping.current) {
        const d1 = snapStep(o1, snap1.current, L.P1);
        const d2 = snapStep(o2, snap2.current, L.P2);
        const d3 = snapStep(o3, snap3.current, L.P3);
        const snapDone = SNAP_DONE_BASE * L.scale;
        if (Math.max(Math.abs(d1), Math.abs(d2), Math.abs(d3)) < snapDone) {
          o1.current = snap1.current;
          o2.current = snap2.current;
          o3.current = snap3.current;
          isSnapping.current = false;
          apply();
          raf.current = null;
          return;
        }
        apply();
        raf.current = requestAnimationFrame(tick);
        return;
      }

      vel.current *= FRICTION;
      if (Math.abs(vel.current) < 0.04 * L.scale) {
        vel.current = 0;
        raf.current = null;
        return;
      }
      const v = vel.current;
      o1.current = wrapN(o1.current + v, L.P1);
      o2.current = wrapN(o2.current - v, L.P2);
      o3.current = wrapN(o3.current + v, L.P3);
      apply();
      raf.current = requestAnimationFrame(tick);
    };

    const engageSnap = () => {
      const L = layoutRef.current;
      snap1.current = nearestSnap(o1.current, L.SNAPS1, L.P1);
      snap2.current = nearestSnap(o2.current, L.SNAPS2, L.P2);
      snap3.current = nearestSnap(o3.current, L.SNAPS3, L.P3);
      vel.current = 0;
      isSnapping.current = true;
      if (!raf.current) raf.current = requestAnimationFrame(tick);
    };

    const onWheel = (e: WheelEvent) => {
      isSnapping.current = false;
      const L = layoutRef.current;
      const maxVel = MAX_VEL_BASE * L.scale;
      vel.current = Math.max(
        -maxVel,
        Math.min(maxVel, vel.current + e.deltaY * SCROLL_FACTOR * L.scale),
      );
      if (!raf.current) raf.current = requestAnimationFrame(tick);
      if (idleTimer.current) clearTimeout(idleTimer.current);
      idleTimer.current = setTimeout(engageSnap, WHEEL_IDLE_MS);
    };

    const onResize = () => {
      const newScale = safeScale(window.innerWidth / BASE_W);
      const oldScale = layoutRef.current.scale;
      if (Math.abs(newScale - oldScale) < 0.001) return;

      // Rescale current offsets proportionally so visual position is preserved
      const ratio = newScale / oldScale;
      o1.current *= ratio;
      o2.current *= ratio;
      o3.current *= ratio;
      vel.current *= ratio;

      const newLayout = computeLayout(newScale);
      layoutRef.current = newLayout;

      // If currently snapping, redirect to nearest target in new layout
      if (isSnapping.current) {
        snap1.current = nearestSnap(o1.current, newLayout.SNAPS1, newLayout.P1);
        snap2.current = nearestSnap(o2.current, newLayout.SNAPS2, newLayout.P2);
        snap3.current = nearestSnap(o3.current, newLayout.SNAPS3, newLayout.P3);
      }

      setScale(newScale); // triggers re-render with new layout
    };

    window.addEventListener("wheel", onWheel, { passive: true });
    window.addEventListener("resize", onResize);
    return () => {
      window.removeEventListener("wheel", onWheel);
      window.removeEventListener("resize", onResize);
      if (raf.current) cancelAnimationFrame(raf.current);
      if (idleTimer.current) clearTimeout(idleTimer.current);
    };
  }, []);

  const L = computeLayout(safeScale(scale));

  return (
    <div style={{
      width: "100%",
      height: L.frameH,
      position: "relative",
      backgroundColor: "white",
      overflow: "hidden",
    }}>
      {/* Row 1 — scrolls left on wheel-down */}
      <div style={{
        position: "absolute", top: L.row1Y, left: 0,
        width: "100%", height: L.imgH, overflow: "hidden",
      }}>
        <div ref={r1El} style={{
          position: "absolute", top: 0, left: 0,
          display: "flex", height: L.imgH, willChange: "transform",
        }}>
          <Strip imgs={L.r1} gap={L.gap13} imgH={L.imgH} />
        </div>
      </div>

      {/* Row 2 — scrolls right on wheel-down */}
      <div style={{
        position: "absolute", top: L.row2Y, left: 0,
        width: "100%", height: L.imgH, overflow: "hidden",
      }}>
        <div ref={r2El} style={{
          position: "absolute", top: 0, left: 0,
          display: "flex", height: L.imgH, willChange: "transform",
        }}>
          <Strip imgs={L.r2} gap={L.gap2} imgH={L.imgH} />
        </div>
      </div>

      {/* White mask — covers the text-gap zone in row 2 */}
      <div style={{
        position: "absolute", top: L.row2Y, left: L.maskL,
        width: L.maskW, height: L.imgH,
        backgroundColor: "white", zIndex: 1,
      }} />

      {/* Row 3 — scrolls left on wheel-down */}
      <div style={{
        position: "absolute", top: L.row3Y, left: 0,
        width: "100%", height: L.imgH, overflow: "hidden",
      }}>
        <div ref={r3El} style={{
          position: "absolute", top: 0, left: 0,
          display: "flex", height: L.imgH, willChange: "transform",
        }}>
          <Strip imgs={L.r3} gap={L.gap13} imgH={L.imgH} />
        </div>
      </div>

      <TextOverlay s={scale} />
    </div>
  );
}
