import { describe, expect, it } from "vitest";
import { assessQuality, type RawImage } from "./quality";

const BLUR_MIN = 100;

function makeImage(
  width: number,
  height: number,
  pixel: (x: number, y: number) => number
): RawImage {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const v = pixel(x, y);
      const o = (y * width + x) * 4;
      data[o] = v;
      data[o + 1] = v;
      data[o + 2] = v;
      data[o + 3] = 255;
    }
  }
  return { width, height, data };
}

describe("assessQuality", () => {
  it("passes a sharp checkerboard image", () => {
    const img = makeImage(8, 8, (x, y) => ((x + y) % 2 === 0 ? 50 : 200));

    const result = assessQuality(img, BLUR_MIN);

    expect(result.pass).toBe(true);
    expect(result.reason).toBeUndefined();
  });

  it("rejects a flat gray image for blur", () => {
    const img = makeImage(8, 8, () => 128);

    const result = assessQuality(img, BLUR_MIN);

    expect(result.pass).toBe(false);
    expect(result.reason).toBe("blur");
  });

  it("rejects an all-white image for brightness/glare", () => {
    const img = makeImage(8, 8, () => 255);

    const result = assessQuality(img, BLUR_MIN);

    expect(result.pass).toBe(false);
    expect(["brightness", "glare"]).toContain(result.reason);
    expect(result.glarePct).toBeGreaterThan(5);
  });
});
