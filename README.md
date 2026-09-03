# @trybyte/robotstxt-parser

`@trybyte/robotstxt-parser` is a dependency-free TypeScript parser and matcher for robots.txt files.

Parse the file once with `compileRobotsText()`. Bind one crawler identity with `forCrawler()`. The resulting matcher can check one URL or consume a lazy iterable of URLs.

Compatibility with Google's [open-source parser and matcher](https://github.com/google/robotstxt) is the default. Callers can choose strict [RFC 9309](https://www.rfc-editor.org/rfc/rfc9309.html) behavior when they need the standard instead of Google's parser rules.

## Install

Use one package manager.

| Package manager | Command                                 |
| --------------- | --------------------------------------- |
| npm             | `npm install @trybyte/robotstxt-parser` |
| pnpm            | `pnpm add @trybyte/robotstxt-parser`    |
| Bun             | `bun add @trybyte/robotstxt-parser`     |

The package supports Node.js 22 LTS and newer.

## Match URLs

```ts
import { compileRobotsText } from "@trybyte/robotstxt-parser";

const robotsText = `
User-agent: *
Disallow: /private/

User-agent: Googlebot
Allow: /
`;

const robots = compileRobotsText(robotsText);
const googlebot = robots.forCrawler("Googlebot/2.1");

googlebot.isAllowed("https://example.com/private/report.pdf"); // true

const decision = googlebot.match("https://example.com/private/report.pdf");

console.log(decision);
// {
//   url: "https://example.com/private/report.pdf",
//   path: "/private/report.pdf",
//   allowed: true,
//   selectedRules: "specific",
//   evidence: {
//     kind: "rule",
//     directive: "allow",
//     pattern: "/",
//     lineNumber: 6
//   }
// }
```

`forCrawler()` accepts an RFC product token such as `Googlebot` or a `Product/Version` value such as `Googlebot/2.1`. It stores the lowercase product token and matches group names without regard to case. An invalid value throws `InvalidCrawlerIdentityError`.

## Choose a matching policy

```ts
const google = compileRobotsText(robotsText);
const strict = compileRobotsText(robotsText, { policy: "rfc9309" });
```

| Policy    | What it does                                                                                                                                                                                                       |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `google`  | This is the default. It follows Google's open-source parser and matcher, including accepted field-name misspellings, field-name prefix matching, the Google line-length limit, and `index.htm` directory matching. |
| `rfc9309` | It requires exact directive syntax, compares percent-encoded paths by RFC rules, rejects invalid product tokens and path patterns, and always allows `/robots.txt`.                                                |

Both policies use the same public types, crawler identity normalization, URL path extraction, and lazy bulk methods. Each policy keeps its own parsing and matching behavior where the two specifications disagree.

Google mode covers decisions made by the open-source parser and matcher. It does not fetch robots.txt files or model HTTP status codes, redirects, caches, download limits, or crawl schedules. Supply URI-encoded URLs because that is what Google's matcher expects.

## Process large URL sets

`isAllowedMany()` and `matchMany()` accept any `Iterable<string>`. Both return lazy, single-pass iterators. The package does not collect the input or output.

```ts
const crawler = compileRobotsText(robotsText).forCrawler("Googlebot");

function* urls() {
	for (let index = 0; index < 1_000_000; index++) {
		yield `https://example.com/page/${index}`;
	}
}

for (const allowed of crawler.isAllowedMany(urls())) {
	// Store, count, or stream this result before requesting the next one.
}
```

Use `isAllowedMany()` for booleans. Use `matchMany()` when the caller also needs the chosen rule set and match evidence.

Calling `Array.from()` stores every result. Iterate over the return value directly when memory use matters.

## Inspect a robots file

Inspection is separate from compilation. Normal matching therefore does not keep source-line metadata that it never reads.

```ts
import { inspectRobotsText } from "@trybyte/robotstxt-parser";

const report = inspectRobotsText(robotsText, { policy: "google" });

