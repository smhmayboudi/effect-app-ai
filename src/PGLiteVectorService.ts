import { PGlite } from "@electric-sql/pglite"
import { vector } from "@electric-sql/pglite/vector"
import { Effect } from "effect"

export class PGLiteVectorService extends Effect.Service<PGLiteVectorService>()(
  "PGLiteVectorService",
  {
    effect: Effect.gen(function*() {
      // Initialize PGLite with vector support
      const db = yield* Effect.tryPromise(() =>
        PGlite.create({
          dataDir: "./data",
          extensions: { vector }
        })
      )

      // Initialize vector extension and create tables - execute each command separately
      yield* Effect.tryPromise(() => db.query("CREATE EXTENSION IF NOT EXISTS vector")).pipe(
        Effect.ignore
      )

      yield* Effect.tryPromise(() =>
        db.query(`
          CREATE TABLE IF NOT EXISTS embeddings (
            id TEXT PRIMARY KEY,
            content TEXT NOT NULL,
            embedding VECTOR(1536),
            type TEXT NOT NULL,
            entity_id TEXT NOT NULL,
            metadata JSONB,
            created_at TIMESTAMP DEFAULT NOW()
          )
        `)
      ).pipe(
        Effect.ignore
      )

      // Create index separately
      yield* Effect.tryPromise(() =>
        db.query(`
          CREATE INDEX IF NOT EXISTS embedding_idx 
          ON embeddings 
          USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = 100)
        `)
      ).pipe(
        Effect.ignore
      )

      return { db }
    })
  }
) {}
