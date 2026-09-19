import assert from "node:assert/strict"
import { test } from "node:test"
import {
  Err,
  Ok,
  PrefixedErr,
  toDisplayString,
  unpack,
  type ErrBranch,
  type OkBranch,
  type Result,
} from "./index.ts"

function assertResultOpsTypes(result: Result<number, { code: string }>): void {
  if (result.isOk()) {
    const ok: OkBranch<number> = result
    void ok
    // @ts-expect-error An Ok branch has no error.
    void result.error
  }
  if (result.isErr()) {
    const error: ErrBranch<{ code: string }> = result
    void error
    // @ts-expect-error An Err branch has no value.
    void result.value
  }
  const value: number = result.unwrap()
  const fallback: number = result.unwrapOr(0)
  const mapped: Result<string, { code: string }> = result.map(value => `${value}`)
  const mappedError: Result<number, string> = result.mapErr(error => error.code)
  const folded: string = result.mapOrElse(error => error.code, value => `${value}`)
  // These values only exist to check their types.
  // Using void keeps TypeScript happy without doing anything with them.
  void [value, fallback, mapped, mappedError, folded]
  // @ts-expect-error The fallback must match the successful value type.
  result.unwrapOr("fallback")
  // @ts-expect-error The map callback receives the successful value type.
  result.map((value: string) => value)
  // @ts-expect-error The mapErr callback receives the error type.
  result.mapErr((error: number) => error)
}

// This helper is never called; TypeScript checks its body to ensure these properties stay readonly.
function assertResultInvariantsAreReadonly(
  ok: OkBranch<number>,
  error: ErrBranch<{ code: string }>,
): void {
  // @ts-expect-error The Ok discriminator is readonly.
  ok.type = "ok"
  // @ts-expect-error The successful value is readonly.
  ok.value = 42
  // @ts-expect-error The Err discriminator is readonly.
  error.type = "err"
  // @ts-expect-error The contained error is readonly.
  error.error = { code: "changed" }
}

test("isOk and isErr identify both result branches", () => {
  const ok = Ok(21)
  const error = Err("failure")
  assert.equal(ok.type, "ok")
  assert.equal(ok.isOk(), true)
  assert.equal(ok.isErr(), false)
  assert.equal(error.type, "err")
  assert.equal(error.isOk(), false)
  assert.equal(error.isErr(), true)
})

test("unwrap returns the exact successful value", () => {
  const value = { answer: 42 }
  assert.equal(Ok(value).unwrap(), value)
})

test("unwrap throws strings, Error instances, and structured errors", () => {
  assert.throws(
    () => Err("failure", true).unwrap(),
    (thrown: unknown) => thrown instanceof Error && thrown.message === "failure",
  )
  const error = new TypeError("failure")
  assert.throws(() => Err(error, true).unwrap(), (thrown: unknown) => thrown === error)
  assert.throws(
    () => Err({ reason: "failure" }, true).unwrap(),
    (thrown: unknown) => thrown instanceof Error
      && thrown.message === '{"reason":"failure"}',
  )
})

test("unwrapOr selects the successful value or exact fallback", () => {
  const value = { source: "ok" }
  const fallback = { source: "fallback" }
  assert.equal(Ok(value).unwrapOr(fallback), value)
  assert.equal(Err("failure").unwrapOr(fallback), fallback)
})

test("map invokes its callback once and returns a chainable Ok", () => {
  let invocations = 0
  const mapped = Ok(21).map((value) => {
    invocations += 1
    assert.equal(value, 21)
    return value * 2
  })
  assert.equal(invocations, 1)
  assert.deepEqual(mapped, Ok(42))
  assert.equal(mapped.map(value => value + 1).unwrap(), 43)
})

test("map leaves an Err unchanged without invoking its callback", () => {
  const result = Err({ code: "broken" }, true)
  const mapped = result.map(() => {
    throw new Error("unexpected map callback")
  })
  assert.equal(mapped, result)
})

