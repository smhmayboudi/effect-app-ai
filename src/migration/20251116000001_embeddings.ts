import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"

export default SqlClient.SqlClient.pipe(
  Effect.flatMap((sql) =>
    sql`
      CREATE EXTENSION IF NOT EXISTS vector
    `
  )
)
