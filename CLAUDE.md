# Repository guide

This package is a dependency-free TypeScript robots.txt compiler and matcher. Version 2 has two public operations. `compileRobotsText()` creates crawler-scoped matchers, while `inspectRobotsText()` returns a parsed-line report.

Do not restore version 1 classes or compatibility aliases. The removed API includes `RobotsMatcher`, `ParsedRobots`, parser callbacks, `RobotsParsingReporter`, public matching strategies, and parser utility exports.

## Commands

```bash
bun install --frozen-lockfile
bun test
bun test tests/public-interface.test.ts
bun test --test-name-pattern "bulk methods"
bun run build
bun run format
```

The package targets Node.js 22 or newer and has no runtime dependencies.

## Code map

- `src/index.ts` exports the complete public API.
- `src/model.ts` defines public types, report records, evidence records, and `InvalidCrawlerIdentityError`.
- `src/compile.ts` validates policy and crawler inputs. It builds compiled documents, crawler-scoped matchers, and inspection reports.
- `src/engine.ts` contains policy-specific parsing, rule selection, URL path handling, pattern matching, decisions, and report collection.
- `tests/matcher.test.ts` keeps cases adapted from Google's C++ suite. Preserve upstream `describe()` labels when they help trace a case back to its source.
- `tests/google-parity.test.ts` records version 2 Google compatibility regressions.
- `tests/rfc9309-policy.test.ts` records behavior required by the strict policy.
- `tests/public-interface.test.ts` protects the public API, evidence, reports, validation, and bulk iterator contract.

## Design rules

Compilation and inspection are separate on purpose. A compiled matcher must not retain parsed-line report data.

Bind crawler identity before matching URLs. `forCrawler()` normalizes a valid `Product` or `Product/Version` input to a lowercase product token and selects rules once.

Keep bulk methods lazy and single-pass. They must preserve input order and must work with an iterable that rejects a second iterator request.

Do not force Google and RFC 9309 through shared behavior when their rules differ. Google mode keeps Google's accepted misspellings, prefix recognition, byte limit, and `index.htm` handling. RFC mode keeps exact syntax, RFC percent-encoding comparison, path grammar, octet-based priority, and the `/robots.txt` allowance.

Every match decision must explain itself. A winning rule reports its directive, original source pattern, and line number. A default allow reports `no-group`, `empty-group`, `no-match`, or `robots-txt`.

Use the vocabulary in `CONTEXT.md` in code comments, tests, and documentation.

## Test changes

Add a focused regression before changing policy behavior. If the change follows Google, place it in `google-parity.test.ts` or the matching upstream section in `matcher.test.ts`. If it follows RFC 9309, place it in `rfc9309-policy.test.ts`. Public contracts belong in `public-interface.test.ts`.

Test both the allowed and disallowed result when a pattern change can affect either side. For bulk code, include a single-use iterable or a partial-consumption check so an eager implementation fails visibly.
