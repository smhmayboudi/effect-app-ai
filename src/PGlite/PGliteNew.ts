/**
 * @since 1.0.0
 */
import * as Reactivity from "@effect/experimental/Reactivity"
import * as SqlClient from "@effect/sql/SqlClient"
import type * as SqlConnection from "@effect/sql/SqlConnection"
import * as SqlError from "@effect/sql/SqlError"
import * as Statement from "@effect/sql/Statement"
import * as Pglite from "@electric-sql/pglite"
import * as Config from "effect/Config"
import type * as ConfigError from "effect/ConfigError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Scope from "effect/Scope"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

type PGliteConnection = SqlConnection.Connection

const PgliteTransaction = Context.GenericTag<readonly [PGliteConnection, counter: number]>(
  "@effect/sql-pglite/PGliteNew/PgliteTransaction"
)

/**
 * @category type models
 * @since 1.0.0
 */
export type PGlite<O extends Pglite.PGliteOptions> = Pglite.PGlite & Pglite.PGliteInterfaceExtensions<O["extensions"]>

/**
 * @category type ids
 * @since 1.0.0
 */
export const TypeId: unique symbol = Symbol.for("@effect/sql-pglite/PGliteNew")

/**
 * @category type ids
 * @since 1.0.0
 */
export type TypeId = typeof TypeId

/**
 * @category models
 * @since 1.0.0
 */
export interface PgliteClient<O extends Pglite.PGliteOptions = Pglite.PGliteOptions> extends SqlClient.SqlClient {
  readonly [TypeId]: TypeId
  readonly config: PgliteClientConfig<O>
  readonly sdk: PGlite<O> | Pglite.Transaction
}

/**
 * @category tags
 * @since 1.0.0
 */
export const PgliteClient = Context.GenericTag<PgliteClient>("@effect/sql-pglite/PGliteNew")

/**
 * @category models
 * @since 1.0.0
 */
export interface PgliteClientConfig<O extends Pglite.PGliteOptions> extends Pglite.PGliteOptions {
  readonly spanAttributes?: Record<string, unknown> | undefined
  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
  readonly transformJson?: boolean | undefined

  readonly liveClient?: PGlite<O>
}

const makeCompiler = (
  transform?: (_: string) => string,
  transformJson = true
): Statement.Compiler => {
  const escape = Statement.defaultEscape("\"")
  const transformValue = transformJson && transform
    ? Statement.defaultTransforms(transform).value
    : undefined

  return Statement.makeCompiler<PgJson>({
    dialect: "pg",
    onCustom: (
      type,
      placeholder,
      withoutTransform
    ) => {
      switch (type.kind) {
        case "PgJson": {
          return [
            placeholder(undefined),
            [
              withoutTransform || transformValue === undefined
                ? type.i0
                : transformValue(type.i0)
            ]
          ]
        }
      }
    },
    onIdentifier: (value, withoutTransform) =>
      !transform || withoutTransform ? escape(value) : escape(transform(value)),
    onInsert: (
      columns,
      placeholders,
      values,
      returning
    ) => {
      const sql = `(${columns.join(",")}) VALUES ${placeholders}${returning ? ` RETURNING ${returning[0]}` : ""}`
      const params = values.flat().map((a) =>
        typeof a === "boolean" || typeof a === "number" || typeof a === "string" || !(a instanceof Array)
          ? a
          : `${JSON.stringify(a)}`
      )

      return [sql, returning ? params.concat(returning[1] as any) : params]
    },
    onRecordUpdate: (
      _placeholders,
      _alias,
      cols,
      values,
      returning
    ) => {
      const columns = cols.slice(1, cols.length - 1).split(",")
      const ids = values.map((row) => row[0])
      const setClauses = columns
        .filter((col) => col !== "id")
        .map((col) => {
          const cases = values.map((_row, index) => {
            const valueIndex = columns.indexOf(col)
            return `WHEN id = $${index * columns.length + 1} THEN $${index * columns.length + valueIndex + 1}`
          }).join(" ")

          return `${col} = CASE ${cases} ELSE ${col} END`
        })
        .join(",")
      const sql = `${setClauses} WHERE id IN (${ids.map((_, i) => `$${i * columns.length + 1}`).join(",")})${
        returning ? ` RETURNING ${returning[0]}` : ""
      }`.trim()
      const params = values.flat().map((a) =>
        typeof a === "boolean" || typeof a === "number" || typeof a === "string" || !(a instanceof Array)
          ? a
          : `${JSON.stringify(a)}`
      )

      return [sql, returning ? params.concat(returning[1] as any) : params]
    },
    onRecordUpdateSingle: (
      columns,
      vals,
      returning
    ) => {
      const values = [vals]
      const ids = values.map((row) => row[0])
      const setClauses = columns
        .filter((col) => col !== "id")
        .map((col) => {
          const cases = values.map((_row, index) => {
            const valueIndex = columns.indexOf(col)
            return `WHEN id = $${index * columns.length + 1} THEN $${index * columns.length + valueIndex + 1}`
          }).join(" ")

          return `${col} = CASE ${cases} ELSE ${col} END`
        })
        .join(",")
      const sql = `${setClauses} WHERE id IN (${ids.map((_, i) => `$${i * columns.length + 1}`).join(",")})${
        returning ? ` RETURNING ${returning[0]}` : ""
      }`.trim()
      const params = values.flat().map((a) =>
        typeof a === "boolean" || typeof a === "number" || typeof a === "string" || !(a instanceof Array)
          ? a
          : `${JSON.stringify(a)}`
      )

      return [sql, returning ? params.concat(returning[1] as any) : params]
    },
    placeholder: (index, _value) => {
      return `$${index}`
    }
  })
}

