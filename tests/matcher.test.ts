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
	compileRobotsText,
	InvalidCrawlerIdentityError,
} from "../src/index.js";

/** Checks whether one crawler identity may access one URL. */
function isUserAgentAllowed(
	robotstxt: string,
	useragent: string,
	url: string,
): boolean {
	return compileRobotsText(robotstxt).forCrawler(useragent).isAllowed(url);
}

// Google system cases.
describe("GoogleOnly_SystemTest", () => {
	const robotstxt = "user-agent: FooBot\ndisallow: /\n";

	test("allows every URL when robots text is empty", () => {
		expect(isUserAgentAllowed("", "FooBot", "")).toBe(true);
	});

	test("rejects an empty caller identity", () => {
		expect(() => isUserAgentAllowed(robotstxt, "", "")).toThrow(
			InvalidCrawlerIdentityError,
		);
	});

	test("treats an empty URL as the root path", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", "")).toBe(false);
	});

	test("requires a valid caller identity even when robots text is empty", () => {
		expect(() => isUserAgentAllowed("", "", "")).toThrow(
			InvalidCrawlerIdentityError,
		);
	});
});

// Directives use a colon between the name and value.
describe("ID_LineSyntax_Line", () => {
	const robotstxtCorrect = "user-agent: FooBot\ndisallow: /\n";
	const robotstxtIncorrect = "foo: FooBot\nbar: /\n";
	const robotstxtIncorrectAccepted = "user-agent FooBot\ndisallow /\n";
	const url = "http://foo.bar/x/y";

	test("recognizes directives with a colon", () => {
		expect(isUserAgentAllowed(robotstxtCorrect, "FooBot", url)).toBe(false);
	});

	test("ignores unknown directive names", () => {
		expect(isUserAgentAllowed(robotstxtIncorrect, "FooBot", url)).toBe(true);
	});

	test("accepts Google's two-token syntax without a colon", () => {
		expect(isUserAgentAllowed(robotstxtIncorrectAccepted, "FooBot", url)).toBe(
			false,
		);
	});
});

// A group has one or more user-agent lines followed by rules.
describe("ID_LineSyntax_Groups", () => {
	const robotstxt =
		"allow: /foo/bar/\n" +
		"\n" +
		"user-agent: FooBot\n" +
		"disallow: /\n" +
		"allow: /x/\n" +
		"user-agent: BarBot\n" +
		"disallow: /\n" +
		"allow: /y/\n" +
		"\n" +
		"\n" +
		"allow: /w/\n" +
		"user-agent: BazBot\n" +
		"\n" +
		"user-agent: FooBot\n" +
		"allow: /z/\n" +
		"disallow: /\n";

	const urlW = "http://foo.bar/w/a";
	const urlX = "http://foo.bar/x/b";
	const urlY = "http://foo.bar/y/c";
	const urlZ = "http://foo.bar/z/d";
	const urlFoo = "http://foo.bar/foo/bar/";

	test("allows FooBot on /x/", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", urlX)).toBe(true);
	});

	test("allows FooBot on /z/", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", urlZ)).toBe(true);
	});

	test("disallows FooBot on /y/", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", urlY)).toBe(false);
	});

	test("allows BarBot on /y/", () => {
		expect(isUserAgentAllowed(robotstxt, "BarBot", urlY)).toBe(true);
	});

	test("allows BarBot on /w/", () => {
		expect(isUserAgentAllowed(robotstxt, "BarBot", urlW)).toBe(true);
	});

	test("disallows BarBot on /z/", () => {
		expect(isUserAgentAllowed(robotstxt, "BarBot", urlZ)).toBe(false);
	});

	test("allows BazBot on /z/", () => {
		expect(isUserAgentAllowed(robotstxt, "BazBot", urlZ)).toBe(true);
	});

	test("ignores rules outside FooBot's groups", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", urlFoo)).toBe(false);
	});

	test("ignores rules outside BarBot's groups", () => {
		expect(isUserAgentAllowed(robotstxt, "BarBot", urlFoo)).toBe(false);
	});

	test("ignores rules outside BazBot's groups", () => {
		expect(isUserAgentAllowed(robotstxt, "BazBot", urlFoo)).toBe(false);
	});
});

