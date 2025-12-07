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

import { K_NO_MATCH_PRIORITY } from "./constants.js";
import {
	LongestMatchRobotsMatchStrategy,
	type RobotsMatchStrategy,
} from "./match-strategy.js";
import { ParsedRobots, type UrlCheckResult } from "./parsed-robots.js";
import { parseRobotsTxt } from "./parser.js";
import { RobotsParseHandler, type LineMetadata } from "./types.js";
import { getPathParamsQuery } from "./url-utils.js";

/**
 * Stores the information associated with a match (e.g. when a Disallow is matched)
 * as priority of the match and line matching.
 *
 * The priority is initialized with a negative value to make sure that a match
 * of priority 0 is higher priority than no match at all.
 */
class Match {
	private priority: number;
	private line: number;

	constructor(priority: number = K_NO_MATCH_PRIORITY, line: number = 0) {
		this.priority = priority;
		this.line = line;
	}

	public set(priority: number, line: number): void {
		this.priority = priority;
		this.line = line;
	}

	public clear(): void {
		this.set(K_NO_MATCH_PRIORITY, 0);
	}

	public getLine(): number {
		return this.line;
	}

	public getPriority(): number {
		return this.priority;
	}

	public static higherPriorityMatch(a: Match, b: Match): Match {
		if (a.getPriority() > b.getPriority()) {
			return a;
		}
		return b;
	}
}

/**
 * For each of the directives within user-agents, we keep global and specific
 * match scores.
 */
interface MatchHierarchy {
	global: Match; // Match for '*'
	specific: Match; // Match for queried agent.
}

/**
 * RobotsMatcher - matches robots.txt against URLs.
 *
 * The Matcher uses a default match strategy for Allow/Disallow patterns which
 * is the official way of Google crawler to match robots.txt. It is also
 * possible to provide a custom match strategy.
 *
 * The entry point for the user is to call one of the *AllowedByRobots()
 * methods that return directly if a URL is being allowed according to the
 * robots.txt and the crawl agent.
 *
 * The RobotsMatcher can be re-used for URLs/robots.txt but is not thread-safe.
 */
export class RobotsMatcher extends RobotsParseHandler {
	private allow: MatchHierarchy;
	private disallowMatch: MatchHierarchy;

	private seenGlobalAgent: boolean = false;
	private seenSpecificAgent: boolean = false;
	private everSeenSpecificAgentFlag: boolean = false;
	private seenSeparator: boolean = false;

	private path: string = "";
	private userAgents: string[] = [];

	private matchStrategy: RobotsMatchStrategy;

	constructor() {
		super();
		this.allow = { global: new Match(), specific: new Match() };
		this.disallowMatch = { global: new Match(), specific: new Match() };
		this.matchStrategy = new LongestMatchRobotsMatchStrategy();
	}

	/**
	 * Parse robots.txt once for efficient repeated checks.
	 * Use when checking many URLs or multiple user-agents against the same robots.txt.
	 *
	 * @param robotsBody - The robots.txt content to parse
	 * @returns A ParsedRobots instance ready for bulk URL checking
	 *
	 * @example
	 * ```typescript
	 * const parsed = RobotsMatcher.parse(robotsBody);
	 * const results = parsed.checkUrls('Googlebot', urls);
	 * ```
	 */
	public static parse(robotsBody: string): ParsedRobots {
		return ParsedRobots.parse(robotsBody);
	}

	/**
	 * Bulk check URLs against robots.txt for a single user-agent.
	 * More efficient than repeated oneAgentAllowedByRobots() calls.
	 *
	 * @param robotsBody - The robots.txt content
	 * @param userAgent - The user-agent to check
	 * @param urls - Array of URLs to check (must be %-encoded per RFC3986)
	 * @returns Array of results with detailed match information
	 *
	 * @example
	 * ```typescript
	 * const results = RobotsMatcher.batchCheck(robotsBody, 'Googlebot', urls);
	 * for (const result of results) {
	 *   console.log(`${result.url}: ${result.allowed ? 'allowed' : 'blocked'}`);
	 * }
	 * ```
	 */
	public static batchCheck(
		robotsBody: string,
		userAgent: string,
		urls: string[],
	): UrlCheckResult[] {
		return ParsedRobots.parse(robotsBody).checkUrls(userAgent, urls);
	}

