// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, test } from "bun:test";
import {
	ParsedRobots,
	RobotsMatcher,
	type UrlCheckResult,
} from "../src/index.js";

describe("BulkCheck_BasicFunctionality", () => {
	const robotstxt = `
User-agent: *
Disallow: /private/
Disallow: /admin/
Allow: /public/
`;

	test("Batch check returns correct results for multiple URLs", () => {
		const urls = [
			"http://example.com/public/page.html",
			"http://example.com/private/secret.html",
			"http://example.com/admin/dashboard",
			"http://example.com/about",
		];

		const results = RobotsMatcher.batchCheck(robotstxt, "MyBot", urls);

		expect(results.length).toBe(4);
		expect(results[0].allowed).toBe(true); // /public/ allowed
		expect(results[1].allowed).toBe(false); // /private/ disallowed
		expect(results[2].allowed).toBe(false); // /admin/ disallowed
		expect(results[3].allowed).toBe(true); // /about not matched, allowed
	});

	test("Results include URL in same order as input", () => {
		const urls = [
			"http://example.com/a",
			"http://example.com/b",
			"http://example.com/c",
		];

		const results = RobotsMatcher.batchCheck(robotstxt, "MyBot", urls);

		expect(results[0].url).toBe(urls[0]);
		expect(results[1].url).toBe(urls[1]);
		expect(results[2].url).toBe(urls[2]);
	});

	test("Detailed results include matching line and pattern", () => {
		const results = RobotsMatcher.batchCheck(robotstxt, "MyBot", [
			"http://example.com/private/doc.pdf",
		]);

		expect(results[0].allowed).toBe(false);
		expect(results[0].matchingLine).toBeGreaterThan(0);
		expect(results[0].matchedPattern).toBe("/private/");
		expect(results[0].matchedRuleType).toBe("disallow");
	});
});

describe("BulkCheck_ParsedRobotsReuse", () => {
	const robotstxt = `
User-agent: *
Disallow: /

User-agent: Googlebot
Allow: /
`;

	test("ParsedRobots can be reused for multiple checks", () => {
		const parsed = ParsedRobots.parse(robotstxt);

		const urls = ["http://example.com/page1", "http://example.com/page2"];

		// Check with one agent
		const results1 = parsed.checkUrls("Googlebot", urls);
		expect(results1[0].allowed).toBe(true);
		expect(results1[1].allowed).toBe(true);

		// Check with another agent
		const results2 = parsed.checkUrls("Bingbot", urls);
		expect(results2[0].allowed).toBe(false);
		expect(results2[1].allowed).toBe(false);
	});

	test("checkUrl convenience method works", () => {
		const parsed = ParsedRobots.parse(robotstxt);

		const result = parsed.checkUrl("Googlebot", "http://example.com/page");
		expect(result.allowed).toBe(true);
	});

	test("RobotsMatcher.parse returns ParsedRobots", () => {
		const parsed = RobotsMatcher.parse(robotstxt);

		expect(parsed).toBeInstanceOf(ParsedRobots);
		const result = parsed.checkUrl("Googlebot", "http://example.com/page");
		expect(result.allowed).toBe(true);
	});
});

