const enum ResultType {
  Ok = "ok",
  Err = "err",
}

const resultOps = { isOk, isErr, unwrap, unwrapOr, map, mapOrElse, toJSON } as const

type ResultOpsType = typeof resultOps

export type Result<O, E = undefined>
  = | { type: Readonly<ResultType.Ok>, value: O } & ResultOpsType
    | { type: Readonly<ResultType.Err>, error: E } & ResultOpsType

export type OkResult<O, E = undefined> = Extract<
  Result<O, E>,
  { type: ResultType.Ok }
>

export type ErrResult<O, E = undefined> = Extract<
  Result<O, E>,
  { type: ResultType.Err }
>

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

function isOk<O, E>(
  this: Result<O, E>,
): this is OkResult<O, E> {
  return this.type === ResultType.Ok
}

function isErr<O, E>(
  this: Result<O, E>,
): this is ErrResult<O, E> {
  return this.type === ResultType.Err
}

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

function unwrapOr<O, E>(
  this: Result<O, E>,
  defaultValue: O,
): O {
  if (this.isOk()) {
    return this.value
  }
  return defaultValue
}

function map<O, E, U>(
  this: Result<O, E>,
  fn: (value: O) => U,
): Result<U, E> {
  if (this.isOk()) {
    return Ok(fn(this.value))
  }
  return this
}

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

export function Ok<T>(value: T): OkResult<T> {
  return { type: ResultType.Ok, value, ...resultOps }
}

export function Err<E>(error: E, raw: true): ErrResult<undefined, E>
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function Err<E>(
  error: unknown,
  raw?: false,
): ErrResult<undefined, string>
export function Err<E>(
  error: E | unknown,
  raw = false,
): ErrResult<undefined, E> | ErrResult<undefined, string> {
  return raw
    ? { type: ResultType.Err, error: error as E, ...resultOps }
    : { type: ResultType.Err, error: stringifyError(error), ...resultOps }
}

// -----------------------------------------------------------------------------
// Additional functionality for Result that do not have a Rust equivalent.
// -----------------------------------------------------------------------------

/**
 * Converts the inner value into a JSON string. Returned string is not
 * guaranteed to be reversible into an usable value (due to circular references
 * and the way errors are stringified).
 */
function toJSON<O, E>(this: Result<O, E>): string {
  return this.isOk() ? inspect(this.value) : stringifyError(this.error)
}

/**
 * Creates a string `Err` prefixed with `name`. It automatically stringifies
 * whatever is passed as the `error` parameter.
 */
export function NamedErr(name: string, error: unknown): ErrResult<never, string> {
  return Err(`${name}: ${stringifyError(error)}`)
}

export type UnpackedResult<O, E> = {
  value: NonNullable<O>,
  error: E | null,
}

/**
 * Transforms a `Result` into an `UnpackedResult` object containing both `value`
 * and `error` fields.
 * * If the `Result` contains an error, returns the provided default value as
 *   `value` and the actual error.
 * * If the `Result` contains a value, returns the contained value and `null` for
 *   the error field.
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
