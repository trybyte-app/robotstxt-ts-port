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
	InvalidCrawlerIdentityError,
	compileRobotsText,
	inspectRobotsText,
} from "../src/index.js";

describe("compileRobotsText matching policy", () => {
	const robotsText = [
		"User-agent: *",
		// Google compatibility accepts this common typo. RFC 9309 does not.
		"Dissallow: /private/",
	].join("\n");

	test("uses the Google policy by default", () => {
		const crawler = compileRobotsText(robotsText).forCrawler("ExampleCrawler");

		expect(crawler.isAllowed("https://example.com/private/report.pdf")).toBe(
			false,
		);
	});

	test("lets callers select the RFC 9309 policy", () => {
		const crawler = compileRobotsText(robotsText, {
			policy: "rfc9309",
		}).forCrawler("ExampleCrawler");

		expect(crawler.isAllowed("https://example.com/private/report.pdf")).toBe(
			true,
		);
	});

	test("rejects an unknown policy at runtime", () => {
		expect(() =>
			compileRobotsText("", {
				policy: "unknown" as "google",
			}),
		).toThrow(RangeError);
	});
});

describe("crawler identity", () => {
	const compiled = compileRobotsText(
		["User-agent: ExampleCrawler", "Disallow: /private/"].join("\n"),
	);

	test("normalizes a product/version value to its product token", () => {
		const crawler = compiled.forCrawler("ExampleCrawler/2.1");
		const decision = crawler.match("https://example.com/private/report.pdf");

		expect(decision.allowed).toBe(false);
		expect(decision.selectedRules).toBe("specific");
	});

	test("matches product tokens case-insensitively", () => {
		const crawler = compiled.forCrawler("examplecrawler/2.1");

		expect(crawler.isAllowed("https://example.com/private/report.pdf")).toBe(
			false,
		);
	});

	test.each([
		"",
		"*",
		"/2.1",
		"ExampleCrawler 2.1",
		"ExampleCrawler/1/2",
		"ExampleCrawler/💩",
	])("rejects the invalid crawler identity %p", (identity) => {
		expect(() => compiled.forCrawler(identity)).toThrow(
			InvalidCrawlerIdentityError,
		);
	});
});

describe("match decisions", () => {
	test("returns the selected rules and the rule that determined the decision", () => {
		const robotsText = [
			"User-agent: *",
			"Disallow: /private/",
			"Allow: /private/public/",
		].join("\n");
		const crawler = compileRobotsText(robotsText).forCrawler("ExampleCrawler");
		const url = "https://example.com/private/report.pdf";

		expect(crawler.match(url)).toEqual({
			url,
			path: "/private/report.pdf",
			allowed: false,
			selectedRules: "global",
			evidence: {
				kind: "rule",
				directive: "disallow",
				pattern: "/private/",
				lineNumber: 2,
			},
		});
	});

	test("preserves an empty specific group instead of falling back to global rules", () => {
		const robotsText = [
			"User-agent: *",
			"Disallow: /",
			"User-agent: ExampleCrawler",
		].join("\n");
		const crawler =
			compileRobotsText(robotsText).forCrawler("ExampleCrawler/1.0");

		expect(crawler.match("https://example.com/private/")).toMatchObject({
			allowed: true,
			selectedRules: "specific",
			evidence: {
				kind: "default-allow",
				reason: "empty-group",
			},
		});
	});

	test("distinguishes no selected group from no matching rule", () => {
		const noGroup = compileRobotsText("")
			.forCrawler("ExampleCrawler")
			.match("https://example.com/public/");
		const noMatch = compileRobotsText(
			["User-agent: *", "Disallow: /private/"].join("\n"),
		)
			.forCrawler("ExampleCrawler")
			.match("https://example.com/public/");

		expect(noGroup).toMatchObject({
			allowed: true,
			selectedRules: "none",
			evidence: { kind: "default-allow", reason: "no-group" },
		});
		expect(noMatch).toMatchObject({
			allowed: true,
			selectedRules: "global",
			evidence: { kind: "default-allow", reason: "no-match" },
		});
	});
});