describe("BulkCheck_EdgeCases", () => {
	test("Empty robots.txt allows everything", () => {
		const results = RobotsMatcher.batchCheck("", "MyBot", [
			"http://example.com/anything",
			"http://example.com/private/secret",
		]);

		expect(results[0].allowed).toBe(true);
		expect(results[1].allowed).toBe(true);
		expect(results[0].matchedRuleType).toBe("none");
	});

	test("Empty Disallow allows everything (RFC 9309 compliance)", () => {
		// RFC 9309: "If the value is empty, the rule is ignored"
		// An empty Disallow: means "allow all" - it should NOT block any URLs
		const robotstxt = `
User-agent: *
Disallow:
`;

		const urls = [
			"http://example.com/",
			"http://example.com/anything",
			"http://example.com/private/secret",
			"http://example.com/admin/dashboard",
		];

		// Test with ParsedRobots (where the bug was)
		const parsed = ParsedRobots.parse(robotstxt);
		const parsedResults = parsed.checkUrls("MyBot", urls);
		for (const result of parsedResults) {
			expect(result.allowed).toBe(true);
		}

		// Test with RobotsMatcher (already worked correctly)
		const matcher = new RobotsMatcher();
		for (const url of urls) {
			expect(matcher.oneAgentAllowedByRobots(robotstxt, "MyBot", url)).toBe(
				true,
			);
		}

		// Ensure both APIs return the same result
		const batchResults = RobotsMatcher.batchCheck(robotstxt, "MyBot", urls);
		for (let i = 0; i < urls.length; i++) {
			expect(batchResults[i].allowed).toBe(
				matcher.oneAgentAllowedByRobots(robotstxt, "MyBot", urls[i]),
			);
		}
	});

	test("Empty URL list returns empty array", () => {
		const results = RobotsMatcher.batchCheck(
			"User-agent: *\nDisallow: /",
			"MyBot",
			[],
		);

		expect(results).toEqual([]);
	});

	test("No matching user-agent falls back to global rules", () => {
		const robotstxt = `
User-agent: *
Disallow: /private/

User-agent: Googlebot
Allow: /private/
`;

		const parsed = ParsedRobots.parse(robotstxt);

		// UnknownBot should use global rules
		const result1 = parsed.checkUrl(
			"UnknownBot",
			"http://example.com/private/doc",
		);
		expect(result1.allowed).toBe(false);

		// Googlebot should use specific rules
		const result2 = parsed.checkUrl(
			"Googlebot",
			"http://example.com/private/doc",
		);
		expect(result2.allowed).toBe(true);
	});

	test("Specific agent ignores global rules", () => {
		const robotstxt = `
User-agent: *
Disallow: /

User-agent: Googlebot
Allow: /allowed/
`;

		const parsed = ParsedRobots.parse(robotstxt);

		// Googlebot ignores global Disallow: / and only uses its specific rules
		const result = parsed.checkUrl("Googlebot", "http://example.com/other/");
		expect(result.allowed).toBe(true); // No rule matches, so allowed
	});

	test("User-agent extraction works (Googlebot/2.1 matches Googlebot)", () => {
		const robotstxt = `
User-agent: Googlebot
Disallow: /private/
`;

		const result = RobotsMatcher.batchCheck(robotstxt, "Googlebot/2.1", [
			"http://example.com/private/doc",
		])[0];

		expect(result.allowed).toBe(false);
	});
});

describe("BulkCheck_LongestMatchSemantics", () => {
	test("Longest pattern wins (Allow longer than Disallow)", () => {
		const robotstxt = `
User-agent: *
Disallow: /private/
Allow: /private/public/
`;

		const results = RobotsMatcher.batchCheck(robotstxt, "MyBot", [
			"http://example.com/private/secret",
			"http://example.com/private/public/doc",
		]);

		expect(results[0].allowed).toBe(false); // /private/ matches
		expect(results[1].allowed).toBe(true); // /private/public/ is longer, wins
		expect(results[1].matchedRuleType).toBe("allow");
	});

	test("Longest pattern wins (Disallow longer than Allow)", () => {
		const robotstxt = `
User-agent: *
Allow: /public/
Disallow: /public/private/
`;

		const results = RobotsMatcher.batchCheck(robotstxt, "MyBot", [
			"http://example.com/public/doc",
			"http://example.com/public/private/secret",
		]);

		expect(results[0].allowed).toBe(true);
		expect(results[1].allowed).toBe(false);
		expect(results[1].matchedRuleType).toBe("disallow");
	});

	test("Equal length patterns: Allow wins", () => {
		const robotstxt = `
User-agent: *
Disallow: /path/
Allow: /path/
`;

		const result = RobotsMatcher.batchCheck(robotstxt, "MyBot", [
			"http://example.com/path/doc",
		])[0];

		expect(result.allowed).toBe(true);
	});
});

