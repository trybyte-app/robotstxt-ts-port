# robotstxt-parser

A TypeScript port of Google's official C++ robots.txt parser, fully compliant with [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) (Robots Exclusion Protocol).

## Features

- **RFC 9309 Compliant**: Implements the official Robots Exclusion Protocol specification
- **Google-Compatible**: Matches Google's crawler behavior, including handling of edge cases and typos
- **Zero Dependencies**: Pure TypeScript implementation with no runtime dependencies
- **Type-Safe**: Full TypeScript support with comprehensive type definitions
- **Pattern Matching**: Supports wildcards (`*`) and end anchors (`$`) in patterns
- **Typo Tolerance**: Accepts common typos like `disalow`, `useragent`, `site-map`
- **Bulk Checking**: Parse once, check many URLs efficiently with `ParsedRobots`

## Installation

```bash
# Using npm
npm install robotstxt-parser

# Using bun
bun add robotstxt-parser

# Using pnpm
pnpm add robotstxt-parser
```

## Quick Start

```typescript
import { RobotsMatcher } from "robotstxt-parser";

const robotsTxt = `
User-agent: *
Disallow: /private/
Allow: /public/

User-agent: Googlebot
Allow: /
`;

const matcher = new RobotsMatcher();

// Check if a URL is allowed for a specific user agent
const isAllowed = matcher.oneAgentAllowedByRobots(
	robotsTxt,
	"MyBot",
	"https://example.com/public/page.html",
);
console.log(isAllowed); // true

// Check with multiple user agents
const allowed = matcher.allowedByRobots(
	robotsTxt,
	["Googlebot", "MyBot"],
	"https://example.com/private/secret.html",
);
console.log(allowed); // true (Googlebot is allowed everywhere)
```

### Bulk Checking

For checking many URLs against the same robots.txt, use `ParsedRobots` to avoid re-parsing:

```typescript
import { ParsedRobots } from "robotstxt-parser";

const robotsTxt = `
User-agent: *
Disallow: /private/
Allow: /public/
`;

// Parse once
const parsed = ParsedRobots.parse(robotsTxt);

// Check many URLs efficiently
const urls = [
	"https://example.com/public/page1.html",
	"https://example.com/private/secret.html",
	"https://example.com/about",
];

const results = parsed.checkUrls("MyBot", urls);
for (const result of results) {
	console.log(`${result.url}: ${result.allowed ? "allowed" : "blocked"}`);
}
// Output:
// https://example.com/public/page1.html: allowed
// https://example.com/private/secret.html: blocked
// https://example.com/about: allowed
```

## API Reference

### RobotsMatcher

The main class for checking URL access against robots.txt rules.

```typescript
import { RobotsMatcher } from "robotstxt-parser";

const matcher = new RobotsMatcher();
```

#### Methods

| Method                                               | Description                                                        |
| ---------------------------------------------------- | ------------------------------------------------------------------ |
| `oneAgentAllowedByRobots(robotsTxt, userAgent, url)` | Check if URL is allowed for a single user agent                    |
| `allowedByRobots(robotsTxt, userAgents[], url)`      | Check if URL is allowed for any of the user agents                 |
| `disallow()`                                         | Returns true if URL is disallowed (after calling allowedByRobots)  |
| `disallowIgnoreGlobal()`                             | Same as disallow() but ignores `*` rules                           |
| `everSeenSpecificAgent()`                            | Returns true if robots.txt contained rules for the specified agent |
| `matchingLine()`                                     | Returns the line number that matched, or 0                         |
| `static isValidUserAgentToObey(userAgent)`           | Validates user agent format (only `[a-zA-Z_-]` allowed)            |
| `static parse(robotsTxt)`                            | Returns a `ParsedRobots` instance for bulk URL checking            |
| `static batchCheck(robotsTxt, userAgent, urls[])`    | Convenience method for bulk checking (parses + checks)             |

