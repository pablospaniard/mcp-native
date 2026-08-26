import { JSON_MAX_DEPTH, JSON_MAX_VALUES } from "@mcp-native/core";
import type { JsonObject, JsonValue } from "@mcp-native/core";

import { A2uiParseError } from "../errors.js";

export interface A2uiV1ParsedFormatString {
  readonly expressionCount: number;
  readonly expressions: readonly JsonValue[];
}

interface Interpolation {
  readonly content: string;
  readonly end: number;
  readonly offset: number;
}

const IDENTIFIER = /^[\p{XID_Start}_][\p{XID_Continue}]*$/u;
const JSON_NUMBER = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?$/;

/** Parses the expression language embedded in one pinned-catalog formatString value. */
export function parseA2uiV1FormatString(source: string, path: string): A2uiV1ParsedFormatString {
  const parser = new FormatStringParser(path);
  return parser.parse(source);
}

class FormatStringParser {
  readonly #path: string;
  #expressionCount = 0;

  constructor(path: string) {
    this.#path = path;
  }

  parse(source: string): A2uiV1ParsedFormatString {
    const expressions: JsonValue[] = [];
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== "$" || source[index + 1] !== "{" || isEscaped(source, index)) {
        continue;
      }
      const interpolation = this.#readInterpolation(source, index);
      expressions.push(this.#parseExpression(interpolation.content, interpolation.offset, 1));
      index = interpolation.end - 1;
    }
    return {
      expressionCount: this.#expressionCount,
      expressions,
    };
  }

  #parseExpression(source: string, offset: number, depth: number): JsonValue {
    this.#expressionCount += 1;
    if (this.#expressionCount > JSON_MAX_VALUES) {
      this.#fail(`exceeds maximum of ${JSON_MAX_VALUES} interpolation expressions`, offset);
    }
    if (depth > JSON_MAX_DEPTH) {
      this.#fail(`exceeds maximum expression depth of ${JSON_MAX_DEPTH}`, offset);
    }

    const expression = source.trim();
    if (expression.length === 0) {
      this.#fail("contains an empty interpolation expression", offset);
    }
    if (expression.startsWith("${")) {
      const interpolation = this.#readInterpolation(expression, 0);
      if (expression.slice(interpolation.end).trim().length !== 0) {
        this.#fail("contains trailing content after a nested expression", offset);
      }
      return this.#parseExpression(interpolation.content, offset + interpolation.offset, depth + 1);
    }
    if (expression[0] === '"' || expression[0] === "'") {
      return parseQuotedLiteral(expression, this.#path, offset);
    }
    if (expression === "true") {
      return true;
    }
    if (expression === "false") {
      return false;
    }
    if (expression === "null") {
      return null;
    }
    if (JSON_NUMBER.test(expression)) {
      const value = Number(expression);
      if (!Number.isFinite(value)) {
        this.#fail("contains a non-finite numeric literal", offset);
      }
      return value;
    }
    const openParenthesis = findFirstParenthesis(expression);
    if (openParenthesis === -1) {
      return { path: expression };
    }

    const functionName = expression.slice(0, openParenthesis).trim();
    if (!isFunctionIdentifier(functionName)) {
      return { path: expression };
    }
    const closeParenthesis = findClosingParenthesis(expression, openParenthesis, this.#path);
    if (expression.slice(closeParenthesis + 1).trim().length !== 0) {
      this.#fail("contains trailing content after a function call", offset);
    }

    const args = this.#parseArguments(
      expression.slice(openParenthesis + 1, closeParenthesis),
      offset + openParenthesis + 1,
      depth,
    );
    return {
      call: functionName,
      ...(Object.keys(args).length === 0 ? {} : { args }),
    };
  }

  #parseArguments(source: string, offset: number, depth: number): JsonObject {
    const args: Record<string, JsonValue> = {};
    if (source.trim().length === 0) {
      return args;
    }
    for (const segment of splitTopLevel(source, ",", this.#path)) {
      const separator = findTopLevelCharacter(segment.value, ":", this.#path);
      if (separator === -1) {
        this.#fail("requires every function argument to be named", offset + segment.offset);
      }
      const name = segment.value.slice(0, separator).trim();
      if (!IDENTIFIER.test(name)) {
        this.#fail(
          `contains invalid argument name ${JSON.stringify(name)}`,
          offset + segment.offset,
        );
      }
      if (Object.hasOwn(args, name)) {
        this.#fail(`contains duplicate argument ${JSON.stringify(name)}`, offset + segment.offset);
      }
      const valueSource = segment.value.slice(separator + 1).trim();
      if (valueSource.length === 0) {
        this.#fail(
          `contains an empty value for argument ${JSON.stringify(name)}`,
          offset + segment.offset,
        );
      }
      defineJsonProperty(
        args,
        name,
        this.#parseArgumentValue(valueSource, offset + segment.offset + separator + 1, depth + 1),
      );
    }
    return args;
  }

  #parseArgumentValue(source: string, offset: number, depth: number): JsonValue {
    if (source.startsWith("${")) {
      const interpolation = this.#readInterpolation(source, 0);
      if (source.slice(interpolation.end).trim().length !== 0) {
        this.#fail("contains trailing content after a nested expression", offset);
      }
      return this.#parseExpression(interpolation.content, offset + interpolation.offset, depth);
    }
    if (source[0] === '"' || source[0] === "'") {
      return parseQuotedLiteral(source, this.#path, offset);
    }
    if (source === "true") {
      return true;
    }
    if (source === "false") {
      return false;
    }
    if (JSON_NUMBER.test(source)) {
      const value = Number(source);
      if (!Number.isFinite(value)) {
        this.#fail("contains a non-finite numeric literal", offset);
      }
      return value;
    }
    this.#fail(`contains unsupported argument literal ${JSON.stringify(source)}`, offset);
  }

  #readInterpolation(source: string, start: number): Interpolation {
    let nesting = 1;
    let quote: '"' | "'" | undefined;
    let escaped = false;
    for (let index = start + 2; index < source.length; index += 1) {
      const character = source[index]!;
      if (quote !== undefined) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = undefined;
        }
        continue;
      }
      if (character === '"' || character === "'") {
        quote = character;
        continue;
      }
      if (character === "$" && source[index + 1] === "{" && !isEscaped(source, index)) {
        nesting += 1;
        index += 1;
        continue;
      }
      if (character === "}") {
        nesting -= 1;
        if (nesting === 0) {
          return {
            content: source.slice(start + 2, index),
            end: index + 1,
            offset: start + 2,
          };
        }
      }
    }
    this.#fail("contains an unterminated interpolation expression", start);
  }

  #fail(message: string, offset: number): never {
    throw new A2uiParseError(`A2UI formatString at ${this.#path} ${message} near offset ${offset}`);
  }
}

