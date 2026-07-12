import { readFile, readdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { execute, getPool, rows, closePool } from './db.js'
import type { RowDataPacket } from 'mysql2'

interface MigrationRow extends RowDataPacket { version: string }

const migrationsDirectory = fileURLToPath(new URL('./migrations', import.meta.url))

async function migrate() {
  await execute(`CREATE TABLE IF NOT EXISTS schema_migrations (
    version VARCHAR(64) PRIMARY KEY,
    applied_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
  ) ENGINE=InnoDB`)
  const applied = new Set((await rows<MigrationRow>('SELECT version FROM schema_migrations')).map((row) => row.version))
  const files = (await readdir(migrationsDirectory)).filter((file) => file.endsWith('.sql')).sort()

  for (const file of files) {
    if (applied.has(file)) continue
    const sql = await readFile(path.join(migrationsDirectory, file), 'utf8')
    const connection = await getPool().getConnection()
    try {
      const statements = sql
        .split(/;\s*(?:\r?\n|$)/)
        .map((statement) => statement.trim())
        .filter(Boolean)
      await connection.beginTransaction()
      for (const statement of statements) await connection.query(statement)
      await connection.execute('INSERT INTO schema_migrations (version) VALUES (?)', [file])
      await connection.commit()
      console.log(`Applied migration ${file}`)
    } catch (error) {
      await connection.rollback()
      throw error
    } finally {
      connection.release()
    }
  }
}

migrate()
  .then(() => closePool())
  .catch(async (error) => {
    console.error(error instanceof Error ? error.message : 'Migration failed')
    await closePool()
    process.exit(1)
  })
