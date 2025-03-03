/* eslint-disable @typescript-eslint/no-unsafe-argument */
/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-call */
/* eslint-disable mocha/max-top-level-suites */
/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { assert, equals, notEquals, matches, equalsJSON, resetDirectory, dataDir } from './helpers.js'

import { CID } from 'multiformats/cid'

import { fireproof, Database } from '../dist/test/database.js'
import { index } from '../dist/test/index.js'

export function cidListIncludes(list, cid) {
  return list.some(c => c.equals(cid))
}

describe('dreamcode', function () {
  let ok, doc, result, db
  beforeEach(async function () {
    await resetDirectory(dataDir, 'test-db')
    db = fireproof('test-db')
    ok = await db.put({ _id: 'test-1', text: 'fireproof', dream: true })
    doc = await db.get(ok.id)
    result = await db.query('text', { range: ['a', 'z'] })
  })
  it('should put', function () {
    assert(ok)
    equals(ok.id, 'test-1')
  })
  it('should get', function () {
    equals(doc.text, 'fireproof')
  })
  it('should query', function () {
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 1)
    equals(result.rows[0].key, 'fireproof')
  })
  it('should query with function', async function () {
    const result = await db.query((doc) => doc.dream)
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 1)
    equals(result.rows[0].key, true)
  })
})

describe('public API', function () {
  beforeEach(async function () {
    await resetDirectory(dataDir, 'test-api')
    this.db = fireproof('test-api')
    // this.index = index(this.db, 'test-index', (doc) => doc.foo)
    this.ok = await this.db.put({ _id: 'test', foo: 'bar' })
    this.doc = await this.db.get('test')
    this.query = await this.db.query((doc) => doc.foo)
  })
  it('should be a database instance', function () {
    assert(this.db)
    assert(this.db instanceof Database)
  })
  it('should put', function () {
    assert(this.ok)
    equals(this.ok.id, 'test')
  })
  it('should get', function () {
    equals(this.doc.foo, 'bar')
  })
  it('should query', function () {
    assert(this.query)
    assert(this.query.rows)
    equals(this.query.rows.length, 1)
    equals(this.query.rows[0].key, 'bar')
  })
})

describe('basic database', function () {
  /** @type {Database} */
  let db
  beforeEach(async function () {
    await resetDirectory(dataDir, 'test-basic')
    db = new Database('test-basic')
  })
  it('can put with id', async function () {
    const ok = await db.put({ _id: 'test', foo: 'bar' })
    assert(ok)
    equals(ok.id, 'test')
  })
  it('can put without id', async function () {
    const ok = await db.put({ foo: 'bam' })
    assert(ok)
    const got = await db.get(ok.id)
    equals(got.foo, 'bam')
  })
  it('can define an index', async function () {
    const ok = await db.put({ _id: 'test', foo: 'bar' })
    assert(ok)
    const idx = index(db, 'test-index', doc => doc.foo)
    const result = await idx.query()
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 1)
    equals(result.rows[0].key, 'bar')
  })
  it('can define an index with a default function', async function () {
    const ok = await db.put({ _id: 'test', foo: 'bar' })
    assert(ok)
    const idx = index(db, 'foo')
    const result = await idx.query()
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 1)
    equals(result.rows[0].key, 'bar')
  })
})

describe('Reopening a database', function () {
  /** @type {Database} */
  let db
  beforeEach(async function () {
    // erase the existing test data
    await resetDirectory(dataDir, 'test-reopen')

    db = new Database('test-reopen')
    const ok = await db.put({ _id: 'test', foo: 'bar' })
    assert(ok)
    equals(ok.id, 'test')

    assert(db._crdt.clock.head)
    equals(db._crdt.clock.head.length, 1)
  })

  it('should persist data', async function () {
    const doc = await db.get('test')
    equals(doc.foo, 'bar')
  })

  it('should have the same data on reopen', async function () {
    const db2 = new Database('test-reopen')
    const doc = await db2.get('test')
    equals(doc.foo, 'bar')
    assert(db2._crdt.clock.head)
    equals(db2._crdt.clock.head.length, 1)
    equalsJSON(db2._crdt.clock.head, db._crdt.clock.head)
  })

  it('should have a car in the car log', async function () {
    await db._crdt.ready
    assert(db._crdt.blockstore.loader)
    assert(db._crdt.blockstore.loader.carLog)
    equals(db._crdt.blockstore.loader.carLog.length, 1)
  })

  it('should have carlog after reopen', async function () {
    const db2 = new Database('test-reopen')
    await db2._crdt.ready
    assert(db2._crdt.blockstore.loader)
    assert(db2._crdt.blockstore.loader.carLog)
    equals(db2._crdt.blockstore.loader.carLog.length, 1)
  })

  it('faster, should have the same data on reopen after reopen and update', async function () {
    for (let i = 0; i < 4; i++) {
      // console.log('iteration', i)
      const db = new Database('test-reopen')
      assert(db._crdt.ready)
      await db._crdt.ready
      equals(db._crdt.blockstore.loader.carLog.length, i + 1)
      const ok = await db.put({ _id: `test${i}`, fire: 'proof'.repeat(50 * 1024) })
      assert(ok)
      equals(db._crdt.blockstore.loader.carLog.length, i + 2)
      const doc = await db.get(`test${i}`)
      equals(doc.fire, 'proof'.repeat(50 * 1024))
    }
  }).timeout(20000)

  // eslint-disable-next-line mocha/no-skipped-tests
  it.skip(
    'passing slow, should have the same data on reopen after reopen and update',
    async function () {
      for (let i = 0; i < 100; i++) {
        // console.log('iteration', i)
        const db = new Database('test-reopen')
        assert(db._crdt.ready)
        await db._crdt.ready
        equals(db._crdt.blockstore.loader.carLog.length, i + 1)
        const ok = await db.put({ _id: `test${i}`, fire: 'proof'.repeat(50 * 1024) })
        assert(ok)
        equals(db._crdt.blockstore.loader.carLog.length, i + 2)
        const doc = await db.get(`test${i}`)
        equals(doc.fire, 'proof'.repeat(50 * 1024))
      }
    }
  ).timeout(20000)
})