	/**
	 * Verifies that the given user agent is valid to be matched against
	 * robots.txt. Valid user agent strings only contain the characters
	 * [a-zA-Z_-].
	 */
	public static isValidUserAgentToObey(userAgent: string): boolean {
		if (userAgent.length === 0) return false;
		return RobotsMatcher.extractUserAgent(userAgent) === userAgent;
	}

	/**
	 * Extract the matchable part of a user agent string, essentially stopping at
	 * the first invalid character.
	 * Example: 'Googlebot/2.1' becomes 'Googlebot'
	 */
	private static extractUserAgent(userAgent: string): string {
		let end = 0;
		while (end < userAgent.length) {
			const ch = userAgent[end];
			if (
				(ch >= "a" && ch <= "z") ||
				(ch >= "A" && ch <= "Z") ||
				ch === "-" ||
				ch === "_"
			) {
				end++;
			} else {
				break;
			}
		}
		return userAgent.slice(0, end);
	}

	/**
	 * Returns true iff 'url' is allowed to be fetched by any member of the
	 * "userAgents" array. 'url' must be %-encoded according to RFC3986.
	 *
	 * Invalid or malformed URLs are handled gracefully - if the path cannot be
	 * extracted, it defaults to "/" which typically allows access.
	 *
	 * @param robotsBody - The robots.txt content to parse
	 * @param userAgents - Array of user-agent strings to check
	 * @param url - The URL to check (should be %-encoded per RFC3986)
	 * @returns true if access is allowed, false if disallowed
	 */
	public allowedByRobots(
		robotsBody: string,
		userAgents: string[],
		url: string,
	): boolean {
		// The url is not normalized (escaped, percent encoded) here because the user
		// is asked to provide it in escaped form already.
		const path = getPathParamsQuery(url);
		this.initUserAgentsAndPath(userAgents, path);
		parseRobotsTxt(robotsBody, this);
		return !this.disallow();
	}

	/**
	 * Do robots check for 'url' when there is only one user agent. 'url' must
	 * be %-encoded according to RFC3986.
	 *
	 * Invalid or malformed URLs are handled gracefully - if the path cannot be
	 * extracted, it defaults to "/" which typically allows access.
	 *
	 * @param robotsTxt - The robots.txt content to parse
	 * @param userAgent - The user-agent string to check
	 * @param url - The URL to check (should be %-encoded per RFC3986)
	 * @returns true if access is allowed, false if disallowed
	 */
	public oneAgentAllowedByRobots(
		robotsTxt: string,
		userAgent: string,
		url: string,
	): boolean {
		return this.allowedByRobots(robotsTxt, [userAgent], url);
	}

	/**
	 * Returns true if we are disallowed from crawling a matching URI.
	 */
	public disallow(): boolean {
		if (
			this.allow.specific.getPriority() > 0 ||
			this.disallowMatch.specific.getPriority() > 0
		) {
			return (
				this.disallowMatch.specific.getPriority() >
				this.allow.specific.getPriority()
			);
		}

		if (this.everSeenSpecificAgentFlag) {
			// Matching group for user-agent but either without disallow or empty one,
			// i.e. priority == 0.
			return false;
		}

		if (
			this.disallowMatch.global.getPriority() > 0 ||
			this.allow.global.getPriority() > 0
		) {
			return (
				this.disallowMatch.global.getPriority() >
				this.allow.global.getPriority()
			);
		}

		return false;
	}

	/**
	 * Returns true if we are disallowed from crawling a matching URI. Ignores any
	 * rules specified for the default user agent, and bases its results only on
	 * the specified user agents.
	 */
	public disallowIgnoreGlobal(): boolean {
		if (
			this.allow.specific.getPriority() > 0 ||
			this.disallowMatch.specific.getPriority() > 0
		) {
			return (
				this.disallowMatch.specific.getPriority() >
				this.allow.specific.getPriority()
			);
		}
		return false;
	}

	/**
	 * Returns true iff, when AllowedByRobots() was called, the robots file
	 * referred explicitly to one of the specified user agents.
	 */
	public everSeenSpecificAgent(): boolean {
		return this.everSeenSpecificAgentFlag;
	}

