import { SqlClient } from "@effect/sql"
import { NodeFS } from "@electric-sql/pglite/nodefs"
import { vector } from "@electric-sql/pglite/vector"
import { Effect, Layer, pipe, String } from "effect"
import { PGliteClient } from "./PGlite/index.js"

export const App = Effect.scoped(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  const items = [{
    id: "1",
    content: "2",
    embedding: Array(1536).fill(0).map(() => Math.random()),
    type: "4",
    entity_id: "5",
    metadata: {}
  }]
  const a = yield* sql`INSERT INTO embeddings (id, content, embedding, type, entity_id, metadata) VALUES ${
    sql.unsafe(
      items.map((item) =>
        `('${item.id}', '${item.content}', '${JSON.stringify(item.embedding)}', '${item.type}', '${item.entity_id}', '${
          JSON.stringify(item.metadata || {})
        }')`
      ).join(", ")
    )
  }`
  console.log({ a })
  const b = yield* sql`SELECT * FROM embeddings`
  console.log({ b })
}))

export const Migrator = Layer.effectDiscard(
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient
    yield* sql`CREATE EXTENSION IF NOT EXISTS vector`
    yield* sql`
      CREATE TABLE IF NOT EXISTS embeddings (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        embedding VECTOR(1536) NOT NULL,
        type TEXT NOT NULL,
        entity_id TEXT NOT NULL,
        metadata JSONB NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `
    yield* sql`
      CREATE INDEX IF NOT EXISTS embeddings_idx ON embeddings USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100)
    `
  })
)

const Client = PGliteClient.layer({
  extensions: { vector },
  fs: new NodeFS("./data/"),
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})

pipe(
  App,
  Effect.provide(Migrator.pipe(Layer.provideMerge(Client))),
  Effect.tapBoth({
    onFailure: (error) => Effect.sync(() => console.error("💥 Error:", error)),
    onSuccess: (result) => Effect.sync(() => console.log(result))
  }),
  Effect.runPromise
)
