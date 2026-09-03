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

import type {
	MatchDecision,
	MatchingPolicy,
	ParseDiagnostic,
	ParsedDirective,
	ParsedDirectiveName,
	ParsedLine,
	RobotsReport,
	SelectedRules,
} from "./model.js";

const GOOGLE_MAX_LINE_BYTES = 2083 * 8 - 1;
const UTF8_BOM = [0xef, 0xbb, 0xbf] as const;
const UNSUPPORTED_DIRECTIVES = new Set([
	"clean-param",
	"content-signal",
	"content-usage",
	"crawl-delay",
	"domain",
	"host",
	"noarchive",
	"noindex",
	"nofollow",
	"request-rate",
	"revisit-after",
	"visit-time",
]);

type RuleDirective = "allow" | "disallow";

interface Rule {
	readonly directive: RuleDirective;
	readonly pattern: string;
	readonly sourcePattern: string;
	readonly lineNumber: number;
	readonly priority: number;
}

interface UserAgentGroup {
	readonly agents: ReadonlySet<string>;
	readonly global: boolean;
	readonly rules: readonly Rule[];
}

export interface CompiledPolicyData {
	readonly policy: MatchingPolicy;
	readonly groups: readonly UserAgentGroup[];
}

interface MutableGroup {
	agents: Set<string>;
	global: boolean;
	rules: Rule[];
}

interface ScannedLine {
	readonly lineNumber: number;
	readonly bytes: Uint8Array;
	readonly tooLong: boolean;
}

interface InterpretedLine {
	readonly kind: ParsedDirectiveName | null;
	readonly value: string;
	readonly valueBytes: Uint8Array;
	readonly diagnostics: ParseDiagnostic[];
	readonly parseable: boolean;
	readonly effective: boolean;
}

