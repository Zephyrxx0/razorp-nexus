"use client"

import { useEffect, useRef } from "react"

/**
 * AsciiVitruvian — self-contained ASCII shader that draws Leonardo da Vinci's
 * Vitruvian Man live on an HTML <canvas>.
 * 
 * Defined from signed-distance field math (line segments, circles, bounding square),
 * sampled onto a monospace character grid, and shaded with an ASCII ramp.
 * Active limbs dynamically sweep between the earthly square and celestial circle.
 */

type V2 = readonly [number, number]

const lerp = (a: number, b: number, t: number) => a + (b - a) * t
const lerp2 = (a: V2, b: V2, t: number): V2 => [
  lerp(a[0], b[0], t),
  lerp(a[1], b[1], t),
]
const clamp = (x: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, x))
function smoothstep(e0: number, e1: number, x: number) {
  const t = clamp((x - e0) / (e1 - e0), 0, 1)
  return t * t * (3 - 2 * t)
}

/** Distance from point p to segment a→b in figure units */
function sdSeg(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number
) {
  const pax = px - ax
  const pay = py - ay
  const bax = bx - ax
  const bay = by - ay
  const h = clamp(
    (pax * bax + pay * bay) / (bax * bax + bay * bay || 1e-6),
    0,
    1
  )
  const dx = pax - bax * h
  const dy = pay - bay * h
  return Math.hypot(dx, dy)
}

// Figure geometry in figure units (navel at origin, +y up, circle R≈1)
const PELVIS: V2 = [0, -0.2]
const NECK: V2 = [0, 0.52]
const SHOULDER_L: V2 = [-0.17, 0.48]
const SHOULDER_R: V2 = [0.17, 0.48]
const HEAD_C: V2 = [0, 0.72]
const HEAD_R = 0.145

// Arm fingertips — pose A: horizontal (square); pose B: raised (circle).
const ARM_A_L: V2 = [-0.95, 0.48]
const ARM_A_R: V2 = [0.95, 0.48]
const ARM_B_L: V2 = [-0.5, 0.87]
const ARM_B_R: V2 = [0.5, 0.87]

// Leg toes — pose A: vertical (square bottom); pose B: spread (circle arc).
const LEG_A_L: V2 = [-0.1, -1.0]
const LEG_A_R: V2 = [0.1, -1.0]
const LEG_B_L: V2 = [-0.46, -0.9]
const LEG_B_R: V2 = [0.46, -0.9]

// Square (earthly frame)
const SQ_X = 0.92
const SQ_TOP = 0.84
const SQ_BOT = -1.0

const RAMP_BRIGHT = " .:-=+*#%@"
const RAMP_DIM = " .:-=+"
const STAR_CHARS = "."
const STAR_BRIGHT = "+"

export interface AsciiVitruvianProps {
  className?: string
  /** Multiplies animation speed (0 ≈ frozen). Default 1 */
  speed?: number
  /** Color theme for ASCII glyphs */
  theme?: "white" | "emerald"
}