### ParsedRobots

Efficient bulk URL checking by separating parsing from matching. Parse once, check many URLs.

```typescript
import { ParsedRobots } from "robotstxt-parser";

const parsed = ParsedRobots.parse(robotsTxt);

// Check multiple URLs
const results = parsed.checkUrls("Googlebot", urls);

// Check a single URL
const result = parsed.checkUrl("Googlebot", "https://example.com/page");
```

#### Methods

| Method                         | Description                                           |
| ------------------------------ | ----------------------------------------------------- |
| `static parse(robotsTxt)`      | Parse robots.txt and return a `ParsedRobots` instance |
| `checkUrls(userAgent, urls[])` | Check multiple URLs, returns `UrlCheckResult[]`       |
| `checkUrl(userAgent, url)`     | Check a single URL, returns `UrlCheckResult`          |
| `hasSpecificAgent(userAgent)`  | Returns true if robots.txt has rules for this agent   |
| `getExplicitAgents()`          | Returns array of user-agents explicitly mentioned     |

#### UrlCheckResult

```typescript
interface UrlCheckResult {
	url: string; // The URL that was checked
	allowed: boolean; // Whether crawling is allowed
	matchingLine: number; // Line number of matching rule (0 if none)
	matchedPattern: string; // The pattern that matched
	matchedRuleType: "allow" | "disallow" | "none";
}
```

### parseRobotsTxt

Low-level parsing function for custom handling.

```typescript
import { parseRobotsTxt, RobotsParseHandler } from "robotstxt-parser";

class MyHandler extends RobotsParseHandler {
	handleRobotsStart(): void {
		/* ... */
	}
	handleRobotsEnd(): void {
		/* ... */
	}
	handleUserAgent(lineNum: number, value: string): void {
		/* ... */
	}
	handleAllow(lineNum: number, value: string): void {
		/* ... */
	}
	handleDisallow(lineNum: number, value: string): void {
		/* ... */
	}
	handleSitemap(lineNum: number, value: string): void {
		/* ... */
	}
	handleUnknownAction(lineNum: number, action: string, value: string): void {
		/* ... */
	}
}

parseRobotsTxt(robotsTxtContent, new MyHandler());
```

### RobotsParsingReporter

A parse handler that collects detailed information about each line.

```typescript
import {
	parseRobotsTxt,
	RobotsParsingReporter,
	RobotsTagName,
} from "robotstxt-parser";

const reporter = new RobotsParsingReporter();
parseRobotsTxt(robotsTxt, reporter);

console.log(reporter.validDirectives()); // Count of valid directives
console.log(reporter.unusedDirectives()); // Count of unrecognized tags
console.log(reporter.lastLineSeen()); // Last line number parsed
console.log(reporter.parseResults()); // Array of RobotsParsedLine objects
```

### RobotsMatchStrategy

Interface for implementing custom matching strategies.

```typescript
import {
	RobotsMatchStrategy,
	LongestMatchRobotsMatchStrategy,
} from "robotstxt-parser";

// Default implementation uses longest-match strategy
const strategy = new LongestMatchRobotsMatchStrategy();

// Custom implementation
class MyStrategy implements RobotsMatchStrategy {
	matchAllow(path: string, pattern: string): number {
		// Return priority (pattern length on match, -1 on no match)
	}
	matchDisallow(path: string, pattern: string): number {
		// Return priority (pattern length on match, -1 on no match)
	}
}
```

### Types

```typescript
import {
	KeyType, // Enum: USER_AGENT, SITEMAP, ALLOW, DISALLOW, UNKNOWN
	RobotsTagName, // Enum: Unknown, UserAgent, Allow, Disallow, Sitemap, Unused
	LineMetadata, // Interface for line parsing metadata
	RobotsParsedLine, // Interface for complete parsed line info
} from "robotstxt-parser";
```

### Utility Functions