console.log(report.lineCount);
console.log(report.recognizedDirectiveCount);
console.log(report.lines);
```

The report is structured data, not a formatted text summary.

| Field                       | Meaning                                                                                                         |
| --------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `policy`                    | The policy used to interpret the source.                                                                        |
| `lineCount`                 | The number of source lines scanned.                                                                             |
| `recognizedDirectiveCount`  | The number of `user-agent`, `allow`, `disallow`, and `sitemap` directives recognized under the selected policy. |
| `unsupportedDirectiveCount` | The number of known but unsupported directives.                                                                 |
| `unknownDirectiveCount`     | The number of other named directives.                                                                           |
| `lines`                     | One `ParsedLine` entry for each source line.                                                                    |

Each `ParsedLine` contains its one-based `lineNumber`, an interpreted `directive` or `null`, and zero or more diagnostic codes. A directive records its normalized name and value plus `effective`, which tells you whether it can affect matching. Diagnostic codes include `missing-colon`, `acceptable-typo`, `line-too-long`, `comment`, `whole-line-comment`, and `empty`.

## Read match evidence

`match()` returns the checked URL, the extracted path, the boolean decision, the selected rule set, and evidence for that decision.

When a rule wins, `evidence.kind` is `rule`. The evidence names the `allow` or `disallow` directive, preserves its source pattern, and gives its one-based source line number.

When no rule decides the result, `evidence.kind` is `default-allow`. Its `reason` is one of these values.

| Reason        | Meaning                                             |
| ------------- | --------------------------------------------------- |
| `no-group`    | No specific or global user-agent group matched.     |
| `empty-group` | A matching group exists but has no effective rules. |
| `no-match`    | Rules were selected, but none matched the URL path. |
| `robots-txt`  | RFC 9309 grants access to `/robots.txt`.            |

`selectedRules` is `specific`, `global`, or `none`. A matching specific group suppresses global rules even when the specific group contains no effective rules.

## Public API

```ts
compileRobotsText(source, options?): CompiledRobotsText
inspectRobotsText(source, options?): RobotsReport
```

`CompiledRobotsText` has this interface.

```ts
readonly policy: "google" | "rfc9309";
forCrawler(identity: string): CrawlerRules;
```

`CrawlerRules` has this interface.

```ts
readonly identity: string;
isAllowed(url: string): boolean;
match(url: string): MatchDecision;
isAllowedMany(urls: Iterable<string>): IterableIterator<boolean>;
matchMany(urls: Iterable<string>): IterableIterator<MatchDecision>;
```

## Migrate from version 1

Version 2 replaces the version 1 class and callback API. It has no compatibility aliases. An automated migration should remove old imports instead of wrapping or recreating them.

Use this checklist as the migration contract.

1. Require Node.js 22 or newer in the consuming project.
2. Replace every version 1 package import with the version 2 exports listed below.
3. Call `compileRobotsText()` once for each robots text and policy.
4. Call `forCrawler()` once for each crawler identity used with that compiled file.
5. Replace scalar checks with `isAllowed()` or `match()`.
6. Replace array-based bulk checks with the lazy `isAllowedMany()` or `matchMany()` iterator.
7. Replace parser callbacks and `RobotsParsingReporter` with `inspectRobotsText()`.
8. Remove code that depends on deleted matcher state, internal utilities, constants, or custom matching strategies.
9. Run the consuming project's type checker and robots matching tests. Review the behavior changes at the end of this section before accepting new results.

### Replace imports

These version 1 exports no longer exist.

```ts
RobotsMatcher;
ParsedRobots;
RobotsParsingReporter;
RobotsParseHandler;
RobotsMatchStrategy;
LongestMatchRobotsMatchStrategy;
UrlCheckResult;
ParsedRule;
LineMetadata;
RobotsParsedLine;
parseRobotsTxt;
matches;
getPathParamsQuery;
maybeEscapePattern;
KeyType;
RobotsTagName;
createLineMetadata;
createRobotsParsedLine;
K_MAX_LINE_LEN;
K_ALLOW_FREQUENT_TYPOS;
K_UNSUPPORTED_TAGS;
```

Import only the version 2 operations and types that the application uses.

```ts
import {
	compileRobotsText,
	inspectRobotsText,
	InvalidCrawlerIdentityError,
	type CrawlerRules,
	type MatchDecision,
	type RobotsReport,
} from "@trybyte/robotstxt-parser";
```

### Replace matching calls

| Version 1                                                       | Version 2                                                                                                                      |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `new RobotsMatcher().oneAgentAllowedByRobots(text, agent, url)` | `compileRobotsText(text).forCrawler(agent).isAllowed(url)`                                                                     |
| `matcher.allowedByRobots(text, agents, url)`                    | Compile once, then call `agents.some()` with one crawler matcher per identity.                                                 |
| `RobotsMatcher.parse(text)`                                     | `compileRobotsText(text)`                                                                                                      |
| `ParsedRobots.parse(text)`                                      | `compileRobotsText(text)`                                                                                                      |
| `RobotsMatcher.batchCheck(text, agent, urls)`                   | `compileRobotsText(text).forCrawler(agent).matchMany(urls)`                                                                    |
| `parsed.checkUrl(agent, url)`                                   | `compiled.forCrawler(agent).match(url)`                                                                                        |
| `parsed.checkUrls(agent, urls)`                                 | `compiled.forCrawler(agent).matchMany(urls)`                                                                                   |
| `matcher.disallow()`                                            | Negate `crawler.isAllowed(url)`, or read `decision.allowed` from `crawler.match(url)`.                                         |
| `matcher.everSeenSpecificAgent()`                               | Read `decision.selectedRules === "specific"`. Rule selection is fixed for a bound crawler, so this value does not vary by URL. |
| `matcher.matchingLine()`                                        | When `decision.evidence.kind === "rule"`, read `decision.evidence.lineNumber`.                                                 |
| `RobotsMatcher.isValidUserAgentToObey(agent)`                   | Call `compiled.forCrawler(agent)` and catch `InvalidCrawlerIdentityError`.                                                     |

The direct replacement for a single crawler looks like this.

```ts
// Version 1
const allowed = new RobotsMatcher().oneAgentAllowedByRobots(
	robotsText,
	"Googlebot",
	url,
);

