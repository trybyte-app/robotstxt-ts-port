# Google robots.txt Parser Test Suite Documentation

This document provides comprehensive documentation of all tests in Google's robots.txt parser repository. These tests validate compliance with [RFC 9309 (Robots Exclusion Protocol)](https://www.rfc-editor.org/rfc/rfc9309.html) and Google-specific extensions.

## Test Statistics

### C++ Original

| Metric                | Count |
| --------------------- | ----- |
| Total Test Files      | 2     |
| Total Test Cases      | 23    |
| Total Assertions      | ~192  |
| RFC-Compliant Tests   | 14    |
| Google-Specific Tests | 5     |
| Utility Tests         | 2     |
| Reporting Tests       | 2     |

### TypeScript Port

| Metric           | Count             |
| ---------------- | ----------------- |
| Total Test Files | 5                 |
| Total Test Cases | 206               |
| Total Assertions | 495               |
| Coverage         | 100% of C++ tests |

## Test Naming Conventions

- **`ID_` prefix**: Tests that verify RFC 9309 compliance
- **`GoogleOnly_` prefix**: Tests for Google-specific extensions/leniency
- **`Test` prefix**: Utility function tests

---

## Source Files

### C++ Original

1. **robots_test.cc** - Main test file (21 test cases)
2. **reporting_robots_test.cc** - Reporting/parsing metadata tests (2 test cases)

### TypeScript Port

1. **tests/matcher.test.ts** - Main parsing/matching tests (145 test cases)
2. **tests/reporter.test.ts** - Reporting/parsing metadata tests (6 test cases)
3. **tests/url-utils.test.ts** - URL utility function tests (22 test cases)
4. **tests/bulk-check.test.ts** - Bulk URL checking API tests (23 test cases)
5. **tests/stress.test.ts** - Performance and stress tests (10 test cases)

---

## Critical Logic Rules

Before diving into individual tests, understand these fundamental rules:

1. **Longest Match Wins**: When multiple patterns match, the one with the most octets (characters) takes precedence
2. **Equal Length Tie-Breaker**: When allow and disallow patterns have equal length, allow wins
3. **Group Boundaries**: A group starts with `user-agent:` and includes all subsequent rules until the next `user-agent:` line
4. **Unknown Directives Don't Close Groups**: Sitemap, unknown fields, or invalid lines do not terminate a group
5. **Case Sensitivity**: Directive names are case-insensitive; URL paths are case-sensitive
6. **Encoding Responsibility**: The parser encodes non-ASCII in rules; the caller must pre-encode URLs

---

## Category A: Core Protocol Tests (RFC 9309)

### ID_LineSyntax_Line (robots_test.cc:65-80)

**RFC Reference**: Section 2.1 - Protocol Definition

**Purpose**: Validates that robots.txt follows the name:value pair format, with Google's extension of accepting missing colons.

**Assertions**:

1. Correct syntax (`user-agent: FooBot\ndisallow: /`) disallows matching URL → expects FALSE because rule is properly parsed and applied
2. Incorrect directive names (`foo: FooBot\nbar: /`) allow all URLs → expects TRUE because unrecognized directives are ignored
3. Missing colon but valid keywords (`user-agent FooBot\ndisallow /`) still works → expects FALSE because Google accepts this as a typo

**Edge Cases**: Webmasters sometimes forget the colon separator

---

### ID_LineSyntax_Groups (robots_test.cc:87-124)

**RFC Reference**: Section 2.1 - Protocol Definition

**Purpose**: Tests that user-agent groups are correctly parsed and that rules outside groups are ignored.

**Assertions**:

1. FooBot can access /x/ path → expects TRUE because allow: /x/ is in FooBot's group
2. FooBot can access /z/ path → expects TRUE because FooBot has a second group later with allow: /z/
3. FooBot cannot access /y/ path → expects FALSE because /y/ is only allowed for BarBot
4. BarBot can access /y/ path → expects TRUE because allow: /y/ is in BarBot's group
5. BarBot can access /w/ path → expects TRUE because allow: /w/ appears before BazBot's group
6. BarBot cannot access /z/ path → expects FALSE because /z/ is not in BarBot's rules
7. BazBot can access /z/ path → expects TRUE because no disallow matches
8. FooBot cannot access /foo/bar/ → expects FALSE because rule outside group is ignored
9. BarBot cannot access /foo/bar/ → expects FALSE because rule outside group is ignored
10. BazBot cannot access /foo/bar/ → expects FALSE because rule outside group is ignored

**Edge Cases**:

- Rules appearing before any user-agent line are ignored
- Rules appearing between groups (after blank lines) are ignored
- Same user-agent can appear in multiple groups (rules are combined)

---

### ID_LineSyntax_Groups_OtherRules (robots_test.cc:129-150)

