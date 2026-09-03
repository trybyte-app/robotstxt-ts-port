// Copyright 2019 Google LLC
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
//
// Adapted from google/robotstxt robots_test.cc. These tests record the released
// Google parser and matcher behavior, including accepted syntax errors and
// implementation-specific rules.

import { describe, expect, test } from "bun:test";
import {
	compileRobotsText,
	inspectRobotsText,
	type MatchDecision,
} from "../src/index.js";

function forCrawler(robotsText: string, identity = "FooBot") {
	return compileRobotsText(robotsText, { policy: "google" }).forCrawler(
		identity,
	);
}

function isAllowed(robotsText: string, identity: string, url: string): boolean {
	return forCrawler(robotsText, identity).isAllowed(url);
}

function expectRule(
	decision: MatchDecision,
	directive: "allow" | "disallow",
	pattern: string,
	lineNumber: number,
): void {
	expect(decision.evidence).toEqual({
		kind: "rule",
		directive,
		pattern,
		lineNumber,
	});
}

describe("google policy syntax compatibility", () => {
	test("accepts a missing colon when the line has exactly two tokens", () => {
		const robotsText = "user-agent FooBot\ndisallow /\n";

		expect(isAllowed(robotsText, "FooBot", "http://foo.bar/x/y")).toBe(false);
	});

	test.each(["useragent", "user agent"])(
		"accepts the %s user-agent spelling",
		(key) => {
			const robotsText = `${key}: FooBot\ndisallow: /\n`;

			expect(isAllowed(robotsText, "FooBot", "https://example.com/x")).toBe(
				false,
			);
		},
	);

	test.each(["dissallow", "dissalow", "disalow", "diasllow", "disallaw"])(
		"accepts the %s disallow spelling",
		(key) => {
			const robotsText = `user-agent: FooBot\n${key}: /\n`;

			expect(isAllowed(robotsText, "FooBot", "https://example.com/x")).toBe(
				false,
			);
		},
	);

	test("recognizes core field names by prefix", () => {
		const robotsText = [
			"user-agent-extra: FooBot",
			"disallowed: /",
			"allowance: /public/",
			"",
		].join("\n");

		const crawler = forCrawler(robotsText);
		expect(crawler.isAllowed("https://example.com/private")).toBe(false);
		expect(crawler.isAllowed("https://example.com/public/page")).toBe(true);
	});

	test("truncates a malformed robots-text user-agent to its product token", () => {
		const robotsText = [
			"User-Agent: *",
			"Disallow: /",
			"User-Agent: Foo Bar",
			"Allow: /x/",
			"Disallow: /",
			"",
		].join("\n");

		expect(isAllowed(robotsText, "Foo", "http://foo.bar/x/y")).toBe(true);
	});

	test("treats a wildcard followed by whitespace and junk as global", () => {
		const robotsText = "User-agent: * anything\nDisallow: /\n";

		expect(isAllowed(robotsText, "OtherBot", "https://example.com/x")).toBe(
			false,
		);
	});
});

describe("google policy user-agent group transitions", () => {
	test("an empty specific group suppresses global rules", () => {
		const robotsText = [
			"User-agent: *",
			"Disallow: /",
			"User-agent: FooBot",
			"",
		].join("\n");

		const decision = forCrawler(robotsText).match("https://example.com/x");

		expect(decision.allowed).toBe(true);
		expect(decision.selectedRules).toBe("specific");
		expect(decision.evidence).toEqual({
			kind: "default-allow",
			reason: "empty-group",
		});
	});

	test.each(["Allow", "Disallow"])(
		"an empty %s rule closes the current group",
		(directive) => {
			const robotsText = [
				"User-agent: FooBot",
				`${directive}:`,
				"User-agent: BarBot",
				"Disallow: /",
				"",
			].join("\n");

			expect(isAllowed(robotsText, "FooBot", "https://example.com/x")).toBe(
				true,
			);
			expect(isAllowed(robotsText, "BarBot", "https://example.com/x")).toBe(
				false,
			);
		},
	);

	test.each(["Sitemap: https://example.com/sitemap.xml", "Unknown: value"])(
		"%s does not close a user-agent group",
		(otherRecord) => {
			const robotsText = [
				"User-agent: FooBot",
				otherRecord,
				"User-agent: BarBot",
				"Disallow: /",
				"",
			].join("\n");

			expect(isAllowed(robotsText, "FooBot", "https://example.com/x")).toBe(
				false,
			);
			expect(isAllowed(robotsText, "BarBot", "https://example.com/x")).toBe(
				false,
			);
		},
	);

	test.each(["User-agent:", "User-agent: 123", "User-agent: *junk"])(
		"an invalid %s closes a preceding group after rules",
		(invalidAgent) => {
			const robotsText = [
				"User-agent: FooBot",
				"Disallow: /first",
				invalidAgent,
				"Disallow: /leak",
				"",
			].join("\n");
			const crawler = forCrawler(robotsText);

			expect(crawler.isAllowed("https://example.com/first")).toBe(false);
			expect(crawler.isAllowed("https://example.com/leak")).toBe(true);
		},
	);
});

