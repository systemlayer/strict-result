# Repository Guidelines

- Use snake_case for file and directory names unless the name is provided by a third party (for example, `package-lock.json`).
- Functions shorter than 30 lines must not contain blank lines.
- Prefix imports from native Node.js packages with `node:`.
- For long functions, prefer an explicit `return` keyword over arrow-function syntax with an implicit return.
- When adding JSDoc to TypeScript files, avoid redundant tags; for example, omit `@returns` when the function already declares a TypeScript return type.