describe('Reopening a database with indexes', function () {
  /** @type {Database} */
  let db, idx, didMap, mapFn
  beforeEach(async function () {
    // erase the existing test data
    await resetDirectory(dataDir, 'test-reopen-idx')
    await resetDirectory(dataDir, 'test-reopen-idx.idx')

    db = fireproof('test-reopen-idx')
    const ok = await db.put({ _id: 'test', foo: 'bar' })
    equals(ok.id, 'test')

    didMap = false

    const mapFn = (doc) => {
      didMap = true
      return doc.foo
    }

    idx = index(db, 'foo', mapFn)
  })

  it('should persist data', async function () {
    const doc = await db.get('test')
    equals(doc.foo, 'bar')
    const idx2 = index(db, 'foo')
    assert(idx2 === idx, 'same object')
    const result = await idx2.query()
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 1)
    equals(result.rows[0].key, 'bar')
    assert(didMap)
  })

  it('should reuse the index', async function () {
    const idx2 = index(db, 'foo', mapFn)
    assert(idx2 === idx, 'same object')
    const result = await idx2.query()
    assert(result)
    assert(result.rows)
    equals(result.rows.length, 1)
    equals(result.rows[0].key, 'bar')
    assert(didMap)
    didMap = false
    const r2 = await idx2.query()
    assert(r2)
    assert(r2.rows)
    equals(r2.rows.length, 1)
    equals(r2.rows[0].key, 'bar')
    assert(!didMap)
  })

  it('should have the same data on reopen', async function () {
    const db2 = fireproof('test-reopen-idx')
    const doc = await db2.get('test')
    equals(doc.foo, 'bar')
    assert(db2._crdt.clock.head)
    equals(db2._crdt.clock.head.length, 1)
    equalsJSON(db2._crdt.clock.head, db._crdt.clock.head)
  })

  it('should have the same data on reopen after a query', async function () {
    const r0 = await idx.query()
    assert(r0)
    assert(r0.rows)
    equals(r0.rows.length, 1)
    equals(r0.rows[0].key, 'bar')

    const db2 = fireproof('test-reopen-idx')
    const doc = await db2.get('test')
    equals(doc.foo, 'bar')
    assert(db2._crdt.clock.head)
    equals(db2._crdt.clock.head.length, 1)
    equalsJSON(db2._crdt.clock.head, db._crdt.clock.head)
  })

  // it('should query the same data on reopen', async function () {
  //   const r0 = await idx.query()
  //   assert(r0)
  //   assert(r0.rows)
  //   equals(r0.rows.length, 1)
  //   equals(r0.rows[0].key, 'bar')

  //   const db2 = fireproof('test-reopen-idx')
  //   const d2 = await db2.get('test')
  //   equals(d2.foo, 'bar')
  //   didMap = false
  //   const idx3 = db2.index('foo', mapFn)
  //   const result = await idx3.query()
  //   assert(result)
  //   assert(result.rows)
  //   equals(result.rows.length, 1)
  //   equals(result.rows[0].key, 'bar')
  //   assert(!didMap)
  // })
})

describe('basic js verify', function () {
  it('should include cids in arrays', async function () {
    await resetDirectory(dataDir, 'test-verify')
    const db = fireproof('test-verify')
    const ok = await db.put({ _id: 'test', foo: ['bar', 'bam'] })
    equals(ok.id, 'test')
    const ok2 = await db.put({ _id: 'test2', foo: ['bar', 'bam'] })
    equals(ok2.id, 'test2')
    const cid = db._crdt.blockstore.loader.carLog[0]
    const cid2 = db._crdt.clock.head[0]
    notEquals(cid, cid2)
    assert(cid !== cid2)
    const cidList = [cid, cid2]
    const cid3 = CID.parse(cid.toString())
    assert(!cidList.includes(cid3)) // sad trombone
    assert(cidListIncludes(cidList, cid3))
  })
})
