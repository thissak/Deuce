import { nativeImage } from 'electron'

// Small bitmap glyphs stay legible in the Windows taskbar's 16px overlay.
const glyphs: Record<string, string[]> = {
  '0': ['111', '101', '101', '101', '111'],
  '1': ['010', '110', '010', '010', '111'],
  '2': ['111', '001', '111', '100', '111'],
  '3': ['111', '001', '111', '001', '111'],
  '4': ['101', '101', '111', '001', '001'],
  '5': ['111', '100', '111', '001', '111'],
  '6': ['111', '100', '111', '101', '111'],
  '7': ['111', '001', '010', '010', '010'],
  '8': ['111', '101', '111', '101', '111'],
  '9': ['111', '101', '111', '001', '111'],
  '+': ['000', '010', '111', '010', '000'],
}

export function badgeImage(count: number) {
  const text = count > 99 ? '99+' : String(count)
  const size = 32
  const pixels = Buffer.alloc(size * size * 4)
  const put = (x: number, y: number, white: boolean) => {
    const offset = (y * size + x) * 4
    // NativeImage bitmap bytes are BGRA on supported Windows architectures.
    pixels.set(white ? [255, 255, 255, 255] : [75, 49, 196, 255], offset)
  }
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
    if ((x - 15.5) ** 2 + (y - 15.5) ** 2 <= 15.5 ** 2) put(x, y, false)
  }
  const scale = text.length === 1 ? 4 : 2
  const left = (size - (text.length * 4 - 1) * scale) / 2
  const top = (size - 5 * scale) / 2
  for (const [index, char] of [...text].entries()) {
    glyphs[char]!.forEach((row, y) => [...row].forEach((pixel, x) => {
      if (pixel !== '1') return
      for (let dy = 0; dy < scale; dy++) for (let dx = 0; dx < scale; dx++) {
        put(left + (index * 4 + x) * scale + dx, top + y * scale + dy, true)
      }
    }))
  }
  return nativeImage.createFromBitmap(pixels, { width: size, height: size }).resize({ width: 16, height: 16 })
}