// Records outside the REP grammar do not close a group.
describe("ID_LineSyntax_Groups_OtherRules", () => {
	test("does not close a group at a sitemap directive", () => {
		const robotstxt =
			"User-agent: BarBot\n" +
			"Sitemap: https://foo.bar/sitemap\n" +
			"User-agent: *\n" +
			"Disallow: /\n";
		const url = "http://foo.bar/";

		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(false);
		expect(isUserAgentAllowed(robotstxt, "BarBot", url)).toBe(false);
	});

	test("does not close a group at an unknown directive", () => {
		const robotstxt =
			"User-agent: FooBot\n" +
			"Invalid-Unknown-Line: unknown\n" +
			"User-agent: *\n" +
			"Disallow: /\n";
		const url = "http://foo.bar/";

		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(false);
		expect(isUserAgentAllowed(robotstxt, "BarBot", url)).toBe(false);
	});
});

// REP directive names are case-insensitive.
describe("ID_REPLineNamesCaseInsensitive", () => {
	const robotstxtUpper = "USER-AGENT: FooBot\nALLOW: /x/\nDISALLOW: /\n";
	const robotstxtLower = "user-agent: FooBot\nallow: /x/\ndisallow: /\n";
	const robotstxtCamel = "uSeR-aGeNt: FooBot\nAlLoW: /x/\ndIsAlLoW: /\n";
	const urlAllowed = "http://foo.bar/x/y";
	const urlDisallowed = "http://foo.bar/a/b";

	test("allows the URL with uppercase directive names", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "FooBot", urlAllowed)).toBe(true);
	});

	test("allows the URL with lowercase directive names", () => {
		expect(isUserAgentAllowed(robotstxtLower, "FooBot", urlAllowed)).toBe(true);
	});

	test("allows the URL with mixed-case directive names", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "FooBot", urlAllowed)).toBe(true);
	});

	test("disallows the URL with uppercase directive names", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "FooBot", urlDisallowed)).toBe(
			false,
		);
	});

	test("disallows the URL with lowercase directive names", () => {
		expect(isUserAgentAllowed(robotstxtLower, "FooBot", urlDisallowed)).toBe(
			false,
		);
	});

	test("disallows the URL with mixed-case directive names", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "FooBot", urlDisallowed)).toBe(
			false,
		);
	});
});

// A robots-text user-agent value may contain ASCII letters, underscores, and hyphens.
describe("ID_VerifyValidUserAgentsToObey", () => {
	test.each(["Foobot", "Foobot-Bar", "Foo_Bar", "Foobot/2.1"])(
		"accepts and normalizes caller identity %s",
		(identity) => {
			expect(compileRobotsText("").forCrawler(identity).identity).toBe(
				identity.split("/")[0].toLowerCase(),
			);
		},
	);

	test.each(["", "ツ", "Foobot*", " Foobot ", "Foobot Bar"])(
		"rejects caller identity %s",
		(identity) => {
			expect(() => compileRobotsText("").forCrawler(identity)).toThrow(
				InvalidCrawlerIdentityError,
			);
		},
	);
});

// User-agent values are case-insensitive.
describe("ID_UserAgentValueCaseInsensitive", () => {
	const robotstxtUpper = "User-Agent: FOO BAR\nAllow: /x/\nDisallow: /\n";
	const robotstxtLower = "User-Agent: foo bar\nAllow: /x/\nDisallow: /\n";
	const robotstxtCamel = "User-Agent: FoO bAr\nAllow: /x/\nDisallow: /\n";
	const urlAllowed = "http://foo.bar/x/y";
	const urlDisallowed = "http://foo.bar/a/b";

	test("allows Foo with an uppercase robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "Foo", urlAllowed)).toBe(true);
	});

	test("allows Foo with a lowercase robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtLower, "Foo", urlAllowed)).toBe(true);
	});

	test("allows Foo with a mixed-case robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "Foo", urlAllowed)).toBe(true);
	});

	test("disallows Foo with an uppercase robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "Foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("disallows Foo with a lowercase robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtLower, "Foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("disallows Foo with a mixed-case robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "Foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("allows lowercase foo with an uppercase robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "foo", urlAllowed)).toBe(true);
	});

	test("allows lowercase foo with a lowercase robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtLower, "foo", urlAllowed)).toBe(true);
	});

	test("allows lowercase foo with a mixed-case robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "foo", urlAllowed)).toBe(true);
	});

	test("disallows lowercase foo with an uppercase robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("disallows lowercase foo with a lowercase robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtLower, "foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("disallows lowercase foo with a mixed-case robots-text value", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "foo", urlDisallowed)).toBe(
			false,
		);
	});
});

