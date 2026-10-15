import { deflateSync } from 'node:zlib'

/** Generate a tiny original PNG/ICO fixture so upload coverage does not depend on branded assets. */
function png() {
  function chunk(type: string, data: Buffer) {
    const payload = Buffer.concat([Buffer.from(type), data])
    let crc = 0xffffffff
    for (const byte of payload) {
      crc ^= byte
      for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0)
    }
    const length = Buffer.alloc(4),
      checksum = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    checksum.writeUInt32BE((crc ^ 0xffffffff) >>> 0)
    return Buffer.concat([length, payload, checksum])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(1, 0)
  header.writeUInt32BE(1, 4)
  header[8] = 8
  header[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.from([0, 22, 119, 255, 255]))),
    chunk('IEND', Buffer.alloc(0)),
  ])
}
const image = png(),
  icon = Buffer.alloc(22)
icon.writeUInt16LE(1, 2)
icon.writeUInt16LE(1, 4)
icon[6] = 1
icon[7] = 1
icon.writeUInt16LE(1, 10)
icon.writeUInt16LE(32, 12)
icon.writeUInt32LE(image.length, 14)
icon.writeUInt32LE(22, 18)
export const brandingUploadImages = {
  logo: image,
  background: image,
  ico: Buffer.concat([icon, image]),
}
