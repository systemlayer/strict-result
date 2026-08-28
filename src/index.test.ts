import assert from "node:assert/strict"
import { test } from "node:test"
import { Err, NamedErr, Ok, stringifyError, unpack } from "./index.ts"

test("Ok exposes and transforms its value", () => {
  const result = Ok(21)
  assert.equal(result.type, "ok")
  assert.equal(result.isOk(), true)
  assert.equal(result.isErr(), false)
  assert.equal(result.unwrap(), 21)
  assert.equal(result.unwrapOr(0), 21)
  assert.deepEqual(result.map((value) => value * 2), Ok(42))
  assert.deepEqual(result.mapErr(() => "mapped"), Ok(21))
  assert.equal(result.mapOrElse(() => 0, (value) => value + 1), 22)
  assert.equal(result.toJSON(), "21")
})

test("Err preserves raw errors and uses fallback operations", () => {
  const error = { code: "broken" }
  const result = Err(error, true)
  assert.equal(result.type, "err")
  assert.equal(result.isOk(), false)
  assert.equal(result.isErr(), true)
  assert.equal(result.error, error)
  assert.equal(result.unwrapOr("fallback"), "fallback")
  assert.equal(result.map(() => "mapped"), result)
  assert.deepEqual(result.mapErr((value) => value.code), Err("broken", true))
  assert.equal(result.mapOrElse((value) => value.code, () => "mapped"), "broken")
  assert.equal(result.toJSON(), '{\n  "code": "broken"\n}')
})

test("Err stringifies errors unless raw mode is requested", () => {
  assert.equal(Err("failure").error, "failure")
  assert.equal(Err(new Error("failure")).error, "failure")
  assert.equal(Err({ reason: "failure" }).error, '{\n  "reason": "failure"\n}')
})

test("Err has the same inner value in raw and default modes for strings", () => {
  assert.equal(Err("failure", true).error, Err("failure").error)
})

test("unwrap throws strings, Error instances, and structured errors", () => {
  assert.throws(() => Err("failure", true).unwrap(), new Error("failure"))
  const error = new TypeError("failure")
  assert.throws(() => Err(error, true).unwrap(), (thrown: unknown) => thrown === error)
  assert.throws(
    () => Err({ reason: "failure" }, true).unwrap(),
    (thrown: unknown) => thrown instanceof Error && thrown.message.includes('"reason": "failure"'),
  )
})

test("stringifyError handles Zod-like and circular values", () => {
  const zodError = { name: "ZodError", issues: [{ path: ["name"], message: "Required" }] }
  assert.equal(stringifyError(zodError), JSON.stringify(zodError.issues, null, 2))
  const circular: { self?: unknown } = {}
  circular.self = circular
  assert.equal(stringifyError(circular), '{\n  "self": "[Circular]"\n}')
})

test("NamedErr prefixes a stringified error", () => {
  assert.deepEqual(NamedErr("parse", new Error("invalid input")), Err("parse: invalid input"))
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