// Google reads a robots-text user-agent value only up to the first space.
describe("GoogleOnly_AcceptUserAgentUpToFirstSpace", () => {
	test("rejects Foobot Bar as a caller identity", () => {
		expect(() => compileRobotsText("").forCrawler("Foobot Bar")).toThrow(
			InvalidCrawlerIdentityError,
		);
	});

	const robotstxt =
		"User-Agent: *\n" +
		"Disallow: /\n" +
		"User-Agent: Foo Bar\n" +
		"Allow: /x/\n" +
		"Disallow: /\n";
	const url = "http://foo.bar/x/y";

	test("matches Foo against a Foo Bar user-agent value", () => {
		expect(isUserAgentAllowed(robotstxt, "Foo", url)).toBe(true);
	});

	test("rejects Foo Bar before matching", () => {
		expect(() => isUserAgentAllowed(robotstxt, "Foo Bar", url)).toThrow(
			InvalidCrawlerIdentityError,
		);
	});
});

// If no group matches the user-agent, crawlers must obey the first group with
// a user-agent line with a "*" value.
describe("ID_GlobalGroups_Secondary", () => {
	const robotstxtEmpty = "";
	const robotstxtGlobal =
		"user-agent: *\nallow: /\nuser-agent: FooBot\ndisallow: /\n";
	const robotstxtOnlySpecific =
		"user-agent: FooBot\n" +
		"allow: /\n" +
		"user-agent: BarBot\n" +
		"disallow: /\n" +
		"user-agent: BazBot\n" +
		"disallow: /\n";
	const url = "http://foo.bar/x/y";

	test("allows every URL when robots text is empty", () => {
		expect(isUserAgentAllowed(robotstxtEmpty, "FooBot", url)).toBe(true);
	});

	test("uses FooBot's specific disallow rule", () => {
		expect(isUserAgentAllowed(robotstxtGlobal, "FooBot", url)).toBe(false);
	});

	test("uses the global allow rule for BarBot", () => {
		expect(isUserAgentAllowed(robotstxtGlobal, "BarBot", url)).toBe(true);
	});

	test("allows QuxBot when no specific or global group matches", () => {
		expect(isUserAgentAllowed(robotstxtOnlySpecific, "QuxBot", url)).toBe(true);
	});
});

// Rule matching is case-sensitive.
describe("ID_AllowDisallow_Value_CaseSensitive", () => {
	const robotstxtLowercaseUrl = "user-agent: FooBot\ndisallow: /x/\n";
	const robotstxtUppercaseUrl = "user-agent: FooBot\ndisallow: /X/\n";
	const url = "http://foo.bar/x/y";

	test("matches a lowercase pattern against a lowercase URL", () => {
		expect(isUserAgentAllowed(robotstxtLowercaseUrl, "FooBot", url)).toBe(
			false,
		);
	});

	test("does not match an uppercase pattern against a lowercase URL", () => {
		expect(isUserAgentAllowed(robotstxtUppercaseUrl, "FooBot", url)).toBe(true);
	});
});