describe("google policy rule adjudication", () => {
	const url = "http://foo.bar/x/page.html";

	test("a longer disallow rule wins", () => {
		const robotsText = [
			"user-agent: FooBot",
			"disallow: /x/page.html",
			"allow: /x/",
			"",
		].join("\n");

		const decision = forCrawler(robotsText).match(url);
		expect(decision.allowed).toBe(false);
		expectRule(decision, "disallow", "/x/page.html", 2);
	});

	test("a longer allow rule wins", () => {
		const robotsText = [
			"user-agent: FooBot",
			"allow: /x/page.html",
			"disallow: /x/",
			"",
		].join("\n");

		const decision = forCrawler(robotsText).match(url);
		expect(decision.allowed).toBe(true);
		expectRule(decision, "allow", "/x/page.html", 2);
	});

	test("allow wins an equal-priority tie", () => {
		const robotsText = [
			"user-agent: FooBot",
			"disallow: /x/page.html",
			"allow: /x/page.html",
			"",
		].join("\n");

		const decision = forCrawler(robotsText).match(url);
		expect(decision.allowed).toBe(true);
		expectRule(decision, "allow", "/x/page.html", 3);
	});

	test("wildcard characters count toward rule priority", () => {
		const robotsText = [
			"user-agent: FooBot",
			"allow: /page",
			"disallow: /*.html",
			"",
		].join("\n");

		expect(isAllowed(robotsText, "FooBot", "https://example.com/page")).toBe(
			true,
		);
		expect(
			isAllowed(robotsText, "FooBot", "https://example.com/page.html"),
		).toBe(false);
	});

	test("a terminal dollar matches only the end of the path", () => {
		const robotsText = [
			"user-agent: FooBot",
			"allow: /$",
			"disallow: /",
			"",
		].join("\n");

		expect(isAllowed(robotsText, "FooBot", "https://example.com/")).toBe(true);
		expect(
			isAllowed(robotsText, "FooBot", "https://example.com/page.html"),
		).toBe(false);
	});
});

describe("google policy encoding", () => {
	test("preserves an encoded query string while extracting the URL path", () => {
		const robotsText = [
			"User-agent: FooBot",
			"Disallow: /",
			"Allow: /foo/bar?qux=taz&baz=http://foo.bar?tar&par",
			"",
		].join("\n");
		const url = "http://foo.bar/foo/bar?qux=taz&baz=http://foo.bar?tar&par";

		expect(isAllowed(robotsText, "FooBot", url)).toBe(true);
	});

	test.each([
		["/foo/bar/\u30c4", "/foo/bar/%E3%83%84"],
		["/foo/bar/\ud83d\ude00", "/foo/bar/%F0%9F%98%80"],
	] as const)(
		"percent-encodes the UTF-8 bytes in %s",
		(rulePath, encodedPath) => {
			const robotsText = [
				"User-agent: FooBot",
				"Disallow: /",
				`Allow: ${rulePath}`,
				"",
			].join("\n");

			const decision = forCrawler(robotsText).match(
				`https://example.com${encodedPath}`,
			);
			expect(decision.allowed).toBe(true);
			expectRule(decision, "allow", rulePath, 3);
		},
	);

	test("normalizes lowercase hexadecimal digits in a rule", () => {
		const robotsText = [
			"User-agent: FooBot",
			"Disallow: /",
			"Allow: /foo/%e3%83%84",
			"",
		].join("\n");

		const decision = forCrawler(robotsText).match(
			"https://example.com/foo/%E3%83%84",
		);
		expect(decision.allowed).toBe(true);
		expectRule(decision, "allow", "/foo/%e3%83%84", 3);
	});

	test("keeps percent-encoded unreserved URL octets encoded", () => {
		const robotsText = [
			"User-agent: FooBot",
			"Disallow: /",
			"Allow: /foo/bar/%62%61%7A",
			"",
		].join("\n");
		const crawler = forCrawler(robotsText);

		expect(crawler.isAllowed("https://example.com/foo/bar/baz")).toBe(false);
		expect(crawler.isAllowed("https://example.com/foo/bar/%62%61%7A")).toBe(
			true,
		);
	});
});

