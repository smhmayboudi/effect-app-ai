import { Reactivity } from "@effect/experimental"
import { describe, expect, it } from "@effect/vitest"
import { PGlite } from "@electric-sql/pglite"
import { Effect } from "effect"
import { make } from "../src/pglite/PGliteClient.js"

// Test just the connection without using the SqlClient tag
describe("PGlite Direct Test", () => {
  it("should connect directly", async () => {
    // Create a PGlite instance
    const pg = await PGlite.create()

    // Create the client directly using the make function
    const client = await Effect.runPromise(
      Effect.scoped(make({ liveClient: pg })).pipe(
        Effect.provide(Reactivity.layer)
      )
    )

    // Try to execute a query directly using the client
    const result = await Effect.runPromise(
      client.execute("SELECT 1 as test", [])
    )

    console.log("Direct result:", result)
    expect(result).toBeDefined()
    expect(Array.isArray(result)).toBe(true)

    // Clean up
    await pg.close()
  })
})