// The rule with the highest priority decides the result.
describe("ID_LongestMatch", () => {
	const url = "http://foo.bar/x/page.html";

	test("lets a longer disallow rule beat a shorter allow rule", () => {
		const robotstxt =
			"user-agent: FooBot\ndisallow: /x/page.html\nallow: /x/\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(false);
	});

	test("lets a longer allow rule beat a shorter disallow rule", () => {
		const robotstxt =
			"user-agent: FooBot\nallow: /x/page.html\ndisallow: /x/\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/x/")).toBe(
			false,
		);
	});

	test("allows by default when both patterns are empty", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: \nallow: \n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
	});

	test("lets allow win when root patterns tie", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: /\nallow: /\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
	});

	test("/x vs /x/ patterns", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: /x\nallow: /x/\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/x")).toBe(
			false,
		);
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/x/")).toBe(
			true,
		);
	});

	test("lets allow win when identical patterns tie", () => {
		const robotstxt =
			"user-agent: FooBot\ndisallow: /x/page.html\nallow: /x/page.html\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
	});

	test("compares wildcard and literal pattern priority", () => {
		const robotstxt = "user-agent: FooBot\nallow: /page\ndisallow: /*.html\n";
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/page.html"),
		).toBe(false);
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/page")).toBe(
			true,
		);
	});

	test("lets a longer allow rule ending in a dot win", () => {
		const robotstxt =
			"user-agent: FooBot\nallow: /x/page.\ndisallow: /*.html\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/x/y.html"),
		).toBe(false);
	});

	test("uses specific rules instead of global rules", () => {
		const robotstxt =
			"User-agent: *\nDisallow: /x/\nUser-agent: FooBot\nDisallow: /y/\n";
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/x/page"),
		).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/y/page"),
		).toBe(false);
	});
});

// Encoding behavior.
describe("ID_Encoding", () => {
	test("keeps a URL query string unencoded", () => {
		const robotstxt =
			"User-agent: FooBot\n" +
			"Disallow: /\n" +
			"Allow: /foo/bar?qux=taz&baz=http://foo.bar?tar&par\n";
		expect(
			isUserAgentAllowed(
				robotstxt,
				"FooBot",
				"http://foo.bar/foo/bar?qux=taz&baz=http://foo.bar?tar&par",
			),
		).toBe(true);
	});

	test("encodes a three-byte UTF-8 character", () => {
		const robotstxt = "User-agent: FooBot\nDisallow: /\nAllow: /foo/bar/ツ\n";
		expect(
			isUserAgentAllowed(
				robotstxt,
				"FooBot",
				"http://foo.bar/foo/bar/%E3%83%84",
			),
		).toBe(true);
		// The parser encodes the three-byte character. The URL is not percent-encoded.
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar/ツ"),
		).toBe(false);
	});

	test("matches a percent-encoded three-byte character", () => {
		const robotstxt =
			"User-agent: FooBot\nDisallow: /\nAllow: /foo/bar/%E3%83%84\n";
		expect(
			isUserAgentAllowed(
				robotstxt,
				"FooBot",
				"http://foo.bar/foo/bar/%E3%83%84",
			),
		).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar/ツ"),
		).toBe(false);
	});

	test("matches percent-encoded unreserved US-ASCII", () => {
		const robotstxt =
			"User-agent: FooBot\nDisallow: /\nAllow: /foo/bar/%62%61%7A\n";
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar/baz"),
		).toBe(false);
		expect(
			isUserAgentAllowed(
				robotstxt,
				"FooBot",
				"http://foo.bar/foo/bar/%62%61%7A",
			),
		).toBe(true);
	});
});

// Wildcards, end anchors, and comments.
describe("ID_SpecialCharacters", () => {
	test("matches a wildcard pattern", () => {
		const robotstxt =
			"User-agent: FooBot\nDisallow: /foo/bar/quz\nAllow: /foo/*/qux\n";
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar/quz"),
		).toBe(false);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/quz"),
		).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo//quz"),
		).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bax/quz"),
		).toBe(true);
	});

	test("matches a pattern with an end anchor", () => {
		const robotstxt =
			"User-agent: FooBot\nDisallow: /foo/bar$\nAllow: /foo/bar/qux\n";
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar"),
		).toBe(false);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar/qux"),
		).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar/"),
		).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar/baz"),
		).toBe(true);
	});

	test("removes comments before matching", () => {
		const robotstxt =
			"User-agent: FooBot\n# Disallow: /\nDisallow: /foo/quz#qux\nAllow: /\n";
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar"),
		).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/quz"),
		).toBe(false);
	});
});