function findFirstParenthesis(source: string): number {
  for (let index = 0; index < source.length; index += 1) {
    if (source[index] === "(") {
      return index;
    }
  }
  return -1;
}

function findClosingParenthesis(source: string, open: number, path: string): number {
  let depth = 1;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = open + 1; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
    } else if (character === "(") {
      depth += 1;
    } else if (character === ")") {
      depth -= 1;
      if (depth === 0) {
        return index;
      }
    }
  }
  throw new A2uiParseError(`A2UI formatString at ${path} contains an unclosed function call`);
}

interface Segment {
  readonly offset: number;
  readonly value: string;
}

function splitTopLevel(source: string, separator: string, path: string): readonly Segment[] {
  const segments: Segment[] = [];
  let start = 0;
  walkTopLevel(source, path, (character, index, isTopLevel) => {
    if (isTopLevel && character === separator) {
      segments.push({ offset: start, value: source.slice(start, index) });
      start = index + 1;
    }
  });
  segments.push({ offset: start, value: source.slice(start) });
  return segments;
}

function findTopLevelCharacter(source: string, target: string, path: string): number {
  let result = -1;
  walkTopLevel(source, path, (character, index, isTopLevel) => {
    if (result === -1 && isTopLevel && character === target) {
      result = index;
    }
  });
  return result;
}

