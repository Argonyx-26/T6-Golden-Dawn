// Pure functions on pixel data — no DOM/canvas APIs, so this is unit-testable
// in Node. app/capture builds a real ImageData via canvas and passes it in.
export type RawImage = Pick<ImageData, "width" | "height" | "data">;

export type QualityReason = "brightness" | "glare" | "blur";

export interface QualityResult {
  pass: boolean;
  reason?: QualityReason;
  blur: number;
  brightness: number;
  glarePct: number;
}

const DOWNSCALE_WIDTH = 512;
const BRIGHTNESS_MIN = 50;
const BRIGHTNESS_MAX = 210;
const GLARE_GRAY_THRESHOLD = 240;
const GLARE_MAX_PCT = 5;
const LAPLACIAN = [0, 1, 0, 1, -4, 1, 0, 1, 0];

export function downscale(img: RawImage, targetWidth = DOWNSCALE_WIDTH): RawImage {
  if (img.width === targetWidth) return img;
  const scale = img.width / targetWidth;
  const targetHeight = Math.max(1, Math.round(img.height / scale));
  const data = new Uint8ClampedArray(targetWidth * targetHeight * 4);
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(img.height - 1, Math.floor(y * scale));
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(img.width - 1, Math.floor(x * scale));
      const src = (sy * img.width + sx) * 4;
      const dst = (y * targetWidth + x) * 4;
      data[dst] = img.data[src];
      data[dst + 1] = img.data[src + 1];
      data[dst + 2] = img.data[src + 2];
      data[dst + 3] = img.data[src + 3];
    }
  }
  return { width: targetWidth, height: targetHeight, data };
}

export function toGrayscale(img: RawImage): Float32Array {
  const gray = new Float32Array(img.width * img.height);
  for (let i = 0; i < gray.length; i++) {
    const o = i * 4;
    gray[i] = 0.299 * img.data[o] + 0.587 * img.data[o + 1] + 0.114 * img.data[o + 2];
  }
  return gray;
}

export function laplacianVariance(gray: Float32Array, width: number, height: number): number {
  const responses: number[] = [];
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      let sum = 0;
      let k = 0;
      for (let ky = -1; ky <= 1; ky++) {
        for (let kx = -1; kx <= 1; kx++) {
          sum += gray[(y + ky) * width + (x + kx)] * LAPLACIAN[k];
          k++;
        }
      }
      responses.push(sum);
    }
  }
  if (responses.length === 0) return 0;
  const mean = responses.reduce((a, b) => a + b, 0) / responses.length;
  return responses.reduce((a, b) => a + (b - mean) ** 2, 0) / responses.length;
}

export function meanBrightness(gray: Float32Array): number {
  return gray.reduce((a, b) => a + b, 0) / gray.length;
}

export function glarePercent(gray: Float32Array): number {
  let over = 0;
  for (const v of gray) if (v >= GLARE_GRAY_THRESHOLD) over++;
  return (over / gray.length) * 100;
}

export function assessQuality(img: RawImage, blurMin: number): QualityResult {
  const small = downscale(img);
  const gray = toGrayscale(small);
  const blur = laplacianVariance(gray, small.width, small.height);
  const brightness = meanBrightness(gray);
  const glarePct = glarePercent(gray);

  // Brightness/glare checked first: a blown-out or black frame is also flat
  // (zero Laplacian variance), but the more specific, actionable reason is
  // exposure, not blur.
  let reason: QualityReason | undefined;
  if (brightness < BRIGHTNESS_MIN || brightness > BRIGHTNESS_MAX) reason = "brightness";
  else if (glarePct > GLARE_MAX_PCT) reason = "glare";
  else if (blur < blurMin) reason = "blur";

  return { pass: !reason, reason, blur, brightness, glarePct };
}
