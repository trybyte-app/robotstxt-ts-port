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

/**
 * robotstxt-parser - Google's robots.txt parser ported to TypeScript
 *
 * This is a TypeScript port of Google's official C++ robots.txt parser,
 * compliant with RFC 9309 (Robots Exclusion Protocol).
 *
 * @example
 * ```typescript
 * import { RobotsMatcher } from 'robotstxt-parser';
 *
 * const matcher = new RobotsMatcher();
 * const robotsTxt = `
 *   User-agent: *
 *   Disallow: /private/
 *   Allow: /public/
 * `;
 *
 * const isAllowed = matcher.oneAgentAllowedByRobots(
 *   robotsTxt,
 *   'MyBot',
 *   'http://example.com/public/page.html'
 * );
 * console.log(isAllowed); // true
 * ```
 */

// Main parser function
export { parseRobotsTxt } from "./parser.js";

// Main matcher class
export { RobotsMatcher } from "./matcher.js";

// Bulk URL checking
export {
	ParsedRobots,
	type UrlCheckResult,
	type ParsedRule,
} from "./parsed-robots.js";

// Reporting handler
export { RobotsParsingReporter } from "./reporter.js";

// Types and interfaces
export {
	RobotsParseHandler,
	KeyType,
	RobotsTagName,
	createLineMetadata,
	createRobotsParsedLine,
	type LineMetadata,
	type RobotsParsedLine,
} from "./types.js";

// Match strategy
export {
	LongestMatchRobotsMatchStrategy,
	type RobotsMatchStrategy,
} from "./match-strategy.js";

// Utilities
export { getPathParamsQuery, maybeEscapePattern } from "./url-utils.js";
export { matches } from "./pattern-matcher.js";

// Constants
export {
	K_MAX_LINE_LEN,
	K_ALLOW_FREQUENT_TYPOS,
	K_UNSUPPORTED_TAGS,
} from "./constants.js";