/**
 * @category constructor
 * @since 1.0.0
 */
export const make = <O extends Pglite.PGliteOptions>(
  options: PgliteClientConfig<O>
): Effect.Effect<PgliteClient, never, Scope.Scope | Reactivity.Reactivity> =>
  Effect.gen(function*() {
    const compiler = makeCompiler(
      options.transformQueryNames,
      options.transformJson
    )
    const transformRows = options.transformResultNames ?
      Statement.defaultTransforms(
        options.transformResultNames,
        options.transformJson
      ).array :
      undefined

    const spanAttributes: Array<[string, unknown]> = [
      ...(options.spanAttributes ? Object.entries(options.spanAttributes) : []),
      [ATTR_DB_SYSTEM_NAME, "pglite"]
    ]

    class PGliteConnectionImpl implements PGliteConnection {
      constructor(readonly sdk: PGlite<O> | Pglite.Transaction) {}

      run(
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) {
        return Effect.map(
          Effect.tryPromise({
            try: () => this.sdk.query(sql, params as Array<any>),
            catch: (cause) => new SqlError.SqlError({ cause, message: "Failed to run statement" })
          }),
          (results) => results.rows
        )
      }

      runRaw(
        sql: string,
        params: ReadonlyArray<unknown> = []
      ) {
        return Effect.tryPromise({
          try: () => this.sdk.query(sql, params as Array<any>),
          catch: (cause) => new SqlError.SqlError({ cause, message: "Failed to runRaw statement" })
        })
      }

      execute(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ): Effect.Effect<ReadonlyArray<any>, SqlError.SqlError> {
        return transformRows
          ? Effect.map(
            this.run(sql, params).pipe(
              Effect.mapError((cause) => new SqlError.SqlError({ cause, message: "Failed to execute statement" }))
            ),
            transformRows as any
          )
          : this.run(sql, params).pipe(
            Effect.mapError((cause) => new SqlError.SqlError({ cause, message: "Failed to execute statement" }))
          )
      }

      executeRaw(sql: string, params: ReadonlyArray<unknown>) {
        return this.runRaw(sql, params).pipe(
          Effect.mapError((cause) => new SqlError.SqlError({ cause, message: "Failed to executeRaw statement" }))
        )
      }

      executeValues(sql: string, params: ReadonlyArray<unknown>) {
        return Effect.map(
          this.run(sql, params).pipe(
            Effect.mapError((cause) => new SqlError.SqlError({ cause, message: "Failed to executeValues statement" }))
          ),
          (rows) => rows.map((row) => Array.from(row as any) as Array<any>)
        )
      }

      executeUnprepared(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ) {
        return this.execute(sql, params, transformRows).pipe(
          Effect.mapError((cause) => new SqlError.SqlError({ cause, message: "Failed to executeUnprepared statement" }))
        )
      }

      executeStream() {
        return Effect.dieMessage("executeStream not implemented")
      }
    }

    const connection = "liveClient" in options
      ? new PGliteConnectionImpl(options.liveClient)
      : yield* Effect.map(
        Effect.acquireRelease(
          Effect.promise(() => Pglite.PGlite.create(options as O)),
          (sdk) => Effect.sync(() => sdk.close())
        ),
        (sdk) => new PGliteConnectionImpl(sdk)
      )

    // Create transaction support by properly integrating with PGlite's transaction functionality
    const withTransaction = SqlClient.makeWithTransaction({
      transactionTag: PgliteTransaction,
      spanAttributes,
      acquireConnection: Effect.uninterruptibleMask((restore) =>
        Scope.make().pipe(
          Effect.flatMap((scope) =>
            restore(Effect.succeed(connection as PGliteConnection)).pipe(
              Effect.flatMap((conn) =>
                conn.executeUnprepared("BEGIN", [], undefined).pipe(
                  Effect.as([scope, conn] as const),
                  Effect.ensuring(
                    // Add finalizer to ensure the transaction is properly closed if not committed
                    Effect.orDie(conn.executeUnprepared("ROLLBACK", [], undefined)).pipe(
                      Effect.ignore
                    )
                  )
                )
              )
            )
          )
        )
      ),
      begin: (_conn) => Effect.void, // Already started in acquireConnection
      savepoint: (conn, id) => conn.executeUnprepared(`SAVEPOINT effect_sql_${id};`, [], undefined),
      commit: (conn) => conn.executeUnprepared("COMMIT", [], undefined),
      rollback: (conn) => conn.executeUnprepared("ROLLBACK", [], undefined),
      rollbackSavepoint: (conn, id) => conn.executeUnprepared(`ROLLBACK TO SAVEPOINT effect_sql_${id};`, [], undefined)
    })

    const acquirer = Effect.flatMap(
      Effect.serviceOption(PgliteTransaction),
      Option.match({
        onNone: () => Effect.succeed(connection as PGliteConnection),
        onSome: ([conn]) => Effect.succeed(conn)
      })
    )

    return Object.assign(
      yield* SqlClient.make({
        acquirer,
        beginTransaction: "BEGIN",
        commit: "COMMIT",
        compiler,
        rollback: "ROLLBACK",
        rollbackSavepoint: (id: string) => `ROLLBACK TO SAVEPOINT ${id}`,
        savepoint: (id: string) => `SAVEPOINT ${id}`,
        spanAttributes,
        transactionAcquirer: Effect.succeed(connection as PGliteConnection), // Provide a direct acquirer for transactions
        transformRows
      }),
      {
        [TypeId]: TypeId as TypeId,
        config: options,
        withTransaction,
        sdk: connection.sdk
      }
    )
  })

