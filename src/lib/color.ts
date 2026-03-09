export function hexToRgba(hex: string, alpha: number, darken: number): string {
  const r = Math.round(parseInt(hex.slice(1, 3), 16) * darken);
  const g = Math.round(parseInt(hex.slice(3, 5), 16) * darken);
  const b = Math.round(parseInt(hex.slice(5, 7), 16) * darken);
  return `rgba(${r},${g},${b},${alpha})`;
}

/** Simple string hash → value in [0, 1). */
function hashString(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h * 31 + s.charCodeAt(i)) | 0;
  }
  return ((h >>> 0) % 3600) / 3600;
}

/** Convert HSV (h in [0,360], s/v in [0,1]) to a hex color string. */
function hsvToHex(h: number, s: number, v: number): string {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];

  const toHex = (n: number) =>
    Math.round((n + m) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/** Hash a name to a hue in [0, 360). */
export function hueFromName(name: string): number {
  return hashString(name) * 360;
}

/** Hex color from a hue in [0, 360), with configurable saturation and value. */
export function pastelColorFromHue(
  hue: number,
  s: number = 0.45,
  v: number = 0.95,
): string {
  return hsvToHex(((hue % 360) + 360) % 360, s, v);
}

/** Circular mean of an array of hues (in degrees). */
export function circularMeanHue(hues: number[]): number {
  let sinSum = 0;
  let cosSum = 0;
  for (const h of hues) {
    const rad = (h * Math.PI) / 180;
    sinSum += Math.sin(rad);
    cosSum += Math.cos(rad);
  }
  const mean = (Math.atan2(sinSum, cosSum) * 180) / Math.PI;
  return ((mean % 360) + 360) % 360;
}