test("mapErr invokes its callback once and preserves the raw mapped error", () => {
  const mappedError = new TypeError("mapped")
  let invocations = 0
  const mapped = Err({ code: "broken" }, true).mapErr((error) => {
    invocations += 1
    assert.equal(error.code, "broken")
    return mappedError
  })
  assert.equal(invocations, 1)
  assert.equal(mapped.isErr(), true)
  if (!mapped.isErr()) {
    assert.fail("mapErr returned an Ok")
  }
  assert.equal(mapped.error, mappedError)
  const remapped = mapped.mapErr(error => error.message)
  assert.equal(remapped.isErr(), true)
  if (!remapped.isErr()) {
    assert.fail("a chained mapErr returned an Ok")
  }
  assert.equal(remapped.error, "mapped")
})

test("mapErr leaves an Ok unchanged without invoking its callback", () => {
  const result = Ok(21)
  const mapped = result.mapErr(() => {
    throw new Error("unexpected mapErr callback")
  })
  assert.equal(mapped, result)
})

test("mapOrElse invokes only the Ok callback with the successful value", () => {
  let invocations = 0
  const output = Ok(21).mapOrElse(
    () => { throw new Error("unexpected error callback") },
    (value) => {
      invocations += 1
      return { doubled: value * 2 }
    },
  )
  assert.equal(invocations, 1)
  assert.deepEqual(output, { doubled: 42 })
})

test("mapOrElse invokes only the Err callback with the error", () => {
  let invocations = 0
  const output = Err({ code: "broken" }, true).mapOrElse(
    (error) => {
      invocations += 1
      return { message: error.code }
    },
    () => { throw new Error("unexpected value callback") },
  )
  assert.equal(invocations, 1)
  assert.deepEqual(output, { message: "broken" })
})

test("toDisplayString serializes primitives and structured values", () => {
  assert.equal(toDisplayString(21), "21")
  assert.equal(toDisplayString("value"), "value")
  const circular: { self?: unknown } = {}
  circular.self = circular
  assert.equal(toDisplayString(circular), '{"self":"[Circular]"}')
  assert.equal("toJSON" in Ok(21), false)
  assert.equal(toDisplayString(new Error("failure")), "failure")
  assert.equal(toDisplayString({ code: "broken" }), '{"code":"broken"}')
})

test("Err stringifies errors unless raw mode is requested", () => {
  const error = { reason: "failure" }
  assert.equal(Err("failure").error, "failure")
  assert.equal(Err(new Error("failure")).error, "failure")
  assert.equal(Err(error).error, '{"reason":"failure"}')
  assert.equal(Err(error, true).error, error)
})

test("Err has the same inner value in raw and default modes for strings", () => {
  assert.equal(Err("failure", true).error, Err("failure").error)
})

test("toDisplayString handles Zod-like and circular values", () => {
  const zodError = { name: "ZodError", issues: [{ path: ["name"], message: "Required" }] }
  assert.equal(toDisplayString(zodError), JSON.stringify(zodError.issues))
  const circular: { self?: unknown } = {}
  circular.self = circular
  assert.equal(toDisplayString(circular), '{"self":"[Circular]"}')
  assert.equal(toDisplayString(circular, true), '{\n  "self": "[Circular]"\n}')
})

test("toDisplayString falls back when JSON.stringify returns undefined", () => {
  assert.equal(toDisplayString(undefined), "undefined")
  assert.equal(toDisplayString(Symbol("value")), "Symbol(value)")
})

test("PrefixedErr prefixes a stringified error", () => {
  assert.deepEqual(
    PrefixedErr("could not parse", new Error("invalid input")),
    Err("could not parse: invalid input"),
  )
})

test("unpack returns successful values and substitutes nullish values", () => {
  assert.deepEqual(unpack(Ok("value"), "fallback"), { value: "value", error: null })
  assert.deepEqual(unpack(Ok<string | null>(null), "fallback"), {
    value: "fallback",
    error: null,
  })
})

test("unpack returns the fallback and error for Err", () => {
  const error = { code: 500 }
  assert.deepEqual(unpack(Err(error, true), "fallback"), { value: "fallback", error })
})

// Reference the helper so it remains part of strict compile-time type checking.
// Using void avoids executing assertions that intentionally contain invalid types.
void assertResultOpsTypes
void assertResultInvariantsAreReadonly
