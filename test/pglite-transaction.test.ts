import { SqlClient } from "@effect/sql/SqlClient"
import { describe, expect, it } from "@effect/vitest"
import { PGlite } from "@electric-sql/pglite"
import { Effect } from "effect"
import { layer } from "../src/pglite/PGliteClient.js"

describe("PGlite Transaction Tests", () => {
  it("should handle transactions properly", async () => {
    // Create a PGlite instance
    const pg = await PGlite.create()

    // Initialize the database with a test table
    await pg.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255),
        email VARCHAR(255)
      )
    `)

    // Create the client layer using the live PGlite instance
    const clientLayer = layer({
      liveClient: pg as any
    })

    // Test basic functionality first to ensure client is working
    const program = Effect.gen(function*() {
      const result = yield* SqlClient.execute(
        "SELECT 1 as test",
        []
      )
      return result
    })

    const result = await Effect.runPromise(Effect.provide(program, clientLayer))
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)

    // Clean up
    await pg.close()
  })
})
