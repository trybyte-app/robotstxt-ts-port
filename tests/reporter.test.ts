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
	parseRobotsTxt,
	RobotsParsingReporter,
	RobotsTagName,
	type RobotsParsedLine,
	type LineMetadata,
} from "../src/index.js";

function expectLineToParseTo(
	lines: string[],
	parseResults: RobotsParsedLine[],
	expectedResult: RobotsParsedLine,
): void {
	const lineNum = expectedResult.lineNum;
	const actual = parseResults[lineNum - 1];

	expect(actual.lineNum).toBe(expectedResult.lineNum);
	expect(actual.tagName).toBe(expectedResult.tagName);
	expect(actual.isTypo).toBe(expectedResult.isTypo);
	expect(actual.metadata.isEmpty).toBe(expectedResult.metadata.isEmpty);
	expect(actual.metadata.hasComment).toBe(expectedResult.metadata.hasComment);
	expect(actual.metadata.isComment).toBe(expectedResult.metadata.isComment);
	expect(actual.metadata.hasDirective).toBe(
		expectedResult.metadata.hasDirective,
	);
	expect(actual.metadata.isAcceptableTypo).toBe(
		expectedResult.metadata.isAcceptableTypo,
	);
	expect(actual.metadata.isLineTooLong).toBe(
		expectedResult.metadata.isLineTooLong,
	);
	expect(actual.metadata.isMissingColonSeparator).toBe(
		expectedResult.metadata.isMissingColonSeparator,
	);
}

describe("LinesNumbersAreCountedCorrectly", () => {
	const kSimpleFile =
		"User-Agent: foo\n" + // 1
		"Allow: /some/path\n" + // 2
		"User-Agent bar # no\n" + // 3
		"absolutely random line\n" + // 4
		"#so comment, much wow\n" + // 5
		"\n" + // 6
		"unicorns: /extinct\n" + // 7
		"noarchive: /some\n" + // 8
		"Disallow: /\n" + // 9
		"Error #and comment\n" + // 10
		"useragent: baz\n" + // 11
		"disallaw: /some\n" + // 12
		"site-map: https://e/s.xml #comment\n" + // 13
		"sitemap: https://e/t.xml\n" + // 14
		"Noarchive: /someCapital\n"; // 15
	// 16 (from final \n)

	test("Basic reporting test", () => {
		const report = new RobotsParsingReporter();
		parseRobotsTxt(kSimpleFile, report);

		expect(report.validDirectives()).toBe(8);
		expect(report.lastLineSeen()).toBe(16);
		expect(report.parseResults().length).toBe(report.lastLineSeen());

		const lines = kSimpleFile.split("\n");
		const parseResults = report.parseResults();

		// Line 1: "User-Agent: foo\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 1,
			tagName: RobotsTagName.UserAgent,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 2: "Allow: /some/path\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 2,
			tagName: RobotsTagName.Allow,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 3: "User-Agent bar # no\n" (missing colon)
		expectLineToParseTo(lines, parseResults, {
			lineNum: 3,
			tagName: RobotsTagName.UserAgent,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: true,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: true,
			},
		});

		// Line 4: "absolutely random line\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 4,
			tagName: RobotsTagName.Unknown,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: false,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 5: "#so comment, much wow\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 5,
			tagName: RobotsTagName.Unknown,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: true,
				isComment: true,
				hasDirective: false,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 6: "\n" (empty)
		expectLineToParseTo(lines, parseResults, {
			lineNum: 6,
			tagName: RobotsTagName.Unknown,
			isTypo: false,
			metadata: {
				isEmpty: true,
				hasComment: false,
				isComment: false,
				hasDirective: false,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 7: "unicorns: /extinct\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 7,
			tagName: RobotsTagName.Unknown,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 8: "noarchive: /some\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 8,
			tagName: RobotsTagName.Unused,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 9: "Disallow: /\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 9,
			tagName: RobotsTagName.Disallow,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 10: "Error #and comment\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 10,
			tagName: RobotsTagName.Unknown,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: true,
				isComment: false,
				hasDirective: false,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 11: "useragent: baz\n" (typo)
		expectLineToParseTo(lines, parseResults, {
			lineNum: 11,
			tagName: RobotsTagName.UserAgent,
			isTypo: true,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: true,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 12: "disallaw: /some\n" (typo)
		expectLineToParseTo(lines, parseResults, {
			lineNum: 12,
			tagName: RobotsTagName.Disallow,
			isTypo: true,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: true,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 13: "site-map: https://e/s.xml #comment\n" (typo)
		expectLineToParseTo(lines, parseResults, {
			lineNum: 13,
			tagName: RobotsTagName.Sitemap,
			isTypo: true,
			metadata: {
				isEmpty: false,
				hasComment: true,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: true,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 14: "sitemap: https://e/t.xml\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 14,
			tagName: RobotsTagName.Sitemap,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 15: "Noarchive: /someCapital\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 15,
			tagName: RobotsTagName.Unused,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 16: empty from final newline
		expectLineToParseTo(lines, parseResults, {
			lineNum: 16,
			tagName: RobotsTagName.Unknown,
			isTypo: false,
			metadata: {
				isEmpty: true,
				hasComment: false,
				isComment: false,
				hasDirective: false,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});
	});

	test("DOS line endings", () => {
		const report = new RobotsParsingReporter();
		const kDosFile =
			"User-Agent: foo\r\n" +
			"Allow: /some/path\r\n" +
			"User-Agent: bar\r\n" +
			"\r\n" +
			"\r\n" +
			"Disallow: /\r\n";
		parseRobotsTxt(kDosFile, report);
		expect(report.validDirectives()).toBe(4);
		expect(report.lastLineSeen()).toBe(7);
	});

	test("Mac line endings", () => {
		const report = new RobotsParsingReporter();
		const kMacFile =
			"User-Agent: foo\r" +
			"Allow: /some/path\r" +
			"User-Agent: bar\r" +
			"\r" +
			"\r" +
			"Disallow: /\r";
		parseRobotsTxt(kMacFile, report);
		expect(report.validDirectives()).toBe(4);
		expect(report.lastLineSeen()).toBe(7);
	});
});

describe("LinesTooLongReportedCorrectly", () => {
	test("Long line reported", () => {
		const report = new RobotsParsingReporter();
		const kMaxLineLen = 2084 * 8;
		const allow = "allow: /\n";
		const disallow = "disallow: ";
		let robotstxt = "user-agent: foo\n";
		let longline = "/x/";

		while (longline.length < kMaxLineLen) {
			longline += "a";
		}
		robotstxt += disallow + longline + "\n" + allow;

		parseRobotsTxt(robotstxt, report);
		expect(report.validDirectives()).toBe(3);
		expect(report.lastLineSeen()).toBe(4);
		expect(report.parseResults().length).toBe(report.lastLineSeen());

		const lines = robotstxt.split("\n");
		const parseResults = report.parseResults();

		// Line 1: "user-agent: foo\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 1,
			tagName: RobotsTagName.UserAgent,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});

		// Line 2: long disallow line
		expectLineToParseTo(lines, parseResults, {
			lineNum: 2,
			tagName: RobotsTagName.Disallow,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: true,
				isMissingColonSeparator: false,
			},
		});

		// Line 3: "allow: /\n"
		expectLineToParseTo(lines, parseResults, {
			lineNum: 3,
			tagName: RobotsTagName.Allow,
			isTypo: false,
			metadata: {
				isEmpty: false,
				hasComment: false,
				isComment: false,
				hasDirective: true,
				isAcceptableTypo: false,
				isLineTooLong: false,
				isMissingColonSeparator: false,
			},
		});
	});
});
