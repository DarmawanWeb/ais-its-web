/**
 * Safe first-fuel-formula grammar of the fleet service (services/fleet/README.md, "Safe
 * first-fuel-formula grammar"; the emission service evaluates the same language): the editor
 * checks formulas while typing, points at the position of a problem and previews the fuel flow
 * at a few speeds. Nothing is ever evaluated with `eval` / `new Function`.
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
 * Limits: 500 characters, 32 nesting levels (parentheses, calls, signs and exponents).
 *
 * @method fuel.first_formula
 */
export const FORMULA_MAX_LENGTH = 500;
export const FORMULA_MAX_DEPTH = 32;

const FUNCTIONS = {
  exp: 1,
  log: 1,
  ln: 1,
  sqrt: 1,
  pow: 2,
  abs: 1,
  min: 'variadic',
  max: 'variadic',
} as const;
type FunctionName = keyof typeof FUNCTIONS;

type Node =
  | { kind: 'number'; value: number }
  | { kind: 'speed' }
  | { kind: 'unary'; op: '+' | '-'; operand: Node }
  | { kind: 'binary'; op: '+' | '-' | '*' | '/' | '^'; left: Node; right: Node }
  | { kind: 'call'; name: FunctionName; args: Node[] };

/** Why a formula is refused (translated by the editor as `formula.problems.<code>`). */
export type FormulaProblemCode =
  | 'empty'
  | 'tooLong'
  | 'tooDeep'
  | 'unexpectedEnd'
  | 'unexpectedToken'
  | 'unknownName'
  | 'badNumber'
  | 'arity';

export interface FormulaProblem {
  readonly code: FormulaProblemCode;
  /** 0-based character offset of the problem. */
  readonly position: number;
  /** The token or name concerned (unknown names, unexpected tokens, functions). */
  readonly token?: string;
  readonly expected?: number;
  readonly actual?: number;
}

type Token =
  | { kind: 'number'; value: number; text: string; position: number }
  | { kind: 'name'; text: string; position: number }
  | { kind: 'op'; text: string; position: number }
  | { kind: 'end'; text: ''; position: number };

class FormulaError extends Error {
  readonly problem: FormulaProblem;

  constructor(problem: FormulaProblem) {
    super(problem.code);
    this.problem = problem;
  }
}

function tokenize(source: string): Token[] {
  const tokens: Token[] = [];
  let index = 0;
  while (index < source.length) {
    const char = source[index]!;
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(source.slice(index));
    if (number) {
      const value = Number(number[0]);
      if (!Number.isFinite(value))
        throw new FormulaError({ code: 'badNumber', position: index, token: number[0] });
      tokens.push({ kind: 'number', value, text: number[0], position: index });
      index += number[0].length;
      continue;
    }
    const name = /^[A-Za-z_][A-Za-z0-9_]*(?:\.[A-Za-z_][A-Za-z0-9_]*)?/.exec(source.slice(index));
    if (name) {
      tokens.push({ kind: 'name', text: name[0], position: index });
      index += name[0].length;
      continue;
    }
    if (source.startsWith('**', index)) {
      tokens.push({ kind: 'op', text: '**', position: index });
      index += 2;
      continue;
    }
    if ('+-*/^(),'.includes(char)) {
      tokens.push({ kind: 'op', text: char, position: index });
      index += 1;
      continue;
    }
    throw new FormulaError({ code: 'unexpectedToken', position: index, token: char });
  }
  tokens.push({ kind: 'end', text: '', position: source.length });
  return tokens;
}

