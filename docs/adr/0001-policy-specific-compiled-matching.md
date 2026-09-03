---
status: accepted
---

# Use policy-specific compiled matching

## Context

Version 1 mixed parsing, callbacks, rule selection, and matching behind several public classes and strategies. Rechecking many URLs repeated work or required a second bulk-only abstraction. It was also hard to say whether a behavior came from Google's implementation or RFC 9309.

## Decision

`compileRobotsText()` parses robots text once under one named policy. `forCrawler()` normalizes and binds one crawler identity, then selects and merges its rules once. The returned `CrawlerRules` object handles scalar matches and lazy bulk matches.

The `google` policy is the default because this package began as a port of Google's open-source parser. The `rfc9309` policy is an explicit strict option. Policy-specific parsing and matching code stays separate when the two disagree.

`inspectRobotsText()` performs a separate parse and returns source-line details. Compiled matchers do not retain that report. `match()` returns evidence for the winning rule or a typed reason for default access.

Version 2 removes the version 1 matcher, parsed-document wrapper, parser callbacks, public matching strategies, and parser utility exports. It does not provide compatibility aliases.

## Consequences

Callers that check many URLs parse once and bind the crawler once. Bulk methods accept single-use iterables and yield in input order without collecting results.

Inspection costs a second parse when a caller needs both a matcher and a report. That cost is deliberate. High-volume matching should not pay to allocate line metadata.

Google compatibility stops at the open-source parser and matcher after crawler identity normalization. Fetching, HTTP status handling, redirects, caching, download limits, and crawl scheduling remain outside this package.