**RFC Reference**: Section 2.1 - Protocol Definition

**Purpose**: Verifies that non-standard directives (Sitemap, unknown lines) do not close a user-agent group.

**Assertions**:

1. With Sitemap between user-agents: FooBot is disallowed → expects FALSE because \* group applies
2. With Sitemap between user-agents: BarBot is disallowed → expects FALSE because BarBot matches \* group
3. With unknown directive between user-agents: FooBot is disallowed → expects FALSE because \* group applies
4. With unknown directive between user-agents: BarBot is disallowed → expects FALSE because \* group applies

**Edge Cases**: Sitemap and unknown directives should not terminate groups

---

### ID_REPLineNamesCaseInsensitive (robots_test.cc:154-176)

**RFC Reference**: Section 2.1 - Protocol Definition

**Purpose**: Confirms that directive names (user-agent, allow, disallow) are case-insensitive.

**Assertions**:

1. UPPERCASE directives: allowed URL works → expects TRUE
2. lowercase directives: allowed URL works → expects TRUE
3. CaMeL case directives: allowed URL works → expects TRUE
4. UPPERCASE directives: disallowed URL blocked → expects FALSE
5. lowercase directives: disallowed URL blocked → expects FALSE
6. CaMeL case directives: disallowed URL blocked → expects FALSE

**Edge Cases**: All case variations must be handled identically

---

### ID_VerifyValidUserAgentsToObey (robots_test.cc:181-195)

**RFC Reference**: Section 2.2.1 - The user-agent line

**Purpose**: Tests the `IsValidUserAgentToObey` function for valid user-agent character sets.

**Assertions**:

1. "Foobot" → expects TRUE (valid: letters only)
2. "Foobot-Bar" → expects TRUE (valid: letters and hyphen)
3. "Foo_Bar" → expects TRUE (valid: letters and underscore)
4. Empty string_view → expects FALSE (invalid: empty) _[C++ only]_
5. Empty string "" → expects FALSE (invalid: empty)
6. Non-ASCII character "ツ" → expects FALSE (invalid: non-ASCII)
7. "Foobot\*" → expects FALSE (invalid: contains asterisk)
8. " Foobot " → expects FALSE (invalid: contains spaces)
9. "Foobot/2.1" → expects FALSE (invalid: contains slash)
10. "Foobot Bar" → expects FALSE (invalid: contains space)

**Edge Cases**: Only [a-zA-Z_-] characters are allowed

**TypeScript Note**: Assertions 4 and 5 are combined into a single test since TypeScript has no `string_view` type - both represent empty strings.

---

### ID_UserAgentValueCaseInsensitive (robots_test.cc:200-228)

**RFC Reference**: Section 2.2.1 - The user-agent line

**Purpose**: Confirms that user-agent value matching is case-insensitive.

**Assertions**:
1-3. "FOO BAR" in robots.txt matches "Foo" user-agent for allowed URL → expects TRUE (3 case variants)
4-6. "FOO BAR" in robots.txt blocks "Foo" user-agent for disallowed URL → expects FALSE (3 case variants)
7-9. "foo bar" in robots.txt matches "foo" user-agent for allowed URL → expects TRUE (3 case variants)
10-12. "foo bar" in robots.txt blocks "foo" user-agent for disallowed URL → expects FALSE (3 case variants)

**Edge Cases**: Case variations in both robots.txt and user-agent parameter

---

### ID_GlobalGroups_Secondary (robots_test.cc:255-275)

**RFC Reference**: Section 2.2.1 - The user-agent line

**Purpose**: Tests wildcard (\*) user-agent fallback behavior.

**Assertions**:

1. Empty robots.txt: all allowed → expects TRUE because no rules means no restrictions
2. Specific group disallows, wildcard allows: FooBot blocked → expects FALSE because specific group takes precedence
3. Specific group disallows, wildcard allows: BarBot allowed → expects TRUE because BarBot falls back to \* group
4. No matching group and no wildcard: QuxBot allowed → expects TRUE because no applicable rules

**Edge Cases**: Crawlers with no matching group use wildcard; no wildcard means no rules apply

---

### ID_AllowDisallow_Value_CaseSensitive (robots_test.cc:280-291)

**RFC Reference**: Section 2.2.2 - The Allow and Disallow lines

**Purpose**: Confirms that URL path matching is case-sensitive.

**Assertions**:

1. Rule `disallow: /x/` blocks `/x/y` → expects FALSE because paths match (same case)
2. Rule `disallow: /X/` allows `/x/y` → expects TRUE because paths differ in case

**Edge Cases**: Unlike directive names, URL paths are case-sensitive

---

### ID_LongestMatch (robots_test.cc:298-388)

**RFC Reference**: Section 2.2.2 - The Allow and Disallow lines

**Purpose**: Tests that the most specific (longest) match determines the outcome.

