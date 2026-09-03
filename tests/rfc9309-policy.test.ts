// Copyright 2024 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
// https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import { describe, expect, test } from "bun:test";
import {
	InvalidCrawlerIdentityError,
	compileRobotsText,
} from "../src/index.js";

const strictPolicy = (robotsText: string) =>
	compileRobotsText(robotsText, { policy: "rfc9309" });

describe("RFC 9309 group selection", () => {
	test("accepts exact directive names case-insensitively", () => {
		const crawler = strictPolicy(
			"uSeR-aGeNt: ExampleBot\ndIsAlLoW: /private\n",
		).forCrawler("examplebot");

		expect(crawler.isAllowed("https://example.com/private/page")).toBe(false);
	});

	test("an empty specific group suppresses global rules", () => {
		const crawler = strictPolicy(
			"User-agent: *\nDisallow: /\nUser-agent: ExampleBot\n",
		).forCrawler("ExampleBot");
		const url = "https://example.com/private";

		expect(crawler.isAllowed(url)).toBe(true);
		expect(crawler.match(url)).toEqual({
			url,
			path: "/private",
			allowed: true,
			selectedRules: "specific",
			evidence: { kind: "default-allow", reason: "empty-group" },
		});
	});

	test("an empty rule ends a run of user-agent declarations", () => {
		const crawler = strictPolicy(
			"User-agent: ExampleBot\n" +
				"Disallow:\n" +
				"User-agent: OtherBot\n" +
				"Disallow: /\n",
		).forCrawler("ExampleBot");

		expect(crawler.isAllowed("https://example.com/private")).toBe(true);
	});

	test("combines rules from repeated matching groups", () => {
		const crawler = strictPolicy(
			"User-agent: ExampleBot\n" +
				"Disallow: /first\n" +
				"User-agent: examplebot\n" +
				"Disallow: /second\n",
		).forCrawler("EXAMPLEBOT");

		expect(crawler.isAllowed("https://example.com/first/page")).toBe(false);
		expect(crawler.isAllowed("https://example.com/second/page")).toBe(false);
		expect(crawler.isAllowed("https://example.com/elsewhere")).toBe(true);
	});

	test("falls back to global rules when no specific group matches", () => {
		const crawler = strictPolicy(
			"User-agent: *\n" +
				"Disallow: /private\n" +
				"User-agent: OtherBot\n" +
				"Allow: /private\n",
		).forCrawler("ExampleBot");
		const decision = crawler.match("https://example.com/private/page");

		expect(decision.allowed).toBe(false);
		expect(decision.selectedRules).toBe("global");
		expect(decision.evidence).toEqual({
			kind: "rule",
			directive: "disallow",
			pattern: "/private",
			lineNumber: 2,
		});
	});
});

describe("RFC 9309 rule priority", () => {
	test("the longest matching rule wins", () => {
		const crawler = strictPolicy(
			"User-agent: ExampleBot\n" +
				"Disallow: /private\n" +
				"Allow: /private/public\n",
		).forCrawler("ExampleBot");
		const url = "https://example.com/private/public/page";

		expect(crawler.match(url)).toEqual({
			url,
			path: "/private/public/page",
			allowed: true,
			selectedRules: "specific",
			evidence: {
				kind: "rule",
				directive: "allow",
				pattern: "/private/public",
				lineNumber: 3,
			},
		});
	});

	test("allow wins when equivalent rules have equal priority", () => {
		const crawler = strictPolicy(
			"User-agent: *\nDisallow: /same\nAllow: /same\n",
		).forCrawler("ExampleBot");
		const decision = crawler.match("https://example.com/same/page");

		expect(decision.allowed).toBe(true);
		expect(decision.evidence).toEqual({
			kind: "rule",
			directive: "allow",
			pattern: "/same",
			lineNumber: 3,
		});
	});

	test("decodes percent-encoded unreserved URI octets before matching", () => {
		const crawler = strictPolicy(
			"User-agent: *\nDisallow: /private\n",
		).forCrawler("ExampleBot");

		expect(crawler.isAllowed("https://example.com/%70rivate/page")).toBe(false);
	});

	test("always allows the robots.txt path", () => {
		const crawler = strictPolicy("User-agent: *\nDisallow: /\n").forCrawler(
			"ExampleBot",
		);

		const decision = crawler.match("https://example.com/robots.txt");
		expect(decision.allowed).toBe(true);
		expect(decision.evidence).toEqual({
			kind: "default-allow",
			reason: "robots-txt",
		});
		expect(crawler.isAllowed("https://example.com/robots.txt;private")).toBe(
			false,
		);
	});

	test.each([
		["/path/file-with-a-%2A.html", "/path/file-with-a-*.html"],
		["/path/foo-%24", "/path/foo-$"],
	])(
		"matches percent-encoded literal special characters in %s",
		(rule, path) => {
			const crawler = strictPolicy(
				`User-agent: *\nDisallow: ${rule}\n`,
			).forCrawler("ExampleBot");

			expect(crawler.isAllowed(`https://example.com${path}`)).toBe(false);
		},
	);
});

