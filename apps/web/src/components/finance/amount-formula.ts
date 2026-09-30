const OPERATOR = /[+\-*/×÷()]/u;
const DECIMALS = 6;
const PRECEDENCE: Record<string, number | undefined> = {
  "*": 1,
  "+": 0,
  "-": 0,
  "/": 1,
};

/** Whether the text is arithmetic rather than a plain number. */
export const isFormula = (text: string): boolean => OPERATOR.test(text);

/** Drops anything a formula can't contain; a comma is read as a point. */
export const sanitizeFormula = (text: string): string =>
  text.replaceAll(",", ".").replaceAll(/[^\d.+\-*/×÷()\s]/gu, "");

/** The plain-number sanitizer: digits and one decimal separator. */
export const sanitizeDecimal = (text: string): string => {
  const next = text.replace(",", ".").replaceAll(/[^\d.]/gu, "");
  const [whole = "", ...rest] = next.split(".");
  return rest.length > 0
    ? `${whole}.${rest.join("").slice(0, DECIMALS)}`
    : whole;
};

/**
 * Evaluates `+ − × ÷` with parentheses and unary signs by recursive descent —
 * never `eval`. Returns the decimal string the API expects, or `null` when the
 * text is incomplete, malformed or not a non-negative finite amount.
 */
export const evaluateFormula = (text: string): string | null => {
  const source = text
    .replaceAll("×", "*")
    .replaceAll("÷", "/")
    .replaceAll(/\s/gu, "");
  const tokens = source.match(/\d*\.?\d+|\d+\.|[+\-*/()]|./gu) ?? [];
  let position = 0;

  const take = (): string | undefined => {
    const token = tokens[position];
    position += 1;
    return token;
  };

  // Precedence climbing: one recursive function covers every level.
  const parse = (minPrecedence: number): number => {
    const token = take();
    let left = Number.NaN;
    if (token === "-" || token === "+") {
      const operand = parse(2);
      left = token === "-" ? -operand : operand;
    } else if (token === "(") {
      left = parse(0);
      if (take() !== ")") {
        return Number.NaN;
      }
    } else if (token !== undefined && /^[\d.]+$/u.test(token)) {
      left = Number(token);
    }
    for (;;) {
      const operator = tokens[position];
      const precedence = PRECEDENCE[operator ?? ""];
      if (precedence === undefined || precedence < minPrecedence) {
        return left;
      }
      position += 1;
      const right = parse(precedence + 1);
      if (operator === "+") {
        left += right;
      } else if (operator === "-") {
        left -= right;
      } else if (operator === "*") {
        left *= right;
      } else {
        left /= right;
      }
    }
  };

  const result = parse(0);
  if (position !== tokens.length || !Number.isFinite(result) || result < 0) {
    return null;
  }
  return String(Number(result.toFixed(DECIMALS)));
};