describe("crawler-scoped matching", () => {
	test("binds one crawler identity for repeated URL checks", () => {
		const compiled = compileRobotsText(
			[
				"User-agent: *",
				"Disallow: /",
				"User-agent: ExampleCrawler",
				"Allow: /",
			].join("\n"),
		);
		const exampleCrawler = compiled.forCrawler("ExampleCrawler/3.0");
		const otherCrawler = compiled.forCrawler("OtherCrawler/1.0");
		const url = "https://example.com/article";

		expect(exampleCrawler.isAllowed(url)).toBe(true);
		expect(exampleCrawler.match(url).selectedRules).toBe("specific");
		expect(otherCrawler.isAllowed(url)).toBe(false);
		expect(otherCrawler.match(url).selectedRules).toBe("global");
	});
});

describe("inspectRobotsText", () => {
	test("is a separate operation that reports every parsed line", () => {
		const robotsText = [
			"# crawler rules",
			"User-agent: *",
			"Disallow: /private/",
		].join("\n");
		const compiled = compileRobotsText(robotsText);
		const inspection = inspectRobotsText(robotsText);

		expect("inspect" in compiled).toBe(false);
		expect(inspection).toMatchObject({
			policy: "google",
			lineCount: 3,
			recognizedDirectiveCount: 2,
			unsupportedDirectiveCount: 0,
			unknownDirectiveCount: 0,
		});
		expect(inspection.lines).toHaveLength(3);
		expect(inspection.lines[0]).toMatchObject({
			lineNumber: 1,
			directive: null,
		});
		expect(inspection.lines[0].diagnostics).toContain("comment");
		expect(inspection.lines[1]).toMatchObject({
			lineNumber: 2,
			directive: {
				name: "user-agent",
				value: "*",
				effective: true,
			},
		});
		expect(inspection.lines[2]).toMatchObject({
			lineNumber: 3,
			directive: {
				name: "disallow",
				value: "/private/",
				effective: true,
			},
		});
	});

	test("reports the selected inspection policy", () => {
		const inspection = inspectRobotsText("User-agent: *", {
			policy: "rfc9309",
		});

		expect(inspection.policy).toBe("rfc9309");
	});

	test("marks a rule outside a user-agent group as ineffective", () => {
		const inspection = inspectRobotsText(
			"Disallow: /outside\nUser-agent: *\nDisallow: /inside",
		);

		expect(inspection.lines[0].directive?.effective).toBe(false);
		expect(inspection.lines[2].directive?.effective).toBe(true);
	});
});

describe("lazy bulk matching", () => {
	const totalUrls = 1_000_000;

	function millionUrls(onPull: () => void): Generator<string> {
		return (function* urls() {
			for (let index = 0; index < totalUrls; index++) {
				onPull();
				yield `https://example.com/page/${index}`;
			}
		})();
	}

	test("isAllowedMany consumes a million-URL generator lazily", () => {
		const crawler = compileRobotsText("").forCrawler("ExampleCrawler");
		let pulled = 0;
		const results = crawler.isAllowedMany(
			millionUrls(() => {
				pulled++;
			}),
		);

		expect(pulled).toBe(0);

		const iterator = results[Symbol.iterator]();
		expect(iterator.next()).toEqual({ value: true, done: false });
		expect(iterator.next()).toEqual({ value: true, done: false });
		expect(iterator.next()).toEqual({ value: true, done: false });
		expect(pulled).toBe(3);
	});

	test("matchMany consumes a million-URL generator lazily", () => {
		const crawler = compileRobotsText("").forCrawler("ExampleCrawler");
		let pulled = 0;
		const results = crawler.matchMany(
			millionUrls(() => {
				pulled++;
			}),
		);

		expect(pulled).toBe(0);

		const iterator = results[Symbol.iterator]();
		expect(iterator.next().value).toMatchObject({
			url: "https://example.com/page/0",
			allowed: true,
			selectedRules: "none",
			evidence: { kind: "default-allow", reason: "no-group" },
		});
		expect(iterator.next().value).toMatchObject({
			url: "https://example.com/page/1",
			allowed: true,
		});
		expect(iterator.next().value).toMatchObject({
			url: "https://example.com/page/2",
			allowed: true,
		});
		expect(pulled).toBe(3);
	});
});
