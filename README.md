# strict-result

[![npm version](https://img.shields.io/npm/v/strict-result.svg)](https://www.npmjs.com/package/strict-result)
[![npm downloads](https://img.shields.io/npm/dm/strict-result.svg)](https://www.npmjs.com/package/strict-result)
[![license](https://img.shields.io/npm/l/strict-result.svg)](https://github.com/systemlayer/strict-result/blob/main/package.json)

Handle success and failure explicitly with a type-safe, Rust-inspired `Result`
for TypeScript.

`strict-result` represents an operation as either `Ok(value)` or `Err(error)`.
Checking the result narrows its type, so successful values and failures can be
handled without exceptions, unsafe casts, or optional properties.

## Why use strict-result?

As a project grows, functions can develop inconsistent ways of reporting
failure. One function might return a string or `null`, while another returns an
array or an object. Without a shared convention and clear type constraints,
callers must guess which values represent success and which represent failure.

`Result` gives these functions a consistent return type: `Ok` for success and
`Err` for failure. Because the two outcomes are represented explicitly, callers
must distinguish between them before TypeScript allows access to the successful
value. This encourages developers to handle expected failures where they occur,
rather than throwing exceptions or optimistically assuming an operation will
succeed.

## When to return a Result

Return `Result` for expected failures that callers may reasonably handle or
propagate, such as invalid input, a failed network request, or a required record
not being found.

Throw when the program reaches an unrecoverable state, such as a violated
invariant or a condition that should be impossible. As with Rust's `panic!`,
throwing should indicate a bug or failed assumption, not serve as the normal way
to report operational failures.

## Features

- Discriminated `Result<O, E>` union with TypeScript type narrowing
- Familiar helpers such as `map`, `mapErr`, `unwrap`, `unwrapOr`, and
  `mapOrElse`
- String errors by default, with opt-in support for custom error types
- Utilities for normalizing unknown errors and unpacking results
- Small, dependency-free ESM package

## Installation

```sh
npm install strict-result
```

## Quick start

```ts
import { Err, Ok, type Result } from "strict-result"

async function safeFetch(
  ...args: Parameters<typeof fetch>
): Promise<Result<Response, string>> {
  try {
    return Ok(await fetch(...args))
  } catch (error) {
    return Err(error)
  }
}

const result = await safeFetch("https://jsonplaceholder.typicode.com/todos/1")

if (result.isErr()) {
  console.error(`Request failed: ${result.error}`)
} else {
  // result is narrowed to OkBranch<Response> here.
  console.log(await result.value.json())
}
```

## Custom error types

By default, `Err(error)` converts an unknown error to a string. Pass `true` as
the second argument to preserve a structured error value.

```ts
import { Err, Ok, stringifyError, type Result } from "strict-result"

interface HttpRequestError {
  message: string
  status?: number
}

async function safeFetch(
  ...args: Parameters<typeof fetch>
): Promise<Result<Response, HttpRequestError>> {
  try {
    const response = await fetch(...args)

    if (response.status >= 400) {
      return Err(
        { message: response.statusText, status: response.status },
        true,
      )
    }

    return Ok(response)
  } catch (error) {
    return Err({ message: stringifyError(error) }, true)
  }
}
```

For repeated error construction, return an error-only result from a helper:

By convention, name custom error helpers in PascalCase and end their names with
`Err`, such as `HttpErr`. This makes them recognizable as specialized `Err`
constructors rather than `Error` classes or general-purpose functions.

```ts
import { Err, stringifyError, type Result } from "strict-result"

interface HttpRequestError {
  message: string
  status?: number
}

function HttpErr(
  error: unknown,
  status?: number,
): Result<never, HttpRequestError> {
  return Err({ message: stringifyError(error), status }, true)
}
```

The fetch wrapper can then replace its inline custom errors with `HttpErr`:

```diff
 async function safeFetch(
   ...args: Parameters<typeof fetch>
 ): Promise<Result<Response, HttpRequestError>> {
   try {
     const response = await fetch(...args)

     if (response.status >= 400) {
-      return Err(
-        { message: response.statusText, status: response.status },
-        true,
-      )
+      return HttpErr(response.statusText, response.status)
     }

     return Ok(response)
   } catch (error) {
-    return Err({ message: stringifyError(error) }, true)
+    return HttpErr(error)
   }
 }
```

## Transforming results

```ts
import { Err, Ok, type Result } from "strict-result"

const doubled = Ok(21).map((value) => value * 2)
doubled.unwrap() // 42

const unavailable: Result<string, string> = Err("not available")
unavailable.unwrapOr("fallback") // "fallback"

const status = unavailable.mapErr((error) => ({ message: error }))
// Err({ message: "not available" })

const message = Ok(3).mapOrElse(
  (error) => `Failed: ${error}`,
  (value) => `Received: ${value}`,
)
// "Received: 3"
```

`map()` transforms only the successful value, while `mapErr()` transforms only
the error. The other branch is returned unchanged.

`unwrap()` returns an `Ok` value and throws when called on an `Err`. Prefer
`isOk()`, `isErr()`, `unwrapOr()`, or `mapOrElse()` when failure is expected.

## Unpacking results

Use `unpack` when code is easier to consume with a value and error available as
separate fields. The fallback guarantees that `value` is non-nullish.

```ts
import { Err, unpack, type Result } from "strict-result"

const result: Result<string, { status: number }> = Err({ status: 503 }, true)
const { value, error } = unpack(result, "No data available")

console.log(value) // "No data available"
console.log(error) // { status: 503 }
```

For an `Ok` result, `value` contains the successful value and `error` is
`null`. A nullish successful value is replaced by the provided fallback.

## React example

A result can also model the state returned by a hook:

```tsx
import { useEffect, useState } from "react"
import { Err, Ok, type Result } from "strict-result"

export function useSafeFetch(url: string): Result<Response | null, string> {
  const [result, setResult] = useState<Result<Response | null, string>>(Ok(null))

  useEffect(() => {
    let active = true

    void fetch(url)
      .then((response) => Ok<Response | null>(response))
      .catch((error) => Err(error))
      .then((nextResult) => {
        if (active) {
          setResult(nextResult)
        }
      })

    return () => {
      active = false
    }
  }, [url])

  return result
}
```

In a production hook, consider representing loading as a separate state rather
than treating `Ok(null)` as both the initial and successful empty state.

## API

### Types

#### `Result<O, E = undefined>`

A union of `OkBranch<O>` and `ErrBranch<E>`. Every `Result` has a `type`
discriminant (`"ok"` or `"err"`) and the methods listed below.

#### `OkBranch<O>`

The successful branch of a `Result`. Its payload is available as `value`.

#### `ErrBranch<E>`

The failed branch of a `Result`. Its payload is available as `error`.

#### `UnpackedResult<O, E>`

An object returned by `unpack`, containing a non-nullish `value` and either an
`error` or `null`.

### Constructors and utilities

#### `Ok(value)`

Creates a successful `Result` containing `value`.

#### `Err(error, raw?)`

Creates a failed `Result`. Without `raw`, the error is normalized to a string.
Pass `true` to preserve the original error value and type.

#### `NamedErr(name, error)`

Creates a string error prefixed with a name, such as
`NamedErr("parse", error)`.

#### `stringifyError(error)`

Converts an unknown thrown value to a useful string. It handles strings,
`Error` instances, Zod-like errors, plain objects, and circular references.

#### `unpack(result, defaultValue)`

Converts a `Result` into `{ value, error }`. An `Err` uses `defaultValue`; an
`Ok` uses its contained value, or `defaultValue` when that value is nullish.

### Result methods

| Method | Description |
| --- | --- |
| `isOk()` | Returns `true` for an `Ok` and narrows the `Result` type. |
| `isErr()` | Returns `true` for an `Err` and narrows the `Result` type. |
| `unwrap()` | Extracts the value from an `Ok`; throws when called on an `Err`. |
| `unwrapOr(defaultValue)` | Returns the successful value or a fallback. |
| `map(fn)` | Transforms an `Ok` value and leaves an `Err` unchanged. |
| `mapErr(fn)` | Transforms an `Err` error and leaves an `Ok` unchanged. |
| `mapOrElse(defaultFn, mapFn)` | Maps either branch into a plain value. |
| `toJSON()` | Converts the contained value or error to a JSON-style string. |

## Runtime support

`strict-result` is published as an ECMAScript module and includes TypeScript
declarations. Its output targets ES2022-compatible runtimes.

## Development

```sh
npm install
npm test
npm run build
```

## License

[MIT](https://opensource.org/license/mit)