// Google treats an index.htm prefix in the last path segment as its directory.
describe("GoogleOnly_IndexHTMLisDirectory", () => {
	const robotstxt =
		"User-Agent: *\nAllow: /allowed-slash/index.html\nDisallow: /\n";

	test("lets an index.html rule allow its directory", () => {
		expect(
			isUserAgentAllowed(robotstxt, "foobot", "http://foo.com/allowed-slash/"),
		).toBe(true);
	});

	test("does not require an exact index.htm suffix", () => {
		expect(
			isUserAgentAllowed(
				robotstxt,
				"foobot",
				"http://foo.com/allowed-slash/index.htm",
			),
		).toBe(false);
	});

	test("matches index.html itself", () => {
		expect(
			isUserAgentAllowed(
				robotstxt,
				"foobot",
				"http://foo.com/allowed-slash/index.html",
			),
		).toBe(true);
	});

	test("disallows other URLs", () => {
		expect(
			isUserAgentAllowed(robotstxt, "foobot", "http://foo.com/anyother-url"),
		).toBe(false);
	});
});

// Google truncates lines after 8 * 2083 minus one bytes.
describe("GoogleOnly_LineTooLong", () => {
	const kMaxLineLen = 2083 * 8;

	test("truncates a disallow rule at the byte limit", () => {
		let robotstxt = "user-agent: FooBot\n";
		let longline = "/x/";
		const disallow = "disallow: ";
		const maxLength = kMaxLineLen - longline.length - disallow.length + 1;
		while (longline.length < maxLength) {
			longline += "a";
		}
		robotstxt += disallow + longline + "/qux\n";

		// No rule matches this URL, so the matcher allows it.
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fux")).toBe(
			true,
		);
		// This URL matches the truncated disallow rule.
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", `http://foo.bar${longline}/fux`),
		).toBe(false);
	});

	test("truncates an allow rule at the byte limit", () => {
		let robotstxt = "user-agent: FooBot\ndisallow: /\n";
		let longlineA = "/x/";
		let longlineB = "/x/";
		const allow = "allow: ";
		const maxLength = kMaxLineLen - longlineA.length - allow.length + 1;
		while (longlineA.length < maxLength) {
			longlineA += "a";
			longlineB += "b";
		}
		robotstxt += allow + longlineA + "/qux\n";
		robotstxt += allow + longlineB + "/qux\n";

		// This URL matches the disallow rule.
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/")).toBe(
			false,
		);
		// This URL matches the allow rule exactly.
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", `http://foo.bar${longlineA}/qux`),
		).toBe(true);
		// This URL matches the truncated allow rule.
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", `http://foo.bar${longlineB}/fux`),
		).toBe(true);
	});
});