// Version 2
const allowed = compileRobotsText(robotsText)
	.forCrawler("Googlebot")
	.isAllowed(url);
```

Version 1 `allowedByRobots()` returned `true` when any supplied crawler identity was allowed. Preserve that behavior explicitly.

```ts
const compiled = compileRobotsText(robotsText);
const allowed = crawlerIdentities.some((identity) =>
	compiled.forCrawler(identity).isAllowed(url),
);
```

Compile and bind outside repeated URL loops.

```ts
const compiled = compileRobotsText(robotsText);
const crawler = compiled.forCrawler("Googlebot");

for (const decision of crawler.matchMany(urls)) {
	consume(decision);
}
```

`matchMany()` returns a lazy iterator. Version 1 `checkUrls()` returned an array. If the caller still needs an array, collect it at the application boundary.

```ts
const decisions = Array.from(crawler.matchMany(urls));
```

### Replace bulk result fields

Version 1 returned `UrlCheckResult`. Version 2 returns `MatchDecision` from `match()` and `matchMany()`.

| Version 1 field   | Version 2 field                                      |
| ----------------- | ---------------------------------------------------- |
| `url`             | `url`                                                |
| `allowed`         | `allowed`                                            |
| `matchingLine`    | `evidence.lineNumber` when `evidence.kind` is `rule` |
| `matchedPattern`  | `evidence.pattern` when `evidence.kind` is `rule`    |
| `matchedRuleType` | `evidence.directive` when `evidence.kind` is `rule`  |

Version 2 also returns the extracted `path`, the `selectedRules` scope, and a typed default-allow reason when no rule wins. Do not invent a line number or empty pattern for a default allow. Branch on `evidence.kind`.

```ts
const decision = crawler.match(url);

if (decision.evidence.kind === "rule") {
	console.log(
		decision.evidence.directive,
		decision.evidence.pattern,
		decision.evidence.lineNumber,
	);
} else {
	console.log(decision.evidence.reason);
}
```

### Replace parsing reports

Delete custom `RobotsParseHandler` subclasses when they only collect line metadata or directive counts. Call `inspectRobotsText()` instead.

```ts
const report = inspectRobotsText(robotsText, { policy: "google" });
```

| Version 1 reporter value   | Version 2 report value                                   |
| -------------------------- | -------------------------------------------------------- |
| `lastLineSeen()`           | `lineCount`                                              |
| `validDirectives()`        | `recognizedDirectiveCount`                               |
| `unusedDirectives()`       | `unsupportedDirectiveCount + unknownDirectiveCount`      |
| `parseResults()`           | `lines`                                                  |
| `RobotsParsedLine.lineNum` | `ParsedLine.lineNumber`                                  |
| `RobotsParsedLine.tagName` | `ParsedLine.directive?.name`                             |
| `LineMetadata` booleans    | `ParsedLine.diagnostics` and `ParsedDirective.effective` |

The report uses string directive names and diagnostic codes instead of the `RobotsTagName` enum and `LineMetadata` booleans. Review any code that serializes the old report shape.

### Handle APIs with no direct replacement

- `disallowIgnoreGlobal()` has no version 2 equivalent. Version 2 always follows the selected policy's group rules. Redesign code that bypasses global groups.
- `getExplicitAgents()` and `hasSpecificAgent()` are not compiled-document queries in version 2. Use `selectedRules` when the application only needs to know whether a bound crawler selected specific rules. Use `inspectRobotsText()` to build a line-level user-agent inventory.
- Custom `RobotsMatchStrategy` implementations have no extension point. Choose `google` or `rfc9309` when compiling.
- Parser callbacks, matching helpers, URL helpers, and parser constants are internal. Move unrelated utility behavior into application code. Use the public compiler and inspector for robots decisions.

### Review behavior changes

- Google matching remains the default. Pass `{ policy: "rfc9309" }` when the application requires strict RFC 9309 parsing and matching.
- `forCrawler()` accepts a valid `Product` or `Product/Version` identity, normalizes it to a lowercase product token, and throws `InvalidCrawlerIdentityError` for malformed input. Version 1 did not normalize caller identities before matching. Review results for `Product/Version` values, and replace malformed values such as `Foo Bar` with an explicit product token.
- A matching specific group suppresses global rules even when the specific group has no effective rules.
- `match()` reports the original source pattern and its one-based line number. Default access reports `no-group`, `empty-group`, `no-match`, or `robots-txt` instead of a synthetic line zero.
- Bulk methods preserve input order and consume the iterable once. They produce results only as the caller requests them.
- Compilation does not retain inspection metadata. Call `inspectRobotsText()` separately when the application needs a report.

After migration, search the consuming repository for every removed export named above. A clean search plus a passing type check is the minimum evidence that the version 1 API is gone.

## Develop the package

```bash
bun install --frozen-lockfile
bun test
bun run build
```

The Google regression suite adapts cases from [`google/robotstxt`](https://github.com/google/robotstxt). The RFC suite covers strict syntax, group selection, rule priority, percent encoding, and the required `/robots.txt` allowance. See [TESTS.md](./TESTS.md) for the pinned upstream revision and the full test map.

## License

Apache-2.0
