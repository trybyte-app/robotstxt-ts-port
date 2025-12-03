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

import { K_UNSUPPORTED_TAGS } from "./constants.js";
import {
	RobotsParseHandler,
	RobotsTagName,
	createRobotsParsedLine,
	type LineMetadata,
	type RobotsParsedLine,
} from "./types.js";

/**
 * RobotsParsingReporter - A parse handler that collects detailed information
 * about each line parsed from a robots.txt file.
 *
 * This is useful for analysis, debugging, or building tools that provide
 * feedback about robots.txt content.
 */
export class RobotsParsingReporter extends RobotsParseHandler {
	/** Indexed and sorted by line number */
	private robotsParseResults: Map<number, RobotsParsedLine> = new Map();
	private lastLineSeenValue: number = 0;
	private validDirectivesValue: number = 0;
	private unusedDirectivesValue: number = 0;

	/**
	 * Get the last line number seen during parsing.
	 */
	public lastLineSeen(): number {
		return this.lastLineSeenValue;
	}

	/**
	 * Get the count of valid directives found.
	 */
	public validDirectives(): number {
		return this.validDirectivesValue;
	}

	/**
	 * Get the count of unused/unsupported directives found.
	 */
	public unusedDirectives(): number {
		return this.unusedDirectivesValue;
	}

	/**
	 * Get the parse results as an array sorted by line number.
	 */
	public parseResults(): RobotsParsedLine[] {
		const results: RobotsParsedLine[] = [];
		const sortedKeys = Array.from(this.robotsParseResults.keys()).sort(
			(a, b) => a - b,
		);
		for (const key of sortedKeys) {
			const line = this.robotsParseResults.get(key);
			if (line) {
				results.push(line);
			}
		}
		return results;
	}

	private digest(lineNum: number, parsedTag: RobotsTagName): void {
		if (lineNum > this.lastLineSeenValue) {
			this.lastLineSeenValue = lineNum;
		}

		if (
			parsedTag !== RobotsTagName.Unknown &&
			parsedTag !== RobotsTagName.Unused
		) {
			this.validDirectivesValue++;
		}

		let line = this.robotsParseResults.get(lineNum);
		if (!line) {
			line = createRobotsParsedLine();
			this.robotsParseResults.set(lineNum, line);
		}
		line.lineNum = lineNum;
		line.tagName = parsedTag;
	}

	public handleRobotsStart(): void {
		this.lastLineSeenValue = 0;
		this.validDirectivesValue = 0;
		this.unusedDirectivesValue = 0;
		this.robotsParseResults.clear();
	}

	public handleRobotsEnd(): void {
		// Nothing to do
	}

	public handleUserAgent(lineNum: number, _lineValue: string): void {
		this.digest(lineNum, RobotsTagName.UserAgent);
	}

	public handleAllow(lineNum: number, _lineValue: string): void {
		this.digest(lineNum, RobotsTagName.Allow);
	}

	public handleDisallow(lineNum: number, _lineValue: string): void {
		this.digest(lineNum, RobotsTagName.Disallow);
	}

	public handleSitemap(lineNum: number, _lineValue: string): void {
		this.digest(lineNum, RobotsTagName.Sitemap);
	}

	public handleUnknownAction(
		lineNum: number,
		action: string,
		_lineValue: string,
	): void {
		// Check if it's a recognized but unsupported tag
		const lowerAction = action.toLowerCase();
		const isUnsupported = K_UNSUPPORTED_TAGS.some((tag) => tag === lowerAction);

		const tagName = isUnsupported
			? RobotsTagName.Unused
			: RobotsTagName.Unknown;

		this.unusedDirectivesValue++;
		this.digest(lineNum, tagName);
	}

	public reportLineMetadata(lineNum: number, metadata: LineMetadata): void {
		if (lineNum > this.lastLineSeenValue) {
			this.lastLineSeenValue = lineNum;
		}

		let line = this.robotsParseResults.get(lineNum);
		if (!line) {
			line = createRobotsParsedLine();
			this.robotsParseResults.set(lineNum, line);
		}
		line.lineNum = lineNum;
		line.isTypo = metadata.isAcceptableTypo;
		line.metadata = { ...metadata };
	}
}