export default function AsciiVitruvian({
  className,
  speed = 1,
  theme = "white",
}: AsciiVitruvianProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  useEffect(() => {
    if (!canvasRef.current) return
    const view: HTMLCanvasElement = canvasRef.current
    const ctx2d = view.getContext("2d", { alpha: true })
    if (!ctx2d) return
    const g: CanvasRenderingContext2D = ctx2d

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches

    let raf = 0
    let cols = 0
    let rows = 0
    let cellW = 0
    let cellH = 0
    let fontSize = 14
    let W = 0
    let H = 0

    let starRow: string[] = []
    let ghostRow: string[] = []
    let brightRow: string[] = []

    const dpr = () => Math.min(2, window.devicePixelRatio || 1)

    function resize() {
      const parent = view.parentElement
      W = parent?.clientWidth || window.innerWidth
      H = parent?.clientHeight || window.innerHeight
      const ratio = dpr()
      view.width = Math.floor(W * ratio)
      view.height = Math.floor(H * ratio)
      view.style.width = `${W}px`
      view.style.height = `${H}px`
      g.setTransform(ratio, 0, 0, ratio, 0, 0)

      fontSize = clamp(Math.round(Math.min(W, H) / 46), 9, 16)
      cellW = fontSize * 0.6
      cellH = fontSize * 1.06
      cols = Math.ceil(W / cellW)
      rows = Math.ceil(H / cellH)
      g.font = `${fontSize}px "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`
      g.textBaseline = "top"
      starRow = new Array(rows).fill("")
      ghostRow = new Array(rows).fill("")
      brightRow = new Array(rows).fill("")
    }

    function hash(c: number, r: number) {
      const s = Math.sin(c * 127.1 + r * 311.7) * 43758.5453
      return s - Math.floor(s)
    }

    function frame(now: number) {
      const t = reduced ? 6.0 : (now / 1000) * speed

      // Animation drivers
      const m = 0.5 - 0.5 * Math.cos(t * 0.55) // limb morph: square ⇄ circle
      const RC = 1 + (reduced ? 0 : 0.02 * Math.sin(t * 0.9)) // breathing circle
      const scanY = reduced ? 2 : 1.05 - ((t * 0.12) % 1.0) * 2.4 // shimmer sweep

      // Positioning navel slightly right-of-centre and above midline for balanced hero
      const S = H * 0.36
      const figCx = W * 0.58
      const figCy = H * 0.48
      const strokeBright = cellH * 0.7
      const strokeGhost = cellH * 0.46
      const ring = cellH * 0.55

      // Active bright limbs
      const aL = lerp2(ARM_A_L, ARM_B_L, m)
      const aR = lerp2(ARM_A_R, ARM_B_R, m)
      const lL = lerp2(LEG_A_L, LEG_B_L, m)
      const lR = lerp2(LEG_A_R, LEG_B_R, m)

      // Bright segments: spine, shoulders, arms, legs
      const bseg: number[] = [
        PELVIS[0], PELVIS[1], NECK[0], NECK[1],
        SHOULDER_L[0], SHOULDER_L[1], SHOULDER_R[0], SHOULDER_R[1],
        SHOULDER_L[0], SHOULDER_L[1], aL[0], aL[1],
        SHOULDER_R[0], SHOULDER_R[1], aR[0], aR[1],
        PELVIS[0], PELVIS[1], lL[0], lL[1],
        PELVIS[0], PELVIS[1], lR[0], lR[1],
      ]

      // Ghost segments: extreme poses + bounding square
      const gseg: number[] = [
        SHOULDER_L[0], SHOULDER_L[1], ARM_A_L[0], ARM_A_L[1],
        SHOULDER_R[0], SHOULDER_R[1], ARM_A_R[0], ARM_A_R[1],
        SHOULDER_L[0], SHOULDER_L[1], ARM_B_L[0], ARM_B_L[1],
        SHOULDER_R[0], SHOULDER_R[1], ARM_B_R[0], ARM_B_R[1],
        PELVIS[0], PELVIS[1], LEG_A_L[0], LEG_A_L[1],
        PELVIS[0], PELVIS[1], LEG_A_R[0], LEG_A_R[1],
        PELVIS[0], PELVIS[1], LEG_B_L[0], LEG_B_L[1],
        PELVIS[0], PELVIS[1], LEG_B_R[0], LEG_B_R[1],
        // square boundary
        -SQ_X, SQ_TOP, SQ_X, SQ_TOP,
        -SQ_X, SQ_BOT, SQ_X, SQ_BOT,
        -SQ_X, SQ_BOT, -SQ_X, SQ_TOP,
        SQ_X, SQ_BOT, SQ_X, SQ_TOP,
      ]

      for (let r = 0; r < rows; r++) {
        const fy = (figCy - (r * cellH + cellH * 0.5)) / S
        let star = ""
        let ghost = ""
        let bright = ""
        for (let c = 0; c < cols; c++) {
          const fx = (c * cellW + cellW * 0.5 - figCx) / S

          // Bright field
          let db = 1e9
          for (let i = 0; i < bseg.length; i += 4) {
            const d = sdSeg(fx, fy, bseg[i], bseg[i + 1], bseg[i + 2], bseg[i + 3])
            if (d < db) db = d
          }
          const dHead = Math.abs(Math.hypot(fx - HEAD_C[0], fy - HEAD_C[1]) - HEAD_R)
          if (dHead < db) db = dHead

          let brightI = 1 - smoothstep(0, strokeBright / S, db)
          if (brightI > 0.05) {
            brightI = clamp(
              brightI + 0.45 * Math.exp(-((fy - scanY) * (fy - scanY)) / 0.012),
              0,
              1
            )
          }

          if (brightI > 0.16) {
            const idx = clamp(
              Math.floor(brightI ** 1.2 * RAMP_BRIGHT.length),
              1,
              RAMP_BRIGHT.length - 1
            )
            bright += RAMP_BRIGHT[idx]
            ghost += " "
            star += " "
            continue
          }
          bright += " "

          // Ghost construction field
          let dg = 1e9
          for (let i = 0; i < gseg.length; i += 4) {
            const d = sdSeg(fx, fy, gseg[i], gseg[i + 1], gseg[i + 2], gseg[i + 3])
            if (d < dg) dg = d
          }
          const dCircle = Math.abs(Math.hypot(fx, fy) - RC)
          const ghostI = Math.max(
            1 - smoothstep(0, strokeGhost / S, dg),
            1 - smoothstep(0, ring / S, dCircle)
          )
          if (ghostI > 0.16) {
            const idx = clamp(
              Math.floor(ghostI * RAMP_DIM.length),
              1,
              RAMP_DIM.length - 1
            )
            ghost += RAMP_DIM[idx]
            star += " "
            continue
          }
          ghost += " "

          // Star field
          const h = hash(c, r)
          if (h > 0.985) {
            const tw = 0.5 + 0.5 * Math.sin(t * 2.2 + h * 40)
            star += tw > 0.78 ? STAR_BRIGHT : tw > 0.4 ? STAR_CHARS : " "
          } else {
            star += " "
          }
        }
        starRow[r] = star
        ghostRow[r] = ghost
        brightRow[r] = bright
      }

      g.clearRect(0, 0, W, H)

      if (theme === "emerald") {
        g.fillStyle = "rgba(110, 231, 183, 0.22)"
        for (let r = 0; r < rows; r++) g.fillText(starRow[r], 0, r * cellH)
        g.fillStyle = "rgba(16, 185, 129, 0.48)"
        for (let r = 0; r < rows; r++) g.fillText(ghostRow[r], 0, r * cellH)
        g.fillStyle = "rgba(52, 211, 153, 0.95)"
        for (let r = 0; r < rows; r++) g.fillText(brightRow[r], 0, r * cellH)
      } else {
        g.fillStyle = "rgba(255, 255, 255, 0.22)"
        for (let r = 0; r < rows; r++) g.fillText(starRow[r], 0, r * cellH)
        g.fillStyle = "rgba(255, 255, 255, 0.5)"
        for (let r = 0; r < rows; r++) g.fillText(ghostRow[r], 0, r * cellH)
        g.fillStyle = "rgba(255, 255, 255, 0.96)"
        for (let r = 0; r < rows; r++) g.fillText(brightRow[r], 0, r * cellH)
      }

      if (!reduced) raf = requestAnimationFrame(frame)
    }

    resize()
    const ro = new ResizeObserver(() => resize())
    if (view.parentElement) ro.observe(view.parentElement)
    window.addEventListener("resize", resize)

    if (reduced) {
      frame(0)
    } else {
      raf = requestAnimationFrame(frame)
    }

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      window.removeEventListener("resize", resize)
    }
  }, [speed, theme])

  return (
    <canvas
      ref={canvasRef}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    />
  )
}

