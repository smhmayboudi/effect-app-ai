/**
 * @since 1.0.0
 */
import * as Reactivity from "@effect/experimental/Reactivity"
import * as SqlClient from "@effect/sql/SqlClient"
import type * as SqlConnection from "@effect/sql/SqlConnection"
import * as SqlError from "@effect/sql/SqlError"
import * as Statement from "@effect/sql/Statement"
import * as Pglite from "@electric-sql/pglite"
import type * as basefs from "@electric-sql/pglite/basefs"
import * as Config from "effect/Config"
import type * as ConfigError from "effect/ConfigError"
import * as Context from "effect/Context"
import * as Effect from "effect/Effect"
import * as Layer from "effect/Layer"
import * as Option from "effect/Option"
import * as Scope from "effect/Scope"

const ATTR_DB_SYSTEM_NAME = "db.system.name"

export type PGlite<O extends Pglite.PGliteOptions> = Pglite.PGlite & Pglite.PGliteInterfaceExtensions<O["extensions"]>

/**
 * @category type ids
 * @since 1.0.0
 */
export const TypeId: unique symbol = Symbol.for("@effect/sql-pglite/PgliteClient")

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
}

/**
 * @category tags
 * @since 1.0.0
 */
export const PgliteClient = Context.GenericTag<PgliteClient>("@effect/sql-pglite/PgliteClient")

const PgliteTransaction = Context.GenericTag<readonly [PGliteConnection, counter: number]>(
  "@effect/sql-pglite/PgliteClient/PgliteTransaction"
)

/**
 * @category models
 * @since 1.0.0
 */
export interface PgliteClientConfig<O extends Pglite.PGliteOptions> {
  readonly spanAttributes?: Record<string, unknown> | undefined
  readonly transformResultNames?: ((str: string) => string) | undefined
  readonly transformQueryNames?: ((str: string) => string) | undefined
  readonly transformJson?: boolean | undefined

  dataDir?: string
  username?: string
  database?: string
  fs?: basefs.Filesystem
  debug?: Pglite.DebugLevel
  relaxedDurability?: boolean
  extensions?: Pglite.Extensions
  loadDataDir?: Blob | File
  initialMemory?: number
  wasmModule?: WebAssembly.Module
  fsBundle?: Blob | File
  parsers?: Pglite.ParserOptions
  serializers?: Pglite.SerializerOptions

  readonly liveClient?: PGlite<O>
}

type PGliteConnection = SqlConnection.Connection

/**
 * @category constructor
 * @since 1.0.0
 */
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
      console.log({ type, placeholder, withoutTransform })
      // throw new Error("onCustom not implemented for PGlite")
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
      const sql = `(${columns.join(", ")}) VALUES ${placeholders}${returning ? ` RETURNING ${returning[0]}` : ""}`
      const vals = values.flat().map((a) =>
        typeof a === "boolean" || typeof a === "number" || typeof a === "string"
          ? a
          : JSON.stringify(a)
      )

      return [sql, returning ? vals.concat(returning[1] as any) : vals]
    },
    onRecordUpdate: (
      _placeholders,
      _alias,
      columns,
      values,
      returning
    ) => {
      const ids = values.map((row) => row[0])
      const columnNames = columns.slice(1, columns.length - 1).split(",")
      const setClauses = columnNames
        .filter((col) => col !== "id")
        .map((col) => {
          const cases = values.map((row, index) => {
            const valueIndex = columnNames.indexOf(col)
            return `WHEN id = $${index * columnNames.length + 1} THEN $${index * columnNames.length + valueIndex + 1}`
          }).join(" ")

          return `${col} = CASE ${cases} ELSE ${col} END`
        })
        .join(", ")
      const sql = `${setClauses} WHERE id IN (${ids.map((_, i) => `$${i * columnNames.length + 1}`).join(", ")})${
        returning ? ` RETURNING ${returning[0]}` : ""
      }`.trim()
      const vals = values.flat().map((a) =>
        typeof a === "boolean" || typeof a === "number" || typeof a === "string"
          ? a
          : JSON.stringify(a)
      )

      return [sql, returning ? vals.concat(returning[1] as any) : vals]
    },
    onRecordUpdateSingle: (
      columns,
      values,
      returning
    ) => {
      const sql = `${columns.map((a, i) => `${a}=$${i + 1}`).join(", ")}${
        returning ? ` RETURNING ${returning[0]}` : ""
      }`
      const vals = values.map((a) =>
        typeof a === "boolean" || typeof a === "number" || typeof a === "string"
          ? a
          : JSON.stringify(a)
      )

      return [sql, returning ? vals.concat(returning[1] as any) : vals]
    },
    placeholder: (index, _value) => `$${index}`
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
            catch: (cause) => new SqlError.SqlError({ cause, message: "Failed to execute statement" })
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
          catch: (cause) => new SqlError.SqlError({ cause, message: "Failed to execute statement" })
        })
      }

      execute(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ): Effect.Effect<ReadonlyArray<any>, SqlError.SqlError> {
        return transformRows
          ? Effect.map(this.run(sql, params), transformRows as any)
          : this.run(sql, params)
      }

      executeRaw(sql: string, params: ReadonlyArray<unknown>) {
        return this.runRaw(sql, params)
      }

      executeValues(sql: string, params: ReadonlyArray<unknown>) {
        return Effect.map(this.run(sql, params), (rows) => rows.map((row) => Array.from(row as any) as Array<any>))
      }

      executeUnprepared(
        sql: string,
        params: ReadonlyArray<unknown>,
        transformRows: (<A extends object>(row: ReadonlyArray<A>) => ReadonlyArray<A>) | undefined
      ) {
        return this.execute(sql, params, transformRows)
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
