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

import { matches } from "./pattern-matcher.js";

/**
 * A RobotsMatchStrategy defines a strategy for matching individual lines in a
 * robots.txt file. Each Match* method should return a match priority, which is
 * interpreted as:
 *
 * match priority < 0:
 *    No match.
 *
 * match priority == 0:
 *    Match, but treat it as if matched an empty pattern.
 *
 * match priority > 0:
 *    Match.
 */
export interface RobotsMatchStrategy {
	/**
	 * Match an Allow pattern against a path.
	 * @param path - The URL path to match
	 * @param pattern - The Allow pattern
	 * @returns Match priority (pattern length on match, -1 on no match)
	 */
	matchAllow(path: string, pattern: string): number;

	/**
	 * Match a Disallow pattern against a path.
	 * @param path - The URL path to match
	 * @param pattern - The Disallow pattern
	 * @returns Match priority (pattern length on match, -1 on no match)
	 */
	matchDisallow(path: string, pattern: string): number;
}

/**
 * Implements the default robots.txt matching strategy. The maximum number of
 * characters matched by a pattern is returned as its match priority.
 *
 * This is the official way of Google crawler to match robots.txt. The
 * longest-match strategy is what webmasters assume when writing directives.
 * For example, in case of conflicting matches (both Allow and Disallow),
 * the longest match is the one the user wants.
 */
export class LongestMatchRobotsMatchStrategy implements RobotsMatchStrategy {
	public matchAllow(path: string, pattern: string): number {
		return matches(path, pattern) ? pattern.length : -1;
	}

	public matchDisallow(path: string, pattern: string): number {
		return matches(path, pattern) ? pattern.length : -1;
	}
}
