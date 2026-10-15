import type { AvatarCrop } from '@/modules/authentication-manager-ui/types/account'
export type { AvatarCrop } from '@/modules/authentication-manager-ui/types/account'
export function avatarCropRect(width: number, height: number, crop: AvatarCrop) {
  if (![width, height].every((value) => Number.isFinite(value) && value > 0))
    throw new Error('Invalid image dimensions')
  const side = Math.min(width, height) / Math.max(1, Math.min(4, crop.zoom))
  const fraction = (value: number) => Math.max(0, Math.min(100, value)) / 100
  return {
    x: (width - side) * fraction(crop.horizontal),
    y: (height - side) * fraction(crop.vertical),
    side,
  }
}
export function drawAvatar(
  canvas: HTMLCanvasElement,
  image: HTMLImageElement,
  crop: AvatarCrop,
  size: number,
) {
  const rectangle = avatarCropRect(image.naturalWidth, image.naturalHeight, crop)
  canvas.width = size
  canvas.height = size
  const context = canvas.getContext('2d')
  if (!context) throw new Error('Canvas unavailable')
  context.clearRect(0, 0, size, size)
  context.drawImage(
    image,
    rectangle.x,
    rectangle.y,
    rectangle.side,
    rectangle.side,
    0,
    0,
    size,
    size,
  )
}
export async function avatarPngFile(
  image: HTMLImageElement,
  crop: AvatarCrop,
  size: number,
): Promise<File> {
  if (![128, 256, 512].includes(size)) throw new Error('Invalid avatar size')
  const canvas = document.createElement('canvas')
  drawAvatar(canvas, image, crop, size)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (value) => (value ? resolve(value) : reject(new Error('Image encoding failed'))),
      'image/png',
    ),
  )
  if (blob.size > 2 * 1024 * 1024) throw new Error('Avatar too large')
  return new File([blob], 'avatar.png', { type: 'image/png' })
}
