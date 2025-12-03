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

import { K_MAX_LINE_LEN, UTF8_BOM } from "./constants.js";
import { ParsedRobotsKey } from "./parsed-key.js";
import {
	KeyType,
	RobotsParseHandler,
	createLineMetadata,
	type LineMetadata,
} from "./types.js";
import { maybeEscapePattern } from "./url-utils.js";

/**
 * Result of parsing a key-value pair from a line.
 */
interface KeyValueResult {
	key: string;
	value: string;
	metadata: LineMetadata;
}

/**
 * Internal parser class for robots.txt files.
 */
class RobotsTxtParser {
	private readonly robotsBody: string;
	private readonly handler: RobotsParseHandler;
	private readonly parsedKey: ParsedRobotsKey;

	constructor(robotsBody: string, handler: RobotsParseHandler) {
		this.robotsBody = robotsBody;
		this.handler = handler;
		this.parsedKey = new ParsedRobotsKey();
	}

	/**
	 * Check if value escaping is needed for the given key type.
	 */
	private needEscapeValueForKey(keyType: KeyType): boolean {
		switch (keyType) {
			case KeyType.USER_AGENT:
			case KeyType.SITEMAP:
				return false;
			default:
				return true;
		}
	}

	/**
	 * Extract key and value from a line.
	 */
	private getKeyAndValueFrom(line: string): KeyValueResult {
		const metadata = createLineMetadata();

		// Remove comments from the current robots.txt line.
		let processedLine = line;
		const commentPos = line.indexOf("#");
		if (commentPos !== -1) {
			metadata.hasComment = true;
			processedLine = line.slice(0, commentPos);
		}

		// Trim whitespace
		processedLine = processedLine.trim();

		// If the line became empty after removing the comment, return.
		if (processedLine.length === 0) {
			if (metadata.hasComment) {
				metadata.isComment = true;
			} else {
				metadata.isEmpty = true;
			}
			return { key: "", value: "", metadata };
		}

		// Rules must match the following pattern:
		//   <key>[ \t]*:[ \t]*<value>
		let sepPos = processedLine.indexOf(":");

		if (sepPos === -1) {
			// Google-specific optimization: some people forget the colon, so we need to
			// accept whitespace in its stead.
			const parts = processedLine.split(/[ \t]+/);
			if (parts.length === 2) {
				// We only accept whitespace as a separator if there are exactly two
				// sequences of non-whitespace characters.
				metadata.isMissingColonSeparator = true;
				metadata.hasDirective = true;
				return {
					key: parts[0],
					value: parts[1],
					metadata,
				};
			}
			// Couldn't find a valid separator
			return { key: "", value: "", metadata };
		}

		// Extract key and value
		const key = processedLine.slice(0, sepPos).trim();
		const value = processedLine.slice(sepPos + 1).trim();

		if (key.length > 0) {
			metadata.hasDirective = true;
			return { key, value, metadata };
		}

		return { key: "", value: "", metadata };
	}

	/**
	 * Emit key-value pair to handler.
	 */
	private emitKeyValueToHandler(
		lineNum: number,
		keyType: KeyType,
		value: string,
		unknownText?: string,
	): void {
		switch (keyType) {
			case KeyType.USER_AGENT:
				this.handler.handleUserAgent(lineNum, value);
				break;
			case KeyType.ALLOW:
				this.handler.handleAllow(lineNum, value);
				break;
			case KeyType.DISALLOW:
				this.handler.handleDisallow(lineNum, value);
				break;
			case KeyType.SITEMAP:
				this.handler.handleSitemap(lineNum, value);
				break;
			case KeyType.UNKNOWN:
				this.handler.handleUnknownAction(lineNum, unknownText || "", value);
				break;
		}
	}

	/**
	 * Parse and emit a single line.
	 */
	private parseAndEmitLine(
		lineNum: number,
		line: string,
		lineTooLong: boolean,
	): void {
		const { key, value, metadata } = this.getKeyAndValueFrom(line);
		metadata.isLineTooLong = lineTooLong;

		if (!metadata.hasDirective) {
			this.handler.reportLineMetadata(lineNum, metadata);
			return;
		}

		const keyResult = this.parsedKey.parse(key);
		metadata.isAcceptableTypo = keyResult.isAcceptableTypo;

		if (this.needEscapeValueForKey(keyResult.type)) {
			const { escaped } = maybeEscapePattern(value);
			this.emitKeyValueToHandler(
				lineNum,
				keyResult.type,
				escaped,
				keyResult.unknownText,
			);
		} else {
			this.emitKeyValueToHandler(
				lineNum,
				keyResult.type,
				value,
				keyResult.unknownText,
			);
		}

		this.handler.reportLineMetadata(lineNum, metadata);
	}

	/**
	 * Parse the robots.txt body.
	 */
	parse(): void {
		let lineBuffer = "";
		let lineNum = 0;
		let bomPos = 0;
		let lastWasCarriageReturn = false;
		let lineTooLong = false;

		this.handler.handleRobotsStart();

		// Process each byte
		for (let i = 0; i < this.robotsBody.length; i++) {
			const ch = this.robotsBody.charCodeAt(i);

			// Google-specific optimization: UTF-8 byte order marks should never
			// appear in a robots.txt file, but they do nevertheless. Skipping
			// possible BOM-prefix in the first bytes of the input.
			if (bomPos < UTF8_BOM.length && ch === UTF8_BOM[bomPos]) {
				bomPos++;
				continue;
			}
			bomPos = UTF8_BOM.length; // Disable BOM check after mismatch

			const char = this.robotsBody[i];

			// Line ending check: LF (0x0A) or CR (0x0D)
			if (ch === 0x0a || ch === 0x0d) {
				// Only emit an empty line if this was not due to the second character
				// of the DOS line-ending \r\n
				const isCRLFContinuation =
					lineBuffer.length === 0 && lastWasCarriageReturn && ch === 0x0a;

				if (!isCRLFContinuation) {
					lineNum++;
					this.parseAndEmitLine(lineNum, lineBuffer, lineTooLong);
					lineTooLong = false;
				}

				lineBuffer = "";
				lastWasCarriageReturn = ch === 0x0d;
			} else {
				// Non-line-ending char case
				// Put in next spot on current line, as long as there's room.
				// Note: K_MAX_LINE_LEN - 1 to match C++ behavior (reserve space for null terminator)
				if (lineBuffer.length < K_MAX_LINE_LEN - 1) {
					lineBuffer += char;
				} else {
					lineTooLong = true;
				}
				lastWasCarriageReturn = false;
			}
		}

		// Handle final line (always emit, matching C++ behavior)
		lineNum++;
		this.parseAndEmitLine(lineNum, lineBuffer, lineTooLong);

		this.handler.handleRobotsEnd();
	}
}

/**
 * Parses body of a robots.txt and emits parse callbacks. This will accept
 * typical typos found in robots.txt, such as 'disalow'.
 *
 * Note, this function will accept all kind of input but will skip
 * everything that does not look like a robots directive.
 *
 * @param robotsBody - The robots.txt content to parse
 * @param handler - The handler to receive parse callbacks
 */
export function parseRobotsTxt(
	robotsBody: string,
	handler: RobotsParseHandler,
): void {
	const parser = new RobotsTxtParser(robotsBody, handler);
	parser.parse();
}
