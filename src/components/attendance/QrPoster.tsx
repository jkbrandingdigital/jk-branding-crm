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
import { createPortal } from 'react-dom'
import QRCode from 'qrcode'

type Props = {
  payload: string          // the scan link: https://…/scan?c=TOKEN
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

/**
 * Save the code as a PNG file.
 *
 * Printing from the browser is the quick way; a file is the one you can
 * send to a print shop, put in a WhatsApp message, or hand to somebody
 * with a better printer. It is the same image the poster carries.
 */
export async function downloadQr(payload: string, fileName: string) {
  const url = await QRCode.toDataURL(payload, {
    errorCorrectionLevel: 'Q',
    margin: 2,
    scale: 20,              // ~1200px: large enough to print at any size
    color: { dark: '#000000', light: '#FFFFFF' },
  })
  const a = document.createElement('a')
  a.href = url
  a.download = fileName.endsWith('.png') ? fileName : `${fileName}.png`
  document.body.appendChild(a)
  a.click()
  a.remove()
}

export type PosterInfo = {
  payload: string          // the scan link the poster carries
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
 *
 * ── Why this hangs off document.body ──
 *
 * The print rule below hides every child of <body> except the sheet. Left
 * where React puts it, the sheet sits INSIDE <div id="root"> — which is
 * itself a child of body, so the rule hid the root and took the posters
 * down with it. The dialogue opened on a blank page every time, and
 * nothing on screen could explain why: the code was fine, the QR was
 * fine, the paper was empty.
 *
 * A portal puts the sheet where the rule expects it: a real child of
 * body, beside the root rather than inside it.
 *
 * ── And why it waits, without counting ──
 *
 * It used to print on a 400 ms timer and close itself in the same breath.
 * A timer is a guess about how long an image takes to draw, and the guess
 * is wrong on a slow machine — which prints an empty box.
 *
 * The first attempt to fix that counted the codes as they loaded, and was
 * worse: `Poster` is declared inside this function, so every render makes
 * a NEW component type and React throws the subtree away and builds it
 * again. Counting caused a render, the render remounted the images, the
 * images reported in again — and the dialogue never opened at all.
 * ScanSetup carries this exact warning above Fold and Switch; I wrote it
 * there and then walked into it here.
 *
 * So there is nothing to count. The code is drawn ONCE, into one data
 * URL, and the browser is made to load it before React is told about it.
 * By the time the posters render, the image is already in hand.
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
  // The drawn code, or '' until it is ready. One image, both posters.
  const [qr, setQr] = useState('')
  const [err, setErr] = useState('')
  const started = useRef(false)

  // Draw it, then make the browser actually LOAD it before React hears
  // about it. An <img> that has not decoded yet prints as a blank box,
  // and waiting on the element would need a render to wait on.
  useEffect(() => {
    let alive = true
    QRCode.toDataURL(info.payload, {
      errorCorrectionLevel: 'Q',
      margin: 2,
      scale: 10,
      color: { dark: '#000000', light: '#FFFFFF' },
    })
      .then((url) =>
        new Promise<string>((resolve) => {
          const img = new Image()
          img.onload = () => resolve(url)
          img.onerror = () => resolve(url)   // print it and let the paper show
          img.src = url
        }))
      .then((url) => alive && setQr(url))
      .catch((e) => alive && setErr(String(e?.message ?? e)))
    return () => { alive = false }
  }, [info.payload])

  // Open the dialogue once, when there is something to print.
  useEffect(() => {
    if (started.current || (!qr && !err)) return
    started.current = true

    const finish = () => onDone()
    window.addEventListener('afterprint', finish, { once: true })

    // One frame, so the sheet is painted and not merely in the DOM.
    const open = window.setTimeout(() => window.print(), 60)

    // A few browsers never fire afterprint. Without this the staging area
    // would stay mounted for the rest of the session — invisible, but
    // holding the next print open on the same two posters.
    const guard = window.setTimeout(finish, 120000)

    return () => {
      window.clearTimeout(open)
      window.clearTimeout(guard)
      window.removeEventListener('afterprint', finish)
    }
  }, [qr, err, onDone])

  const size = paper === 'A4' ? 420 : 300

  // A plain function, called as poster('Entrance'). NOT a component —
  // see the note above about what a component declared in here does.
  const poster = (where: string) => (
    <section className="poster" key={where}>
      <p className="brand">JK BRANDING</p>
      <h1>Scan here for attendance</h1>
      <p className="where">
        {info.place} · {where}
      </p>

      <div className="code">
        {qr ? (
          <img
            src={qr}
            width={size}
            height={size}
            alt="Attendance QR code"
            style={{ imageRendering: 'pixelated' }}
          />
        ) : (
          <div style={{ width: size, height: size, fontSize: '10pt' }}>
            The code could not be drawn: {err}
          </div>
        )}
      </div>

      <ol className="how">
        <li>Point your phone camera at this code</li>
        <li>Tap the link that appears</li>
        <li>Your attendance is marked</li>
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

  const sheet = (
    <div className="poster-sheet">
      <style>{`
        @page { size: ${paper} portrait; margin: 12mm; }

        /* On screen this is only a staging area — the person sees the
           browser's own print preview, not this. */
        .poster-sheet { position: fixed; inset: 0; z-index: -1; opacity: 0; pointer-events: none; }

        @media print {
          /* Hide the app, show the posters. Done by hiding body's children
             rather than by a class on each, so no screen component has to
             know that printing exists — which only works because the sheet
             is portalled onto body and really is one of those children. */
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

          /* The browser's own header and footer print the page address
             across the top of the poster. Nothing here can remove them —
             that is "Headers and footers" under More settings in the print
             dialogue, and it is remembered after the first time. */
        }
      `}</style>

      {poster('Entrance')}
      {poster('Inside')}
    </div>
  )

  // Beside <div id="root">, not inside it. See the note above.
  return createPortal(sheet, document.body)
}