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

export type MatchingPolicy = "google" | "rfc9309";

export interface CompileRobotsOptions {
	readonly policy?: MatchingPolicy;
}

export type SelectedRules = "specific" | "global" | "none";

export type MatchEvidence =
	| {
			readonly kind: "rule";
			readonly directive: "allow" | "disallow";
			readonly pattern: string;
			readonly lineNumber: number;
	  }
	| {
			readonly kind: "default-allow";
			readonly reason: "no-group" | "empty-group" | "no-match" | "robots-txt";
	  };

export interface MatchDecision {
	readonly url: string;
	readonly path: string;
	readonly allowed: boolean;
	readonly selectedRules: SelectedRules;
	readonly evidence: MatchEvidence;
}

export interface CrawlerRules {
	readonly identity: string;
	isAllowed(url: string): boolean;
	match(url: string): MatchDecision;
	isAllowedMany(urls: Iterable<string>): IterableIterator<boolean>;
	matchMany(urls: Iterable<string>): IterableIterator<MatchDecision>;
}

export interface CompiledRobotsText {
	readonly policy: MatchingPolicy;
	forCrawler(identity: string): CrawlerRules;
}

export type ParseDiagnostic =
	| "acceptable-typo"
	| "comment"
	| "empty"
	| "whole-line-comment"
	| "line-too-long"
	| "missing-colon";

export type ParsedDirectiveName =
	| "user-agent"
	| "allow"
	| "disallow"
	| "sitemap"
	| "unsupported"
	| "unknown";

export interface ParsedDirective {
	readonly name: ParsedDirectiveName;
	readonly value: string;
	readonly effective: boolean;
}

export interface ParsedLine {
	readonly lineNumber: number;
	readonly directive: ParsedDirective | null;
	readonly diagnostics: readonly ParseDiagnostic[];
}

export interface RobotsReport {
	readonly policy: MatchingPolicy;
	readonly lineCount: number;
	readonly recognizedDirectiveCount: number;
	readonly unsupportedDirectiveCount: number;
	readonly unknownDirectiveCount: number;
	readonly lines: readonly ParsedLine[];
}

export class InvalidCrawlerIdentityError extends Error {
	constructor(identity: string) {
		super(`Invalid crawler identity: ${JSON.stringify(identity)}`);
		this.name = "InvalidCrawlerIdentityError";
	}
}