**Assertions (8 sub-tests)**:

Sub-test 1 (disallow longer):

1. Disallow `/x/page.html`, allow `/x/`: page.html blocked → expects FALSE (disallow is longer match)

Sub-test 2 (allow longer): 2. Allow `/x/page.html`, disallow `/x/`: page.html allowed → expects TRUE (allow is longer match) 3. Allow `/x/page.html`, disallow `/x/`: /x/ blocked → expects FALSE (disallow matches /x/)

Sub-test 3 (empty patterns): 4. Empty disallow and allow: URL allowed → expects TRUE (equal length, allow wins)

Sub-test 4 (root patterns): 5. Disallow `/`, allow `/`: URL allowed → expects TRUE (equal length, allow wins)

Sub-test 5 (trailing slash difference): 6. Disallow `/x`, allow `/x/`: `/x` blocked → expects FALSE (disallow matches exactly) 7. Disallow `/x`, allow `/x/`: `/x/` allowed → expects TRUE (allow is longer match)

Sub-test 6 (identical patterns): 8. Disallow and allow both `/x/page.html`: URL allowed → expects TRUE (equal length, allow wins)

Sub-test 7 (wildcard vs fixed): 9. Allow `/page`, disallow `/*.html`: page.html blocked → expects FALSE (_.html is longer match) 10. Allow `/page`, disallow `/_.html`: /page allowed → expects TRUE (no .html)

Sub-test 8 (specific group precedence): 11. Wildcard disallows `/x/`, FooBot disallows `/y/`: FooBot accesses /x/page → expects TRUE (specific group rules only) 12. Wildcard disallows `/x/`, FooBot disallows `/y/`: FooBot blocked from /y/page → expects FALSE

**Edge Cases**: Equal length tie-breaker always favors allow

---

### ID_Encoding (robots_test.cc:398-446)

**RFC Reference**: Section 2.2.2 - The Allow and Disallow lines

**Purpose**: Tests percent-encoding handling for URLs and patterns.

**Assertions (4 sub-tests)**:

Sub-test 1 (query strings):

1. URL with nested URL in query string matches rule → expects TRUE (query preserved as-is)

Sub-test 2 (3-byte character): 2. Rule with "ツ" matches percent-encoded URL → expects TRUE (parser encodes non-ASCII) 3. Rule with "ツ" does not match unencoded URL → expects FALSE (caller must pre-encode)

Sub-test 3 (pre-encoded pattern): 4. Rule with `%E3%83%84` matches percent-encoded URL → expects TRUE (already encoded) 5. Pre-encoded rule does not match unencoded URL → expects FALSE

Sub-test 4 (encoded US-ASCII): 6. Rule `%62%61%7A` does not match `baz` → expects FALSE (should not encode unreserved) 7. Rule `%62%61%7A` matches `%62%61%7A` → expects TRUE (literal match)

**Edge Cases**: Encoding unreserved ASCII is technically illegal per RFC 3986

---

### ID_SpecialCharacters (robots_test.cc:455-495)

**RFC Reference**: Section 2.2.3 - Special Characters

**Purpose**: Tests the special characters defined in the RFC: \* (wildcard), $ (end anchor), # (comment).

**Assertions (3 sub-tests)**:

Sub-test 1 (asterisk wildcard):

1. Disallow `/foo/bar/quz`, allow `/foo/*/qux`: /foo/bar/quz blocked → expects FALSE (exact disallow)
2. Allow `/foo/*/qux`: /foo/quz allowed → expects TRUE (no qux)
3. Allow `/foo/*/qux`: /foo//quz allowed → expects TRUE (double slash, no qux)
4. Allow `/foo/*/qux`: /foo/bax/quz allowed → expects TRUE (\* matches bax)

Sub-test 2 (dollar end anchor): 5. Disallow `/foo/bar$`: /foo/bar blocked → expects FALSE (exact end match) 6. Disallow `/foo/bar$`: /foo/bar/qux allowed → expects TRUE (has content after bar) 7. Disallow `/foo/bar$`: /foo/bar/ allowed → expects TRUE (trailing slash) 8. Disallow `/foo/bar$`: /foo/bar/baz allowed → expects TRUE (path continues)

