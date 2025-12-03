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
	RobotsMatcher,
	RobotsParseHandler,
	parseRobotsTxt,
	type LineMetadata,
} from "../src/index.js";

/**
 * Helper function to check if a user agent is allowed for a URL.
 */
function isUserAgentAllowed(
	robotstxt: string,
	useragent: string,
	url: string,
): boolean {
	const matcher = new RobotsMatcher();
	return matcher.oneAgentAllowedByRobots(robotstxt, useragent, url);
}

// Google-specific: system test.
describe("GoogleOnly_SystemTest", () => {
	const robotstxt = "user-agent: FooBot\ndisallow: /\n";

	test("Empty robots.txt: everything allowed", () => {
		expect(isUserAgentAllowed("", "FooBot", "")).toBe(true);
	});

	test("Empty user-agent to be matched: everything allowed", () => {
		expect(isUserAgentAllowed(robotstxt, "", "")).toBe(true);
	});

	test("Empty url: implicitly disallowed", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", "")).toBe(false);
	});

	test("All params empty: same as robots.txt empty, everything allowed", () => {
		expect(isUserAgentAllowed("", "", "")).toBe(true);
	});
});

// Rules are colon separated name-value pairs.
describe("ID_LineSyntax_Line", () => {
	const robotstxtCorrect = "user-agent: FooBot\ndisallow: /\n";
	const robotstxtIncorrect = "foo: FooBot\nbar: /\n";
	const robotstxtIncorrectAccepted = "user-agent FooBot\ndisallow /\n";
	const url = "http://foo.bar/x/y";

	test("Correct syntax with colon", () => {
		expect(isUserAgentAllowed(robotstxtCorrect, "FooBot", url)).toBe(false);
	});

	test("Incorrect key names", () => {
		expect(isUserAgentAllowed(robotstxtIncorrect, "FooBot", url)).toBe(true);
	});

	test("Missing colon but accepted (Google-specific)", () => {
		expect(isUserAgentAllowed(robotstxtIncorrectAccepted, "FooBot", url)).toBe(
			false,
		);
	});
});

// A group is one or more user-agent line followed by rules.
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

	test("FooBot allowed /x/", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", urlX)).toBe(true);
	});

	test("FooBot allowed /z/", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", urlZ)).toBe(true);
	});

	test("FooBot disallowed /y/", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", urlY)).toBe(false);
	});

	test("BarBot allowed /y/", () => {
		expect(isUserAgentAllowed(robotstxt, "BarBot", urlY)).toBe(true);
	});

	test("BarBot allowed /w/", () => {
		expect(isUserAgentAllowed(robotstxt, "BarBot", urlW)).toBe(true);
	});

	test("BarBot disallowed /z/", () => {
		expect(isUserAgentAllowed(robotstxt, "BarBot", urlZ)).toBe(false);
	});

	test("BazBot allowed /z/", () => {
		expect(isUserAgentAllowed(robotstxt, "BazBot", urlZ)).toBe(true);
	});

	test("Rules outside groups are ignored - FooBot", () => {
		expect(isUserAgentAllowed(robotstxt, "FooBot", urlFoo)).toBe(false);
	});

	test("Rules outside groups are ignored - BarBot", () => {
		expect(isUserAgentAllowed(robotstxt, "BarBot", urlFoo)).toBe(false);
	});

	test("Rules outside groups are ignored - BazBot", () => {
		expect(isUserAgentAllowed(robotstxt, "BazBot", urlFoo)).toBe(false);
	});
});