class Parser {
  private index = 0;
  private depth = 0;
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index]!;
  }

  private next(): Token {
    const token = this.tokens[this.index]!;
    this.index += 1;
    return token;
  }

  private unexpected(token: Token): FormulaError {
    return token.kind === 'end'
      ? new FormulaError({ code: 'unexpectedEnd', position: token.position })
      : new FormulaError({ code: 'unexpectedToken', position: token.position, token: token.text });
  }

  private nested<T>(position: number, parse: () => T): T {
    this.depth += 1;
    if (this.depth > FORMULA_MAX_DEPTH) throw new FormulaError({ code: 'tooDeep', position });
    try {
      return parse();
    } finally {
      this.depth -= 1;
    }
  }

  parse(): Node {
    const node = this.sum();
    const token = this.peek();
    if (token.kind !== 'end') throw this.unexpected(token);
    return node;
  }

  private isOp(token: Token, ...ops: string[]): boolean {
    return token.kind === 'op' && ops.includes(token.text);
  }

  private sum(): Node {
    let left = this.product();
    while (this.isOp(this.peek(), '+', '-')) {
      const op = this.next().text as '+' | '-';
      left = { kind: 'binary', op, left, right: this.product() };
    }
    return left;
  }

  private product(): Node {
    let left = this.unary();
    while (this.isOp(this.peek(), '*', '/')) {
      const op = this.next().text as '*' | '/';
      left = { kind: 'binary', op, left, right: this.unary() };
    }
    return left;
  }

  private unary(): Node {
    const token = this.peek();
    if (this.isOp(token, '+', '-')) {
      this.next();
      return this.nested(token.position, () => ({
        kind: 'unary',
        op: token.text as '+' | '-',
        operand: this.unary(),
      }));
    }
    return this.power();
  }

  private power(): Node {
    const base = this.primary();
    const token = this.peek();
    if (this.isOp(token, '**', '^')) {
      this.next();
      return this.nested(token.position, () => ({
        kind: 'binary',
        op: '^',
        left: base,
        right: this.unary(),
      }));
    }
    return base;
  }

  private primary(): Node {
    const token = this.next();
    if (token.kind === 'number') return { kind: 'number', value: token.value };
    if (token.kind === 'name') {
      if (token.text === 'speedKnot') return { kind: 'speed' };
      const name = token.text.startsWith('Math.') ? token.text.slice(5) : token.text;
      if (
        !Object.hasOwn(FUNCTIONS, name) ||
        (token.text.includes('.') && !token.text.startsWith('Math.'))
      )
        throw new FormulaError({
          code: 'unknownName',
          position: token.position,
          token: token.text,
        });
      return this.call(name as FunctionName, token.position);
    }
    if (this.isOp(token, '(')) {
      return this.nested(token.position, () => {
        const inner = this.sum();
        const close = this.next();
        if (!this.isOp(close, ')')) throw this.unexpected(close);
        return inner;
      });
    }
    throw this.unexpected(token);
  }

  private call(name: FunctionName, position: number): Node {
    const open = this.next();
    if (!this.isOp(open, '(')) throw this.unexpected(open);
    return this.nested(position, () => {
      const args = [this.sum()];
      while (this.isOp(this.peek(), ',')) {
        this.next();
        args.push(this.sum());
      }
      const close = this.next();
      if (!this.isOp(close, ')')) throw this.unexpected(close);
      const arity = FUNCTIONS[name];
      if (arity !== 'variadic' && args.length !== arity) {
        throw new FormulaError({
          code: 'arity',
          position,
          token: name,
          expected: arity,
          actual: args.length,
        });
      }
      return { kind: 'call', name, args };
    });
  }
}

export type FormulaCheck =
  | { readonly valid: true; readonly evaluate: (speedKnot: number) => number }
  | { readonly valid: false; readonly problem: FormulaProblem };

function evaluateNode(node: Node, speed: number): number {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'speed':
      return speed;
    case 'unary':
      return node.op === '-'
        ? -evaluateNode(node.operand, speed)
        : evaluateNode(node.operand, speed);
    case 'binary': {
      const left = evaluateNode(node.left, speed);
      const right = evaluateNode(node.right, speed);
      switch (node.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          return left / right;
        case '^':
          return left ** right;
      }
      break;
    }
    case 'call': {
      const args = node.args.map((arg) => evaluateNode(arg, speed));
      switch (node.name) {
        case 'exp':
          return Math.exp(args[0]!);
        case 'log':
        case 'ln':
          return Math.log(args[0]!);
        case 'sqrt':
          return Math.sqrt(args[0]!);
        case 'pow':
          return args[0]! ** args[1]!;
        case 'abs':
          return Math.abs(args[0]!);
        case 'min':
          return Math.min(...args);
        case 'max':
          return Math.max(...args);
      }
    }
  }
  return Number.NaN;
}

/** Checks a formula against the grammar; a valid one can be evaluated at a speed (knots). */
export function checkFormula(source: string): FormulaCheck {
  if (source.length > FORMULA_MAX_LENGTH)
    return { valid: false, problem: { code: 'tooLong', position: FORMULA_MAX_LENGTH } };
  if (source.trim() === '') return { valid: false, problem: { code: 'empty', position: 0 } };
  try {
    const ast = new Parser(tokenize(source)).parse();
    return { valid: true, evaluate: (speedKnot) => evaluateNode(ast, speedKnot) };
  } catch (error) {
    if (error instanceof FormulaError) return { valid: false, problem: error.problem };
    throw error;
  }
}

/** Speeds (knots) of the formula preview. */
export const PREVIEW_SPEEDS = [0, 4, 8, 12, 16, 20] as const;

/** Fuel flow (L/min) at the preview speeds; non-finite values become null. */
export function previewFormula(source: string): (number | null)[] | null {
  const check = checkFormula(source);
  if (!check.valid) return null;
  return PREVIEW_SPEEDS.map((speed) => {
    const value = check.evaluate(speed);
    return Number.isFinite(value) ? value : null;
  });
}
