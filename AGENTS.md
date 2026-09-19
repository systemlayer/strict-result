# Repository Guidelines

- Use snake_case for file and directory names unless the name is provided by a third party (for example, `package-lock.json`).
- Functions shorter than 30 lines must not contain blank lines.
- Prefix imports from native Node.js packages with `node:`.
- Use `Result` for recoverable or expected failures; throw errors for unrecoverable errors, unreachable states, or programming bugs.
- When writing new code, prefer placing declarations before their first use. This is a soft preference, not a hard rule.
- For long functions, prefer an explicit `return` keyword over arrow-function syntax with an implicit return.
- When adding JSDoc to TypeScript files, avoid redundant tags; for example, omit `@returns` when the function already declares a TypeScript return type.
- Do not use JSDoc `@link` tags.