describe("BulkCheck_MultipleAgentGroups", () => {
	test("Same agent in multiple groups: rules merge", () => {
		const robotstxt = `
User-agent: Googlebot
Disallow: /a/

User-agent: Googlebot
Disallow: /b/
`;

		const parsed = ParsedRobots.parse(robotstxt);

		const results = parsed.checkUrls("Googlebot", [
			"http://example.com/a/doc",
			"http://example.com/b/doc",
			"http://example.com/c/doc",
		]);

		expect(results[0].allowed).toBe(false); // /a/ blocked
		expect(results[1].allowed).toBe(false); // /b/ blocked
		expect(results[2].allowed).toBe(true); // /c/ allowed
	});

	test("hasSpecificAgent returns true for explicit agents", () => {
		const robotstxt = `
User-agent: *
Disallow: /

User-agent: Googlebot
Allow: /
`;

		const parsed = ParsedRobots.parse(robotstxt);

		expect(parsed.hasSpecificAgent("Googlebot")).toBe(true);
		expect(parsed.hasSpecificAgent("Bingbot")).toBe(false);
	});

	test("getExplicitAgents returns list of agents", () => {
		const robotstxt = `
User-agent: *
Disallow: /

User-agent: Googlebot
Allow: /

User-agent: Bingbot
Disallow: /private/
`;

		const parsed = ParsedRobots.parse(robotstxt);
		const agents = parsed.getExplicitAgents();

		expect(agents).toContain("googlebot");
		expect(agents).toContain("bingbot");
		expect(agents.length).toBe(2);
	});
});

describe("BulkCheck_WildcardPatterns", () => {
	test("Wildcard * in pattern matches correctly", () => {
		const robotstxt = `
User-agent: *
Disallow: /private/*.pdf
`;

		const results = RobotsMatcher.batchCheck(robotstxt, "MyBot", [
			"http://example.com/private/doc.pdf",
			"http://example.com/private/subdir/doc.pdf",
			"http://example.com/private/doc.html",
		]);

		expect(results[0].allowed).toBe(false); // matches /private/*.pdf
		expect(results[1].allowed).toBe(false); // matches /private/*.pdf
		expect(results[2].allowed).toBe(true); // doesn't match *.pdf
	});

	test("End anchor $ in pattern matches correctly", () => {
		const robotstxt = `
User-agent: *
Disallow: /private/$
`;

		const results = RobotsMatcher.batchCheck(robotstxt, "MyBot", [
			"http://example.com/private/",
			"http://example.com/private/doc",
		]);

		expect(results[0].allowed).toBe(false); // exact match with $
		expect(results[1].allowed).toBe(true); // doesn't match because of $
	});
});

describe("BulkCheck_ConsistencyWithOriginalAPI", () => {
	const robotstxt = `
User-agent: *
Disallow: /private/
Allow: /private/public/

User-agent: Googlebot
Allow: /
`;

	test("Batch results match oneAgentAllowedByRobots results", () => {
		const urls = [
			"http://example.com/",
			"http://example.com/private/",
			"http://example.com/private/public/",
			"http://example.com/other/",
		];

		const batchResults = RobotsMatcher.batchCheck(robotstxt, "MyBot", urls);

		const matcher = new RobotsMatcher();
		for (let i = 0; i < urls.length; i++) {
			const singleResult = matcher.oneAgentAllowedByRobots(
				robotstxt,
				"MyBot",
				urls[i],
			);
			expect(batchResults[i].allowed).toBe(singleResult);
		}
	});

	test("Specific agent batch results match original API", () => {
		const urls = [
			"http://example.com/private/secret",
			"http://example.com/anything",
		];

		const batchResults = RobotsMatcher.batchCheck(robotstxt, "Googlebot", urls);

		const matcher = new RobotsMatcher();
		for (let i = 0; i < urls.length; i++) {
			const singleResult = matcher.oneAgentAllowedByRobots(
				robotstxt,
				"Googlebot",
				urls[i],
			);
			expect(batchResults[i].allowed).toBe(singleResult);
		}
	});
});