// Tests from Google documentation.
describe("GoogleOnly_DocumentationChecks", () => {
	describe("/fish pattern", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: /\nallow: /fish\n";

		test("/fish matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish"),
			).toBe(true);
		});

		test("/fish.html matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish.html"),
			).toBe(true);
		});

		test("/fish/salmon.html matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fish/salmon.html",
				),
			).toBe(true);
		});

		test("/fishheads matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fishheads"),
			).toBe(true);
		});

		test("/fishheads/yummy.html matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fishheads/yummy.html",
				),
			).toBe(true);
		});

		test("/fish.html?id=anything matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fish.html?id=anything",
				),
			).toBe(true);
		});

		test("/Fish.asp does not match because case differs", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/Fish.asp"),
			).toBe(false);
		});

		test("/catfish does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/catfish"),
			).toBe(false);
		});

		test("/?id=fish does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/?id=fish"),
			).toBe(false);
		});

		test("/bar does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/bar"),
			).toBe(false);
		});
	});

	describe("/fish* pattern, equivalent to /fish", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: /\nallow: /fish*\n";

		test("/fish matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish"),
			).toBe(true);
		});

		test("/fish.html matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish.html"),
			).toBe(true);
		});

		test("/fish/salmon.html matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fish/salmon.html",
				),
			).toBe(true);
		});

		test("/fishheads matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fishheads"),
			).toBe(true);
		});

		test("/fishheads/yummy.html matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fishheads/yummy.html",
				),
			).toBe(true);
		});

		test("/fish.html?id=anything matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fish.html?id=anything",
				),
			).toBe(true);
		});

		test("/Fish.bar does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/Fish.bar"),
			).toBe(false);
		});

		test("/catfish does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/catfish"),
			).toBe(false);
		});

		test("/?id=fish does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/?id=fish"),
			).toBe(false);
		});

		test("/bar does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/bar"),
			).toBe(false);
		});
	});

	describe("/fish/ pattern, distinct from /fish", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: /\nallow: /fish/\n";

		test("/fish/ matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish/"),
			).toBe(true);
		});

		test("/fish/salmon matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish/salmon"),
			).toBe(true);
		});

		test("/fish/?salmon matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish/?salmon"),
			).toBe(true);
		});

		test("/fish/salmon.html matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fish/salmon.html",
				),
			).toBe(true);
		});

		test("/fish/?id=anything matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fish/?id=anything",
				),
			).toBe(true);
		});

		test("/bar does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/bar"),
			).toBe(false);
		});

		test("/fish does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish"),
			).toBe(false);
		});

		test("/fish.html does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish.html"),
			).toBe(false);
		});

		test("/Fish/Salmon.html does not match", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/Fish/Salmon.html",
				),
			).toBe(false);
		});
	});

	describe("/*.php pattern", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: /\nallow: /*.php\n";

		test("/filename.php matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/filename.php"),
			).toBe(true);
		});

		test("/folder/filename.php matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/folder/filename.php",
				),
			).toBe(true);
		});

		test("/folder/filename.php?parameters matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/folder/filename.php?parameters",
				),
			).toBe(true);
		});

		test("//folder/any.php.file.html matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar//folder/any.php.file.html",
				),
			).toBe(true);
		});

		test("/filename.php/ matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/filename.php/"),
			).toBe(true);
		});

		test("/index?f=filename.php/ matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/index?f=filename.php/",
				),
			).toBe(true);
		});

		test("/bar does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/bar"),
			).toBe(false);
		});

		test("/php/ does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/php/"),
			).toBe(false);
		});

		test("/index?php does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/index?php"),
			).toBe(false);
		});

		test("/windows.PHP does not match because case differs", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/windows.PHP"),
			).toBe(false);
		});
	});

	describe("/*.php$ pattern", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: /\nallow: /*.php$\n";

		test("/bar does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/bar"),
			).toBe(false);
		});

		test("/filename.php matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/filename.php"),
			).toBe(true);
		});

		test("/folder/filename.php matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/folder/filename.php",
				),
			).toBe(true);
		});

		test("/filename.php?parameters does not match", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/filename.php?parameters",
				),
			).toBe(false);
		});

		test("/filename.php/ does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/filename.php/"),
			).toBe(false);
		});

		test("/filename.php5 does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/filename.php5"),
			).toBe(false);
		});

		test("/php/ does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/php/"),
			).toBe(false);
		});

		test("/filename?php does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/filename?php"),
			).toBe(false);
		});

		test("/aaaphpaaa does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/aaaphpaaa"),
			).toBe(false);
		});

		test("//windows.PHP does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar//windows.PHP"),
			).toBe(false);
		});
	});

	describe("/fish*.php pattern", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: /\nallow: /fish*.php\n";

		test("/fish.php matches", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fish.php"),
			).toBe(true);
		});

		test("/fishheads/catfish.php?parameters matches", () => {
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://foo.bar/fishheads/catfish.php?parameters",
				),
			).toBe(true);
		});

		test("/bar does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/bar"),
			).toBe(false);
		});

		test("/Fish.PHP does not match", () => {
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/Fish.PHP"),
			).toBe(false);
		});
	});

	describe("order of precedence for group-member records", () => {
		test("/p allows /page", () => {
			const robotstxt = "user-agent: FooBot\nallow: /p\ndisallow: /\n";
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://example.com/page"),
			).toBe(true);
		});

		test("allow wins when rule lengths tie", () => {
			const robotstxt =
				"user-agent: FooBot\nallow: /folder\ndisallow: /folder\n";
			expect(
				isUserAgentAllowed(
					robotstxt,
					"FooBot",
					"http://example.com/folder/page",
				),
			).toBe(true);
		});

		test("a longer disallow rule wins", () => {
			const robotstxt = "user-agent: FooBot\nallow: /page\ndisallow: /*.htm\n";
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://example.com/page.htm"),
			).toBe(false);
		});

		test("/$ allows only the root path", () => {
			const robotstxt = "user-agent: FooBot\nallow: /$\ndisallow: /\n";
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://example.com/"),
			).toBe(true);
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://example.com/page.html"),
			).toBe(false);
		});
	});
});