// Group must not be closed by rules not explicitly defined in the REP RFC.
describe("ID_LineSyntax_Groups_OtherRules", () => {
	test("Sitemap doesn't close group", () => {
		const robotstxt =
			"User-agent: BarBot\n" +
			"Sitemap: https://foo.bar/sitemap\n" +
			"User-agent: *\n" +
			"Disallow: /\n";
		const url = "http://foo.bar/";

		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(false);
		expect(isUserAgentAllowed(robotstxt, "BarBot", url)).toBe(false);
	});

	test("Unknown directive doesn't close group", () => {
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

// REP lines are case insensitive.
describe("ID_REPLineNamesCaseInsensitive", () => {
	const robotstxtUpper = "USER-AGENT: FooBot\nALLOW: /x/\nDISALLOW: /\n";
	const robotstxtLower = "user-agent: FooBot\nallow: /x/\ndisallow: /\n";
	const robotstxtCamel = "uSeR-aGeNt: FooBot\nAlLoW: /x/\ndIsAlLoW: /\n";
	const urlAllowed = "http://foo.bar/x/y";
	const urlDisallowed = "http://foo.bar/a/b";

	test("UPPER case - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "FooBot", urlAllowed)).toBe(true);
	});

	test("lower case - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtLower, "FooBot", urlAllowed)).toBe(true);
	});

	test("CaMeL case - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "FooBot", urlAllowed)).toBe(true);
	});

	test("UPPER case - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "FooBot", urlDisallowed)).toBe(
			false,
		);
	});

	test("lower case - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtLower, "FooBot", urlDisallowed)).toBe(
			false,
		);
	});

	test("CaMeL case - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "FooBot", urlDisallowed)).toBe(
			false,
		);
	});
});

// A user-agent line is expected to contain only [a-zA-Z_-] characters.
describe("ID_VerifyValidUserAgentsToObey", () => {
	test("Valid: Foobot", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("Foobot")).toBe(true);
	});

	test("Valid: Foobot-Bar", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("Foobot-Bar")).toBe(true);
	});

	test("Valid: Foo_Bar", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("Foo_Bar")).toBe(true);
	});

	test("Invalid: empty string", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("")).toBe(false);
	});

	test("Invalid: Unicode character", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("ツ")).toBe(false);
	});

	test("Invalid: wildcard", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("Foobot*")).toBe(false);
	});

	test("Invalid: leading/trailing spaces", () => {
		expect(RobotsMatcher.isValidUserAgentToObey(" Foobot ")).toBe(false);
	});

	test("Invalid: version string", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("Foobot/2.1")).toBe(false);
	});

	test("Invalid: space in name", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("Foobot Bar")).toBe(false);
	});
});

// User-agent line values are case insensitive.
describe("ID_UserAgentValueCaseInsensitive", () => {
	const robotstxtUpper = "User-Agent: FOO BAR\nAllow: /x/\nDisallow: /\n";
	const robotstxtLower = "User-Agent: foo bar\nAllow: /x/\nDisallow: /\n";
	const robotstxtCamel = "User-Agent: FoO bAr\nAllow: /x/\nDisallow: /\n";
	const urlAllowed = "http://foo.bar/x/y";
	const urlDisallowed = "http://foo.bar/a/b";

	test("UPPER robots.txt, Foo agent - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "Foo", urlAllowed)).toBe(true);
	});

	test("lower robots.txt, Foo agent - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtLower, "Foo", urlAllowed)).toBe(true);
	});

	test("CaMeL robots.txt, Foo agent - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "Foo", urlAllowed)).toBe(true);
	});

	test("UPPER robots.txt, Foo agent - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "Foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("lower robots.txt, Foo agent - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtLower, "Foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("CaMeL robots.txt, Foo agent - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "Foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("UPPER robots.txt, foo agent - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "foo", urlAllowed)).toBe(true);
	});

	test("lower robots.txt, foo agent - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtLower, "foo", urlAllowed)).toBe(true);
	});

	test("CaMeL robots.txt, foo agent - allowed URL", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "foo", urlAllowed)).toBe(true);
	});

	test("UPPER robots.txt, foo agent - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtUpper, "foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("lower robots.txt, foo agent - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtLower, "foo", urlDisallowed)).toBe(
			false,
		);
	});

	test("CaMeL robots.txt, foo agent - disallowed URL", () => {
		expect(isUserAgentAllowed(robotstxtCamel, "foo", urlDisallowed)).toBe(
			false,
		);
	});
});

