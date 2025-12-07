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

import { describe, test, expect } from "bun:test";
import { RobotsMatcher, ParsedRobots } from "../src";

describe("Stress Tests", () => {
	describe("Large File Handling", () => {
		test("handles 1MB robots.txt without crashing", () => {
			// Generate ~1MB of valid robots.txt content
			let content = "User-agent: *\n";
			const rule = "Disallow: /path/to/some/resource/\n";
			while (content.length < 1_000_000) {
				content += rule;
			}

			const start = performance.now();
			const parsed = ParsedRobots.parse(content);
			const elapsed = performance.now() - start;

			expect(parsed).toBeDefined();
			// Should complete within 5 seconds on any reasonable hardware
			expect(elapsed).toBeLessThan(5000);
		});

		test("handles 100K lines efficiently", () => {
			const lines: string[] = ["User-agent: *"];
			for (let i = 0; i < 100_000; i++) {
				lines.push(`Disallow: /path${i}/`);
			}

			const start = performance.now();
			const parsed = ParsedRobots.parse(lines.join("\n"));
			const elapsed = performance.now() - start;

			expect(parsed).toBeDefined();
			expect(elapsed).toBeLessThan(5000);
		});

		test("handles many user-agent groups", () => {
			const lines: string[] = [];
			for (let i = 0; i < 1000; i++) {
				lines.push(`User-agent: Bot${i}`);
				lines.push(`Disallow: /private${i}/`);
				lines.push("");
			}

			const start = performance.now();
			const parsed = ParsedRobots.parse(lines.join("\n"));
			const elapsed = performance.now() - start;

			expect(parsed).toBeDefined();
			expect(elapsed).toBeLessThan(1000);
		});
	});

	describe("Pathological Patterns", () => {
		test("handles many wildcards in pattern", () => {
			const pattern = "/a*b*c*d*e*f*g*h*i*j*";
			const robotsTxt = `User-agent: *\nDisallow: ${pattern}`;
			const url = "https://example.com/aXbXcXdXeXfXgXhXiXjX";

			const start = performance.now();
			const result = new RobotsMatcher().oneAgentAllowedByRobots(
				robotsTxt,
				"bot",
				url,
			);
			const elapsed = performance.now() - start;

			// Single match should be fast (< 100ms)
			expect(elapsed).toBeLessThan(100);
			expect(result).toBe(false); // Should be disallowed
		});

		test("handles deeply nested wildcard patterns", () => {
			// Pattern with alternating wildcards and literals
			const pattern = "/*a*b*c*d*e*f*g*h*i*j*k*l*m*n*o*p*";
			const robotsTxt = `User-agent: *\nDisallow: ${pattern}`;
			const url = "https://example.com/XaXbXcXdXeXfXgXhXiXjXkXlXmXnXoXp";

			const start = performance.now();
			const result = new RobotsMatcher().oneAgentAllowedByRobots(
				robotsTxt,
				"bot",
				url,
			);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(100);
			expect(result).toBe(false);
		});

		test("handles many rules with same prefix", () => {
			const lines: string[] = ["User-agent: *"];
			// Many rules starting with the same prefix
			for (let i = 0; i < 10000; i++) {
				lines.push(`Disallow: /api/v1/users/${i}`);
			}

			const robotsTxt = lines.join("\n");
			const parsed = ParsedRobots.parse(robotsTxt);

			const start = performance.now();
			const result = parsed.checkUrl(
				"bot",
				"https://example.com/api/v1/users/5000",
			);
			const elapsed = performance.now() - start;

			expect(elapsed).toBeLessThan(100);
			expect(result.allowed).toBe(false);
		});
	});

	describe("Bulk URL Checking Performance", () => {
		test("checks 10K URLs efficiently with ParsedRobots", () => {
			const robotsTxt = `
User-agent: *
Disallow: /private/
Disallow: /admin/
Allow: /public/
`;
			const parsed = ParsedRobots.parse(robotsTxt);

			const urls: string[] = [];
			for (let i = 0; i < 10_000; i++) {
				urls.push(`https://example.com/page${i}`);
			}

			const start = performance.now();
			const results = parsed.checkUrls("Googlebot", urls);
			const elapsed = performance.now() - start;

			expect(results.length).toBe(10_000);
			// Should complete well under 1 second
			expect(elapsed).toBeLessThan(1000);
		});
	});

	describe("Edge Cases", () => {
		test("handles empty robots.txt", () => {
			const result = new RobotsMatcher().oneAgentAllowedByRobots(
				"",
				"bot",
				"https://example.com/page",
			);
			expect(result).toBe(true); // Empty = allow all
		});

		test("handles robots.txt with only comments", () => {
			const robotsTxt = `
# This is a comment
# Another comment
# No actual rules
`;
			const result = new RobotsMatcher().oneAgentAllowedByRobots(
				robotsTxt,
				"bot",
				"https://example.com/page",
			);
			expect(result).toBe(true); // No rules = allow all
		});

		test("handles malformed URLs gracefully", () => {
			const robotsTxt = `User-agent: *\nDisallow: /`;

			// These should not throw
			const matcher = new RobotsMatcher();
			expect(() =>
				matcher.oneAgentAllowedByRobots(robotsTxt, "bot", ""),
			).not.toThrow();
			expect(() =>
				matcher.oneAgentAllowedByRobots(robotsTxt, "bot", "not-a-url"),
			).not.toThrow();
			expect(() =>
				matcher.oneAgentAllowedByRobots(robotsTxt, "bot", "://missing-scheme"),
			).not.toThrow();
		});
	});
});
