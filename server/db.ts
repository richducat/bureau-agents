import mysql, { type PoolConnection, type ResultSetHeader, type RowDataPacket } from 'mysql2/promise'
import { getConfig } from './config.js'

let pool: mysql.Pool | undefined

export function getPool() {
  if (pool) return pool
  const config = getConfig()
  pool = mysql.createPool({
    host: config.MYSQL_HOST,
    port: config.MYSQL_PORT,
    user: config.MYSQL_USER,
    password: config.MYSQL_PASSWORD,
    database: config.MYSQL_DATABASE,
    ssl: config.MYSQL_SSL ? {} : undefined,
    connectionLimit: 10,
    maxIdle: 5,
    idleTimeout: 60_000,
    enableKeepAlive: true,
    namedPlaceholders: false,
    charset: 'utf8mb4',
    timezone: 'Z',
  })
  return pool
}

export async function rows<T extends RowDataPacket>(sql: string, values: readonly unknown[] = []): Promise<T[]> {
  const [result] = await getPool().execute<T[]>(sql, [...values] as never[])
  return result
}

export async function one<T extends RowDataPacket>(sql: string, values: readonly unknown[] = []): Promise<T | null> {
  const result = await rows<T>(sql, values)
  return result[0] ?? null
}

export async function execute(sql: string, values: readonly unknown[] = []): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, [...values] as never[])
  return result
}

export async function transaction<T>(work: (connection: PoolConnection) => Promise<T>): Promise<T> {
  const connection = await getPool().getConnection()
  try {
    await connection.beginTransaction()
    const result = await work(connection)
    await connection.commit()
    return result
  } catch (error) {
    await connection.rollback()
    throw error
  } finally {
    connection.release()
  }
}

export async function closePool() {
  await pool?.end()
  pool = undefined
}