	/**
	 * Returns the line that matched or 0 if none matched.
	 */
	public matchingLine(): number {
		if (this.everSeenSpecificAgentFlag) {
			return Match.higherPriorityMatch(
				this.disallowMatch.specific,
				this.allow.specific,
			).getLine();
		}
		return Match.higherPriorityMatch(
			this.disallowMatch.global,
			this.allow.global,
		).getLine();
	}

	/**
	 * Initialize next path and user-agents to check. Path must contain only the
	 * path, params, and query (if any) of the url and must start with a '/'.
	 */
	private initUserAgentsAndPath(userAgents: string[], path: string): void {
		if (!path.startsWith("/")) {
			throw new Error("Path must start with /");
		}
		this.path = path;
		this.userAgents = userAgents;
	}

	/**
	 * Returns true if any user-agent was seen.
	 */
	private seenAnyAgent(): boolean {
		return this.seenGlobalAgent || this.seenSpecificAgent;
	}

	// Parse callbacks

	public handleRobotsStart(): void {
		// Reset all instance member variables for new robots.txt file
		this.allow.global.clear();
		this.allow.specific.clear();
		this.disallowMatch.global.clear();
		this.disallowMatch.specific.clear();

		this.seenGlobalAgent = false;
		this.seenSpecificAgent = false;
		this.everSeenSpecificAgentFlag = false;
		this.seenSeparator = false;
	}

	public handleRobotsEnd(): void {
		// Nothing to do
	}

	public handleUserAgent(_lineNum: number, userAgent: string): void {
		if (this.seenSeparator) {
			this.seenSpecificAgent = false;
			this.seenGlobalAgent = false;
			this.seenSeparator = false;
		}

		// Google-specific optimization: a '*' followed by space and more characters
		// in a user-agent record is still regarded a global rule.
		if (
			userAgent.length >= 1 &&
			userAgent[0] === "*" &&
			(userAgent.length === 1 || /\s/.test(userAgent[1]))
		) {
			this.seenGlobalAgent = true;
		} else {
			const extracted = RobotsMatcher.extractUserAgent(userAgent);
			for (const agent of this.userAgents) {
				if (extracted.toLowerCase() === agent.toLowerCase()) {
					this.everSeenSpecificAgentFlag = true;
					this.seenSpecificAgent = true;
					break;
				}
			}
		}
	}

	public handleAllow(lineNum: number, value: string): void {
		if (!this.seenAnyAgent()) return;
		this.seenSeparator = true;

		const priority = this.matchStrategy.matchAllow(this.path, value);
		if (priority >= 0) {
			if (this.seenSpecificAgent) {
				if (this.allow.specific.getPriority() < priority) {
					this.allow.specific.set(priority, lineNum);
				}
			} else {
				// seenGlobalAgent must be true here since seenAnyAgent() returned true
				if (this.allow.global.getPriority() < priority) {
					this.allow.global.set(priority, lineNum);
				}
			}
		} else {
			// Google-specific optimization: 'index.htm' and 'index.html' are normalized
			// to '/'.
			const slashPos = value.lastIndexOf("/");

			if (slashPos !== -1) {
				const afterSlash = value.slice(slashPos);
				if (afterSlash.startsWith("/index.htm")) {
					// Create pattern: path up to "/" + "$"
					const newPattern = value.slice(0, slashPos + 1) + "$";
					this.handleAllow(lineNum, newPattern);
				}
			}
		}
	}

	public handleDisallow(lineNum: number, value: string): void {
		if (!this.seenAnyAgent()) return;
		this.seenSeparator = true;

		const priority = this.matchStrategy.matchDisallow(this.path, value);
		if (priority >= 0) {
			if (this.seenSpecificAgent) {
				if (this.disallowMatch.specific.getPriority() < priority) {
					this.disallowMatch.specific.set(priority, lineNum);
				}
			} else {
				// seenGlobalAgent must be true here since seenAnyAgent() returned true
				if (this.disallowMatch.global.getPriority() < priority) {
					this.disallowMatch.global.set(priority, lineNum);
				}
			}
		}
	}

	public handleSitemap(_lineNum: number, _value: string): void {
		// Nothing to do - sitemaps don't affect crawl access
	}

	public handleUnknownAction(
		_lineNum: number,
		_action: string,
		_value: string,
	): void {
		// Nothing to do
	}

	public reportLineMetadata(_lineNum: number, _metadata: LineMetadata): void {
		// Nothing to do
	}
}
