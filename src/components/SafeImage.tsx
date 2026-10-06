import { useState } from 'react';

interface SafeImageProps {
  src: string;
  alt: string;
  className?: string;
  draggable?: boolean;
}

/** 生成建筑线稿风格的 SVG 占位图 data URI */
export function placeholderSvg(label: string, seedKey = ''): string {
  const hue = seedKey.charCodeAt(0) ?? 0;
  const shift = hue % 3;
  const shapes = [
    `<rect x="70" y="95" width="90" height="130" fill="none" stroke="#9a9384" stroke-width="2"/><rect x="105" y="140" width="120" height="85" fill="none" stroke="#b3ab98" stroke-width="2"/>`,
    `<path d="M60 220 L130 120 L200 220 Z" fill="none" stroke="#9a9384" stroke-width="2"/><rect x="150" y="130" width="70" height="90" fill="none" stroke="#b3ab98" stroke-width="2"/>`,
    `<circle cx="120" cy="130" r="48" fill="none" stroke="#9a9384" stroke-width="2"/><rect x="140" y="140" width="100" height="80" fill="none" stroke="#b3ab98" stroke-width="2"/>`,
  ];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="240" viewBox="0 0 300 240">
  <rect width="300" height="240" fill="#EFECE5"/>
  ${shapes[shift]}
  <line x1="40" y1="225" x2="260" y2="225" stroke="#c4bdac" stroke-width="1.5"/>
  <text x="150" y="205" text-anchor="middle" font-family="sans-serif" font-size="13" fill="#8b877e">${label}</text>
</svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export default function SafeImage({
  src,
  alt,
  className,
  draggable = false,
}: SafeImageProps) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <img
        src={placeholderSvg('图片暂不可用', alt)}
        alt={alt}
        className={className}
        draggable={false}
      />
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      draggable={draggable}
      onError={() => setFailed(true)}
      loading="lazy"
      referrerPolicy="no-referrer"
    />
  );
}
