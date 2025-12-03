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
import { getPathParamsQuery, maybeEscapePattern } from "../src/index.js";

describe("TestGetPathParamsQuery", () => {
	const testPath = (url: string, expectedPath: string) => {
		expect(getPathParamsQuery(url)).toBe(expectedPath);
	};

	test('Empty URL returns "/"', () => {
		testPath("", "/");
	});

	test("URL without path returns /", () => {
		testPath("http://www.example.com", "/");
	});

	test("URL with trailing slash", () => {
		testPath("http://www.example.com/", "/");
	});

	test("Simple path", () => {
		testPath("http://www.example.com/a", "/a");
	});

	test("Path with trailing slash", () => {
		testPath("http://www.example.com/a/", "/a/");
	});

	test("Path with query containing URL", () => {
		testPath("http://www.example.com/a/b?c=http://d.e/", "/a/b?c=http://d.e/");
	});

	test("Path with query and fragment (fragment removed)", () => {
		testPath("http://www.example.com/a/b?c=d&e=f#fragment", "/a/b?c=d&e=f");
	});

	test("Domain without protocol returns /", () => {
		testPath("example.com", "/");
	});

	test("Domain with trailing slash returns /", () => {
		testPath("example.com/", "/");
	});

	test("Domain with simple path", () => {
		testPath("example.com/a", "/a");
	});

	test("Domain with path and trailing slash", () => {
		testPath("example.com/a/", "/a/");
	});

	test("Domain with path, query and fragment", () => {
		testPath("example.com/a/b?c=d&e=f#fragment", "/a/b?c=d&e=f");
	});

	test("Single character returns /", () => {
		testPath("a", "/");
	});

	test("Single character with slash returns /", () => {
		testPath("a/", "/");
	});

	test("Absolute path preserved", () => {
		testPath("/a", "/a");
	});

	test("Relative path", () => {
		testPath("a/b", "/b");
	});

	test("Query prepended with slash", () => {
		testPath("example.com?a", "/?a");
	});

	test("Path with semicolon params, fragment removed", () => {
		testPath("example.com/a;b#c", "/a;b");
	});

	test("Double slash URL", () => {
		testPath("//a/b/c", "/b/c");
	});
});

describe("TestMaybeEscapePattern", () => {
	const testEscape = (url: string, expected: string) => {
		const { escaped } = maybeEscapePattern(url);
		expect(escaped).toBe(expected);
	};

	test("No escaping needed for simple URL", () => {
		testEscape("http://www.example.com", "http://www.example.com");
	});

	test("No escaping needed for simple path", () => {
		testEscape("/a/b/c", "/a/b/c");
	});

	test("UTF-8 character is percent-encoded", () => {
		testEscape("á", "%C3%A1");
	});

	test("Lowercase percent encoding is uppercased", () => {
		testEscape("%aa", "%AA");
	});
});