// Google-specific: accept user-agent value up to the first space.
describe("GoogleOnly_AcceptUserAgentUpToFirstSpace", () => {
	test("Foobot Bar is invalid user agent", () => {
		expect(RobotsMatcher.isValidUserAgentToObey("Foobot Bar")).toBe(false);
	});

	const robotstxt =
		"User-Agent: *\n" +
		"Disallow: /\n" +
		"User-Agent: Foo Bar\n" +
		"Allow: /x/\n" +
		"Disallow: /\n";
	const url = "http://foo.bar/x/y";

	test("Foo matches Foo Bar user-agent", () => {
		expect(isUserAgentAllowed(robotstxt, "Foo", url)).toBe(true);
	});

	test("Foo Bar invalid user-agent falls back to global", () => {
		expect(isUserAgentAllowed(robotstxt, "Foo Bar", url)).toBe(false);
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

	test("Empty robots.txt allows all", () => {
		expect(isUserAgentAllowed(robotstxtEmpty, "FooBot", url)).toBe(true);
	});

	test("FooBot has specific disallow rule", () => {
		expect(isUserAgentAllowed(robotstxtGlobal, "FooBot", url)).toBe(false);
	});

	test("BarBot falls back to global allow", () => {
		expect(isUserAgentAllowed(robotstxtGlobal, "BarBot", url)).toBe(true);
	});

	test("QuxBot allowed when no matching group or global", () => {
		expect(isUserAgentAllowed(robotstxtOnlySpecific, "QuxBot", url)).toBe(true);
	});
});

// Matching rules against URIs is case sensitive.
describe("ID_AllowDisallow_Value_CaseSensitive", () => {
	const robotstxtLowercaseUrl = "user-agent: FooBot\ndisallow: /x/\n";
	const robotstxtUppercaseUrl = "user-agent: FooBot\ndisallow: /X/\n";
	const url = "http://foo.bar/x/y";

	test("Lowercase pattern matches lowercase URL", () => {
		expect(isUserAgentAllowed(robotstxtLowercaseUrl, "FooBot", url)).toBe(
			false,
		);
	});

	test("Uppercase pattern does not match lowercase URL", () => {
		expect(isUserAgentAllowed(robotstxtUppercaseUrl, "FooBot", url)).toBe(true);
	});
});

// The most specific match found MUST be used.
describe("ID_LongestMatch", () => {
	const url = "http://foo.bar/x/page.html";

	test("Longer disallow wins over shorter allow", () => {
		const robotstxt =
			"user-agent: FooBot\ndisallow: /x/page.html\nallow: /x/\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(false);
	});

	test("Longer allow wins over shorter disallow", () => {
		const robotstxt =
			"user-agent: FooBot\nallow: /x/page.html\ndisallow: /x/\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/x/")).toBe(
			false,
		);
	});

	test("Empty patterns: allow wins on tie", () => {
		const robotstxt = "user-agent: FooBot\ndisallow: \nallow: \n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
	});

	test("Root patterns: allow wins on tie", () => {
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

	test("Same pattern: allow wins on tie", () => {
		const robotstxt =
			"user-agent: FooBot\ndisallow: /x/page.html\nallow: /x/page.html\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
	});

	test("Wildcard pattern vs literal", () => {
		const robotstxt = "user-agent: FooBot\nallow: /page\ndisallow: /*.html\n";
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/page.html"),
		).toBe(false);
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/page")).toBe(
			true,
		);
	});

	test("Longer allow with dot wins", () => {
		const robotstxt =
			"user-agent: FooBot\nallow: /x/page.\ndisallow: /*.html\n";
		expect(isUserAgentAllowed(robotstxt, "FooBot", url)).toBe(true);
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/x/y.html"),
		).toBe(false);
	});

	test("Specific agent vs global", () => {
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

// Encoding tests.
describe("ID_Encoding", () => {
	test("URL with query string stays unencoded", () => {
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

	test("3-byte UTF-8 character encoding", () => {
		const robotstxt = "User-agent: FooBot\nDisallow: /\nAllow: /foo/bar/ツ\n";
		expect(
			isUserAgentAllowed(
				robotstxt,
				"FooBot",
				"http://foo.bar/foo/bar/%E3%83%84",
			),
		).toBe(true);
		// The parser encodes the 3-byte character, but the URL is not %-encoded
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/foo/bar/ツ"),
		).toBe(false);
	});

	test("Percent-encoded 3-byte character", () => {
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

	test("Percent-encoded unreserved US-ASCII", () => {
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

// Special characters: *, $, #
describe("ID_SpecialCharacters", () => {
	test("Wildcard * pattern", () => {
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

	test("End anchor $ pattern", () => {
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

	test("Comment # handling", () => {
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

// Google-specific: "index.html" at end of pattern equals "/".
describe("GoogleOnly_IndexHTMLisDirectory", () => {
	const robotstxt =
		"User-Agent: *\nAllow: /allowed-slash/index.html\nDisallow: /\n";

	test("index.html allows directory", () => {
		expect(
			isUserAgentAllowed(robotstxt, "foobot", "http://foo.com/allowed-slash/"),
		).toBe(true);
	});

	test("index.htm does not match exactly", () => {
		expect(
			isUserAgentAllowed(
				robotstxt,
				"foobot",
				"http://foo.com/allowed-slash/index.htm",
			),
		).toBe(false);
	});

	test("Exact match on index.html", () => {
		expect(
			isUserAgentAllowed(
				robotstxt,
				"foobot",
				"http://foo.com/allowed-slash/index.html",
			),
		).toBe(true);
	});

	test("Other URLs are disallowed", () => {
		expect(
			isUserAgentAllowed(robotstxt, "foobot", "http://foo.com/anyother-url"),
		).toBe(false);
	});
});

// Google-specific: long lines are ignored after 8 * 2083 bytes.
describe("GoogleOnly_LineTooLong", () => {
	const kMaxLineLen = 2083 * 8;

	test("Disallow rule cut off at max length", () => {
		let robotstxt = "user-agent: FooBot\n";
		let longline = "/x/";
		const disallow = "disallow: ";
		const maxLength = kMaxLineLen - longline.length - disallow.length + 1;
		while (longline.length < maxLength) {
			longline += "a";
		}
		robotstxt += disallow + longline + "/qux\n";

		// Matches nothing, so URL is allowed
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/fux")).toBe(
			true,
		);
		// Matches cut off disallow rule
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", `http://foo.bar${longline}/fux`),
		).toBe(false);
	});

	test("Allow rule cut off at max length", () => {
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

		// URL matches the disallow rule
		expect(isUserAgentAllowed(robotstxt, "FooBot", "http://foo.bar/")).toBe(
			false,
		);
		// Matches the allow rule exactly
		expect(
			isUserAgentAllowed(robotstxt, "FooBot", `http://foo.bar${longlineA}/qux`),
		).toBe(true);
		// Matches cut off allow rule
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

		test("/Fish.asp does not match (case sensitive)", () => {
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

	describe("/fish* pattern (equals /fish)", () => {
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

	describe("/fish/ pattern (not equal to /fish)", () => {
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

		test("/windows.PHP does not match (case sensitive)", () => {
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

	describe("Order of precedence for group-member records", () => {
		test("/p allows /page", () => {
			const robotstxt = "user-agent: FooBot\nallow: /p\ndisallow: /\n";
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://example.com/page"),
			).toBe(true);
		});

		test("Same length: allow wins", () => {
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

		test("Longer disallow wins", () => {
			const robotstxt = "user-agent: FooBot\nallow: /page\ndisallow: /*.htm\n";
			expect(
				isUserAgentAllowed(robotstxt, "FooBot", "http://example.com/page.htm"),
			).toBe(false);
		});

		test("/$: only root allowed", () => {
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

// Different kinds of line endings are all supported.
describe("ID_LinesNumbersAreCountedCorrectly", () => {
	class RobotsStatsReporter extends RobotsParseHandler {
		lastLineSeen = 0;
		validDirectives = 0;
		unknownDirectives = 0;
		sitemap = "";

		handleRobotsStart(): void {
			this.lastLineSeen = 0;
			this.validDirectives = 0;
			this.unknownDirectives = 0;
			this.sitemap = "";
		}

		handleRobotsEnd(): void {}

		handleUserAgent(lineNum: number, _value: string): void {
			this.digest(lineNum);
		}

		handleAllow(lineNum: number, _value: string): void {
			this.digest(lineNum);
		}

		handleDisallow(lineNum: number, _value: string): void {
			this.digest(lineNum);
		}

		handleSitemap(lineNum: number, value: string): void {
			this.digest(lineNum);
			this.sitemap = value;
		}

		handleUnknownAction(
			lineNum: number,
			_action: string,
			_value: string,
		): void {
			this.lastLineSeen = lineNum;
			this.unknownDirectives++;
		}

		private digest(lineNum: number): void {
			expect(lineNum).toBeGreaterThanOrEqual(this.lastLineSeen);
			this.lastLineSeen = lineNum;
			this.validDirectives++;
		}
	}

	test("Unix line endings", () => {
		const report = new RobotsStatsReporter();
		const kUnixFile =
			"User-Agent: foo\n" +
			"Allow: /some/path\n" +
			"User-Agent: bar\n" +
			"\n" +
			"\n" +
			"Disallow: /\n";
		parseRobotsTxt(kUnixFile, report);
		expect(report.validDirectives).toBe(4);
		expect(report.lastLineSeen).toBe(6);
	});

	test("DOS line endings", () => {
		const report = new RobotsStatsReporter();
		const kDosFile =
			"User-Agent: foo\r\n" +
			"Allow: /some/path\r\n" +
			"User-Agent: bar\r\n" +
			"\r\n" +
			"\r\n" +
			"Disallow: /\r\n";
		parseRobotsTxt(kDosFile, report);
		expect(report.validDirectives).toBe(4);
		expect(report.lastLineSeen).toBe(6);
	});

	test("Mac line endings", () => {
		const report = new RobotsStatsReporter();
		const kMacFile =
			"User-Agent: foo\r" +
			"Allow: /some/path\r" +
			"User-Agent: bar\r" +
			"\r" +
			"\r" +
			"Disallow: /\r";
		parseRobotsTxt(kMacFile, report);
		expect(report.validDirectives).toBe(4);
		expect(report.lastLineSeen).toBe(6);
	});

	test("No final newline", () => {
		const report = new RobotsStatsReporter();
		const kNoFinalNewline =
			"User-Agent: foo\n" +
			"Allow: /some/path\n" +
			"User-Agent: bar\n" +
			"\n" +
			"\n" +
			"Disallow: /";
		parseRobotsTxt(kNoFinalNewline, report);
		expect(report.validDirectives).toBe(4);
		expect(report.lastLineSeen).toBe(6);
	});

	test("Mixed line endings", () => {
		const report = new RobotsStatsReporter();
		const kMixedFile =
			"User-Agent: foo\n" +
			"Allow: /some/path\r\n" +
			"User-Agent: bar\n" +
			"\r\n" +
			"\n" +
			"Disallow: /";
		parseRobotsTxt(kMixedFile, report);
		expect(report.validDirectives).toBe(4);
		expect(report.lastLineSeen).toBe(6);
	});
});

// BOM characters are skipped.
describe("ID_UTF8ByteOrderMarkIsSkipped", () => {
	class RobotsStatsReporter extends RobotsParseHandler {
		validDirectives = 0;
		unknownDirectives = 0;

		handleRobotsStart(): void {
			this.validDirectives = 0;
			this.unknownDirectives = 0;
		}

		handleRobotsEnd(): void {}

		handleUserAgent(lineNum: number, _value: string): void {
			this.validDirectives++;
		}

		handleAllow(lineNum: number, _value: string): void {
			this.validDirectives++;
		}

		handleDisallow(lineNum: number, _value: string): void {
			this.validDirectives++;
		}

		handleSitemap(lineNum: number, _value: string): void {
			this.validDirectives++;
		}

		handleUnknownAction(
			lineNum: number,
			_action: string,
			_value: string,
		): void {
			this.unknownDirectives++;
		}
	}

	test("Full BOM is skipped", () => {
		const report = new RobotsStatsReporter();
		const kUtf8FileFullBOM = "\xEF\xBB\xBFUser-Agent: foo\nAllow: /AnyValue\n";
		parseRobotsTxt(kUtf8FileFullBOM, report);
		expect(report.validDirectives).toBe(2);
		expect(report.unknownDirectives).toBe(0);
	});

	test("Partial BOM (2 bytes) is skipped", () => {
		const report = new RobotsStatsReporter();
		const kUtf8FilePartial2BOM = "\xEF\xBBUser-Agent: foo\nAllow: /AnyValue\n";
		parseRobotsTxt(kUtf8FilePartial2BOM, report);
		expect(report.validDirectives).toBe(2);
		expect(report.unknownDirectives).toBe(0);
	});

	test("Partial BOM (1 byte) is skipped", () => {
		const report = new RobotsStatsReporter();
		const kUtf8FilePartial1BOM = "\xEFUser-Agent: foo\nAllow: /AnyValue\n";
		parseRobotsTxt(kUtf8FilePartial1BOM, report);
		expect(report.validDirectives).toBe(2);
		expect(report.unknownDirectives).toBe(0);
	});

	test("Broken BOM produces garbage line", () => {
		const report = new RobotsStatsReporter();
		const kUtf8FileBrokenBOM =
			"\xEF\x11\xBFUser-Agent: foo\nAllow: /AnyValue\n";
		parseRobotsTxt(kUtf8FileBrokenBOM, report);
		expect(report.validDirectives).toBe(1);
		expect(report.unknownDirectives).toBe(1);
	});

	test("BOM in middle of file is garbage", () => {
		const report = new RobotsStatsReporter();
		const kUtf8BOMSomewhereInMiddleOfFile =
			"User-Agent: foo\n\xEF\xBB\xBFAllow: /AnyValue\n";
		parseRobotsTxt(kUtf8BOMSomewhereInMiddleOfFile, report);
		expect(report.validDirectives).toBe(1);
		expect(report.unknownDirectives).toBe(1);
	});
});

// Sitemap directive parsing.
describe("ID_NonStandardLineExample_Sitemap", () => {
	class RobotsStatsReporter extends RobotsParseHandler {
		sitemap = "";

		handleRobotsStart(): void {
			this.sitemap = "";
		}

		handleRobotsEnd(): void {}
		handleUserAgent(_lineNum: number, _value: string): void {}
		handleAllow(_lineNum: number, _value: string): void {}
		handleDisallow(_lineNum: number, _value: string): void {}

		handleSitemap(_lineNum: number, value: string): void {
			this.sitemap = value;
		}

		handleUnknownAction(
			_lineNum: number,
			_action: string,
			_value: string,
		): void {}
	}

	test("Sitemap at end of file", () => {
		const report = new RobotsStatsReporter();
		const sitemapLoc = "http://foo.bar/sitemap.xml";
		const robotstxt =
			"User-Agent: foo\n" +
			"Allow: /some/path\n" +
			"User-Agent: bar\n" +
			"\n" +
			"\n" +
			`Sitemap: ${sitemapLoc}\n`;
		parseRobotsTxt(robotstxt, report);
		expect(report.sitemap).toBe(sitemapLoc);
	});

	test("Sitemap at beginning of file", () => {
		const report = new RobotsStatsReporter();
		const sitemapLoc = "http://foo.bar/sitemap.xml";
		const robotstxt =
			`Sitemap: ${sitemapLoc}\n` +
			"User-Agent: foo\n" +
			"Allow: /some/path\n" +
			"User-Agent: bar\n" +
			"\n" +
			"\n";
		parseRobotsTxt(robotstxt, report);
		expect(report.sitemap).toBe(sitemapLoc);
	});
});
