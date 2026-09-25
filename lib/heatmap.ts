// Client-only (uses canvas).

// 0-1 -> blue..green..red.
function jet(v: number): [number, number, number] {
  const c = (x: number) => Math.round(255 * Math.min(1, Math.max(0, 1.5 - Math.abs(x))));
  return [c(4 * v - 3), c(4 * v - 2), c(4 * v - 1)];
}

// 7x7 heat-map as a data URL; the <img> stretches it smoothly to the photo size.
export function heatmapUrl(slice: Float32Array): string {
  const canvas = document.createElement("canvas");
  canvas.width = 7;
  canvas.height = 7;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(7, 7);
  slice.forEach((v, i) => {
    img.data.set([...jet(v), 255], i * 4);
  });
  ctx.putImageData(img, 0, 0);
  return canvas.toDataURL();
}
