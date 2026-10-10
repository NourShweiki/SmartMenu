import QRCode from "qrcode";

/**
 * A QR code drawn as plain SVG shapes: no HTML is injected, the library only supplies the on/off grid of modules.
 * Server-side: the scan link never needs to be sent to a third-party QR service.
 * Error correction "M" survives a smudge or a crease on a printed card; one path draws every dark module.
 */
export function qrPath(text: string): { size: number; path: string } {
  const { size, data } = QRCode.create(text, { errorCorrectionLevel: "M" }).modules;
  let path = "";
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (data[y * size + x]) path += `M${x} ${y}h1v1h-1z`;
    }
  }
  return { size, path };
}

/** The QR code for a link. `label` is the accessible name read by screen readers (the card says which table). */
export function QrCode({ text, label, className }: { text: string; label: string; className?: string }) {
  const { size, path } = qrPath(text);
  const quiet = 2; // the blank border QR readers need around the code
  const side = size + quiet * 2;
  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`${-quiet} ${-quiet} ${side} ${side}`}
      shapeRendering="crispEdges"
      className={className}
    >
      <rect x={-quiet} y={-quiet} width={side} height={side} fill="#fff" />
      <path d={path} fill="#000" />
    </svg>
  );
}
