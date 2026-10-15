import { describe, expect, it } from 'vitest'
import { avatarCropRect } from '@/modules/authentication-manager-ui/views/account/utils/avatar-crop'
describe('avatar source crop pixels', () => {
  it('crops the centered square and changes the actual source pixels for zoom and position', () => {
    expect(avatarCropRect(800, 400, { zoom: 1, horizontal: 50, vertical: 50 })).toEqual({
      x: 200,
      y: 0,
      side: 400,
    })
    expect(avatarCropRect(800, 400, { zoom: 2, horizontal: 100, vertical: 0 })).toEqual({
      x: 600,
      y: 0,
      side: 200,
    })
    expect(avatarCropRect(400, 800, { zoom: 4, horizontal: 0, vertical: 100 })).toEqual({
      x: 0,
      y: 700,
      side: 100,
    })
  })
  it('keeps the crop inside the source and rejects invalid image dimensions', () => {
    expect(avatarCropRect(800, 400, { zoom: 0, horizontal: -50, vertical: 200 })).toEqual({
      x: 0,
      y: 0,
      side: 400,
    })
    expect(() => avatarCropRect(0, 100, { zoom: 1, horizontal: 50, vertical: 50 })).toThrow()
  })
})
