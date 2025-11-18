import { SqlClient } from "@effect/sql"
import { LibsqlClient } from "@effect/sql-libsql"
import { Effect, Layer, pipe, String } from "effect"

export const App = Effect.scoped(Effect.gen(function*() {
  const sql = yield* SqlClient.SqlClient
  yield* sql`
    INSERT INTO movies (id, title, year, embedding)
    VALUES
      ('1', 'Napoleon', 2023, vector('[0.800, 0.579, 0.481, 0.229]')),
      ('2', 'Black Hawk Down', 2001, vector('[0.406, 0.027, 0.378, 0.056]')),
      ('3', 'Gladiator', 2000, vector('[0.698, 0.140, 0.073, 0.125]')),
      ('4', 'Blade Runner', 1982, vector('[0.379, 0.637, 0.011, 0.647]'));
  `
  const a = yield* sql`
    SELECT title, year, vector_extract(embedding) as embedding, vector_distance_cos(embedding, vector('[0.064, 0.777, 0.661, 0.687]')) as distance
    FROM vector_top_k('movies_idx', vector('[0.064, 0.777, 0.661, 0.687]'), 3) AS knn
    JOIN movies ON movies.rowid = knn.id
    WHERE year >= 2020;
  `
  console.log({ a })
}))

export const Migrator = Layer.effectDiscard(
  Effect.gen(function*() {
    const sql = yield* SqlClient.SqlClient

    yield* sql`
      CREATE TABLE movies (
        id TEXT PRIMARY KEY,
        title TEXT,
        year INT,
        embedding FLOAT32(4)
      );
    `
    yield* sql`
      CREATE INDEX movies_idx ON movies(libsql_vector_idx(embedding));
    `
  })
)

const Client = LibsqlClient.layer({
  url: "file:data.db",
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
