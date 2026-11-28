import { useEffect, useState } from 'react';
import { Film } from 'lucide-react';

interface MediaImageProps {
  src?: string;
  fallbackSrc?: string;
  alt: string;
  className?: string;
  fallbackLabel?: string;
  aspectClass?: string;
}

export function MediaImage({
  src,
  fallbackSrc,
  alt,
  className = '',
  fallbackLabel,
  aspectClass = '',
}: MediaImageProps) {
  const [useFallback, setUseFallback] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUseFallback(false);
    setFailed(false);
  }, [src, fallbackSrc]);

  const activeSrc = useFallback ? fallbackSrc : src;

  if (!activeSrc || failed) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-surface-raised text-ink-dim p-2 text-center select-none ${aspectClass} ${className}`}
      >
        <Film className="w-5 h-5 text-ink-faint mb-1 opacity-70" />
        <span className="text-[11px] font-medium leading-tight line-clamp-2 text-ink-dim">
          {fallbackLabel || alt}
        </span>
      </div>
    );
  }

  return (
    <img
      src={activeSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      onLoad={(e) => {
        if (e.currentTarget.naturalWidth <= 2 || e.currentTarget.naturalHeight <= 2) {
          if (!useFallback && fallbackSrc && fallbackSrc !== src) {
            setUseFallback(true);
          } else {
            setFailed(true);
          }
        }
      }}
      onError={() => {
        if (!useFallback && fallbackSrc && fallbackSrc !== src) {
          setUseFallback(true);
        } else {
          setFailed(true);
        }
      }}
      className={className}
    />
  );
}