describe("BulkCheck_ComprehensiveConsistency", () => {
	// Edge cases that could potentially differ between bulk and single URL parsing
	const edgeCases = [
		{
			name: "Empty Disallow only",
			robotstxt: "User-agent: *\nDisallow:\n",
		},
		{
			name: "Empty Allow only",
			robotstxt: "User-agent: *\nAllow:\n",
		},
		{
			name: "Both empty Allow and Disallow",
			robotstxt: "User-agent: *\nDisallow:\nAllow:\n",
		},
		{
			name: "Empty Disallow with non-empty Allow",
			robotstxt: "User-agent: *\nDisallow:\nAllow: /public/\n",
		},
		{
			name: "Empty Allow with non-empty Disallow",
			robotstxt: "User-agent: *\nAllow:\nDisallow: /private/\n",
		},
		{
			name: "Disallow / with empty Allow",
			robotstxt: "User-agent: *\nDisallow: /\nAllow:\n",
		},
		{
			name: "Empty user-agent with rules",
			robotstxt: "User-agent:\nDisallow: /private/\n",
		},
		{
			name: "Global and specific agent in same group",
			robotstxt: "User-agent: *\nUser-agent: Googlebot\nDisallow: /private/\n",
		},
		{
			name: "Same agent in multiple groups",
			robotstxt:
				"User-agent: Googlebot\nDisallow: /a/\n\nUser-agent: Googlebot\nDisallow: /b/\n",
		},
		{
			name: "Whitespace-only value",
			robotstxt: "User-agent: *\nDisallow:   \n",
		},
		{
			name: "Root pattern with equal length Allow",
			robotstxt: "User-agent: *\nDisallow: /\nAllow: /\n",
		},
		{
			name: "index.html normalization",
			robotstxt: "User-agent: *\nAllow: /allowed/index.html\nDisallow: /\n",
		},
	];

	const testUrls = [
		"http://example.com/",
		"http://example.com/private/",
		"http://example.com/private/doc.html",
		"http://example.com/public/",
		"http://example.com/public/doc.html",
		"http://example.com/a/",
		"http://example.com/b/",
		"http://example.com/allowed/",
		"http://example.com/allowed/index.html",
		"http://example.com/other/path",
	];

	// Note: Empty agent ("") is excluded as it's documented invalid input
	// (RobotsMatcher.isValidUserAgentToObey("") returns false)
	const testAgents = ["MyBot", "Googlebot", "Bingbot"];

	for (const { name, robotstxt } of edgeCases) {
		test(`Edge case: ${name}`, () => {
			const matcher = new RobotsMatcher();
			const parsed = ParsedRobots.parse(robotstxt);

			for (const agent of testAgents) {
				for (const url of testUrls) {
					const singleResult = matcher.oneAgentAllowedByRobots(
						robotstxt,
						agent,
						url,
					);
					const bulkResult = parsed.checkUrl(agent, url);

					expect(bulkResult.allowed).toBe(singleResult);
				}
			}
		});
	}
});

describe("BulkCheck_Performance", () => {
	test("Can handle large number of URLs without timeout", () => {
		const robotstxt = `
User-agent: *
Disallow: /private/
Allow: /public/
Disallow: /admin/
Allow: /api/
`;

		// Generate 10K URLs for performance test
		const urls: string[] = [];
		for (let i = 0; i < 10000; i++) {
			urls.push(`http://example.com/path${i}/page.html`);
		}

		const start = performance.now();
		const results = RobotsMatcher.batchCheck(robotstxt, "MyBot", urls);
		const elapsed = performance.now() - start;

		expect(results.length).toBe(10000);
		// Should complete in under 1 second for 10K URLs
		expect(elapsed).toBeLessThan(1000);
	});

	test("ParsedRobots reuse is faster than repeated parsing", () => {
		const robotstxt = `
User-agent: *
Disallow: /private/
Allow: /public/
`;

		const urls: string[] = [];
		for (let i = 0; i < 1000; i++) {
			urls.push(`http://example.com/path${i}/page.html`);
		}

		// Measure batch check (single parse)
		const start1 = performance.now();
		RobotsMatcher.batchCheck(robotstxt, "MyBot", urls);
		const batchTime = performance.now() - start1;

		// Measure individual checks (parse per URL)
		const matcher = new RobotsMatcher();
		const start2 = performance.now();
		for (const url of urls) {
			matcher.oneAgentAllowedByRobots(robotstxt, "MyBot", url);
		}
		const individualTime = performance.now() - start2;

		// Batch should be significantly faster
		expect(batchTime).toBeLessThan(individualTime);
	});
});
