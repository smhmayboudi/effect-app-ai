import * as SqlClient from "@effect/sql/SqlClient"
import * as Effect from "effect/Effect"

export default SqlClient.SqlClient.pipe(
  Effect.flatMap((sql) =>
    sql`
      CREATE INDEX IF NOT EXISTS embeddings_idx
        ON embeddings
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
    `
  )
)
