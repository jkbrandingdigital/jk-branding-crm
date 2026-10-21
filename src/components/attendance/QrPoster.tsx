// src/components/attendance/QrPoster.tsx
//
// The printable QR poster, and the small QR image used on screen.
//
// Needs one package:  npm i qrcode
//
// The encoder is not hand-written on purpose. A QR code carries its own
// error-correction maths (Reed-Solomon), and a mistake there does not show
// up in review — it shows up on a printed poster that no camera will read,
// with twenty-two people queuing at the gate and nothing on screen to say
// why. This is exactly the kind of thing that belongs in a library.

import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

type Props = {
  payload: string          // "JKB:XXXXXXXXXXXXXXXX" — straight from site_qr()
  size?: number
  className?: string
}

/** The code itself, as an <img>. */
export function QrImage({ payload, size = 180, className }: Props) {
  const [url, setUrl] = useState('')
  const [err, setErr] = useState('')

  useEffect(() => {
    let alive = true
    QRCode.toDataURL(payload, {
      // Level Q survives a scuffed or part-covered poster. M is the usual
      // default and is not enough for something taped to a wall by a door.
      errorCorrectionLevel: 'Q',
      margin: 2,              // the quiet zone a reader needs to find the code
      scale: 10,              // big enough to print sharply at A4
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((u) => alive && setUrl(u))
      .catch((e) => alive && setErr(String(e?.message ?? e)))
    return () => {
      alive = false
    }
  }, [payload])

  if (err) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex items-center justify-center rounded border border-red-900 bg-red-950/40 p-2 text-center text-xs text-red-300"
      >
        The code could not be drawn: {err}
      </div>
    )
  }

  if (!url) return <div style={{ width: size, height: size }} className={`animate-pulse rounded bg-[#1f1f1f] ${className ?? ''}`} />

  return (
    <img
      src={url}
      width={size}
      height={size}
      alt="Attendance QR code"
      className={className}
      // Printers and browsers both blur a scaled bitmap by default, and a
      // blurred QR is a slow QR.
      style={{ imageRendering: 'pixelated' }}
    />
  )
}

export type PosterInfo = {
  payload: string
  place: string            // "Rajkot office"
  branch: string           // "Rajkot"
  codeNo: number
  radiusM: number
}

/**
 * Two posters, printed in one go: one for the entrance and one for inside.
 *
 * Two rather than one because people arriving and people leaving queue in
 * different places, and a single poster at the door turns the morning into
 * a line. The second is not a spare — it is the one used at going-home time.
 */
export function PosterSheet({
  info,
  paper,
  onDone,
}: {
  info: PosterInfo
  paper: 'A4' | 'A5'
  onDone: () => void
}) {
  const printed = useRef(false)

  useEffect(() => {
    if (printed.current) return
    printed.current = true
    // One frame, so the QR images are in the DOM before the dialog opens.
    const id = window.setTimeout(() => {
      window.print()
      onDone()
    }, 400)
    return () => window.clearTimeout(id)
  }, [onDone])

  const Poster = ({ where }: { where: string }) => (
    <section className="poster">
      <p className="brand">JK BRANDING</p>
      <h1>Scan here for attendance</h1>
      <p className="where">
        {info.place} · {where}
      </p>

      <div className="code">
        <QrImage payload={info.payload} size={paper === 'A4' ? 420 : 300} />
      </div>

      <ol className="how">
        <li>Open the JK Branding app on your phone</li>
        <li>Tap Scan</li>
        <li>Hold the phone up to this code</li>
      </ol>

      <p className="note">
        Works only inside {info.radiusM} m of {info.place}, with Location switched on, from
        your own approved phone. A photo of this poster will not work.
      </p>
      <p className="foot">
        {info.branch} · code #{info.codeNo}
      </p>
    </section>
  )

  return (
    <div className="poster-sheet">
      <style>{`
        @page { size: ${paper} portrait; margin: 12mm; }

        /* On screen this is only a staging area — the person sees the
           browser's own print preview, not this. */
        .poster-sheet { position: fixed; inset: 0; z-index: -1; opacity: 0; pointer-events: none; }

        @media print {
          /* Hide the app, show the posters. Done by hiding body's children
             rather than by a class on each, so no screen component has to
             know that printing exists. */
          body > *:not(.poster-sheet) { display: none !important; }
          .poster-sheet {
            position: static; opacity: 1; z-index: auto;
            background: #fff; color: #000;
          }
          .poster {
            page-break-after: always; break-after: page;
            display: flex; flex-direction: column; align-items: center;
            justify-content: center; text-align: center;
            height: 100vh; font-family: Arial, Helvetica, sans-serif;
          }
          .poster:last-child { page-break-after: auto; break-after: auto; }
          .brand  { font-size: 13pt; letter-spacing: .22em; color: #FF5E00;
                    font-weight: 700; margin: 0 0 6mm; }
          .poster h1 { font-size: ${paper === 'A4' ? '34pt' : '24pt'}; margin: 0 0 3mm; font-weight: 700; }
          .where  { font-size: ${paper === 'A4' ? '17pt' : '13pt'}; margin: 0 0 8mm; color: #333; }
          .code   { padding: 5mm; border: 1.2mm solid #000; border-radius: 3mm; background: #fff; }
          .how    { margin: 8mm 0 0; padding: 0; list-style: none;
                    font-size: ${paper === 'A4' ? '15pt' : '11pt'}; line-height: 1.8; }
          .how li::before { content: counter(list-item) ".  "; font-weight: 700; }
          .note   { margin: 8mm 14mm 0; font-size: ${paper === 'A4' ? '11pt' : '9pt'};
                    color: #444; line-height: 1.5; }
          .foot   { margin-top: 6mm; font-size: 9pt; color: #777; }
        }
      `}</style>

      <Poster where="Entrance" />
      <Poster where="Inside" />
    </div>
  )
}