Sub-test 3 (hash comment): 9. Comment line `# Disallow: /`: /foo/bar allowed → expects TRUE (commented out) 10. Disallow `/foo/quz#qux`: /foo/quz blocked → expects FALSE (comment starts after #)

**Edge Cases**: # in path is treated as comment start, not literal character

---

### ID_LinesNumbersAreCountedCorrectly (robots_test.cc:822-878)

**RFC Reference**: Section 2.1 - Protocol Definition

**Purpose**: Tests that all line ending formats are handled correctly.

**Assertions (5 file format tests, 3 assertions each = 15 total)**:

Unix format (\n):

1. Valid directives count = 4 → expects TRUE
2. Last line seen = 6 → expects TRUE

DOS format (\r\n): 3. Valid directives count = 4 → expects TRUE 4. Last line seen = 6 → expects TRUE

Mac format (\r): 5. Valid directives count = 4 → expects TRUE 6. Last line seen = 6 → expects TRUE

No final newline: 7. Valid directives count = 4 → expects TRUE 8. Last line seen = 6 → expects TRUE

Mixed line endings: 9. Valid directives count = 4 → expects TRUE 10. Last line seen = 6 → expects TRUE

**Edge Cases**: \n, \r\n, \r, mixed endings, missing final newline

---

### ID_UTF8ByteOrderMarkIsSkipped (robots_test.cc:882-927)

**RFC Reference**: N/A (handling of file encodings)

**Purpose**: Tests that UTF-8 BOM characters are properly handled at file start.

**Assertions (4 sub-tests)**:

Full BOM (\xEF\xBB\xBF):

1. Valid directives = 2 → expects TRUE (BOM skipped)
2. Unknown directives = 0 → expects TRUE (no errors)

Partial 2-byte BOM (\xEF\xBB): 3. Valid directives = 2 → expects TRUE (partial BOM skipped) 4. Unknown directives = 0 → expects TRUE

Partial 1-byte BOM (\xEF): 5. Valid directives = 2 → expects TRUE (partial BOM skipped) 6. Unknown directives = 0 → expects TRUE

Broken BOM (\xEF\x11\xBF): 7. Valid directives = 1 → expects TRUE (first line corrupted) 8. Unknown directives = 1 → expects TRUE (broken BOM = unknown line)

BOM in middle of file: 9. Valid directives = 1 → expects TRUE (only lines before BOM) 10. Unknown directives = 1 → expects TRUE (mid-file BOM = error)

**Edge Cases**: Partial BOMs, broken BOMs, BOMs not at file start

---

### ID_NonStandardLineExample_Sitemap (robots_test.cc:933-963)

**RFC Reference**: Section 2.2.4 - Other records

**Purpose**: Tests that Sitemap directive is correctly parsed.

**Assertions (2 sub-tests)**:

Sitemap at end:

1. Sitemap URL correctly extracted → expects equal to "http://foo.bar/sitemap.xml"

Sitemap at beginning: 2. Sitemap URL correctly extracted → expects equal to "http://foo.bar/sitemap.xml"

**Edge Cases**: Sitemap can appear anywhere in the file

---

## Category B: Google-Specific Extensions

### GoogleOnly_SystemTest (robots_test.cc:37-53)

**Purpose**: Basic system validation for edge cases with empty inputs.

**Assertions**:

1. Empty robots.txt with any user-agent and URL → expects TRUE (no rules = allowed)
2. Any robots.txt with empty user-agent → expects TRUE (no agent to match = allowed)
3. Matching disallow with empty URL → expects FALSE (empty URL implicitly disallowed)
4. All params empty → expects TRUE (no rules = allowed)

**Edge Cases**: Behavior when one or more inputs are empty strings

---

### GoogleOnly_AcceptUserAgentUpToFirstSpace (robots_test.cc:236-248)

**Purpose**: Tests Google's lenient handling of malformed user-agent values containing spaces.

**Assertions**:

1. "Foobot Bar" is not valid to obey → expects FALSE (validation fails)
2. "Foo Bar" in robots.txt matches "Foo" user-agent → expects TRUE (accepts up to space)
3. "Foo Bar" as user-agent to match is invalid → expects FALSE (invalid input)

**Edge Cases**: Webmasters incorrectly write "Googlebot Images" as user-agent

---

### GoogleOnly_IndexHTMLisDirectory (robots_test.cc:499-515)

**Purpose**: Tests that allowing /path/index.html implicitly allows /path/.

**Assertions**:

1. Allow `/allowed-slash/index.html`: /allowed-slash/ is accessible → expects TRUE
2. Allow `/allowed-slash/index.html`: /allowed-slash/index.htm blocked → expects FALSE (not exact match)
3. Allow `/allowed-slash/index.html`: /allowed-slash/index.html accessible → expects TRUE (exact match)
4. Allow `/allowed-slash/index.html`: /anyother-url blocked → expects FALSE (no match)

**Edge Cases**: Only "index.html" (exact) triggers this behavior

---

### GoogleOnly_LineTooLong (robots_test.cc:519-569)

**Purpose**: Tests that lines exceeding 8\*2083 bytes are truncated.

**Assertions (2 sub-tests)**:

Disallow truncation:

1. Short URL not matching truncated rule → expects TRUE (allowed)
2. Long URL matching truncated disallow → expects FALSE (blocked at truncation point)

Allow truncation: 3. Root URL blocked → expects FALSE (disallow / applies) 4. Long URL matching full allow rule → expects TRUE (exact match) 5. Long URL matching truncated allow rule → expects TRUE (truncation still matches)

**Edge Cases**: Line limit is 8 \* 2083 = 16,664 bytes

---

### GoogleOnly_DocumentationChecks (robots_test.cc:571-762)

**Purpose**: Comprehensive tests from Google's webmaster documentation examples.

**Assertions (58 total across multiple sub-tests)**:

Pattern `/fish` (10 assertions):
1-6. Various URLs with "fish" prefix tested (fish, fish.html, fish/, fishheads, etc.)
7-10. URLs that should NOT match (Fish.asp, catfish, ?id=fish, /bar)

Pattern `/fish*` (10 assertions):
11-20. Same as above, confirms _ at end is equivalent to no _

Pattern `/fish/` (9 assertions):
21-29. Tests that trailing slash requires slash in URL

Pattern `/*.php` (10 assertions):
30-39. Wildcard before extension matching

Pattern `/*.php$` (10 assertions):
40-49. Wildcard with end anchor (includes /bar baseline test)

Pattern `/fish*.php` (4 assertions):
50-53. Combined wildcard patterns

Order of precedence tests (5 assertions):
54-58. Confirms allow/disallow ordering rules

**Edge Cases**: Extensive real-world pattern examples

---

## Category C: Utility Function Tests

### TestGetPathParamsQuery (robots_test.cc:988-1009)

**Purpose**: Tests the URL path extraction function.

**Assertions (19 in C++, 20 in TypeScript)**:

1. Empty string → "/" (default to root)
2. Full URL without path → "/"
3. Full URL with trailing slash → "/"
4. Full URL with path → "/a"
5. Full URL with path and slash → "/a/"
6. URL with query string containing URL → preserves query
7. URL with query and fragment → strips fragment, keeps query
8. Domain only → "/"
9. Domain with slash → "/"
10. Domain with path → "/a"
11. Domain with path and slash → "/a/"
12. Domain with query and fragment → strips fragment
13. Single character → "/"
14. Single character with slash → "/"
15. Path only → "/a"
16. Relative path → "/b"
17. Domain with query only → "/?a"
18. Domain with semicolon path → "/a;b" (preserves semicolon)
19. Protocol-relative URL → "/b/c"

**Edge Cases**: Various URL formats including edge cases

---

### TestMaybeEscapePattern (robots_test.cc:1011-1016)

**Purpose**: Tests pattern escaping for special characters.

**Assertions (4 in C++, 5 in TypeScript)**:

1. Full URL unchanged → same URL
2. Path unchanged → same path
3. Non-ASCII "á" → "%C3%A1" (percent-encoded)
4. Lowercase percent-encoding "%aa" → "%AA" (normalized to uppercase)

**Edge Cases**: Percent-encoding normalization

---

## Category D: Reporting Tests (reporting_robots_test.cc)

### LinesNumbersAreCountedCorrectly (reporting_robots_test.cc:98-345)

**Purpose**: Comprehensive test of per-line parsing metadata.

**Test Input Lines (16 lines)**:

1. `User-Agent: foo` - Standard directive
2. `Allow: /some/path` - Standard directive
3. `User-Agent bar # no` - Missing colon with comment
4. `absolutely random line` - Unknown content
5. `#so comment, much wow` - Comment line
6. Empty line
7. `unicorns: /extinct` - Unknown directive
8. `noarchive: /some` - Unused directive
9. `Disallow: /` - Standard directive
10. `Error #and comment` - Unknown with comment
11. `useragent: baz` - Typo (missing hyphen)
12. `disallaw: /some` - Typo (misspelled)
13. `site-map: https://e/s.xml #comment` - Typo with comment
14. `sitemap: https://e/t.xml` - Standard directive
15. `Noarchive: /someCapital` - Unused directive
16. Empty (from trailing \n)

**Assertions per line (metadata validation)**:

- line_num: Correct line number
- tag_name: Correct tag type (UserAgent, Allow, Disallow, Sitemap, Unknown, Unused)
- is_typo: Whether it's a recognized typo
- metadata.is_empty: Whether line is empty
- metadata.has_comment: Whether line contains #
- metadata.is_comment: Whether entire line is comment
- metadata.has_directive: Whether valid directive found
- metadata.is_acceptable_typo: Whether typo is auto-corrected
- metadata.is_missing_colon_separator: Whether colon is missing

**Additional format tests**:

- DOS line endings (\r\n)
- Mac line endings (\r)

**Edge Cases**: All possible line types and metadata combinations

---

### LinesTooLongReportedCorrectly (reporting_robots_test.cc:347-404)

**Purpose**: Tests that excessively long lines are flagged in metadata.

**Assertions (3 line validations)**:

1. Line 1 (user-agent): is_line_too_long = false
2. Line 2 (long disallow): is_line_too_long = true
3. Line 3 (normal allow): is_line_too_long = false

**Edge Cases**: Lines exceeding 8\*2084 bytes are flagged

---

## Category E: Bulk Check API Tests (TypeScript Extension)

These tests validate the TypeScript-specific bulk URL checking API, which allows efficient checking of multiple URLs against a single parsed robots.txt file.

### BulkCheck_BasicFunctionality (bulk-check.test.ts:22-71)

**Purpose**: Tests basic batch URL checking functionality.

**Assertions (12 total)**:

Test 1 - Batch check returns correct results:

1. Results array has correct length (4) → expects TRUE
2. /public/ URL is allowed → expects TRUE
3. /private/ URL is blocked → expects FALSE
4. /admin/ URL is blocked → expects FALSE
5. /about URL is allowed → expects TRUE (no matching rule)

Test 2 - Results maintain URL order:
6-8. Each result contains the original URL in correct order

Test 3 - Detailed results include matching info: 9. /private/ URL is blocked → expects FALSE 10. matchingLine is > 0 → expects TRUE 11. matchedPattern equals "/private/" → expects TRUE 12. matchedRuleType equals "disallow" → expects TRUE

---

### BulkCheck_ParsedRobotsReuse (bulk-check.test.ts:73-112)

**Purpose**: Tests that parsed robots.txt can be reused for multiple agent checks.

**Assertions (7 total)**:

Test 1 - ParsedRobots reuse for different agents:
1-2. Googlebot is allowed for both URLs → expects TRUE
3-4. Bingbot is blocked for both URLs → expects FALSE

Test 2 - checkUrl convenience method: 5. Single URL check works → expects TRUE

Test 3 - RobotsMatcher.parse returns ParsedRobots: 6. Return type is ParsedRobots instance → expects TRUE 7. Returned instance works for URL checks → expects TRUE

---

### BulkCheck_EdgeCases (bulk-check.test.ts:114-190)

**Purpose**: Tests edge cases in bulk URL checking.

**Assertions (8 total)**:

Test 1 - Empty robots.txt:
1-2. All URLs allowed with empty robots.txt → expects TRUE 3. matchedRuleType is "none" → expects TRUE

Test 2 - Empty URL list: 4. Returns empty array → expects TRUE

Test 3 - No matching user-agent fallback: 5. UnknownBot uses global rules (blocked) → expects FALSE 6. Googlebot uses specific rules (allowed) → expects TRUE

Test 4 - Specific agent ignores global rules: 7. Googlebot with specific rules ignores global Disallow: / → expects TRUE

Test 5 - User-agent extraction: 8. "Googlebot/2.1" matches "Googlebot" rules → expects FALSE (blocked)

---

### BulkCheck_LongestMatchSemantics (bulk-check.test.ts:192-240)

**Purpose**: Tests longest-match-wins semantics in bulk checking.

**Assertions (7 total)**:

Test 1 - Allow longer than Disallow:

1. /private/secret blocked by shorter /private/ → expects FALSE
2. /private/public/doc allowed by longer /private/public/ → expects TRUE
3. matchedRuleType confirms "allow" → expects TRUE

Test 2 - Disallow longer than Allow: 4. /public/doc allowed by /public/ → expects TRUE 5. /public/private/secret blocked by longer /public/private/ → expects FALSE 6. matchedRuleType confirms "disallow" → expects TRUE

Test 3 - Equal length patterns: 7. Allow wins when patterns have equal length → expects TRUE

---

### BulkCheck_MultipleAgentGroups (bulk-check.test.ts:242-299)

**Purpose**: Tests handling of multiple user-agent groups.

**Assertions (7 total)**:

Test 1 - Same agent in multiple groups (rules merge):

1. /a/doc blocked from first group → expects FALSE
2. /b/doc blocked from second group → expects FALSE
3. /c/doc allowed (no matching rule) → expects TRUE

Test 2 - hasSpecificAgent method: 4. Returns true for explicit agent (Googlebot) → expects TRUE 5. Returns false for non-explicit agent (Bingbot) → expects FALSE

Test 3 - getExplicitAgents method: 6. Contains "googlebot" → expects TRUE 7. Contains "bingbot" and has length 2 → expects TRUE

---

### BulkCheck_WildcardPatterns (bulk-check.test.ts:301-333)

**Purpose**: Tests wildcard and anchor patterns in bulk checking.

**Assertions (5 total)**:

Test 1 - Wildcard \* in pattern:

1. /private/doc.pdf matches /private/\*.pdf → expects FALSE
2. /private/subdir/doc.pdf matches /private/\*.pdf → expects FALSE
3. /private/doc.html doesn't match \*.pdf → expects TRUE

Test 2 - End anchor $ in pattern: 4. /private/ matches /private/$ exactly → expects FALSE 5. /private/doc doesn't match because of $ → expects TRUE

---

### BulkCheck_ConsistencyWithOriginalAPI (bulk-check.test.ts:335-384)

**Purpose**: Verifies batch results match single-check API results.

**Assertions (6 total across loops)**:

Test 1 - Generic agent consistency:
1-4. Each batch result matches oneAgentAllowedByRobots result for "MyBot"

Test 2 - Specific agent consistency:
5-6. Each batch result matches oneAgentAllowedByRobots result for "Googlebot"

**Edge Cases**: Ensures API consistency between batch and single-check methods

---

### BulkCheck_Performance (bulk-check.test.ts:386-439)

**Purpose**: Tests performance characteristics of bulk checking.

**Assertions (3 total)**:

Test 1 - Large URL batch:

1. 10K URLs processed → expects 10000 results
2. Completes in under 1 second → expects TRUE

Test 2 - ParsedRobots reuse vs repeated parsing: 3. Batch check (single parse) is faster than individual checks → expects TRUE

**Edge Cases**: Validates O(n) URL checking after O(1) parse cost

---

## Category F: Stress Tests (TypeScript Extension)

These tests validate the library's performance and stability under extreme conditions.

### StressTest_LargeFileHandling (stress.test.ts:18-63)

**Purpose**: Tests parsing of large robots.txt files.

**Assertions (3 total)**:

Test 1 - 1MB robots.txt:
1. Parser completes without crashing → expects TRUE
2. Completes within 5 seconds → expects TRUE

Test 2 - 100K lines:
3. Parser handles 100,000 Disallow rules efficiently → expects TRUE

Test 3 - Many user-agent groups:
4. Parser handles 1,000 separate user-agent groups → expects TRUE

**Edge Cases**: Memory efficiency, parsing speed with large inputs

---

### StressTest_PathologicalPatterns (stress.test.ts:65-124)

**Purpose**: Tests pattern matching with complex wildcard patterns.

**Assertions (3 total)**:

Test 1 - Many wildcards:
1. Pattern `/a*b*c*d*e*f*g*h*i*j*` matches efficiently → expects TRUE (< 100ms)

Test 2 - Deeply nested wildcards:
2. Pattern with 16 wildcard segments matches efficiently → expects TRUE

Test 3 - Many rules with same prefix:
3. 10,000 rules starting with `/api/v1/users/` checked efficiently → expects TRUE

**Edge Cases**: Avoids exponential backtracking in pattern matching

---

### StressTest_BulkURLCheckingPerformance (stress.test.ts:126-146)

**Purpose**: Tests bulk URL checking at scale.

**Assertions (2 total)**:

Test 1 - 10K URLs:
1. 10,000 URLs processed → expects 10,000 results
2. Completes under 1 second → expects TRUE

**Edge Cases**: Linear scaling with URL count

---

### StressTest_EdgeCases (stress.test.ts:148-188)

**Purpose**: Tests graceful handling of edge cases.

**Assertions (5 total)**:

Test 1 - Empty robots.txt:
1. Returns allowed (true) → expects TRUE

Test 2 - Comments only:
2. Returns allowed (true) → expects TRUE

Test 3 - Malformed URLs:
3. Empty URL doesn't throw → expects no exception
4. Invalid URL doesn't throw → expects no exception
5. Missing scheme URL doesn't throw → expects no exception

**Edge Cases**: Graceful degradation with invalid input

---

## Helper Classes

### RobotsStatsReporter (robots_test.cc:765-819)

Used in parsing tests to collect statistics:

- `last_line_seen_`: Tracks highest line number
- `valid_directives_`: Counts recognized directives
- `unknown_directives_`: Counts unrecognized directives
- `sitemap_`: Stores sitemap URL

### RobotsParsingReporter (reporting_robots_test.cc)

Extended reporter that stores per-line metadata:

- `parse_results_`: Vector of `RobotsParsedLine` structs
- Each line tracked with full metadata

### LineMetadata Struct

Per-line parsing information:

- `is_empty`: Line contains no content
- `has_directive`: Line contains valid directive
- `has_comment`: Line contains # character
- `is_comment`: Entire line is a comment
- `is_acceptable_typo`: Typo was auto-corrected
- `is_line_too_long`: Line exceeds length limit
- `is_missing_colon_separator`: Directive lacks colon

---

## TypeScript Porting Considerations

### String Handling

| C++                 | TypeScript                       |
| ------------------- | -------------------------------- |
| `std::string`       | `string`                         |
| `absl::string_view` | `string` (no separate view type) |
| `str.length()`      | `str.length`                     |
| `str.c_str()`       | Direct string usage              |

**Note**: TypeScript strings are immutable and UTF-16 encoded. Be careful with:

- Multi-byte character handling
- String comparison semantics

### Encoding Considerations

| C++                   | TypeScript                            |
| --------------------- | ------------------------------------- |
| Manual UTF-8 handling | `TextEncoder`/`TextDecoder`           |
| `%` encoding          | `encodeURIComponent()` (with caveats) |
| Byte-level operations | `Uint8Array` when needed              |

**Important**: `encodeURIComponent` encodes differently than the C++ implementation. May need custom encoding for exact compatibility.

### Test Framework Mapping

| gtest               | bun:test                              |
| ------------------- | ------------------------------------- |
| `TEST(Suite, Name)` | `test("Name", () => {})`              |
| `EXPECT_TRUE(x)`    | `expect(x).toBe(true)`                |
| `EXPECT_FALSE(x)`   | `expect(x).toBe(false)`               |
| `EXPECT_EQ(a, b)`   | `expect(a).toBe(b)`                   |
| `ASSERT_GE(a, b)`   | `expect(a).toBeGreaterThanOrEqual(b)` |

### Memory Management

C++ patterns that don't apply to TypeScript:

- `new[]` / `delete[]` for escaped values
- Manual string buffer management
- Pointer arithmetic

TypeScript equivalents:

- Return new strings directly
- Use array methods
- Use slice/substring

### Line Ending Handling

Both languages handle `\n`, `\r\n`, `\r` but be careful with:

- `split()` behavior differs
- Regex patterns for line splitting
- Empty string handling at end

### Character Encoding Constants

```typescript
// BOM bytes (UTF-8)
const UTF8_BOM = [0xef, 0xbb, 0xbf];

// Max line length
const MAX_LINE_LENGTH = 2083 * 8;
```

---

## Test Organization for TypeScript Port

Recommended test file structure:

```
src/
  __tests__/
    robots.test.ts           # Main parsing/matching tests
    reporting.test.ts        # Parsing metadata tests
    utils.test.ts           # Utility function tests
```

Each test should be named to match the original C++ test for traceability.

---

## TypeScript Port Verification Results

The TypeScript port has been verified to provide **100% test coverage** of all C++ test cases.

### Coverage Summary

| Test Section                              | C++ Assertions | TS Assertions | Status |
| ----------------------------------------- | -------------- | ------------- | ------ |
| GoogleOnly_SystemTest                     | 4              | 4             | ✅     |
| ID_LineSyntax_Line                        | 3              | 3             | ✅     |
| ID_LineSyntax_Groups                      | 10             | 10            | ✅     |
| ID_LineSyntax_Groups_OtherRules           | 4              | 4             | ✅     |
| ID_REPLineNamesCaseInsensitive            | 6              | 6             | ✅     |
| ID_VerifyValidUserAgentsToObey            | 10             | 9             | ✅¹    |
| ID_UserAgentValueCaseInsensitive          | 12             | 12            | ✅     |
| GoogleOnly_AcceptUserAgentUpToFirstSpace  | 3              | 3             | ✅     |
| ID_GlobalGroups_Secondary                 | 4              | 4             | ✅     |
| ID_AllowDisallow_Value_CaseSensitive      | 2              | 2             | ✅     |
| ID_LongestMatch                           | 14             | 14            | ✅     |
| ID_Encoding                               | 7              | 7             | ✅     |
| ID_SpecialCharacters                      | 10             | 10            | ✅     |
| GoogleOnly_IndexHTMLisDirectory           | 4              | 4             | ✅     |
| GoogleOnly_LineTooLong                    | 5              | 5             | ✅     |
| GoogleOnly_DocumentationChecks            | 58             | 58            | ✅     |
| ID_LinesNumbersAreCountedCorrectly        | 10             | 11            | ✅     |
| ID_UTF8ByteOrderMarkIsSkipped             | 10             | 10            | ✅     |
| ID_NonStandardLineExample_Sitemap         | 2              | 2             | ✅     |
| TestGetPathParamsQuery                    | 19             | 20            | ✅     |
| TestMaybeEscapePattern                    | 4              | 5             | ✅     |
| Reporter: LinesNumbersAreCountedCorrectly | 10             | 20            | ✅     |
| Reporter: LinesTooLongReportedCorrectly   | 2              | varies        | ✅     |

### Notes

1. **ID_VerifyValidUserAgentsToObey**: C++ tests both `absl::string_view()` and `""` separately. TypeScript only has `""` since there's no string_view concept - both represent empty strings semantically.

2. **TypeScript has MORE tests in several areas**: The TypeScript implementation includes additional test assertions in URL utilities and reporter tests to verify more metadata fields.

### Running the Tests

```bash
# Run all tests
bun test

# Expected output:
# 206 pass
# 0 fail
# 495 expect() calls
```
