import { SqlClient } from "@effect/sql"
import { LibsqlClient } from "@effect/sql-libsql"
import { types } from "@electric-sql/pglite"
import { NodeFS } from "@electric-sql/pglite/nodefs"
import { vector } from "@electric-sql/pglite/vector"
import { Effect, Layer, Logger, LogLevel, pipe, String } from "effect"
import { PGliteClient } from "./PGlite/index.js"

export const App = Effect.scoped(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient

  console.log("B START")
  const items = [
    {
      id: "1",
      content: "2",
      embedding: Array(1536).fill(0).map(() => Math.random()),
      type: "4",
      entity_id: "5",
      metadata: {}
    },
    {
      id: "2",
      content: "2",
      embedding: Array(1536).fill(0).map(() => Math.random()),
      type: "4",
      entity_id: "5",
      metadata: {}
    }
  ]
  const b = sql`INSERT INTO embeddings ${sql.insert(items)}`
  console.log({ b: b.compile() })
  const b2 = yield* b
  console.log({ b2 })

  console.log("C START")
  const item = {
    id: "1",
    content: "2",
    embedding: Array(1536).fill(0).map(() => Math.random()),
    type: "4",
    entity_id: "5",
    metadata: {}
  }
  const c = sql`UPDATE embeddings SET ${sql.update(item, [])}`
  console.log({ c: c.compile() })
  const c2 = yield* c
  console.log({ c2 })

  console.log("D START")
  const items2 = [
    {
      id: "1",
      content: "2",
      embedding: Array(1536).fill(0).map(() => Math.random()),
      type: "4",
      entity_id: "5",
      metadata: {}
    },
    {
      id: "2",
      content: "2",
      embedding: Array(1536).fill(0).map(() => Math.random()),
      type: "4",
      entity_id: "5",
      metadata: {}
    }
  ]
  const d = sql`UPDATE embeddings SET ${sql.updateValues(items2, "")}`
  console.log({ d: d.compile() })
  const d2 = yield* d
  console.log({ d2 })

  console.log("E START")
  const e = sql`SELECT * FROM embeddings`
  console.log({ e: e.compile() })
  const e2 = yield* e
  console.log({ e2 })
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

export const Client = PGliteClient.layer({
  debug: 0,
  extensions: { vector },
  fs: new NodeFS("./data/"),
  parsers: {
    [types.ABSTIME]: (value) => {
      console.log({ f: "P_ABSTIME", value })
      return value
    },
    [types.ACLITEM]: (value) => {
      console.log({ f: "P_ACLITEM", value })
      return value
    },
    [types.BIT]: (value) => {
      console.log({ f: "P_BIT", value })
      return value
    },
    [types.BOOL]: (value) => {
      console.log({ f: "P_BOOL", value })
      return value
    },
    [types.BPCHAR]: (value) => {
      console.log({ f: "P_BPCHAR", value })
      return value
    },
    [types.BYTEA]: (value) => {
      console.log({ f: "P_BYTEA", value })
      return value
    },
    [types.CHAR]: (value) => {
      console.log({ f: "P_CHAR", value })
      return value
    },
    [types.CIDR]: (value) => {
      console.log({ f: "P_CIDR", value })
      return value
    },
    [types.CID]: (value) => {
      console.log({ f: "P_CID", value })
      return value
    },
    [types.CIRCLE]: (value) => {
      console.log({ f: "P_CIRCLE", value })
      return value
    },
    [types.DATE]: (value) => {
      console.log({ f: "P_DATE", value })
      return value
    },
    [types.FLOAT4]: (value) => {
      console.log({ f: "P_FLOAT4", value })
      return value
    },
    [types.FLOAT8]: (value) => {
      console.log({ f: "P_FLOAT8", value })
      return value
    },
    [types.GTSVECTOR]: (value) => {
      console.log({ f: "P_GTSVECTOR", value })
      return value
    },
    [types.INET]: (value) => {
      console.log({ f: "P_INET", value })
      return value
    },
    [types.INT2]: (value) => {
      console.log({ f: "P_INT2", value })
      return value
    },
    [types.INT4]: (value) => {
      console.log({ f: "P_INT4", value })
      return value
    },
    [types.INT8]: (value) => {
      console.log({ f: "P_INT8", value })
      return value
    },
    [types.INTERVAL]: (value) => {
      console.log({ f: "P_INTERVAL", value })
      return value
    },
    [types.JSONB]: (value) => {
      console.log({ f: "P_JSONB", value })
      return JSON.parse(value)
    },
    [types.JSON]: (value) => {
      console.log({ f: "P_JSON", value })
      return JSON.parse(value)
    },
    [types.MACADDR8]: (value) => {
      console.log({ f: "P_MACADDR8", value })
      return value
    },
    [types.MACADDR]: (value) => {
      console.log({ f: "P_MACADDR", value })
      return value
    },
    [types.MONEY]: (value) => {
      console.log({ f: "P_MONEY", value })
      return value
    },
    [types.NUMERIC]: (value) => {
      console.log({ f: "P_NUMERIC", value })
      return value
    },
    [types.OID]: (value) => {
      console.log({ f: "P_OID", value })
      return value
    },
    [types.PATH]: (value) => {
      console.log({ f: "P_PATH", value })
      return value
    },
    [types.PG_DEPENDENCIES]: (value) => {
      console.log({ f: "P_PG_DEPENDENCIES", value })
      return value
    },
    [types.PG_LSN]: (value) => {
      console.log({ f: "P_PG_LSN", value })
      return value
    },
    [types.PG_NDISTINCT]: (value) => {
      console.log({ f: "P_PG_NDISTINCT", value })
      return value
    },
    [types.PG_NODE_TREE]: (value) => {
      console.log({ f: "P_PG_NODE_TREE", value })
      return value
    },
    [types.POLYGON]: (value) => {
      console.log({ f: "P_POLYGON", value })
      return value
    },
    [types.REFCURSOR]: (value) => {
      console.log({ f: "P_REFCURSOR", value })
      return value
    },
    [types.REGCLASS]: (value) => {
      console.log({ f: "P_REGCLASS", value })
      return value
    },
    [types.REGCONFIG]: (value) => {
      console.log({ f: "P_REGCONFIG", value })
      return value
    },
    [types.REGDICTIONARY]: (value) => {
      console.log({ f: "P_REGDICTIONARY", value })
      return value
    },
    [types.REGNAMESPACE]: (value) => {
      console.log({ f: "P_REGNAMESPACE", value })
      return value
    },
    [types.REGOPERATOR]: (value) => {
      console.log({ f: "P_REGOPERATOR", value })
      return value
    },
    [types.REGOPER]: (value) => {
      console.log({ f: "P_REGOPER", value })
      return value
    },
    [types.REGPROCEDURE]: (value) => {
      console.log({ f: "P_REGPROCEDURE", value })
      return value
    },
    [types.REGPROC]: (value) => {
      console.log({ f: "P_REGPROC", value })
      return value
    },
    [types.REGROLE]: (value) => {
      console.log({ f: "P_REGROLE", value })
      return value
    },
    [types.REGTYPE]: (value) => {
      console.log({ f: "P_REGTYPE", value })
      return value
    },
    [types.RELTIME]: (value) => {
      console.log({ f: "P_RELTIME", value })
      return value
    },
    [types.SMGR]: (value) => {
      console.log({ f: "P_SMGR", value })
      return value
    },
    [types.TEXT]: (value) => {
      console.log({ f: "P_TEXT", value })
      return value
    },
    [types.TID]: (value) => {
      console.log({ f: "P_TID", value })
      return value
    },
    [types.TIMESTAMPTZ]: (value) => {
      console.log({ f: "P_TIMESTAMPTZ", value })
      return value
    },
    [types.TIMESTAMP]: (value) => {
      console.log({ f: "P_TIMESTAMP", value })
      return value
    },
    [types.TIMETZ]: (value) => {
      console.log({ f: "P_TIMETZ", value })
      return value
    },
    [types.TIME]: (value) => {
      console.log({ f: "P_TIME", value })
      return value
    },
    [types.TINTERVAL]: (value) => {
      console.log({ f: "P_TINTERVAL", value })
      return value
    },
    [types.TSQUERY]: (value) => {
      console.log({ f: "P_TSQUERY", value })
      return value
    },
    [types.TSVECTOR]: (value) => {
      console.log({ f: "P_TSVECTOR", value })
      return JSON.stringify(value)
    },
    [types.TXID_SNAPSHOT]: (value) => {
      console.log({ f: "P_TXID_SNAPSHOT", value })
      return value
    },
    [types.UUID]: (value) => {
      console.log({ f: "P_UUID", value })
      return value
    },
    [types.VARBIT]: (value) => {
      console.log({ f: "P_VARBIT", value })
      return value
    },
    [types.VARCHAR]: (value) => {
      console.log({ f: "P_VARCHAR", value })
      return value
    },
    [types.XID]: (value) => {
      console.log({ f: "P_XID", value })
      return value
    },
    [types.XML]: (value) => {
      console.log({ f: "P_XML", value })
      return value
    },
    [16385]: (value) => {
      console.log({ f: "P_16385", value })
      return value
    }
  },
  serializers: {
    [types.ABSTIME]: (value) => {
      console.log({ f: "S_ABSTIME", value })
      return value
    },
    [types.ACLITEM]: (value) => {
      console.log({ f: "S_ACLITEM", value })
      return value
    },
    [types.BIT]: (value) => {
      console.log({ f: "S_BIT", value })
      return value
    },
    [types.BOOL]: (value) => {
      console.log({ f: "S_BOOL", value })
      return value
    },
    [types.BPCHAR]: (value) => {
      console.log({ f: "S_BPCHAR", value })
      return value
    },
    [types.BYTEA]: (value) => {
      console.log({ f: "S_BYTEA", value })
      return value
    },
    [types.CHAR]: (value) => {
      console.log({ f: "S_CHAR", value })
      return value
    },
    [types.CIDR]: (value) => {
      console.log({ f: "S_CIDR", value })
      return value
    },
    [types.CID]: (value) => {
      console.log({ f: "S_CID", value })
      return value
    },
    [types.CIRCLE]: (value) => {
      console.log({ f: "S_CIRCLE", value })
      return value
    },
    [types.DATE]: (value) => {
      console.log({ f: "S_DATE", value })
      return value
    },
    [types.FLOAT4]: (value) => {
      console.log({ f: "S_FLOAT4", value })
      return value
    },
    [types.FLOAT8]: (value) => {
      console.log({ f: "S_FLOAT8", value })
      return value
    },
    [types.GTSVECTOR]: (value) => {
      console.log({ f: "S_GTSVECTOR", value })
      return value
    },
    [types.INET]: (value) => {
      console.log({ f: "S_INET", value })
      return value
    },
    [types.INT2]: (value) => {
      console.log({ f: "S_INT2", value })
      return value
    },
    [types.INT4]: (value) => {
      console.log({ f: "S_INT4", value })
      return value
    },
    [types.INT8]: (value) => {
      console.log({ f: "S_INT8", value })
      return value
    },
    [types.INTERVAL]: (value) => {
      console.log({ f: "S_INTERVAL", value })
      return value
    },
    [types.JSONB]: (value) => {
      console.log({ f: "S_JSONB", value })
      return JSON.stringify(value)
    },
    [types.JSON]: (value) => {
      console.log({ f: "S_JSON", value })
      return JSON.stringify(value)
    },
    [types.MACADDR8]: (value) => {
      console.log({ f: "S_MACADDR8", value })
      return value
    },
    [types.MACADDR]: (value) => {
      console.log({ f: "S_MACADDR", value })
      return value
    },
    [types.MONEY]: (value) => {
      console.log({ f: "S_MONEY", value })
      return value
    },
    [types.NUMERIC]: (value) => {
      console.log({ f: "S_NUMERIC", value })
      return value
    },
    [types.OID]: (value) => {
      console.log({ f: "S_OID", value })
      return value
    },
    [types.PATH]: (value) => {
      console.log({ f: "S_PATH", value })
      return value
    },
    [types.PG_DEPENDENCIES]: (value) => {
      console.log({ f: "S_PG_DEPENDENCIES", value })
      return value
    },
    [types.PG_LSN]: (value) => {
      console.log({ f: "S_PG_LSN", value })
      return value
    },
    [types.PG_NDISTINCT]: (value) => {
      console.log({ f: "S_PG_NDISTINCT", value })
      return value
    },
    [types.PG_NODE_TREE]: (value) => {
      console.log({ f: "S_PG_NODE_TREE", value })
      return value
    },
    [types.POLYGON]: (value) => {
      console.log({ f: "S_POLYGON", value })
      return value
    },
    [types.REFCURSOR]: (value) => {
      console.log({ f: "S_REFCURSOR", value })
      return value
    },
    [types.REGCLASS]: (value) => {
      console.log({ f: "S_REGCLASS", value })
      return value
    },
    [types.REGCONFIG]: (value) => {
      console.log({ f: "S_REGCONFIG", value })
      return value
    },
    [types.REGDICTIONARY]: (value) => {
      console.log({ f: "S_REGDICTIONARY", value })
      return value
    },
    [types.REGNAMESPACE]: (value) => {
      console.log({ f: "S_REGNAMESPACE", value })
      return value
    },
    [types.REGOPERATOR]: (value) => {
      console.log({ f: "S_REGOPERATOR", value })
      return value
    },
    [types.REGOPER]: (value) => {
      console.log({ f: "S_REGOPER", value })
      return value
    },
    [types.REGPROCEDURE]: (value) => {
      console.log({ f: "S_REGPROCEDURE", value })
      return value
    },
    [types.REGPROC]: (value) => {
      console.log({ f: "S_REGPROC", value })
      return value
    },
    [types.REGROLE]: (value) => {
      console.log({ f: "S_REGROLE", value })
      return value
    },
    [types.REGTYPE]: (value) => {
      console.log({ f: "S_REGTYPE", value })
      return value
    },
    [types.RELTIME]: (value) => {
      console.log({ f: "S_RELTIME", value })
      return value
    },
    [types.SMGR]: (value) => {
      console.log({ f: "S_SMGR", value })
      return value
    },
    [types.TEXT]: (value) => {
      console.log({ f: "S_TEXT", value })
      return value
    },
    [types.TID]: (value) => {
      console.log({ f: "S_TID", value })
      return value
    },
    [types.TIMESTAMPTZ]: (value) => {
      console.log({ f: "S_TIMESTAMPTZ", value })
      return value
    },
    [types.TIMESTAMP]: (value) => {
      console.log({ f: "S_TIMESTAMP", value })
      return value
    },
    [types.TIMETZ]: (value) => {
      console.log({ f: "S_TIMETZ", value })
      return value
    },
    [types.TIME]: (value) => {
      console.log({ f: "S_TIME", value })
      return value
    },
    [types.TINTERVAL]: (value) => {
      console.log({ f: "S_TINTERVAL", value })
      return value
    },
    [types.TSQUERY]: (value) => {
      console.log({ f: "S_TSQUERY", value })
      return value
    },
    [types.TSVECTOR]: (value) => {
      console.log({ f: "S_TSVECTOR", value })
      return JSON.stringify(value)
    },
    [types.TXID_SNAPSHOT]: (value) => {
      console.log({ f: "S_TXID_SNAPSHOT", value })
      return value
    },
    [types.UUID]: (value) => {
      console.log({ f: "S_UUID", value })
      return value
    },
    [types.VARBIT]: (value) => {
      console.log({ f: "S_VARBIT", value })
      return value
    },
    [types.VARCHAR]: (value) => {
      console.log({ f: "S_VARCHAR", value })
      return value
    },
    [types.XID]: (value) => {
      console.log({ f: "S_XID", value })
      return value
    },
    [types.XML]: (value) => {
      console.log({ f: "S_XML", value })
      return value
    },
    [16385]: (value) => {
      console.log({ f: "S_16385", value })
      return value
    }
  },
  transformJson: false,
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})

export const Client2 = LibsqlClient.layer({
  url: "file:data.db",
  transformQueryNames: String.camelToSnake,
  transformResultNames: String.snakeToCamel
})

pipe(
  App,
  Effect.provide(Migrator.pipe(Layer.provideMerge(Client))),
  Effect.tapBoth({
    onFailure: (error) => Effect.sync(() => Effect.logError(`💥 Error: ${error}`)),
    onSuccess: (result) => Effect.sync(() => Effect.logInfo(result))
  }),
  Logger.withMinimumLogLevel(LogLevel.Debug),
  Effect.runPromise
)
