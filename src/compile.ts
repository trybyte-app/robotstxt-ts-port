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

import { decide, parsePolicy, selectRules } from "./engine.js";
import {
	InvalidCrawlerIdentityError,
	type CompileRobotsOptions,
	type CompiledRobotsText,
	type CrawlerRules,
	type MatchDecision,
	type MatchingPolicy,
	type RobotsReport,
} from "./model.js";

function selectedPolicy(options?: CompileRobotsOptions): MatchingPolicy {
	const policy = options?.policy ?? "google";
	if (policy !== "google" && policy !== "rfc9309") {
		throw new RangeError(
			`Unknown robots.txt matching policy: ${String(policy)}`,
		);
	}
	return policy;
}

function normalizeCrawlerIdentity(identity: string): string {
	const match = /^([A-Za-z_-]+)(?:\/[!#$%&'*+\-.^_`|~0-9A-Za-z]+)?$/.exec(
		identity,
	);
	if (!match) throw new InvalidCrawlerIdentityError(identity);
	return match[1].toLowerCase();
}

class CompiledCrawlerRules implements CrawlerRules {
	public readonly identity: string;

	constructor(
		identity: string,
		private readonly policy: MatchingPolicy,
		private readonly selected: ReturnType<typeof selectRules>,
	) {
		this.identity = identity;
	}

	public isAllowed(url: string): boolean {
		return this.match(url).allowed;
	}

	public match(url: string): MatchDecision {
		return decide(this.policy, this.selected, url);
	}

	public *isAllowedMany(urls: Iterable<string>): IterableIterator<boolean> {
		for (const url of urls) yield this.isAllowed(url);
	}

	public *matchMany(urls: Iterable<string>): IterableIterator<MatchDecision> {
		for (const url of urls) yield this.match(url);
	}
}

class CompiledRobots implements CompiledRobotsText {
	public readonly policy: MatchingPolicy;

	constructor(
		policy: MatchingPolicy,
		private readonly data: ReturnType<typeof parsePolicy>["data"],
	) {
		this.policy = policy;
	}

	public forCrawler(identity: string): CrawlerRules {
		const normalized = normalizeCrawlerIdentity(identity);
		return new CompiledCrawlerRules(
			normalized,
			this.policy,
			selectRules(this.data, normalized),
		);
	}
}

export function compileRobotsText(
	robotsText: string,
	options?: CompileRobotsOptions,
): CompiledRobotsText {
	const policy = selectedPolicy(options);
	const { data } = parsePolicy(robotsText, policy, false);
	return new CompiledRobots(policy, data);
}

export function inspectRobotsText(
	robotsText: string,
	options?: CompileRobotsOptions,
): RobotsReport {
	const policy = selectedPolicy(options);
	const { report } = parsePolicy(robotsText, policy, true);
	if (!report) throw new Error("Robots text inspection produced no report");
	return report;
}
