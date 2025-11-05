import { PGlite } from "@electric-sql/pglite"
import { NodeFS } from "@electric-sql/pglite/nodefs"
import { vector } from "@electric-sql/pglite/vector"
import { Effect } from "effect"

export class PGLiteVectorService extends Effect.Service<PGLiteVectorService>()(
  "PGLiteVectorService",
  {
    dependencies: [],
    scoped: Effect.gen(function*() {
      // Create database resource with acquireRelease
      const db = yield* Effect.acquireRelease(
        // Acquire: initialize PGLite with vector support
        Effect.tryPromise(() =>
          PGlite.create({
            extensions: { vector },
            fs: new NodeFS("./data/")
          })
        ).pipe(
          Effect.catchTag("UnknownException", Effect.die)
        ),
        // Release: close the database connection
        (db) => Effect.tryPromise(() => db.close()).pipe(Effect.catchTag("UnknownException", Effect.die))
      )

      // Initialize vector extension and create tables - execute each command separately
      yield* Effect.tryPromise(() => db.exec("CREATE EXTENSION IF NOT EXISTS vector")).pipe(
        Effect.catchTag("UnknownException", Effect.die)
      )

      yield* Effect.tryPromise(() =>
        db.exec(`
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
        Effect.catchTag("UnknownException", Effect.die)
      )

      yield* Effect.tryPromise(() =>
        db.exec(`
          CREATE INDEX IF NOT EXISTS embedding_idx 
          ON embeddings 
          USING ivfflat (embedding vector_cosine_ops)
          WITH (lists = 100)
        `)
      ).pipe(
        Effect.catchTag("UnknownException", Effect.die)
      )

      return { db }
    })
  }
) {}
