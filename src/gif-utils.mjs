export function delayCentisecondsForFrame(index, fps) {
  const safeFps = Math.max(1, Number(fps) || 1);
  const a = Math.round((index * 100) / safeFps);
  const b = Math.round(((index + 1) * 100) / safeFps);
  return Math.max(1, b - a);
}

export function delayMillisecondsForFrame(index, fps) {
  return delayCentisecondsForFrame(index, fps) * 10;
}

export function totalScheduledMilliseconds(frameCount, fps) {
  let total = 0;
  for (let i = 0; i < Math.max(0, frameCount | 0); i++) total += delayMillisecondsForFrame(i, fps);
  return total;
}

export function sameFrameBytes(a, b) {
  if (!a || !b || a.length !== b.length) return false;
  // Compare wide words first. ImageData buffers are aligned and byte length is a multiple of four.
  const aw = new Uint32Array(a.buffer, a.byteOffset, Math.floor(a.byteLength / 4));
  const bw = new Uint32Array(b.buffer, b.byteOffset, Math.floor(b.byteLength / 4));
  for (let i = 0; i < aw.length; i++) if (aw[i] !== bw[i]) return false;
  for (let i = aw.length * 4; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

export function chooseGifQuality(raw) {
  const value = String(raw || 'maximum').toLowerCase();
  if (value === 'clean') return { name: 'clean', colors: 256, dither: 0 };
  if (value === 'fast') return { name: 'fast', colors: 192, dither: 0 };
  return { name: 'maximum', colors: 256, dither: 6 };
}