/**
 * @category layers
 * @since 1.0.0
 */
export const layerConfig = <O extends Pglite.PGliteOptions>(
  config: Config.Config.Wrap<PgliteClientConfig<O>>
): Layer.Layer<PgliteClient | SqlClient.SqlClient, ConfigError.ConfigError> =>
  Layer.scopedContext(
    Config.unwrap(config).pipe(
      Effect.flatMap(make),
      Effect.map((client) =>
        Context.make(PgliteClient, client).pipe(
          Context.add(SqlClient.SqlClient, client)
        )
      )
    )
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * @category layers
 * @since 1.0.0
 */
export const layer = <O extends Pglite.PGliteOptions>(
  config: PgliteClientConfig<O>
): Layer.Layer<PgliteClient | SqlClient.SqlClient> =>
  Layer.scopedContext(
    Effect.map(make(config), (client) =>
      Context.make(PgliteClient, client).pipe(
        Context.add(SqlClient.SqlClient, client)
      ))
  ).pipe(Layer.provide(Reactivity.layer))

/**
 * @category custom types
 * @since 1.0.0
 */
export type PgCustom = PgJson

/**
 * @category custom types
 * @since 1.0.0
 */
interface PgJson extends Statement.Custom<"PgJson", unknown> {}
/**
 * @category custom types
 * @since 1.0.0
 */
const PgJson = Statement.custom<PgJson>("PgJson")