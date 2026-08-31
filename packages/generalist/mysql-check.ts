import { SCHEMA_STATEMENTS } from "/home/user/workspace/repo/packages/generalist/src/mysql/schema/definition.ts"
import mysql from "mysql2/promise"

const conn = await mysql.createConnection("mysql://generalist:generalist@127.0.0.1:3306/generalist")
for (const [i, stmt] of SCHEMA_STATEMENTS.entries()) {
  try {
    await conn.execute(stmt)
  } catch (error) {
    console.log(`FAILED statement ${i}:`, (error as Error).message)
    console.log(stmt.slice(0, 300))
    break
  }
}
console.log("done")
await conn.end()
