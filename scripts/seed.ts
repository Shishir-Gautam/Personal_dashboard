import { db } from '../src/lib/db'
import { Tree } from '../src/lib/models'
import { importTree } from '../src/lib/importer'
import mongoose from 'mongoose'

async function main() {
  await db()
  if (await Tree.findOne({ slug: 'xnock' })) { console.log('already seeded'); return }
  const r = await importTree({
    slug: 'xnock', title: 'Xnock', kind: 'project',
    outline: '- Core engine\n  - Rendering\n    - Polish\n  - Audio\n- Networking',
  })
  console.log(`seeded xnock with ${r.nodeCount} nodes`)
}
main().then(() => mongoose.disconnect())
