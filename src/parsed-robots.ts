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
import { parseRobotsTxt } from "./parser.js";
import { RobotsParseHandler, type LineMetadata } from "./types.js";
import { getPathParamsQuery } from "./url-utils.js";
import { matches } from "./pattern-matcher.js";

/**
 * Result for a single URL check in bulk operations.
 */
export interface UrlCheckResult {
	/** The URL that was checked */
	url: string;
	/** Whether the URL is allowed for crawling */
	allowed: boolean;
	/** Line number of the matching rule (0 if no rule matched) */
	matchingLine: number;
	/** The pattern that matched (empty string if no match) */
	matchedPattern: string;
	/** Whether the match was an Allow or Disallow rule */
	matchedRuleType: "allow" | "disallow" | "none";
}

/**
 * A stored rule from robots.txt for efficient bulk matching.
 */
export interface ParsedRule {
	/** The pattern (already escaped/normalized by parser) */
	pattern: string;
	/** Line number in the robots.txt */
	lineNumber: number;
	/** true = Allow, false = Disallow */
	isAllow: boolean;
}

/**
 * Internal structure for tracking user-agent groups during parsing.
 */
interface AgentGroup {
	agents: Set<string>; // lowercase agent names
	rules: ParsedRule[];
	isGlobal: boolean; // true if this group includes '*'
}

/**
 * Extract the matchable part of a user agent string.
 * Example: 'Googlebot/2.1' becomes 'Googlebot'
 */
