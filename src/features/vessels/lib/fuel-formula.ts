/**
 * The safe expression language of first fuel formulas (spec §13.5, §15.4), mirrored from the
 * fleet service (`services/fleet/src/domain/fuel-formula.ts`) so the form refuses what the API
 * would refuse — same grammar, same limits (500 characters, 32 nesting levels), same messages —
 * and can preview a formula at a speed. Nothing is ever evaluated with `eval`/`new Function`.
 *
 * ```text
 * formula  = sum
 * sum      = product { ("+" | "-") product }
 * product  = unary { ("*" | "/") unary }
 * unary    = ("+" | "-") unary | power
 * power    = primary [ ("**" | "^") unary ]            right-associative; ^ means power
 * primary  = number | "speedKnot" | call | "(" sum ")"
 * call     = [ "Math." ] ( exp | log | ln | sqrt | pow | abs | min | max ) "(" sum { "," sum } ")"
 * ```
 *
 * @method fuel.first_formula
 */

export const FUEL_FORMULA_MAX_LENGTH = 500;
export const FUEL_FORMULA_MAX_DEPTH = 32;
export const FUEL_FORMULA_VARIABLE = 'speedKnot';

export const FUEL_FORMULA_FUNCTIONS = Object.freeze({
  exp: 1,
  log: 1,
  ln: 1,
  sqrt: 1,
  pow: 2,
  abs: 1,
  min: 'variadic',
  max: 'variadic',
} as const);

export type FuelFormulaFunction = keyof typeof FUEL_FORMULA_FUNCTIONS;

export type FuelFormulaNode =
  | { readonly kind: 'number'; readonly value: number }
  | { readonly kind: 'variable' }
  | { readonly kind: 'unary'; readonly operator: '+' | '-'; readonly operand: FuelFormulaNode }
  | {
      readonly kind: 'binary';
      readonly operator: '+' | '-' | '*' | '/' | '^';
      readonly left: FuelFormulaNode;
      readonly right: FuelFormulaNode;
    }
  | {
      readonly kind: 'call';
      readonly name: FuelFormulaFunction;
      readonly args: readonly FuelFormulaNode[];
    };

/** Why a formula is not in the grammar (`position` = 0-based character offset). */
export type FuelFormulaIssue =
  | { readonly code: 'tooLong'; readonly position: number }
  | { readonly code: 'empty'; readonly position: number }
  | { readonly code: 'unexpectedCharacter'; readonly position: number; readonly text: string }
  | { readonly code: 'unknownIdentifier'; readonly position: number; readonly text: string }
  | {
      readonly code: 'arity';
      readonly position: number;
      readonly text: string;
      readonly expected: number;
      readonly actual: number;
    }
  | { readonly code: 'tooDeep'; readonly position: number }
  | { readonly code: 'numberOutOfRange'; readonly position: number; readonly text: string }
  | { readonly code: 'expected'; readonly position: number; readonly text: string }
  | { readonly code: 'unexpectedToken'; readonly position: number; readonly text: string }
  | { readonly code: 'unexpectedEnd'; readonly position: number };

class FormulaError extends Error {
  readonly issue: FuelFormulaIssue;

  constructor(issue: FuelFormulaIssue) {
    super(issue.code);
    this.issue = issue;
  }
}

type TokenKind = 'number' | 'identifier' | 'operator' | '(' | ')' | ',' | 'end';

interface Token {
  readonly kind: TokenKind;
  readonly text: string;
  readonly position: number;
}

const NUMBER_PATTERN = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/;
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/;
const WHITESPACE = /\s/;

function isFunctionName(name: string): name is FuelFormulaFunction {
  return Object.hasOwn(FUEL_FORMULA_FUNCTIONS, name);
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const character = source.charAt(index);
    if (WHITESPACE.test(character)) {
      index += 1;
      continue;
    }
    const rest = source.slice(index);
    const number = NUMBER_PATTERN.exec(rest);
    if (number) {
      tokens.push({ kind: 'number', text: number[0], position: index });
      index += number[0].length;
      continue;
    }
    const identifier = IDENTIFIER_PATTERN.exec(rest);
    if (identifier) {
      tokens.push({ kind: 'identifier', text: identifier[0], position: index });
      index += identifier[0].length;
      continue;
    }
    if (rest.startsWith('**')) {
      tokens.push({ kind: 'operator', text: '**', position: index });
      index += 2;
      continue;
    }
    if ('+-*/^'.includes(character)) {
      tokens.push({ kind: 'operator', text: character, position: index });
    } else if (character === '(' || character === ')' || character === ',') {
      tokens.push({ kind: character, text: character, position: index });
    } else {
      throw new FormulaError({ code: 'unexpectedCharacter', position: index, text: character });
    }
    index += 1;
  }
  tokens.push({ kind: 'end', text: '', position: source.length });
  return tokens;
}

class Parser {
  private index = 0;
  private depth = 0;
  private readonly tokens: readonly Token[];

  constructor(tokens: readonly Token[]) {
    this.tokens = tokens;
  }

  parse(): FuelFormulaNode {
    const node = this.sum();
    const next = this.peek();
    if (next.kind !== 'end') throw this.unexpected(next);
    return node;
  }

  private sum(): FuelFormulaNode {
    let left = this.product();
    for (;;) {
      const operator = this.operator(['+', '-']);
      if (!operator) return left;
      left = { kind: 'binary', operator: operator as '+' | '-', left, right: this.product() };
    }
  }

  private product(): FuelFormulaNode {
    let left = this.unary();
    for (;;) {
      const operator = this.operator(['*', '/']);
      if (!operator) return left;
      left = { kind: 'binary', operator: operator as '*' | '/', left, right: this.unary() };
    }
  }

