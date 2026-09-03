# How Google interprets robots.txt

This guide explains the robots.txt behavior covered by this package's Google compatibility tests. It is written for SEOs who need to predict whether a URL is crawlable, understand why a rule won, or diagnose a file that Google accepts differently from a strict RFC 9309 parser.

The examples describe the `google` policy, which is the package default. Differences under the `rfc9309` policy are called out where they change a decision.

The compatibility baseline is [`google/robotstxt`](https://github.com/google/robotstxt) commit `22b355ff855419e6a3ff8ff09c0ad7fdb17116f9`, reviewed on September 3, 2026. The package reproduces parser and matcher decisions from that source. It does not reproduce fetching, HTTP status handling, redirects, caching, download limits, or crawl scheduling.

## The decision process

For one crawler and URL, the matcher does this work in order.

1. Parse the robots text under the selected policy.
2. Normalize the caller's crawler identity to a lowercase product token.
3. Select every specific group for that product token. If none match, select the global groups for `User-agent: *`.
4. Merge rules from repeated selected groups.
5. Extract the URL path, parameters, and query. Remove the fragment.
6. Find every selected rule whose pattern matches that value.
7. Use the rule with the highest priority. In Google mode, priority is the normalized pattern length.
8. Let `Allow` win when the best allow and disallow rules have equal priority.
9. Allow the URL when no selected rule matches.

Three consequences cause many production mistakes.

- A specific group suppresses global rules. This remains true when the specific group has no effective rules.
- A blank line does not end a group.
- File order does not decide between two matching rules. Pattern priority does.

## Google mode and RFC 9309 mode

Google's parser is deliberately forgiving in places where RFC 9309 is strict. Choose the policy that matches the system you are testing.

| Question                                                        | `google` policy                                                                                              | `rfc9309` policy                                                             |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| Is the policy selected by default?                              | Yes                                                                                                          | No, pass `{ policy: "rfc9309" }`.                                            |
| Are directive names case-sensitive?                             | No                                                                                                           | No                                                                           |
| Must a directive contain a colon?                               | Usually, but Google accepts a missing colon when the line contains exactly a field name and one value token. | Yes                                                                          |
| Are misspelled field names accepted?                            | Several known spellings are accepted.                                                                        | No                                                                           |
| Are field-name prefixes accepted?                               | Yes, so `disallowed:` is read as `disallow:`.                                                                | No                                                                           |
| Can a robots-text user-agent value contain trailing text?       | Google reads the leading product token.                                                                      | No                                                                           |
| Must a rule pattern start with `/`?                             | No                                                                                                           | Yes, unless the value is empty                                               |
| How is rule priority measured?                                  | Normalized pattern string length, including wildcard characters.                                             | Matching octet count, excluding wildcard syntax and the terminal end anchor. |
| Are percent-encoded unreserved characters decoded?              | No                                                                                                           | Yes                                                                          |
| Does an allow rule for `index.htm...` also allow the directory? | Yes                                                                                                          | No                                                                           |
| Is `/robots.txt` always allowed?                                | No                                                                                                           | Yes, for the exact path                                                      |
| Is there a parser line limit?                                   | Yes, Google keeps at most 16,663 bytes from a line.                                                          | No package-specific limit                                                    |

Use Google mode to reproduce Google parser decisions. Use RFC 9309 mode to audit a file against the standard. A result from one policy is not evidence for the other.

## Directive syntax

A normal record has a field name, a colon, and a value.

```text
User-agent: Googlebot
Disallow: /private/
```

Field names are case-insensitive.

```text
USER-AGENT: Googlebot
disallow: /private/
Allow: /private/public/
```

Google mode recognizes the core field names by prefix. These lines are interpreted as `user-agent`, `disallow`, and `allow`.

```text
user-agent-extra: Googlebot
disallowed: /private/
allowance: /private/public/
```

That leniency can hide a typo during an SEO review. `inspectRobotsText()` reports accepted misspellings with the `acceptable-typo` diagnostic, but ordinary prefix matches do not receive that diagnostic.

### Missing colons

Google accepts a missing colon only when the remaining line has exactly two tokens.

```text
user-agent Googlebot
disallow /private/
```

A value containing more whitespace does not meet that rule. RFC 9309 mode rejects every directive without a colon.

### Accepted Google spellings

Google mode accepts these user-agent spellings.

- `user-agent`
- `useragent`
- `user agent`

It also accepts these known disallow misspellings.

- `dissallow`
- `dissalow`
- `disalow`
- `diasllow`
- `disallaw`

`site-map` is accepted as `sitemap`. RFC 9309 mode treats all of these variants as unknown.

### Unknown and unsupported directives

Unknown records and sitemap records do not end a run of user-agent declarations. They also do not affect allow or disallow decisions.

```text
User-agent: FooBot
Sitemap: https://example.com/sitemap.xml
User-agent: BarBot
Disallow: /
```

`FooBot` and `BarBot` belong to the same group because no allow or disallow record appeared between the two user-agent lines. Both are disallowed from the root path.

The inspector classifies known but unsupported fields separately from unknown fields. The unsupported set includes `crawl-delay`, `host`, `noindex`, `nofollow`, `noarchive`, `request-rate`, and several vendor-specific fields. Classification is useful for audits, but these records never change a match decision.

## User-agent groups

A group contains one or more adjacent `User-agent` records followed by zero or more allow and disallow records.

```text
User-agent: Googlebot
User-agent: Bingbot
Disallow: /private/
Allow: /private/public/
```

Both crawlers use both rules.

### Blank lines do not end a group

This file still puts `Allow: /public/` in Googlebot's group.

```text
User-agent: Googlebot
Disallow: /

Allow: /public/
```

Do not rely on whitespace to separate groups. Start the next group with another `User-agent` record.

### Rules before the first group are ignored

```text
Disallow: /private/

User-agent: *
Allow: /
```

The first disallow rule is ineffective because no user-agent group owns it.

### Repeated groups are merged

```text
User-agent: Googlebot
Disallow: /first/

User-agent: OtherBot
Disallow: /

User-agent: googlebot
Disallow: /second/
```

Googlebot is disallowed from both `/first/` and `/second/`. Product-token matching is case-insensitive.

### Specific groups suppress global groups

```text
User-agent: *
Disallow: /

User-agent: Googlebot
Allow: /public/
```

Googlebot uses only its specific rules. It can crawl `/private/` because no selected rule matches that path, even though the global group blocks everything. Other crawlers use the global group and remain blocked.

An empty specific group behaves the same way.

```text
User-agent: *
Disallow: /

User-agent: Googlebot
```

Googlebot is allowed everywhere because its specific group exists and contains no effective rules. The global disallow rule does not apply.

### No matching group means allow

If a crawler has no specific group and the file has no global group, no rules are selected. The matcher allows the URL and reports `no-group`.

## Crawler identities

`forCrawler()` accepts an RFC product token or a `Product/Version` value.

```ts
const crawler = compileRobotsText(robotsText).forCrawler("Googlebot/2.1");

crawler.identity; // "googlebot"
```

The caller value must begin with ASCII letters, underscores, or hyphens. A version may follow one slash. Empty strings, spaces, asterisks, non-ASCII product names, and multiple slashes throw `InvalidCrawlerIdentityError`.

Google applies a different rule to user-agent values inside robots text. It reads the leading product token and ignores malformed trailing text.

```text
User-agent: Foo Bar
Disallow: /private/
```

A caller identity of `Foo` selects this group. A caller identity of `Foo Bar` is invalid at the package boundary.

`User-agent: * anything` is treated as a global user-agent record because the asterisk is followed by whitespace.

## Rule matching

`Allow` and `Disallow` values match against the URL path, parameters, and query. They do not match the scheme, host, or fragment.

Rules are prefix matches unless the pattern ends with `$`.

| Rule     | URL path            | Matches? | Why                                     |
| -------- | ------------------- | -------- | --------------------------------------- |
| `/fish`  | `/fish`             | Yes      | Exact prefix                            |
| `/fish`  | `/fish.html`        | Yes      | The path begins with `/fish`.           |
| `/fish`  | `/fishheads`        | Yes      | Word boundaries have no meaning.        |
| `/fish`  | `/catfish`          | No       | The prefix begins later in the path.    |
| `/fish`  | `/Fish.asp`         | No       | Path matching is case-sensitive.        |
| `/fish/` | `/fish/salmon.html` | Yes      | The slash is present.                   |
| `/fish/` | `/fish.html`        | No       | The rule requires a slash after `fish`. |

### Wildcards

`*` matches zero or more characters.

```text
User-agent: *
Disallow: /private/*.pdf
```

This rule matches both `/private/report.pdf` and `/private/archive/report.pdf`. It does not match `/private/report.html`.

A trailing wildcard adds no matching power because ordinary rules already match prefixes.

- `/fish` and `/fish*` match the same set of paths.
- The wildcard still counts toward rule priority in Google mode.

### End anchors

A `$` at the end of a pattern requires the URL value to end at that point.

| Rule      | URL path               | Matches? |
| --------- | ---------------------- | -------- |
| `/*.php$` | `/index.php`           | Yes      |
| `/*.php$` | `/folder/index.php`    | Yes      |
| `/*.php$` | `/index.php?preview=1` | No       |
| `/*.php$` | `/index.php/`          | No       |
| `/*.php`  | `/index.php?preview=1` | Yes      |

The query is part of the matched value, so an end anchor before a query does not match.

### Comments

`#` begins a comment. The parser ignores the hash and everything after it.

```text
# Disallow: /
Disallow: /private/ # internal pages
```

The first line has no rule. The second rule is `/private/`.

### Empty rules

An empty allow or disallow record is not an effective rule.

```text
User-agent: Googlebot
Disallow:
```

Googlebot is allowed by default. The empty record still establishes a group boundary before a later `User-agent` record.

## Rule priority

Google mode chooses the matching rule with the longest normalized pattern string. If the best allow and disallow rules have the same priority, allow wins.

```text
User-agent: *
Disallow: /private/
Allow: /private/public/
```

| URL path                     | Decision         | Winning pattern    |
| ---------------------------- | ---------------- | ------------------ |
| `/private/report.pdf`        | Disallow         | `/private/`        |
| `/private/public/report.pdf` | Allow            | `/private/public/` |
| `/other/`                    | Allow by default | No matching rule   |

File order does not change the result. Reversing the two rule lines produces the same decisions.

When identical allow and disallow patterns both match, allow wins.

```text
User-agent: *
Disallow: /same/
Allow: /same/
```

`/same/page.html` is allowed.

Google counts wildcard syntax toward priority. RFC 9309 mode instead counts matching octets and excludes wildcard syntax plus a terminal `$`.

## Google index document handling

Google mode gives certain allow rules an extra directory match.

```text
User-agent: *
Allow: /docs/index.html
Disallow: /
```

This allows both `/docs/index.html` and `/docs/`.

The implementation checks whether the final path segment begins with `index.htm`. As a result, `index.htm`, `index.html`, and `index.html.backup` all create the directory match. This behavior applies only to allow rules. RFC 9309 mode does not add the directory rule.

## Percent encoding

Google mode compares URI-encoded values. Supply percent-encoded URLs to reproduce Google decisions.

For rule values, Google mode does this normalization.

- Non-ASCII UTF-8 bytes become uppercase percent escapes.
- Hexadecimal digits in existing percent escapes become uppercase.
- Percent-encoded unreserved ASCII stays encoded.

```text
User-agent: *
Disallow: /
Allow: /products/ツ
```

The allow rule matches `/products/%E3%83%84`. It does not match an unencoded `/products/ツ` URL passed to the matcher.

Google mode treats `/foo/%62%61%7A` and `/foo/baz` as different patterns. RFC 9309 mode decodes percent-encoded unreserved octets before comparison, so those values compare equally there.

Query strings remain part of the value being matched. Fragments are removed.

```text
User-agent: *
Allow: /search?q=fish
Disallow: /
```

- `https://example.com/search?q=fish` is allowed.
- `https://example.com/search?q=fish#details` is also allowed because the fragment is removed.
- `https://example.com/search?q=salmon` is disallowed.

## URL extraction and malformed input

The matcher accepts complete URLs, protocol-relative URLs, and path-like inputs. It extracts the first path, parameter, or query delimiter after the authority.

| Input                             | Matched value |
| --------------------------------- | ------------- |
| `https://example.com`             | `/`           |
| `https://example.com/a/b`         | `/a/b`        |
| `https://example.com/a;b`         | `/a;b`        |
| `https://example.com/?q=fish#top` | `/?q=fish`    |
| `//example.com/a/b`               | `/a/b`        |
| `not-a-url`                       | `/`           |
| Empty string                      | `/`           |

A malformed value does not throw. It falls back to the root path, which can still be disallowed by `Disallow: /`.

## Long lines and byte order marks

Google mode stores at most 16,663 bytes from one source line. Content after that limit is ignored. The inspector adds `line-too-long` to the line's diagnostics.

The limit applies to the entire line, including the field name, colon, whitespace, and value. A truncated rule can still match its retained prefix. That is awkward but important when auditing generated robots files.

An initial UTF-8 byte order mark is ignored. A byte order mark later in the file remains part of the line and can make a directive unknown or change its value.

## Inspect parser decisions

`inspectRobotsText()` shows how the selected policy interpreted every source line.

```ts
const report = inspectRobotsText(robotsText, { policy: "google" });
```

The report contains these counts.

| Field                       | What it counts                                                      |
| --------------------------- | ------------------------------------------------------------------- |
| `lineCount`                 | Every source line scanned                                           |
| `recognizedDirectiveCount`  | Recognized `user-agent`, `allow`, `disallow`, and `sitemap` records |
| `unsupportedDirectiveCount` | Known records that this matcher does not apply                      |
| `unknownDirectiveCount`     | Other named records                                                 |

Each `ParsedLine` contains a one-based line number, an interpreted directive or `null`, and diagnostic codes.

| Diagnostic           | Meaning                                             |
| -------------------- | --------------------------------------------------- |
| `empty`              | The source line has no content.                     |
| `comment`            | The line contains a comment.                        |
| `whole-line-comment` | Nothing appears before the comment.                 |
| `missing-colon`      | Google accepted the two-token form without a colon. |
| `acceptable-typo`    | Google accepted a known field-name misspelling.     |
| `line-too-long`      | Google truncated the line at its byte limit.        |

`directive.effective` tells an SEO whether the interpreted record can affect matching. A rule before the first user-agent group and an empty allow or disallow record are both ineffective.

Consider this file.

```text
# Googlebot rules
Disallow: /orphaned/
Useragent: Googlebot
Disallow /private/
Noindex: /private/
```

The report shows a whole-line comment, an ineffective orphaned rule, an accepted `useragent` spelling, a missing colon on the effective disallow rule, and one unsupported `noindex` record. The matcher does not apply `noindex` as a robots rule.

## Match evidence

`match()` returns the decision and the reason for it.

```ts
const decision = compileRobotsText(robotsText)
	.forCrawler("Googlebot")
	.match("https://example.com/private/report.pdf");
```

When a rule wins, evidence contains its directive, original source pattern, and one-based line number.

```ts
{
	kind: "rule",
	directive: "disallow",
	pattern: "/private/",
	lineNumber: 2,
}
```

When no rule wins, the decision is allowed and evidence gives one of these reasons.

| Reason        | Meaning                                              |
| ------------- | ---------------------------------------------------- |
| `no-group`    | No specific or global group matched.                 |
| `empty-group` | A selected group has no effective rules.             |
| `no-match`    | Rules were selected, but none matched the URL value. |
| `robots-txt`  | RFC 9309 mode allowed the exact `/robots.txt` path.  |

This evidence is more useful than treating line zero as "no match." It distinguishes a missing group from an empty group and a selected group whose rules did not match.

## Test map

The test names preserve Google identifiers where that makes comparison with the upstream C++ suite easier.

| Test group                                 | What an SEO can learn from it                                             |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `GoogleOnly_SystemTest`                    | Defaults for empty robots text, empty URLs, and invalid caller identities |
| `ID_LineSyntax_Line`                       | Colons, unknown fields, and Google's missing-colon tolerance              |
| `ID_LineSyntax_Groups`                     | Group boundaries, repeated agents, and rules outside groups               |
| `ID_LineSyntax_Groups_OtherRules`          | How sitemap and unknown records affect a group                            |
| `ID_REPLineNamesCaseInsensitive`           | Case-insensitive field names                                              |
| `ID_VerifyValidUserAgentsToObey`           | Valid caller product tokens                                               |
| `ID_UserAgentValueCaseInsensitive`         | Case-insensitive crawler selection                                        |
| `GoogleOnly_AcceptUserAgentUpToFirstSpace` | Google's handling of malformed robots-text user-agent values              |
| `ID_GlobalGroups_Secondary`                | Specific and global group selection                                       |
| `ID_AllowDisallow_Value_CaseSensitive`     | Case-sensitive URL matching                                               |
| `ID_LongestMatch`                          | Rule priority and allow ties                                              |
| `ID_Encoding`                              | URI encoding in rules and URLs                                            |
| `ID_SpecialCharacters`                     | Wildcards, end anchors, and comments                                      |
| `GoogleOnly_IndexHTMLisDirectory`          | Google's index document rule                                              |
| `GoogleOnly_LineTooLong`                   | Google's per-line byte limit                                              |
| `GoogleOnly_DocumentationChecks`           | Worked patterns from Google's public documentation                        |

The current suite is split across four files.

- `tests/matcher.test.ts` contains cases adapted from Google's C++ matcher suite and its public examples.
- `tests/google-parity.test.ts` contains cases added while comparing version 2 with the pinned Google source.
- `tests/rfc9309-policy.test.ts` checks behavior that belongs only to the strict policy.
- `tests/public-interface.test.ts` checks policy selection, crawler identities, evidence, inspection, validation, and lazy bulk matching.

## Run the tests

```bash
bun test
bun run build
```

Both commands must pass before publication. The current suite has 223 passing tests.
