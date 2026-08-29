import { createReadStream, createWriteStream } from 'node:fs'
import { mkdir, rm, stat } from 'node:fs/promises'
import { join } from 'node:path'
import { pipeline } from 'node:stream/promises'
import type { Readable } from 'node:stream'

export interface FileStorage {
  save(objectKey: string, stream: Readable): Promise<{ size: number }>
  createReadStream(objectKey: string): Promise<Readable>
  delete(objectKey: string): Promise<void>
}

const KEY_PATTERN = /^[0-9a-f-]{36}(\.[A-Za-z0-9]{1,10})?$/

function assertSafeKey(objectKey: string): void {
  if (!KEY_PATTERN.test(objectKey)) throw new Error(`invalid object key: ${objectKey}`)
}

export class LocalDiskStorage implements FileStorage {
  constructor(private readonly baseDir: string) {}

  async save(objectKey: string, stream: Readable): Promise<{ size: number }> {
    assertSafeKey(objectKey)
    await mkdir(this.baseDir, { recursive: true })
    const path = join(this.baseDir, objectKey)
    await pipeline(stream, createWriteStream(path))
    const info = await stat(path)
    return { size: info.size }
  }

  async createReadStream(objectKey: string): Promise<Readable> {
    assertSafeKey(objectKey)
    return createReadStream(join(this.baseDir, objectKey))
  }

  async delete(objectKey: string): Promise<void> {
    assertSafeKey(objectKey)
    await rm(join(this.baseDir, objectKey), { force: true })
  }
}