function walkTopLevel(
  source: string,
  path: string,
  visit: (character: string, index: number, isTopLevel: boolean) => void,
): void {
  let interpolationDepth = 0;
  let parenthesisDepth = 0;
  let quote: '"' | "'" | undefined;
  let escaped = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!;
    if (quote !== undefined) {
      if (escaped) {
        escaped = false;
      } else if (character === "\\") {
        escaped = true;
      } else if (character === quote) {
        quote = undefined;
      }
      visit(character, index, false);
      continue;
    }
    if (character === '"' || character === "'") {
      quote = character;
      visit(character, index, false);
      continue;
    }
    if (character === "$" && source[index + 1] === "{") {
      interpolationDepth += 1;
      visit(character, index, false);
      index += 1;
      continue;
    }
    if (character === "}" && interpolationDepth > 0) {
      interpolationDepth -= 1;
      visit(character, index, false);
      continue;
    }
    if (character === "(" && interpolationDepth === 0) {
      parenthesisDepth += 1;
    } else if (character === ")" && interpolationDepth === 0) {
      parenthesisDepth -= 1;
      if (parenthesisDepth < 0) {
        throw new A2uiParseError(`A2UI formatString at ${path} contains an unmatched ")"`);
      }
    }
    visit(character, index, interpolationDepth === 0 && parenthesisDepth === 0);
  }
  if (quote !== undefined || interpolationDepth !== 0 || parenthesisDepth !== 0) {
    throw new A2uiParseError(`A2UI formatString at ${path} contains unbalanced argument syntax`);
  }
}

function parseQuotedLiteral(source: string, path: string, offset: number): string {
  const quote = source[0]!;
  let result = "";
  for (let index = 1; index < source.length; index += 1) {
    const character = source[index]!;
    if (character === quote) {
      if (source.slice(index + 1).trim().length !== 0) {
        throw new A2uiParseError(
          `A2UI formatString at ${path} contains trailing quoted-literal content near offset ${offset}`,
        );
      }
      return result;
    }
    if (character.charCodeAt(0) < 0x20) {
      throw new A2uiParseError(
        `A2UI formatString at ${path} contains a control character near offset ${offset + index}`,
      );
    }
    if (character !== "\\") {
      result += character;
      continue;
    }
    const escaped = source[index + 1];
    if (escaped === undefined) {
      break;
    }
    index += 1;
    switch (escaped) {
      case "\\":
      case "/":
        result += escaped;
        break;
      case '"':
        result += '"';
        break;
      case "'":
        result += "'";
        break;
      case "b":
        result += "\b";
        break;
      case "f":
        result += "\f";
        break;
      case "n":
        result += "\n";
        break;
      case "r":
        result += "\r";
        break;
      case "t":
        result += "\t";
        break;
      case "u": {
        const digits = source.slice(index + 1, index + 5);
        if (!/^[0-9a-fA-F]{4}$/.test(digits)) {
          throw new A2uiParseError(
            `A2UI formatString at ${path} contains an invalid Unicode escape near offset ${offset + index}`,
          );
        }
        result += String.fromCharCode(Number.parseInt(digits, 16));
        index += 4;
        break;
      }
      default:
        throw new A2uiParseError(
          `A2UI formatString at ${path} contains unsupported escape ${JSON.stringify(`\\${escaped}`)} near offset ${offset + index}`,
        );
    }
  }
  throw new A2uiParseError(
    `A2UI formatString at ${path} contains an unterminated quoted literal near offset ${offset}`,
  );
}

function isFunctionIdentifier(value: string): boolean {
  return value === "@index" || IDENTIFIER.test(value);
}

function isEscaped(source: string, index: number): boolean {
  let backslashes = 0;
  for (let cursor = index - 1; cursor >= 0 && source[cursor] === "\\"; cursor -= 1) {
    backslashes += 1;
  }
  return backslashes % 2 === 1;
}

function defineJsonProperty(
  object: Record<string, JsonValue>,
  key: string,
  value: JsonValue,
): void {
  Object.defineProperty(object, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}