describe("google policy parser edge cases", () => {
	test("skips an initial UTF-8 byte order mark", () => {
		const robotsText = "\uFEFFUser-agent: FooBot\nDisallow: /\n";

		expect(isAllowed(robotsText, "FooBot", "https://example.com/x")).toBe(
			false,
		);
	});

	test("does not skip a byte order mark in the middle of the file", () => {
		const robotsText = "User-agent: FooBot\n\uFEFFDisallow: /\n";

		expect(isAllowed(robotsText, "FooBot", "https://example.com/x")).toBe(true);
	});

	test.each(["index.htm", "index.html", "index.html.backup"])(
		"treats an Allow segment beginning with %s as its directory",
		(indexName) => {
			const robotsText = [
				"User-agent: *",
				`Allow: /allowed-slash/${indexName}`,
				"Disallow: /",
				"",
			].join("\n");

			expect(
				isAllowed(robotsText, "FooBot", "https://example.com/allowed-slash/"),
			).toBe(true);
		},
	);

	test("reports the source pattern for an index-directory match", () => {
		const crawler = forCrawler(
			"User-agent: *\nAllow: /docs/index.html\nDisallow: /\n",
		);
		const decision = crawler.match("https://example.com/docs/");

		expectRule(decision, "allow", "/docs/index.html", 2);
	});

	test("keeps a byte order mark in a directive value", () => {
		const report = inspectRobotsText(
			"# force the initial BOM scan to finish\nSitemap: \uFEFFhttps://example.com/map.xml",
		);

		expect(report.lines[1].directive?.value).toBe(
			"\uFEFFhttps://example.com/map.xml",
		);
	});

	test("escapes non-ASCII bytes in unknown directive values", () => {
		const report = inspectRobotsText("Unicorn: /ツ");

		expect(report.lines[0].directive?.value).toBe("/%E3%83%84");
	});

	test("classifies Google's known unsupported directives", () => {
		const unsupported = [
			"clean-param",
			"content-signal",
			"content-usage",
			"crawl-delay",
			"domain",
			"host",
			"noarchive",
			"nofollow",
			"noindex",
			"request-rate",
			"revisit-after",
			"visit-time",
		];
		const report = inspectRobotsText(
			unsupported.map((name) => `${name}: value`).join("\n"),
		);

		expect(report.unsupportedDirectiveCount).toBe(unsupported.length);
		expect(report.unknownDirectiveCount).toBe(0);
	});

	test("truncates long rules by UTF-8 byte count", () => {
		const repeated = "\u00e9".repeat(8_326);
		const robotsText = `User-agent: FooBot\nDisallow: /${repeated}/blocked\n`;
		const encodedPrefix = `%C3%A9`.repeat(8_326);

		expect(
			isAllowed(
				robotsText,
				"FooBot",
				`https://example.com/${encodedPrefix}/other`,
			),
		).toBe(false);
	});

	test.each(["", "example.com", "not-a-url", "https://example.com"])(
		"falls back to the root path for %j",
		(url) => {
			const decision = forCrawler("User-agent: FooBot\nDisallow: /\n").match(
				url,
			);

			expect(decision.path).toBe("/");
			expect(decision.allowed).toBe(false);
		},
	);
});

describe("google policy compiled and bulk behavior", () => {
	test("normalizes product/version crawler identities before selection", () => {
		const crawler = forCrawler(
			"User-agent: Googlebot\nDisallow: /private\n",
			"Googlebot/2.1",
		);

		expect(crawler.isAllowed("https://example.com/private/page")).toBe(false);
	});

	test("bulk methods are lazy and preserve scalar results in input order", () => {
		const crawler = forCrawler(
			[
				"User-agent: FooBot",
				"Disallow: /private/",
				"Allow: /private/public/",
				"Disallow: /*.pdf$",
				"",
			].join("\n"),
		);
		const urls = [
			"https://example.com/",
			"https://example.com/private/secret",
			"https://example.com/private/public/page",
			"https://example.com/report.pdf",
		];
		let pulls = 0;
		function* countedUrls(): Generator<string> {
			for (const url of urls) {
				pulls++;
				yield url;
			}
		}

		const allowedMany = crawler.isAllowedMany(countedUrls());
		expect(pulls).toBe(0);
		expect(Array.from(allowedMany)).toEqual(
			urls.map((url) => crawler.isAllowed(url)),
		);
		expect(pulls).toBe(urls.length);

		pulls = 0;
		const matchMany = crawler.matchMany(countedUrls());
		expect(pulls).toBe(0);
		expect(Array.from(matchMany)).toEqual(
			urls.map((url) => crawler.match(url)),
		);
		expect(pulls).toBe(urls.length);
	});
});
