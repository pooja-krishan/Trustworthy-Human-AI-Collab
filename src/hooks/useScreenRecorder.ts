import { useCallback, useRef, useState } from 'react'

function pickMime(): string | undefined {
  const c = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
  for (const m of c) {
    if (MediaRecorder.isTypeSupported(m)) return m
  }
  return undefined
}

/** Prefer browser-tab capture; the picker still lets the user choose another window if needed. */
function displayMediaConstraints(): DisplayMediaStreamOptions {
  // Chrome supports additional picker hints (preferCurrentTab/selfBrowserSurface/etc.).
  // Keep them as soft hints only; the user can still choose another surface.
  const chromeHints = {
    preferCurrentTab: true,
    selfBrowserSurface: 'include',
    surfaceSwitching: 'include',
    monitorTypeSurfaces: 'exclude',
  } as unknown as DisplayMediaStreamOptions

  return {
    video: {
      displaySurface: 'browser',
    } as MediaTrackConstraints,
    audio: true,
    ...chromeHints,
  }
}

export function useScreenRecorder() {
  const [active, setActive] = useState(false)
  const recRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])

  const start = useCallback(async () => {
    const stream = await navigator.mediaDevices.getDisplayMedia(displayMediaConstraints())
    chunksRef.current = []
    const mime = pickMime()
    const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
    rec.ondataavailable = (e) => {
      if (e.data.size) chunksRef.current.push(e.data)
    }
    rec.start(2000)
    recRef.current = rec
    setActive(true)
  }, [])

  const stop = useCallback((): Promise<Blob> => {
    return new Promise((resolve) => {
      const rec = recRef.current
      if (!rec || rec.state === 'inactive') {
        resolve(new Blob())
        setActive(false)
        return
      }
      rec.addEventListener(
        'stop',
        () => {
          rec.stream.getTracks().forEach((t) => t.stop())
          recRef.current = null
          setActive(false)
          const type = rec.mimeType || 'video/webm'
          resolve(new Blob(chunksRef.current, { type }))
        },
        { once: true },
      )
      rec.stop()
    })
  }, [])

  return { active, start, stop }
}
