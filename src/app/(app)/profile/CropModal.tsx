'use client'

import { useState, useRef, useEffect } from 'react'
import { X, ZoomIn, ZoomOut, Check, Move } from 'lucide-react'

const CIRCLE_SIZE = 240
const CONTAINER = 320
const OUTPUT_PX = 400

type Props = {
  file: File
  onConfirm: (blob: Blob) => void
  onCancel: () => void
}

export default function CropModal({ file, onConfirm, onCancel }: Props) {
  const [imgSrc, setImgSrc] = useState('')
  const [naturalSize, setNaturalSize] = useState({ w: 0, h: 0 })
  const [zoom, setZoom] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const imgRef = useRef<HTMLImageElement>(null)
  const dragging = useRef(false)
  const dragOrigin = useRef({ mx: 0, my: 0, ox: 0, oy: 0 })
  const touchOrigin = useRef({ tx: 0, ty: 0, ox: 0, oy: 0 })

  useEffect(() => {
    const url = URL.createObjectURL(file)
    setImgSrc(url)
    return () => URL.revokeObjectURL(url)
  }, [file])

  function onLoad(e: React.SyntheticEvent<HTMLImageElement>) {
    const { naturalWidth: w, naturalHeight: h } = e.currentTarget
    setNaturalSize({ w, h })
    // Start zoomed to fill the circle
    setZoom(CIRCLE_SIZE / Math.min(w, h))
    setOffset({ x: 0, y: 0 })
  }

  // Mouse drag
  function onMouseDown(e: React.MouseEvent) {
    dragging.current = true
    dragOrigin.current = { mx: e.clientX, my: e.clientY, ox: offset.x, oy: offset.y }
  }

  useEffect(() => {
    function onMove(e: MouseEvent) {
      if (!dragging.current) return
      setOffset({
        x: dragOrigin.current.ox + (e.clientX - dragOrigin.current.mx),
        y: dragOrigin.current.oy + (e.clientY - dragOrigin.current.my),
      })
    }
    function onUp() { dragging.current = false }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp) }
  }, [])

  // Touch drag
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0]
    touchOrigin.current = { tx: t.clientX, ty: t.clientY, ox: offset.x, oy: offset.y }
  }
  function onTouchMove(e: React.TouchEvent) {
    e.preventDefault()
    const t = e.touches[0]
    setOffset({
      x: touchOrigin.current.ox + (t.clientX - touchOrigin.current.tx),
      y: touchOrigin.current.oy + (t.clientY - touchOrigin.current.ty),
    })
  }

  // Scroll-to-zoom on the container
  function onWheel(e: React.WheelEvent) {
    e.preventDefault()
    setZoom(z => Math.max(0.2, Math.min(4, z - e.deltaY * 0.001)))
  }

  function handleConfirm() {
    if (!imgRef.current || !naturalSize.w) return
    const canvas = document.createElement('canvas')
    canvas.width = OUTPUT_PX
    canvas.height = OUTPUT_PX
    const ctx = canvas.getContext('2d')!

    // Clip to circle
    ctx.beginPath()
    ctx.arc(OUTPUT_PX / 2, OUTPUT_PX / 2, OUTPUT_PX / 2, 0, Math.PI * 2)
    ctx.clip()

    // Source region in natural image coordinates
    // The crop circle centre maps to: image centre minus the current offset scaled by zoom
    const srcCX = naturalSize.w / 2 - offset.x / zoom
    const srcCY = naturalSize.h / 2 - offset.y / zoom
    const srcR = (CIRCLE_SIZE / 2) / zoom

    ctx.drawImage(
      imgRef.current,
      srcCX - srcR, srcCY - srcR,
      srcR * 2, srcR * 2,
      0, 0, OUTPUT_PX, OUTPUT_PX,
    )

    canvas.toBlob(blob => { if (blob) onConfirm(blob) }, 'image/jpeg', 0.92)
  }

  const minZoom = naturalSize.w ? CIRCLE_SIZE / Math.min(naturalSize.w, naturalSize.h) * 0.5 : 0.2

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200">
          <h2 className="text-base font-semibold text-slate-900">Crop photo</h2>
          <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 transition-colors"><X size={18} /></button>
        </div>

        <div className="p-5">
          {/* Canvas area */}
          <div
            style={{ width: CONTAINER, height: CONTAINER }}
            className="relative mx-auto overflow-hidden rounded-xl bg-slate-900 cursor-grab active:cursor-grabbing select-none touch-none"
            onMouseDown={onMouseDown}
            onTouchStart={onTouchStart}
            onTouchMove={onTouchMove}
            onWheel={onWheel}
          >
            {imgSrc && (
              <img
                ref={imgRef}
                src={imgSrc}
                onLoad={onLoad}
                draggable={false}
                alt=""
                style={{
                  position: 'absolute',
                  width: naturalSize.w * zoom,
                  height: naturalSize.h * zoom,
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  pointerEvents: 'none',
                  userSelect: 'none',
                }}
              />
            )}

            {/* Dark vignette outside crop circle */}
            <div
              style={{
                position: 'absolute', inset: 0, pointerEvents: 'none',
                background: `radial-gradient(circle ${CIRCLE_SIZE / 2}px at 50% 50%, transparent ${CIRCLE_SIZE / 2 - 1}px, rgba(0,0,0,0.6) ${CIRCLE_SIZE / 2}px)`,
              }}
            />

            {/* Circle guide border */}
            <div
              style={{
                position: 'absolute',
                width: CIRCLE_SIZE, height: CIRCLE_SIZE,
                left: '50%', top: '50%',
                transform: 'translate(-50%, -50%)',
                borderRadius: '50%',
                border: '2px solid rgba(255,255,255,0.75)',
                pointerEvents: 'none',
                boxShadow: '0 0 0 1px rgba(0,0,0,0.3)',
              }}
            />

            {/* Corner rule lines */}
            {[[-1,-1],[1,-1],[-1,1],[1,1]].map(([sx,sy], i) => (
              <div key={i} style={{
                position: 'absolute',
                width: 18, height: 18,
                left: `calc(50% + ${sx * (CIRCLE_SIZE / 2 * 0.707 - 4)}px)`,
                top:  `calc(50% + ${sy * (CIRCLE_SIZE / 2 * 0.707 - 4)}px)`,
                transform: 'translate(-50%, -50%)',
                borderTop:    sy < 0 ? '2px solid rgba(255,255,255,0.9)' : 'none',
                borderBottom: sy > 0 ? '2px solid rgba(255,255,255,0.9)' : 'none',
                borderLeft:   sx < 0 ? '2px solid rgba(255,255,255,0.9)' : 'none',
                borderRight:  sx > 0 ? '2px solid rgba(255,255,255,0.9)' : 'none',
                pointerEvents: 'none',
              }} />
            ))}
          </div>

          {/* Zoom slider */}
          <div className="mt-4 flex items-center gap-2">
            <button onClick={() => setZoom(z => Math.max(minZoom, z - 0.1))} className="text-slate-400 hover:text-slate-700 transition-colors">
              <ZoomOut size={16} />
            </button>
            <input
              type="range" min={minZoom} max={4} step={0.01} value={zoom}
              onChange={e => setZoom(parseFloat(e.target.value))}
              className="flex-1 accent-blue-600 h-1.5"
            />
            <button onClick={() => setZoom(z => Math.min(4, z + 0.1))} className="text-slate-400 hover:text-slate-700 transition-colors">
              <ZoomIn size={16} />
            </button>
          </div>
          <p className="text-center text-xs text-slate-400 mt-1.5 flex items-center justify-center gap-1">
            <Move size={11} />Drag · scroll or slider to zoom
          </p>
        </div>

        <div className="px-5 pb-5 flex gap-2">
          <button
            onClick={handleConfirm}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            <Check size={15} />Apply crop
          </button>
          <button onClick={onCancel} className="px-4 py-2.5 rounded-lg border border-slate-300 text-sm text-slate-600 hover:bg-slate-50 transition-colors">
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