function extractUserAgent(userAgent: string): string {
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
 * Handler that collects rules during parsing instead of matching immediately.
 * This allows the rules to be reused for multiple URL checks.
 */
class RulesCollectorHandler extends RobotsParseHandler {
	public globalRules: ParsedRule[] = [];
	public agentGroups: AgentGroup[] = [];

	private currentGroup: AgentGroup | null = null;
	private seenSeparator = false;

	public handleRobotsStart(): void {
		this.globalRules = [];
		this.agentGroups = [];
		this.currentGroup = null;
		this.seenSeparator = false;
	}

	public handleRobotsEnd(): void {
		// Finalize any pending group
		this.finalizeCurrentGroup();
	}

	public handleUserAgent(_lineNum: number, userAgent: string): void {
		if (this.seenSeparator) {
			// Start a new group after seeing Allow/Disallow
			this.finalizeCurrentGroup();
			this.currentGroup = null;
			this.seenSeparator = false;
		}

		if (!this.currentGroup) {
			this.currentGroup = { agents: new Set(), rules: [], isGlobal: false };
		}

		// Handle * wildcard (with Google's special handling for "* followed by space")
		if (
			userAgent.length >= 1 &&
			userAgent[0] === "*" &&
			(userAgent.length === 1 || /\s/.test(userAgent[1]))
		) {
			this.currentGroup.isGlobal = true;
		} else {
			const extracted = extractUserAgent(userAgent);
			if (extracted.length > 0) {
				this.currentGroup.agents.add(extracted.toLowerCase());
			}
		}
	}

	public handleAllow(lineNum: number, value: string): void {
		// Empty Allow is a no-op - it doesn't add any permissions beyond the default.
		// Skip to avoid creating unnecessary rules and misleading match reporting.
		if (value.length === 0) return;

		this.addRule(lineNum, value, true);

		// Google-specific: index.html normalization
		// 'index.htm' and 'index.html' are normalized to '/'
		const slashPos = value.lastIndexOf("/");
		if (slashPos !== -1) {
			const afterSlash = value.slice(slashPos);
			if (afterSlash.startsWith("/index.htm")) {
				const newPattern = value.slice(0, slashPos + 1) + "$";
				this.addRule(lineNum, newPattern, true);
			}
		}
	}

	public handleDisallow(lineNum: number, value: string): void {
		// RFC 9309: Empty Disallow means "allow all" - don't create a blocking rule.
		// An empty pattern would match everything (empty string is prefix of all strings)
		// but with priority 0, which should not block access.
		if (value.length === 0) return;

		this.addRule(lineNum, value, false);
	}

	public handleSitemap(_lineNum: number, _value: string): void {
		// Sitemaps don't affect crawl rules
	}

	public handleUnknownAction(
		_lineNum: number,
		_action: string,
		_value: string,
	): void {
		// Unknown actions are ignored
	}

	public reportLineMetadata(_lineNum: number, _metadata: LineMetadata): void {
		// Not needed for rule collection
	}

	private addRule(lineNum: number, pattern: string, isAllow: boolean): void {
		if (!this.currentGroup) return;

		this.seenSeparator = true;

		const rule: ParsedRule = {
			pattern,
			lineNumber: lineNum,
			isAllow,
		};

		this.currentGroup.rules.push(rule);

		// If this group has the * agent, also add to global rules
		if (this.currentGroup.isGlobal) {
			this.globalRules.push(rule);
		}
	}

	private finalizeCurrentGroup(): void {
		if (this.currentGroup && this.currentGroup.rules.length > 0) {
			this.agentGroups.push(this.currentGroup);
		}
	}
}

/**
 * Represents a parsed robots.txt ready for efficient bulk URL checking.
 * Immutable after creation - safe to reuse across multiple checkUrls() calls.
 *
 * This class separates parsing from matching, enabling efficient bulk operations
 * where the same robots.txt is checked against many URLs.
 *
 * @example
 * ```typescript
 * const parsed = ParsedRobots.parse(robotsBody);
 *
 * // Check 100K URLs without re-parsing
 * const results = parsed.checkUrls('Googlebot', urls);
 *
 * // Can also check for different agents
 * const bingResults = parsed.checkUrls('Bingbot', urls);
 * ```
 */
export class ParsedRobots {
	private readonly globalRules: ParsedRule[];
	private readonly agentRulesMap: Map<string, ParsedRule[]>;
	private readonly explicitAgents: Set<string>;

	private constructor(
		globalRules: ParsedRule[],
		agentRulesMap: Map<string, ParsedRule[]>,
		explicitAgents: Set<string>,
	) {
		this.globalRules = globalRules;
		this.agentRulesMap = agentRulesMap;
		this.explicitAgents = explicitAgents;
	}

	/**
	 * Parse a robots.txt body and return a ParsedRobots instance.
	 * This is the expensive operation - do it once.
	 *
	 * @param robotsBody - The robots.txt content to parse
	 * @returns A ParsedRobots instance ready for URL checking
	 */
	public static parse(robotsBody: string): ParsedRobots {
		const handler = new RulesCollectorHandler();
		parseRobotsTxt(robotsBody, handler);

		// Build agent -> rules map
		const agentRulesMap = new Map<string, ParsedRule[]>();
		const explicitAgents = new Set<string>();

		for (const group of handler.agentGroups) {
			for (const agent of group.agents) {
				explicitAgents.add(agent);

				// Merge rules if agent appears in multiple groups
				const existing = agentRulesMap.get(agent) || [];
				agentRulesMap.set(agent, [...existing, ...group.rules]);
			}
		}

		return new ParsedRobots(handler.globalRules, agentRulesMap, explicitAgents);
	}

	/**
	 * Check multiple URLs for a single user-agent.
	 * This is the fast operation - O(urls * rules) with no parsing overhead.
	 *
	 * Invalid or malformed URLs are handled gracefully - if the path cannot be
	 * extracted, it defaults to "/" which typically allows access. No exceptions
	 * are thrown for invalid input.
	 *
	 * @param userAgent - The user-agent to check (e.g., 'Googlebot', 'Googlebot/2.1')
	 * @param urls - Array of URLs to check (should be %-encoded per RFC3986)
	 * @returns Array of results in the same order as input URLs
	 */
	public checkUrls(userAgent: string, urls: string[]): UrlCheckResult[] {
		const lowerAgent = extractUserAgent(userAgent).toLowerCase();

		// Determine which rules to use:
		// - If specific agent has rules, use those (ignore global)
		// - Otherwise, fall back to global rules
		const hasSpecificRules = this.agentRulesMap.has(lowerAgent);
		const rules = hasSpecificRules
			? this.agentRulesMap.get(lowerAgent)!
			: this.globalRules;

		return urls.map((url) => this.checkSingleUrl(url, rules));
	}

	/**
	 * Check a single URL (convenience method).
	 *
	 * Invalid or malformed URLs are handled gracefully - if the path cannot be
	 * extracted, it defaults to "/" which typically allows access.
	 *
	 * @param userAgent - The user-agent to check
	 * @param url - The URL to check (should be %-encoded per RFC3986)
	 * @returns Result with detailed match information
	 */
	public checkUrl(userAgent: string, url: string): UrlCheckResult {
		return this.checkUrls(userAgent, [url])[0];
	}

	/**
	 * Returns true if the robots.txt explicitly mentions rules for this user-agent.
	 *
	 * @param userAgent - The user-agent to check
	 */
	public hasSpecificAgent(userAgent: string): boolean {
		const lowerAgent = extractUserAgent(userAgent).toLowerCase();
		return this.explicitAgents.has(lowerAgent);
	}

	/**
	 * Get the list of user-agents explicitly mentioned in the robots.txt.
	 * Does not include '*' (global agent).
	 *
	 * @returns Array of lowercase agent names
	 */
	public getExplicitAgents(): string[] {
		return Array.from(this.explicitAgents);
	}

	/**
	 * Check a single URL against a set of rules.
	 */
	private checkSingleUrl(url: string, rules: ParsedRule[]): UrlCheckResult {
		const path = getPathParamsQuery(url);

		let bestAllowPriority = K_NO_MATCH_PRIORITY;
		let bestAllowLine = 0;
		let bestAllowPattern = "";

		let bestDisallowPriority = K_NO_MATCH_PRIORITY;
		let bestDisallowLine = 0;
		let bestDisallowPattern = "";

		for (const rule of rules) {
			if (matches(path, rule.pattern)) {
				const priority = rule.pattern.length;
				if (rule.isAllow) {
					if (priority > bestAllowPriority) {
						bestAllowPriority = priority;
						bestAllowLine = rule.lineNumber;
						bestAllowPattern = rule.pattern;
					}
				} else {
					if (priority > bestDisallowPriority) {
						bestDisallowPriority = priority;
						bestDisallowLine = rule.lineNumber;
						bestDisallowPattern = rule.pattern;
					}
				}
			}
		}

		// Determine result using longest-match semantics
		// When priorities are equal, Allow wins (RFC 9309 compliance)
		const allowed = bestDisallowPriority <= bestAllowPriority;

		// Determine which rule actually won
		let matchingLine = 0;
		let matchedPattern = "";
		let matchedRuleType: "allow" | "disallow" | "none" = "none";

		if (bestAllowPriority > bestDisallowPriority) {
			matchingLine = bestAllowLine;
			matchedPattern = bestAllowPattern;
			matchedRuleType = "allow";
		} else if (bestDisallowPriority > bestAllowPriority) {
			matchingLine = bestDisallowLine;
			matchedPattern = bestDisallowPattern;
			matchedRuleType = "disallow";
		} else if (bestAllowPriority >= 0) {
			// Tie goes to allow
			matchingLine = bestAllowLine;
			matchedPattern = bestAllowPattern;
			matchedRuleType = "allow";
		}
		// else: no rules matched, everything stays at default

		return {
			url,
			allowed,
			matchingLine,
			matchedPattern,
			matchedRuleType,
		};
	}
}