describe("RFC 9309 strict parsing", () => {
	test("does not recognize Google's directive typos", () => {
		const crawler = strictPolicy(
			"Useragent: ExampleBot\nDisallaw: /private\n",
		).forCrawler("ExampleBot");

		expect(crawler.isAllowed("https://example.com/private/page")).toBe(true);
	});

	test("does not recognize directives without a colon", () => {
		const crawler = strictPolicy(
			"User-agent ExampleBot\nDisallow /private\n",
		).forCrawler("ExampleBot");

		expect(crawler.isAllowed("https://example.com/private/page")).toBe(true);
	});

	test("does not recognize a field name by prefix", () => {
		const crawler = strictPolicy(
			"User-agent: ExampleBot\nDisallow-extra: /private\n",
		).forCrawler("ExampleBot");

		expect(crawler.isAllowed("https://example.com/private/page")).toBe(true);
	});

	test("does not apply Google's index document normalization", () => {
		const crawler = strictPolicy(
			"User-agent: *\n" + "Allow: /docs/index.html\n" + "Disallow: /\n",
		).forCrawler("ExampleBot");

		expect(crawler.isAllowed("https://example.com/docs/")).toBe(false);
		expect(crawler.isAllowed("https://example.com/docs/index.html")).toBe(true);
	});

	test("ignores a rule whose path pattern does not begin with a slash", () => {
		const crawler = strictPolicy("User-agent: *\nDisallow: *\n").forCrawler(
			"ExampleBot",
		);

		expect(crawler.isAllowed("https://example.com/private")).toBe(true);
	});

	test("an invalid user-agent line does not terminate a valid group", () => {
		const crawler = strictPolicy(
			"User-agent: ExampleBot\n" +
				"Disallow: /first\n" +
				"User-agent: Invalid/1.0\n" +
				"Disallow: /second\n",
		).forCrawler("ExampleBot");

		expect(crawler.isAllowed("https://example.com/second")).toBe(false);
	});

	test("an invalid rule does not terminate a run of user-agent lines", () => {
		const compiled = strictPolicy(
			"User-agent: ExampleBot\n" +
				"Disallow: /bad path\n" +
				"User-agent: OtherBot\n" +
				"Disallow: /\n",
		);

		expect(
			compiled.forCrawler("ExampleBot").isAllowed("https://example.com/x"),
		).toBe(false);
		expect(
			compiled.forCrawler("OtherBot").isAllowed("https://example.com/x"),
		).toBe(false);
	});

	test.each(["\v", "\f"])(
		"does not treat control character %p as whitespace",
		(whitespace) => {
			const crawler = strictPolicy(
				`User-agent:${whitespace}ExampleBot\nDisallow: /\n`,
			).forCrawler("ExampleBot");

			expect(crawler.isAllowed("https://example.com/x")).toBe(true);
		},
	);
});

describe("RFC 9309 public API", () => {
	test("normalizes a crawler identification string to its leading product token", () => {
		const crawler = strictPolicy(
			"User-agent: ExampleBot\nDisallow: /private\n",
		).forCrawler("ExampleBot/2.1");

		expect(crawler.isAllowed("https://example.com/private/page")).toBe(false);
	});

	test("rejects an identity without a valid leading product token", () => {
		const document = strictPolicy("User-agent: *\nDisallow: /\n");

		expect(() => document.forCrawler("")).toThrow(InvalidCrawlerIdentityError);
		expect(() => document.forCrawler("   ")).toThrow(
			InvalidCrawlerIdentityError,
		);
		expect(() => document.forCrawler("ツBot")).toThrow(
			InvalidCrawlerIdentityError,
		);
	});

	test("uses the root path fallback for malformed URLs", () => {
		const crawler = strictPolicy("User-agent: *\nDisallow: /\n").forCrawler(
			"ExampleBot",
		);
		const decision = crawler.match("not-a-url");

		expect(decision.path).toBe("/");
		expect(decision.allowed).toBe(false);
	});

	test("bulk methods accept lazy, single-use iterables and preserve order", () => {
		const crawler = strictPolicy(
			"User-agent: *\nDisallow: /private\n",
		).forCrawler("ExampleBot");
		const urls = [
			"https://example.com/public",
			"https://example.com/private/one",
			"https://example.com/other",
		];
		let allowedIteratorRequests = 0;
		let matchIteratorRequests = 0;

		const allowedInput: Iterable<string> = {
			*[Symbol.iterator]() {
				allowedIteratorRequests++;
				if (allowedIteratorRequests > 1) {
					throw new Error("isAllowedMany requested the input iterator twice");
				}
				yield* urls;
			},
		};
		const matchInput: Iterable<string> = {
			*[Symbol.iterator]() {
				matchIteratorRequests++;
				if (matchIteratorRequests > 1) {
					throw new Error("matchMany requested the input iterator twice");
				}
				yield* urls;
			},
		};

		expect(Array.from(crawler.isAllowedMany(allowedInput))).toEqual([
			true,
			false,
			true,
		]);
		expect(Array.from(crawler.matchMany(matchInput))).toEqual(
			urls.map((url) => crawler.match(url)),
		);
		expect(allowedIteratorRequests).toBe(1);
		expect(matchIteratorRequests).toBe(1);
	});
});