  private unary(): FuelFormulaNode {
    const operator = this.operator(['+', '-']);
    if (!operator) return this.power();
    return this.nested(() => ({
      kind: 'unary',
      operator: operator as '+' | '-',
      operand: this.unary(),
    }));
  }

  private power(): FuelFormulaNode {
    const base = this.primary();
    if (!this.operator(['**', '^'])) return base;
    return { kind: 'binary', operator: '^', left: base, right: this.nested(() => this.unary()) };
  }

  private primary(): FuelFormulaNode {
    const token = this.advance();
    if (token.kind === 'number') {
      const value = Number(token.text);
      if (!Number.isFinite(value)) {
        throw new FormulaError({
          code: 'numberOutOfRange',
          position: token.position,
          text: token.text,
        });
      }
      return { kind: 'number', value };
    }
    if (token.kind === 'identifier') return this.identifier(token);
    if (token.kind === '(') {
      const inner = this.nested(() => this.sum());
      this.expect(')');
      return inner;
    }
    throw this.unexpected(token);
  }

  private identifier(token: Token): FuelFormulaNode {
    if (token.text === FUEL_FORMULA_VARIABLE) return { kind: 'variable' };
    const name = token.text.startsWith('Math.') ? token.text.slice('Math.'.length) : token.text;
    if (!isFunctionName(name)) {
      throw new FormulaError({
        code: 'unknownIdentifier',
        position: token.position,
        text: token.text,
      });
    }
    this.expect('(');
    const args = this.nested(() => {
      const list = [this.sum()];
      while (this.peek().kind === ',') {
        this.advance();
        list.push(this.sum());
      }
      return list;
    });
    this.expect(')');
    const arity = FUEL_FORMULA_FUNCTIONS[name];
    if (arity !== 'variadic' && args.length !== arity) {
      throw new FormulaError({
        code: 'arity',
        position: token.position,
        text: name,
        expected: arity,
        actual: args.length,
      });
    }
    return { kind: 'call', name, args };
  }

  private nested<T>(parse: () => T): T {
    this.depth += 1;
    if (this.depth > FUEL_FORMULA_MAX_DEPTH) {
      throw new FormulaError({ code: 'tooDeep', position: this.peek().position });
    }
    try {
      return parse();
    } finally {
      this.depth -= 1;
    }
  }

  private operator(operators: readonly string[]): string | undefined {
    const token = this.peek();
    if (token.kind !== 'operator' || !operators.includes(token.text)) return undefined;
    this.advance();
    return token.text === '**' ? '^' : token.text;
  }

  private expect(kind: TokenKind): void {
    const token = this.advance();
    if (token.kind === kind) return;
    throw new FormulaError({ code: 'expected', position: token.position, text: kind });
  }

  private peek(): Token {
    return this.tokens[this.index] ?? this.tokens[this.tokens.length - 1]!;
  }

  private advance(): Token {
    const token = this.peek();
    if (token.kind !== 'end') this.index += 1;
    return token;
  }

  private unexpected(token: Token): FormulaError {
    return token.kind === 'end'
      ? new FormulaError({ code: 'unexpectedEnd', position: token.position })
      : new FormulaError({ code: 'unexpectedToken', position: token.position, text: token.text });
  }
}

export type FuelFormulaCheck =
  | { readonly valid: true; readonly ast: FuelFormulaNode }
  | { readonly valid: false; readonly issue: FuelFormulaIssue };

/**
 * Parses a first-fuel-formula string (fuel flow of an engine group as a function of
 * `speedKnot`) and reports the first problem, like the fleet service on write.
 *
 * @method fuel.first_formula
 */
export function checkFuelFormula(source: string): FuelFormulaCheck {
  if (source.length > FUEL_FORMULA_MAX_LENGTH) {
    return { valid: false, issue: { code: 'tooLong', position: FUEL_FORMULA_MAX_LENGTH } };
  }
  if (source.trim() === '') return { valid: false, issue: { code: 'empty', position: 0 } };
  try {
    return { valid: true, ast: new Parser(tokenize(source)).parse() };
  } catch (error) {
    if (error instanceof FormulaError) return { valid: false, issue: error.issue };
    throw error;
  }
}

function evaluateNode(node: FuelFormulaNode, speedKnot: number): number {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'variable':
      return speedKnot;
    case 'unary': {
      const value = evaluateNode(node.operand, speedKnot);
      return node.operator === '-' ? -value : value;
    }
    case 'binary': {
      const left = evaluateNode(node.left, speedKnot);
      const right = evaluateNode(node.right, speedKnot);
      if (node.operator === '+') return left + right;
      if (node.operator === '-') return left - right;
      if (node.operator === '*') return left * right;
      if (node.operator === '/') return left / right;
      return left ** right;
    }
    case 'call': {
      const args = node.args.map((arg) => evaluateNode(arg, speedKnot));
      const [first = Number.NaN, second = Number.NaN] = args;
      switch (node.name) {
        case 'exp':
          return Math.exp(first);
        case 'log':
        case 'ln':
          return Math.log(first);
        case 'sqrt':
          return Math.sqrt(first);
        case 'pow':
          return first ** second;
        case 'abs':
          return Math.abs(first);
        case 'min':
          return Math.min(...args);
        case 'max':
          return Math.max(...args);
      }
    }
  }
}

/**
 * Value of a valid formula at a speed (knots), as the emission service computes the raw flow
 * f(V) before its `max(f, 0.5)` floor; `null` for invalid formulas or non-finite results.
 *
 * @method fuel.first_formula
 */
export function evaluateFuelFormula(source: string, speedKnot: number): number | null {
  const check = checkFuelFormula(source);
  if (!check.valid) return null;
  const value = evaluateNode(check.ast, speedKnot);
  return Number.isFinite(value) ? value : null;
}