```typescript
import {
	getPathParamsQuery, // Extract path from URL
	maybeEscapePattern, // Normalize percent-encoding
	matches, // Check if path matches pattern
} from "robotstxt-parser";

// Extract path from URL
getPathParamsQuery("https://example.com/path?query=1"); // '/path?query=1'

// Check pattern matching
matches("/foo/bar", "/foo/*"); // true
matches("/foo/bar", "/baz"); // false
```


## Pattern Matching

The parser supports standard robots.txt pattern syntax:

| Pattern      | Matches                           |
| ------------ | --------------------------------- |
| `/path`      | Any URL starting with `/path`     |
| `/path*`     | Same as `/path` (implicit)        |
| `*.php`      | Any URL containing `.php`         |
| `/path$`     | Exactly `/path` (end anchor)      |
| `/fish*.php` | `/fish.php`, `/fish123.php`, etc. |

**Priority**: When both Allow and Disallow match, the longer pattern wins.

## Production Usage

This library is designed for correctness and RFC 9309 compliance. When using it in production environments that fetch robots.txt from untrusted sources, consider these safeguards:

### File Size Limits

The library does not enforce file size limits. Both RFC 9309 and Google require parsing at least 500 KiB. Implement size checks before parsing:

```typescript
const MAX_ROBOTS_SIZE = 500 * 1024; // 500 KiB (per RFC 9309)

async function fetchAndParse(url: string) {
  const response = await fetch(url);
  const contentLength = response.headers.get('content-length');

  if (contentLength && parseInt(contentLength) > MAX_ROBOTS_SIZE) {
    throw new Error('robots.txt too large');
  }

  const text = await response.text();
  if (text.length > MAX_ROBOTS_SIZE) {
    throw new Error('robots.txt too large');
  }

  return ParsedRobots.parse(text);
}
```

### Timeouts

Implement timeouts when fetching robots.txt to prevent hanging requests.

## Google-Specific Behaviors

This library is a port of Google's C++ parser and includes several behaviors that are Google-specific extensions beyond RFC 9309:

| Behavior | Google | RFC 9309 |
|----------|--------|----------|
| **Line length limit** | Truncates at 16,664 bytes | No limit specified |
| **Typo tolerance** | Accepts "disalow", "useragent", etc. | "MAY be lenient" (unspecified) |
| **index.html normalization** | `Allow: /path/index.html` also allows `/path/` | Not specified |
| **User-agent `*` with trailing text** | `* foo` treated as global agent | Not specified |

The core matching behavior (longest-match-wins, case-insensitive user-agent matching, UTF-8 encoding) follows RFC 9309.

**Note:** This library only handles parsing and matching. HTTP behaviors like redirect following, caching, and status code handling are your responsibility to implement.

## Project Structure

```
src/
├── index.ts           # Main entry point, re-exports public API
├── matcher.ts         # RobotsMatcher class - URL matching logic
├── parsed-robots.ts   # ParsedRobots class - bulk URL checking
├── parser.ts          # robots.txt parsing engine
├── pattern-matcher.ts # Wildcard pattern matching algorithm
├── match-strategy.ts  # Match priority strategy interface
├── parsed-key.ts      # Directive key recognition (with typo support)
├── reporter.ts        # RobotsParsingReporter for analysis
├── url-utils.ts       # URL path extraction and encoding
├── types.ts           # TypeScript interfaces and enums
└── constants.ts       # Configuration constants

tests/
├── matcher.test.ts    # URL matching tests
├── bulk-check.test.ts # Bulk URL checking tests
├── reporter.test.ts   # Parser reporting tests
└── url-utils.test.ts  # URL utility tests
```

## Development

```bash
# Install dependencies
bun install

# Run tests
bun test

# Build for distribution
bun run build
```

## License

Apache-2.0

This is a TypeScript port of [Google's robots.txt parser](https://github.com/google/robotstxt).
