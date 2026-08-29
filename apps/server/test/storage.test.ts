import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { LocalDiskStorage } from '../src/storage.js'

function drain(stream: Readable): Promise<void> {
  return new Promise((resolve, reject) => {
    stream.on('data', () => {})
    stream.on('end', () => resolve())
    stream.on('error', reject)
  })
}

describe('LocalDiskStorage.delete', () => {
  let dir: string
  let storage: LocalDiskStorage

  beforeEach(async () => {
    dir = await mkdtemp(join(tmpdir(), 'deuce-storage-test-'))
    storage = new LocalDiskStorage(dir)
  })

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true })
  })

  it('removes a saved file so the path is gone and reads fail', async () => {
    const objectKey = `${randomUUID()}.txt`
    await storage.save(objectKey, Readable.from(Buffer.from('hello')))

    await storage.delete(objectKey)

    await expect(stat(join(dir, objectKey))).rejects.toThrow()
    const stream = await storage.createReadStream(objectKey)
    await expect(drain(stream)).rejects.toThrow()
  })

  it('resolves without throwing when deleting a key that was never saved', async () => {
    await expect(storage.delete(`${randomUUID()}.txt`)).resolves.toBeUndefined()
  })
})
