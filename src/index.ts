const enum ResultType {
  Ok = "ok",
  Err = "err",
}

const resultOps = { isOk, isErr, unwrap, unwrapOr, map, mapErr, mapOrElse, toJSON } as const

type ResultOpsType = typeof resultOps

/** The successful branch of a {@link Result}, containing `value`. */
export type OkBranch<O> = { type: Readonly<ResultType.Ok>, value: O } & ResultOpsType

/** The failed branch of a {@link Result}, containing `error`. */
export type ErrBranch<E> = { type: Readonly<ResultType.Err>, error: E } & ResultOpsType

/**
 * Represents either a successful value or an error.
 */
export type Result<O, E = undefined>
  = | OkBranch<O>
    | ErrBranch<E>

// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Errors/Cyclic_object_value#examples
function getCircularReplacer() {
  const ancestors: unknown[] = []
  return function (this: unknown, _key: unknown, value: unknown) {
    if (typeof value !== "object" || value === null) {
      return value
    }
    // `this` is the object that value is contained in, i.e., its direct parent.
    while (ancestors.length > 0 && ancestors.at(-1) !== this) {
      ancestors.pop()
    }
    if (ancestors.includes(value)) {
      return "[Circular]"
    }
    ancestors.push(value)
    return value
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function inspect(obj: any): string {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore: TS is not aware of the variable on some environments
  if (typeof Deno !== "undefined") {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore: TS is not aware of the variable on some environments
    return Deno.inspect(obj)
  }
  return JSON.stringify(obj, getCircularReplacer(), 2)
}

/**
 * Converts an unknown thrown value into a useful string.
 *
 * Strings and `Error` messages are returned directly. Zod-like errors are
 * represented by their issues, while other values are serialized with
 * circular references replaced by `"[Circular]"`.
 */
export function stringifyError(error: unknown): string {
  if (typeof error === "string") {
    return error
  }
  const isZodError = !!error && (typeof error === "object") && ("name" in error)
    && ("issues" in error) && (error.name === "ZodError")
  if (isZodError) {
    return JSON.stringify(error.issues, null, 2)
  }
  if (error instanceof Error) {
    return error.message
  }
  return inspect(error)
}

/** Checks whether this result is an {@link OkResult} and narrows its type. */
function isOk<O, E>(
  this: Result<O, E>,
): this is OkBranch<O> {
  return this.type === ResultType.Ok
}

/** Checks whether this result is an {@link ErrResult} and narrows its type. */
function isErr<O, E>(
  this: Result<O, E>,
): this is ErrBranch<E> {
  return this.type === ResultType.Err
}

/**
 * Extracts the successful value.
 *
 * @throws The contained error for an `Err`. Non-`Error` values are converted
 * to an `Error` first.
 */
function unwrap<O, E>(this: Result<O, E>): O {
  if (this.isOk()) {
    return this.value
  }
  if (typeof this.error === "string") {
    throw new Error(this.error)
  }
  if (this.error instanceof Error) {
    throw this.error
  }
  throw new Error(inspect(this.error))
}

/** Extracts the successful value, or returns `defaultValue` for an `Err`. */
function unwrapOr<O, E>(
  this: Result<O, E>,
  defaultValue: O,
): O {
  if (this.isOk()) {
    return this.value
  }
  return defaultValue
}

/**
 * Transforms the successful value with `fn`, leaving an `Err` unchanged.
 */
function map<O, E, U>(
  this: Result<O, E>,
  fn: (value: O) => U,
): Result<U, E> {
  if (this.isOk()) {
    return Ok(fn(this.value))
  }
  return this
}

/**
 * Transforms the error with `fn`, leaving an `Ok` unchanged.
 */
function mapErr<O, E, U>(
  this: Result<O, E>,
  fn: (error: E) => U,
): Result<O, U> {
  if (this.isErr()) {
    return Err(fn(this.error), true)
  }
  return this
}

/**
 * Transforms an `Err` with `defaultFn` or an `Ok` with `mapFn`.
 *
 * The parameter order matches Rust's `Result::map_or_else`. Although unusual,
 * it can be read as "map if error, or else map the successful value."
 */
function mapOrElse<O, E, U>(
  this: Result<O, E>,
  defaultFn: (error: E) => U,
  mapFn: (value: O) => U,
): U {
  if (this.isOk()) {
    return mapFn(this.value)
  }
  return defaultFn(this.error)
}

/** Creates a successful result containing `value`. */
export function Ok<T>(value: T): OkBranch<T> {
  return { type: ResultType.Ok, value, ...resultOps }
}

/**
 * Creates a failed result.
 *
 * By default, `error` is normalized with {@link stringifyError}. Pass `true`
 * for `raw` to preserve the original value and its type.
 */
export function Err<E>(error: E, raw: true): ErrBranch<E>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Err<E>(
  error: unknown,
  raw?: false,
): ErrBranch<string>
export function Err<E>(
  error: E | unknown,
  raw = false,
): ErrBranch<E> | ErrBranch<string> {
  return raw
    ? { type: ResultType.Err, error: error as E, ...resultOps }
    : { type: ResultType.Err, error: stringifyError(error), ...resultOps }
}

// -----------------------------------------------------------------------------
// Additional functionality for Result that do not have a Rust equivalent.
// -----------------------------------------------------------------------------

/**
 * Converts the contained value or error into a JSON-style string.
 *
 * The returned string is not guaranteed to be reversible because circular
 * references are replaced and errors may be normalized.
 */
function toJSON<O, E>(this: Result<O, E>): string {
  return this.isOk() ? inspect(this.value) : stringifyError(this.error)
}

/**
 * Creates a string `Err` whose normalized error is prefixed with `name`.
 */
export function NamedErr(name: string, error: unknown): ErrBranch<string> {
  return Err(`${name}: ${stringifyError(error)}`)
}

/**
 * The object produced by {@link unpack}, containing a non-nullish value and an
 * error or `null`.
 */
export type UnpackedResult<O, E> = {
  value: NonNullable<O>,
  error: E | null,
}

/**
 * Converts a {@link Result} into an {@link UnpackedResult} with both `value` and
 * `error` fields.
 *
 * - An `Err` uses `defaultValue` and preserves its error.
 * - An `Ok` uses its contained value, or `defaultValue` if the contained value
 *   is `null` or `undefined`, and sets `error` to `null`.
 */
export const unpack = <O, E>(
  result: Result<O, E>,
  defaultValue: NonNullable<O>,
): UnpackedResult<O, E> => {
  return result.mapOrElse(
    (error): UnpackedResult<O, E> => ({ value: defaultValue, error }),
    (value): UnpackedResult<O, E> => ({ value: value ?? defaultValue, error: null }),
  )
}
