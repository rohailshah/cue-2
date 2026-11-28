import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Flashlight, Loader2, ScanBarcode, X } from 'lucide-react';
import { extractIsbnFromInput } from '../services/mediaApi';
import { useModalBackHandler } from '../store/useCueStore';

interface IsbnScannerModalProps {
  open: boolean;
  onClose: () => void;
  onDetected: (isbn13: string) => void;
}

interface NativeBarcodeDetector {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
}

interface NativeBarcodeDetectorCtor {
  new (opts?: { formats?: string[] }): NativeBarcodeDetector;
  getSupportedFormats?: () => Promise<string[]>;
}

export function IsbnScannerModal({ open, onClose, onDetected }: IsbnScannerModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const zxingControlsRef = useRef<{ stop: () => void } | null>(null);
  const rafRef = useRef<number | null>(null);
  const detectedRef = useRef(false);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  const onDetectedRef = useRef(onDetected);
  onDetectedRef.current = onDetected;

  const [cameraState, setCameraState] = useState<'starting' | 'active' | 'error'>('starting');
  const [cameraMessage, setCameraMessage] = useState('');
  const [hint, setHint] = useState('');
  const [torchSupported, setTorchSupported] = useState(false);
  const [torchOn, setTorchOn] = useState(false);
  const [manualIsbn, setManualIsbn] = useState('');
  const [manualError, setManualError] = useState('');

  const stopCamera = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      zxingControlsRef.current?.stop();
    } catch {
      // ignore stop errors
    }
    zxingControlsRef.current = null;
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        try {
          track.stop();
        } catch {
          // ignore
        }
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setTorchOn(false);
    setTorchSupported(false);
  }, []);

  const handleClose = useCallback(() => {
    stopCamera();
    onCloseRef.current();
  }, [stopCamera]);

  useModalBackHandler(open, handleClose);

  const handleDecodedValue = useCallback(
    (rawValue: string) => {
      if (detectedRef.current) return;
      const isbn13 = extractIsbnFromInput(rawValue);
      if (isbn13) {
        detectedRef.current = true;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(40);
          } catch {
            // ignore
          }
        }
        stopCamera();
        onDetectedRef.current(isbn13);
      } else {
        setHint('Hold over the 978 / 979 ISBN barcode on the back cover.');
      }
    },
    [stopCamera]
  );

  useEffect(() => {
    if (!open) {
      stopCamera();
      return;
    }

    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') handleClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, handleClose, stopCamera]);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    let acquiredStream: MediaStream | null = null;
    const stopAcquired = () => {
      if (acquiredStream) {
        for (const track of acquiredStream.getTracks()) {
          try {
            track.stop();
          } catch {
            // ignore
          }
        }
        acquiredStream = null;
      }
    };

    detectedRef.current = false;
    setCameraState('starting');
    setCameraMessage('');
    setHint('');
    setManualError('');

    const startScanner = async () => {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if (!cancelled) {
          setCameraState('error');
          setCameraMessage('Camera scanning requires HTTPS or a mobile device camera.');
        }
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: 'environment' },
            width: { ideal: 1280 },
            height: { ideal: 720 },
          },
          audio: false,
        });
        acquiredStream = stream;

        if (cancelled) {
          stopAcquired();
          return;
        }

        streamRef.current = stream;
        const videoEl = videoRef.current;
        if (!videoEl) {
          stopCamera();
          stopAcquired();
          return;
        }

        videoEl.srcObject = stream;
        await videoEl.play().catch(() => undefined);
        if (cancelled) {
          stopCamera();
          stopAcquired();
          return;
        }

        const videoTrack = stream.getVideoTracks()[0];
        const caps = videoTrack?.getCapabilities?.() as { torch?: boolean } | undefined;
        setTorchSupported(Boolean(caps?.torch));
        setCameraState('active');

        const winWithDetector = window as Window & {
          BarcodeDetector?: NativeBarcodeDetectorCtor;
        };
        const DetectorCtor = winWithDetector.BarcodeDetector;
        let useNative = false;
        if (DetectorCtor) {
          try {
            const formats = DetectorCtor.getSupportedFormats
              ? await DetectorCtor.getSupportedFormats()
              : ['ean_13'];
            useNative = formats.includes('ean_13');
          } catch {
            useNative = false;
          }
        }
        if (cancelled) {
          stopCamera();
          stopAcquired();
          return;
        }

        if (useNative && DetectorCtor) {
          const detector = new DetectorCtor({
            formats: ['ean_13', 'ean_8', 'upc_a', 'code_128'],
          });
          let lastScanAt = 0;
          const tick = async (ts: number) => {
            if (cancelled || detectedRef.current) return;
            if (ts - lastScanAt >= 180 && videoEl.readyState >= 2) {
              lastScanAt = ts;
              try {
                const codes = await detector.detect(videoEl);
                for (const code of codes) {
                  if (code.rawValue) {
                    handleDecodedValue(code.rawValue);
                    if (detectedRef.current) return;
                  }
                }
              } catch {
                // keep scanning
              }
            }
            rafRef.current = requestAnimationFrame(tick);
          };
          rafRef.current = requestAnimationFrame(tick);
          return;
        }

        const { BrowserMultiFormatReader } = await import('@zxing/browser');
        if (cancelled) {
          stopCamera();
          stopAcquired();
          return;
        }
        const reader = new BrowserMultiFormatReader();
        const controls = await reader.decodeFromStream(stream, videoEl, (result) => {
          if (cancelled || detectedRef.current) return;
          if (result) {
            handleDecodedValue(result.getText());
          }
        });
        if (cancelled) {
          controls.stop();
          stopCamera();
          stopAcquired();
        } else {
          zxingControlsRef.current = controls;
        }
      } catch (err) {
        stopAcquired();
        stopCamera();
        if (cancelled) return;
        const msg = err instanceof Error ? err.message : '';
        setCameraState('error');
        setCameraMessage(
          /permission|denied|notallowed/i.test(msg)
            ? 'Camera permission was denied. Allow camera access or enter the ISBN below.'
            : 'No camera detected here — you can still type or paste an ISBN below.'
        );
      }
    };

    startScanner();
    return () => {
      cancelled = true;
      stopAcquired();
      stopCamera();
    };
  }, [open, stopCamera]);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const next = !torchOn;
    try {
      await track.applyConstraints({
        advanced: [{ torch: next } as MediaTrackConstraintSet],
      });
      setTorchOn(next);
    } catch {
      setTorchSupported(false);
    }
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const isbn13 = extractIsbnFromInput(manualIsbn);
    if (!isbn13) {
      setManualError('Enter a valid 10- or 13-digit ISBN (books/manga/TPBs).');
      return;
    }
    setManualError('');
    stopCamera();
    onDetected(isbn13);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Scan ISBN barcode"
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleClose}
    >
      <div
        className="w-full max-w-md rounded-[24px] bg-[#161920] border border-white/10 overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.06]">
          <div className="flex items-center gap-2">
            <ScanBarcode className="w-4 h-4 text-read" />
            <h2 className="font-display font-bold text-base text-ink">Scan Book or Comic ISBN</h2>
          </div>
          <div className="flex items-center gap-1.5">
            {torchSupported && (
              <button
                type="button"
                onClick={toggleTorch}
                aria-label={torchOn ? 'Turn off flashlight' : 'Turn on flashlight'}
                className={`h-8 w-8 rounded-full border flex items-center justify-center transition-colors ${
                  torchOn
                    ? 'border-read bg-read/20 text-read'
                    : 'border-white/15 bg-surface text-ink-dim hover:text-ink'
                }`}
              >
                <Flashlight className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={handleClose}
              aria-label="Close scanner"
              className="h-8 w-8 rounded-full bg-surface border border-white/10 flex items-center justify-center text-ink-dim hover:text-ink"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="relative aspect-[4/3] bg-[#0B0D11] overflow-hidden flex items-center justify-center">
          <video
            ref={videoRef}
            playsInline
            muted
            className={`w-full h-full object-cover ${cameraState === 'active' ? 'opacity-100' : 'opacity-0'}`}
          />

          {cameraState === 'starting' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-ink-dim px-6 text-center">
              <Loader2 className="w-6 h-6 text-brand animate-spin" />
              <p className="text-xs">Starting rear camera…</p>
            </div>
          )}

          {cameraState === 'active' && (
            <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-8">
              <div className="w-full max-w-[260px] h-[116px] rounded-2xl border-2 border-read/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.42)]" />
              <p className="mt-4 text-[11px] font-medium text-white bg-black/75 px-3 py-1 rounded-full">
                {hint || 'Align the ISBN barcode inside the frame'}
              </p>
            </div>
          )}

          {cameraState === 'error' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-center px-6">
              <div className="h-11 w-11 rounded-full bg-surface border border-white/10 flex items-center justify-center text-ink-dim">
                <Camera className="w-5 h-5" />
              </div>
              <p className="text-xs text-ink-dim leading-relaxed max-w-xs">{cameraMessage}</p>
            </div>
          )}
        </div>

        <form onSubmit={handleManualSubmit} className="p-4 space-y-2 border-t border-white/[0.06]">
          <label htmlFor="manual-isbn-input" className="block text-[11px] font-semibold uppercase tracking-wider text-ink-dim">
            Or enter ISBN manually
          </label>
          <div className="flex items-center gap-2">
            <input
              id="manual-isbn-input"
              type="text"
              inputMode="text"
              value={manualIsbn}
              onChange={(e) => {
                setManualIsbn(e.target.value);
                if (manualError) setManualError('');
              }}
              placeholder="978-1-77952-711-0"
              className="flex-1 h-10 rounded-xl bg-surface border border-white/10 px-3 text-sm text-ink placeholder:text-ink-faint outline-none focus:border-brand"
            />
            <button
              type="submit"
              className="h-10 px-4 rounded-xl bg-brand text-brand-ink text-xs font-semibold shrink-0 hover:opacity-95 transition-opacity"
            >
              Look up
            </button>
          </div>
          {manualError && <p className="text-xs text-red-400">{manualError}</p>}
        </form>
      </div>
    </div>
  );
}
