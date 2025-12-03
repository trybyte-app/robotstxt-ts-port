# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

TypeScript port of Google's official C++ robots.txt parser, compliant with RFC 9309 (Robots Exclusion Protocol). This is a pure TypeScript library with zero runtime dependencies.

## Commands

```bash
bun install        # Install dependencies
bun test           # Run all tests
bun test tests/matcher.test.ts              # Run a single test file
bun test --test-name-pattern "SystemTest"   # Run tests matching a pattern
bun run build      # Build to dist/ (runs tsc)
```

## Architecture

The codebase is a direct port from Google's C++ implementation. Key design decisions:

**Parser-Handler Pattern**: The parser (`parser.ts`) doesn't return data structures. Instead, it calls handler methods on a `RobotsParseHandler` interface. This allows different consumers:

- `RobotsMatcher` implements the handler to match URLs against rules
- `RobotsParsingReporter` implements the handler to collect parse statistics

**Match Priority System**: When both Allow and Disallow patterns match a URL, the longest pattern wins. This is implemented via the `RobotsMatchStrategy` interface in `match-strategy.ts`. Priority is stored as pattern length; -1 indicates no match.

**Two-tier Matching**: Rules are tracked separately for global (`*`) and specific user-agents. If specific agent rules exist, global rules are ignored.

## Module Responsibilities

- `matcher.ts` - Main entry point: `RobotsMatcher.oneAgentAllowedByRobots()` and `allowedByRobots()`
- `parsed-robots.ts` - `ParsedRobots` for bulk checking: parse once, check many URLs via `checkUrls()`
- `parser.ts` - Line-by-line parsing, handles BOM, CRLF/LF, comments, long lines
- `pattern-matcher.ts` - Wildcard (`*`) and anchor (`$`) pattern matching
- `parsed-key.ts` - Directive recognition with typo tolerance (e.g., "disalow", "useragent")
- `reporter.ts` - `RobotsParsingReporter` for collecting parse statistics
- `url-utils.ts` - Path extraction and percent-encoding normalization

## Testing Notes

Tests mirror the original C++ test suite structure. When porting new tests from `robots_test.cc`:

- Use `describe()` for test groups matching C++ test names
- Use `isUserAgentAllowed()` helper for simple allow/disallow checks
- Test both the positive and negative cases for each pattern
