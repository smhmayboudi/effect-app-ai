/**
 * @since 1.0.0
 * @category errors
 */

import { Data } from "effect"

/**
 * @since 1.0.0
 * @category errors
 * @description Error class for AI service related failures
 */
export class AIServiceError extends Data.TaggedClass("AIServiceError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * @since 1.0.0
 * @category errors
 * @description Error class for business logic related failures
 */
export class BusinessLogicError extends Data.TaggedClass("BusinessLogicError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * @since 1.0.0
 * @category errors
 * @description Error class for database related failures
 */
export class DatabaseError extends Data.TaggedClass("DatabaseError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * @since 1.0.0
 * @category errors
 * @description Error class for embedding related failures
 */
export class EmbeddingError extends Data.TaggedClass("EmbeddingError")<{
  readonly message: string
  readonly cause?: unknown
}> {}

/**
 * @since 1.0.0
 * @category errors
 * @description Error class for vector store related failures
 */
export class VectorStoreError extends Data.TaggedClass("VectorStoreError")<{
  readonly message: string
  readonly cause?: unknown
}> {}
