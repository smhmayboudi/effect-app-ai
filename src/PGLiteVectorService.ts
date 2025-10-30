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
          dataDir: "./data/pglite",
          extensions: { vector }
        })
      )

      // Initialize vector extension and create tables
      yield* Effect.tryPromise(() =>
        db.query(`
        -- Enable vector extension
        CREATE EXTENSION IF NOT EXISTS vector;
        
        -- Create table for vector embeddings
        CREATE TABLE IF NOT EXISTS embeddings (
          id TEXT PRIMARY KEY,
          content TEXT NOT NULL,
          embedding VECTOR(1536), -- OpenAI ada-002 dimension
          type TEXT NOT NULL,
          entity_id TEXT NOT NULL,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW()
        );

        -- Create index for efficient similarity search
        CREATE INDEX IF NOT EXISTS embedding_idx 
        ON embeddings 
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100);
      `)
      )

      return { db }
    })
  }
) {}