interface ParseAccumulator {
	groups: UserAgentGroup[];
	currentGroup: MutableGroup | null;
	seenRule: boolean;
	lines: ParsedLine[] | null;
	lineCount: number;
	recognizedDirectiveCount: number;
	unsupportedDirectiveCount: number;
	unknownDirectiveCount: number;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder("utf-8", { ignoreBOM: true });

function isAsciiWhitespace(byte: number): boolean {
	return byte === 0x20 || (byte >= 0x09 && byte <= 0x0d);
}

function isSpaceOrTab(byte: number): boolean {
	return byte === 0x20 || byte === 0x09;
}

function trimWhitespace(bytes: Uint8Array, policy: MatchingPolicy): Uint8Array {
	let start = 0;
	let end = bytes.length;
	const isWhitespace = policy === "google" ? isAsciiWhitespace : isSpaceOrTab;
	while (start < end && isWhitespace(bytes[start])) start++;
	while (end > start && isWhitespace(bytes[end - 1])) end--;
	return bytes.slice(start, end);
}

function byteIndexOf(bytes: Uint8Array, target: number): number {
	for (let index = 0; index < bytes.length; index++) {
		if (bytes[index] === target) return index;
	}
	return -1;
}

function ascii(bytes: Uint8Array): string {
	let result = "";
	for (const byte of bytes) result += String.fromCharCode(byte);
	return result;
}

function display(bytes: Uint8Array): string {
	return decoder.decode(bytes);
}

function* scanLines(
	source: string,
	policy: MatchingPolicy,
): IterableIterator<ScannedLine> {
	const bytes = encoder.encode(source);
	const buffer: number[] = [];
	let lineNumber = 0;
	let lineTooLong = false;
	let lastWasCarriageReturn = false;
	let bomPosition = 0;
	let start = 0;

	if (
		policy === "rfc9309" &&
		bytes.length >= UTF8_BOM.length &&
		UTF8_BOM.every((byte, index) => bytes[index] === byte)
	) {
		start = UTF8_BOM.length;
	}

	for (let index = start; index < bytes.length; index++) {
		const byte = bytes[index];

		if (policy === "google" && bomPosition < UTF8_BOM.length) {
			if (byte === UTF8_BOM[bomPosition]) {
				bomPosition++;
				continue;
			}
			bomPosition = UTF8_BOM.length;
		}

		if (byte === 0x0a || byte === 0x0d) {
			const crlfContinuation =
				buffer.length === 0 && lastWasCarriageReturn && byte === 0x0a;
			if (!crlfContinuation) {
				lineNumber++;
				yield {
					lineNumber,
					bytes: Uint8Array.from(buffer),
					tooLong: lineTooLong,
				};
				lineTooLong = false;
			}
			buffer.length = 0;
			lastWasCarriageReturn = byte === 0x0d;
			continue;
		}

		if (policy !== "google" || buffer.length < GOOGLE_MAX_LINE_BYTES) {
			buffer.push(byte);
		} else {
			lineTooLong = true;
		}
		lastWasCarriageReturn = false;
	}

	lineNumber++;
	yield {
		lineNumber,
		bytes: Uint8Array.from(buffer),
		tooLong: lineTooLong,
	};
}

function isHex(byte: number): boolean {
	return (
		(byte >= 0x30 && byte <= 0x39) ||
		(byte >= 0x41 && byte <= 0x46) ||
		(byte >= 0x61 && byte <= 0x66)
	);
}

function hexValue(byte: number): number {
	if (byte <= 0x39) return byte - 0x30;
	return (byte & ~0x20) - 0x41 + 10;
}

function hexByte(byte: number): string {
	return `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
}

function isUnreserved(byte: number): boolean {
	return (
		(byte >= 0x41 && byte <= 0x5a) ||
		(byte >= 0x61 && byte <= 0x7a) ||
		(byte >= 0x30 && byte <= 0x39) ||
		byte === 0x2d ||
		byte === 0x2e ||
		byte === 0x5f ||
		byte === 0x7e
	);
}

function normalizeGooglePattern(bytes: Uint8Array): string {
	let result = "";
	for (let index = 0; index < bytes.length; index++) {
		const byte = bytes[index];
		if (
			byte === 0x25 &&
			index + 2 < bytes.length &&
			isHex(bytes[index + 1]) &&
			isHex(bytes[index + 2])
		) {
			result += "%";
			result += String.fromCharCode(bytes[index + 1]).toUpperCase();
			result += String.fromCharCode(bytes[index + 2]).toUpperCase();
			index += 2;
		} else if (byte >= 0x80) {
			result += hexByte(byte);
		} else {
			result += String.fromCharCode(byte);
		}
	}
	return result;
}

function normalizeRfcBytes(
	bytes: Uint8Array,
	encodeLiteralSpecials: boolean,
): string {
	let result = "";
	for (let index = 0; index < bytes.length; index++) {
		const byte = bytes[index];
		if (
			byte === 0x25 &&
			index + 2 < bytes.length &&
			isHex(bytes[index + 1]) &&
			isHex(bytes[index + 2])
		) {
			const decoded =
				hexValue(bytes[index + 1]) * 16 + hexValue(bytes[index + 2]);
			result += isUnreserved(decoded)
				? String.fromCharCode(decoded)
				: hexByte(decoded);
			index += 2;
		} else if (
			byte >= 0x80 ||
			(encodeLiteralSpecials && (byte === 0x2a || byte === 0x24))
		) {
			result += hexByte(byte);
		} else {
			result += String.fromCharCode(byte);
		}
	}
	return result;
}

function isValidRfcPattern(bytes: Uint8Array): boolean {
	if (bytes.length === 0) return true;
	if (bytes[0] !== 0x2f) return false;
	for (const byte of bytes) {
		if (byte <= 0x20 || byte === 0x23) return false;
	}
	return true;
}

function directiveKind(
	key: string,
	policy: MatchingPolicy,
): { kind: ParsedDirectiveName; typo: boolean } {
	const lower = key.toLowerCase();

	if (policy === "rfc9309") {
		if (lower === "user-agent") return { kind: "user-agent", typo: false };
		if (lower === "allow") return { kind: "allow", typo: false };
		if (lower === "disallow") return { kind: "disallow", typo: false };
		if (lower === "sitemap") return { kind: "sitemap", typo: false };
		return {
			kind: UNSUPPORTED_DIRECTIVES.has(lower) ? "unsupported" : "unknown",
			typo: false,
		};
	}

	if (lower.startsWith("user-agent")) {
		return { kind: "user-agent", typo: false };
	}
	if (lower.startsWith("useragent") || lower.startsWith("user agent")) {
		return { kind: "user-agent", typo: true };
	}
	if (lower.startsWith("allow")) return { kind: "allow", typo: false };
	if (lower.startsWith("disallow")) {
		return { kind: "disallow", typo: false };
	}
	if (
		["dissallow", "dissalow", "disalow", "diasllow", "disallaw"].some(
			(prefix) => lower.startsWith(prefix),
		)
	) {
		return { kind: "disallow", typo: true };
	}
	if (lower.startsWith("sitemap")) return { kind: "sitemap", typo: false };
	if (lower.startsWith("site-map")) return { kind: "sitemap", typo: true };
	return {
		kind: UNSUPPORTED_DIRECTIVES.has(lower) ? "unsupported" : "unknown",
		typo: false,
	};
}

function userAgentFrom(
	valueBytes: Uint8Array,
	policy: MatchingPolicy,
): string | "*" | null {
	const value = ascii(valueBytes);
	if (policy === "rfc9309") {
		if (value === "*") return "*";
		return /^[A-Za-z_-]+$/.test(value) ? value.toLowerCase() : null;
	}

	if (
		valueBytes.length >= 1 &&
		valueBytes[0] === 0x2a &&
		(valueBytes.length === 1 || isAsciiWhitespace(valueBytes[1]))
	) {
		return "*";
	}

	let end = 0;
	while (end < valueBytes.length) {
		const byte = valueBytes[end];
		const letter =
			(byte >= 0x41 && byte <= 0x5a) || (byte >= 0x61 && byte <= 0x7a);
		if (!letter && byte !== 0x2d && byte !== 0x5f) break;
		end++;
	}
	if (end === 0) return null;
	return ascii(valueBytes.slice(0, end)).toLowerCase();
}

function interpretLine(
	line: ScannedLine,
	policy: MatchingPolicy,
): InterpretedLine {
	const diagnostics: ParseDiagnostic[] = [];
	if (line.tooLong) diagnostics.push("line-too-long");

	let bytes = line.bytes;
	if (policy === "google") {
		const nul = byteIndexOf(bytes, 0);
		if (nul !== -1) bytes = bytes.slice(0, nul);
	}

	const comment = byteIndexOf(bytes, 0x23);
	if (comment !== -1) {
		diagnostics.push("comment");
		bytes = bytes.slice(0, comment);
	}
	bytes = trimWhitespace(bytes, policy);

	if (bytes.length === 0) {
		diagnostics.push(comment === -1 ? "empty" : "whole-line-comment");
		return {
			kind: null,
			value: "",
			valueBytes: new Uint8Array(),
			diagnostics,
			parseable: true,
			effective: false,
		};
	}

	let separator = byteIndexOf(bytes, 0x3a);
	let valueStart = -1;
	if (separator !== -1) {
		valueStart = separator + 1;
	} else if (policy === "google") {
		for (let index = 0; index < bytes.length; index++) {
			if (!isSpaceOrTab(bytes[index])) continue;
			separator = index;
			valueStart = index;
			while (valueStart < bytes.length && isSpaceOrTab(bytes[valueStart])) {
				valueStart++;
			}
			let extraWhitespace = false;
			for (let rest = valueStart; rest < bytes.length; rest++) {
				if (isSpaceOrTab(bytes[rest])) {
					extraWhitespace = true;
					break;
				}
			}
			if (valueStart >= bytes.length || extraWhitespace) {
				separator = -1;
				valueStart = -1;
			} else {
				diagnostics.push("missing-colon");
			}
			break;
		}
	}

	if (separator === -1 || valueStart === -1) {
		return {
			kind: null,
			value: "",
			valueBytes: new Uint8Array(),
			diagnostics,
			parseable: false,
			effective: false,
		};
	}

	const keyBytes = trimWhitespace(bytes.slice(0, separator), policy);
	if (keyBytes.length === 0) {
		return {
			kind: null,
			value: "",
			valueBytes: new Uint8Array(),
			diagnostics,
			parseable: false,
			effective: false,
		};
	}

	const valueBytes = trimWhitespace(bytes.slice(valueStart), policy);
	const classification = directiveKind(ascii(keyBytes), policy);
	if (classification.typo) diagnostics.push("acceptable-typo");

	let value = display(valueBytes);
	if (
		classification.kind === "allow" ||
		classification.kind === "disallow" ||
		(policy === "google" &&
			classification.kind !== "user-agent" &&
			classification.kind !== "sitemap")
	) {
		value =
			policy === "google"
				? normalizeGooglePattern(valueBytes)
				: normalizeRfcBytes(valueBytes, false);
	}

	let parseable = true;
	let effective = false;
	if (classification.kind === "user-agent") {
		parseable = userAgentFrom(valueBytes, policy) !== null;
		effective = parseable;
	} else if (
		classification.kind === "allow" ||
		classification.kind === "disallow"
	) {
		parseable = policy === "google" || isValidRfcPattern(valueBytes);
		effective = parseable && value.length > 0;
	}

	return {
		kind: classification.kind,
		value,
		valueBytes,
		diagnostics,
		parseable,
		effective,
	};
}

function rfcPriority(pattern: string): number {
	let octets = 0;
	for (let index = 0; index < pattern.length; index++) {
		const character = pattern[index];
		if (character === "*") continue;
		if (character === "$" && index === pattern.length - 1) continue;
		if (
			character === "%" &&
			index + 2 < pattern.length &&
			/^[0-9A-F]{2}$/.test(pattern.slice(index + 1, index + 3))
		) {
			index += 2;
		}
		octets++;
	}
	return octets;
}

function addRule(
	group: MutableGroup | null,
	directive: RuleDirective,
	pattern: string,
	sourcePattern: string,
	lineNumber: number,
	policy: MatchingPolicy,
): void {
	if (!group || pattern.length === 0) return;
	const priority = policy === "google" ? pattern.length : rfcPriority(pattern);
	group.rules.push({
		directive,
		pattern,
		sourcePattern,
		lineNumber,
		priority,
	});

	if (policy === "google" && directive === "allow") {
		const slash = pattern.lastIndexOf("/");
		if (slash !== -1 && pattern.slice(slash).startsWith("/index.htm")) {
			const directoryPattern = `${pattern.slice(0, slash + 1)}$`;
			group.rules.push({
				directive,
				pattern: directoryPattern,
				sourcePattern,
				lineNumber,
				priority: directoryPattern.length,
			});
		}
	}
}

function finalizeGroup(accumulator: ParseAccumulator): void {
	const group = accumulator.currentGroup;
	if (group && (group.global || group.agents.size > 0)) {
		accumulator.groups.push({
			agents: new Set(group.agents),
			global: group.global,
			rules: group.rules.slice(),
		});
	}
	accumulator.currentGroup = null;
}

function recordReportLine(
	accumulator: ParseAccumulator,
	line: ScannedLine,
	interpreted: InterpretedLine,
	effective: boolean,
): void {
	if (!accumulator.lines) return;
	let directive: ParsedDirective | null = null;
	if (interpreted.kind) {
		directive = {
			name: interpreted.kind,
			value: interpreted.value,
			effective,
		};
	}
	accumulator.lines.push({
		lineNumber: line.lineNumber,
		directive,
		diagnostics: interpreted.diagnostics.slice(),
	});
}

export function parsePolicy(
	source: string,
	policy: MatchingPolicy,
	collectReport: boolean,
): { data: CompiledPolicyData; report: RobotsReport | null } {
	const accumulator: ParseAccumulator = {
		groups: [],
		currentGroup: null,
		seenRule: false,
		lines: collectReport ? [] : null,
		lineCount: 0,
		recognizedDirectiveCount: 0,
		unsupportedDirectiveCount: 0,
		unknownDirectiveCount: 0,
	};

	for (const line of scanLines(source, policy)) {
		accumulator.lineCount = line.lineNumber;
		const interpreted = interpretLine(line, policy);
		const effective =
			(interpreted.kind === "allow" || interpreted.kind === "disallow") &&
			!accumulator.currentGroup
				? false
				: interpreted.effective;
		recordReportLine(accumulator, line, interpreted, effective);

		if (!interpreted.kind) continue;
		if (interpreted.kind === "unsupported") {
			accumulator.unsupportedDirectiveCount++;
			continue;
		}
		if (interpreted.kind === "unknown") {
			accumulator.unknownDirectiveCount++;
			continue;
		}
		accumulator.recognizedDirectiveCount++;

		if (interpreted.kind === "user-agent") {
			if (!interpreted.parseable) {
				if (policy === "google" && accumulator.seenRule) {
					finalizeGroup(accumulator);
					accumulator.seenRule = false;
				}
				continue;
			}
			if (accumulator.seenRule) {
				finalizeGroup(accumulator);
				accumulator.seenRule = false;
			}
			if (!accumulator.currentGroup) {
				accumulator.currentGroup = {
					agents: new Set(),
					global: false,
					rules: [],
				};
			}
			const agent = userAgentFrom(interpreted.valueBytes, policy);
			if (agent === "*") accumulator.currentGroup.global = true;
			else if (agent) accumulator.currentGroup.agents.add(agent);
			continue;
		}

		if (interpreted.kind === "allow" || interpreted.kind === "disallow") {
			if (!interpreted.parseable) continue;
			if (accumulator.currentGroup) accumulator.seenRule = true;
			addRule(
				accumulator.currentGroup,
				interpreted.kind,
				interpreted.value,
				display(interpreted.valueBytes),
				line.lineNumber,
				policy,
			);
		}
	}

	finalizeGroup(accumulator);
	const data: CompiledPolicyData = {
		policy,
		groups: accumulator.groups,
	};
	const report: RobotsReport | null = accumulator.lines
		? {
				policy,
				lineCount: accumulator.lineCount,
				recognizedDirectiveCount: accumulator.recognizedDirectiveCount,
				unsupportedDirectiveCount: accumulator.unsupportedDirectiveCount,
				unknownDirectiveCount: accumulator.unknownDirectiveCount,
				lines: accumulator.lines,
			}
		: null;

	return { data, report };
}

export function getPathParamsQuery(url: string): string {
	let searchStart = 0;
	if (url.length >= 2 && url[0] === "/" && url[1] === "/") searchStart = 2;

	const searchPart = url.slice(searchStart);
	let earlyPath = -1;
	for (let index = 0; index < searchPart.length; index++) {
		if ("/?;".includes(searchPart[index])) {
			earlyPath = searchStart + index;
			break;
		}
	}

	let protocolEnd = url.indexOf("://", searchStart);
	if (earlyPath !== -1 && earlyPath < protocolEnd) protocolEnd = -1;
	protocolEnd = protocolEnd === -1 ? searchStart : protocolEnd + 3;

	let pathStart = -1;
	for (let index = protocolEnd; index < url.length; index++) {
		if ("/?;".includes(url[index])) {
			pathStart = index;
			break;
		}
	}
	if (pathStart === -1) return "/";

	const hash = url.indexOf("#", searchStart);
	if (hash !== -1 && hash < pathStart) return "/";
	const pathEnd = hash === -1 ? url.length : hash;
	return url[pathStart] === "/"
		? url.slice(pathStart, pathEnd)
		: `/${url.slice(pathStart, pathEnd)}`;
}

function normalizeRfcPath(path: string): string {
	return normalizeRfcBytes(encoder.encode(path), true);
}

function matches(path: string, pattern: string): boolean {
	const positions: number[] = new Array(path.length + 1);
	positions[0] = 0;
	let count = 1;

	for (let patternIndex = 0; patternIndex < pattern.length; patternIndex++) {
		const character = pattern[patternIndex];
		if (character === "$" && patternIndex === pattern.length - 1) {
			return positions[count - 1] === path.length;
		}
		if (character === "*") {
			count = path.length - positions[0] + 1;
			for (let index = 1; index < count; index++) {
				positions[index] = positions[index - 1] + 1;
			}
			continue;
		}

		let nextCount = 0;
		for (let index = 0; index < count; index++) {
			if (
				positions[index] < path.length &&
				path[positions[index]] === character
			) {
				positions[nextCount++] = positions[index] + 1;
			}
		}
		if (nextCount === 0) return false;
		count = nextCount;
	}
	return true;
}

export interface SelectedRuleSet {
	readonly kind: SelectedRules;
	readonly rules: readonly Rule[];
}

export function selectRules(
	data: CompiledPolicyData,
	identity: string,
): SelectedRuleSet {
	const specific = data.groups.filter((group) => group.agents.has(identity));
	if (specific.length > 0) {
		return {
			kind: "specific",
			rules: specific.flatMap((group) => group.rules),
		};
	}

	const global = data.groups.filter((group) => group.global);
	if (global.length > 0) {
		return {
			kind: "global",
			rules: global.flatMap((group) => group.rules),
		};
	}

	return { kind: "none", rules: [] };
}

function isRobotsPath(path: string): boolean {
	return path === "/robots.txt";
}

export function decide(
	policy: MatchingPolicy,
	selected: SelectedRuleSet,
	url: string,
): MatchDecision {
	const extractedPath = getPathParamsQuery(url);
	const path =
		policy === "rfc9309" ? normalizeRfcPath(extractedPath) : extractedPath;

	if (policy === "rfc9309" && isRobotsPath(path)) {
		return {
			url,
			path,
			allowed: true,
			selectedRules: selected.kind,
			evidence: { kind: "default-allow", reason: "robots-txt" },
		};
	}

	let bestAllow: Rule | null = null;
	let bestDisallow: Rule | null = null;
	for (const rule of selected.rules) {
		if (!matches(path, rule.pattern)) continue;
		if (rule.directive === "allow") {
			if (!bestAllow || rule.priority > bestAllow.priority) bestAllow = rule;
		} else if (!bestDisallow || rule.priority > bestDisallow.priority) {
			bestDisallow = rule;
		}
	}

	const winner =
		bestAllow && (!bestDisallow || bestAllow.priority >= bestDisallow.priority)
			? bestAllow
			: bestDisallow;
	const allowed = !winner || winner.directive === "allow";

	if (winner) {
		return {
			url,
			path,
			allowed,
			selectedRules: selected.kind,
			evidence: {
				kind: "rule",
				directive: winner.directive,
				pattern: winner.sourcePattern,
				lineNumber: winner.lineNumber,
			},
		};
	}

	const reason =
		selected.kind === "none"
			? "no-group"
			: selected.rules.length === 0
				? "empty-group"
				: "no-match";
	return {
		url,
		path,
		allowed: true,
		selectedRules: selected.kind,
		evidence: { kind: "default-allow", reason },
	};
}
