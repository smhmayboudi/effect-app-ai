import { SqlClient } from "@effect/sql/SqlClient"
import { describe, expect, it } from "@effect/vitest"
import { PGlite } from "@electric-sql/pglite"
import { Effect } from "effect"
import { layer } from "../src/pglite/PGliteClient.js"

describe("PGlite Simple Test", () => {
  it("should connect and execute basic queries", async () => {
    // Create a PGlite instance
    const pg = await PGlite.create()

    // Initialize the database with a test table
    await pg.query(`
      CREATE TABLE IF NOT EXISTS simple_test (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255)
      )
    `)

    // Insert some test data directly with PGlite
    await pg.query("INSERT INTO simple_test (name) VALUES ($1), ($2)", ["Test1", "Test2"])

    // Create the client layer using the live PGlite instance
    const clientLayer = layer({
      liveClient: pg
    })

    // Test that we can execute a basic query
    const program = Effect.gen(function*() {
      return yield* SqlClient.execute("SELECT * FROM simple_test", [])
    })

    const result = await Effect.runPromise(Effect.provide(program, clientLayer))

    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBe(2)

    // Clean up
    await pg.close()
  })
})
