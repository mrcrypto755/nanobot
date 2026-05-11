import { useCallback, useEffect, useReducer } from "react";
import { ArrowLeft, ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";

type CalcMode = "standard" | "scientific" | "programmer";
type Base = "HEX" | "DEC" | "OCT" | "BIN";
type AngleUnit = "DEG" | "RAD";

interface CalcState {
  mode: CalcMode;
  display: string;
  expression: string;
  justEvaluated: boolean;
  memory: number;
  base: Base;
  angleUnit: AngleUnit;
  shiftActive: boolean;
}

type CalcAction =
  | { type: "DIGIT"; digit: string }
  | { type: "OPERATOR"; op: string }
  | { type: "EQUALS" }
  | { type: "CLEAR" }
  | { type: "BACKSPACE" }
  | { type: "NEGATE" }
  | { type: "PERCENT" }
  | { type: "DECIMAL" }
  | { type: "UNARY"; fn: string }
  | { type: "MEMORY"; op: "MC" | "MR" | "MS" | "M+" | "M-" }
  | { type: "SET_MODE"; mode: CalcMode }
  | { type: "SET_BASE"; base: Base }
  | { type: "SET_ANGLE"; unit: AngleUnit }
  | { type: "TOGGLE_SHIFT" }
  | { type: "CONSTANT"; value: number };

const MAX_DIGITS = 16;

function toBase(n: number, base: Base): string {
  const int = Math.trunc(n);
  if (!isFinite(int)) return "Error";
  const abs = Math.abs(int);
  const prefix = int < 0 ? "-" : "";
  switch (base) {
    case "HEX": return prefix + abs.toString(16).toUpperCase();
    case "OCT": return prefix + abs.toString(8);
    case "BIN": return prefix + abs.toString(2);
    default: return String(int);
  }
}

function fromBase(s: string, base: Base): number {
  if (!s || s === "-") return 0;
  switch (base) {
    case "HEX": return parseInt(s, 16);
    case "OCT": return parseInt(s, 8);
    case "BIN": return parseInt(s, 2);
    default: return parseFloat(s);
  }
}

function validDigitForBase(d: string, base: Base): boolean {
  switch (base) {
    case "BIN": return /^[01]$/.test(d);
    case "OCT": return /^[0-7]$/.test(d);
    case "HEX": return /^[0-9A-Fa-f]$/.test(d);
    default: return /^[0-9]$/.test(d);
  }
}

function applyUnary(fn: string, val: number, angleUnit: AngleUnit): number {
  const toRad = (x: number) => angleUnit === "DEG" ? (x * Math.PI) / 180 : x;
  const fromRad = (x: number) => angleUnit === "DEG" ? (x * 180) / Math.PI : x;
  switch (fn) {
    case "sin": return Math.sin(toRad(val));
    case "cos": return Math.cos(toRad(val));
    case "tan": return Math.tan(toRad(val));
    case "asin": return fromRad(Math.asin(val));
    case "acos": return fromRad(Math.acos(val));
    case "atan": return fromRad(Math.atan(val));
    case "ln": return Math.log(val);
    case "log": return Math.log10(val);
    case "log2": return Math.log2(val);
    case "sqrt": return Math.sqrt(val);
    case "cbrt": return Math.cbrt(val);
    case "x2": return val * val;
    case "x3": return val * val * val;
    case "1/x": return 1 / val;
    case "abs": return Math.abs(val);
    case "floor": return Math.floor(val);
    case "ceil": return Math.ceil(val);
    case "n!": {
      if (val < 0 || !Number.isInteger(val) || val > 170) return NaN;
      let r = 1;
      for (let i = 2; i <= val; i++) r *= i;
      return r;
    }
    case "exp": return Math.exp(val);
    case "NOT": return ~Math.trunc(val);
    default: return val;
  }
}

function evaluateExpression(expr: string, curVal: number): number {
  const parts = expr.trim().split(" ");
  if (parts.length < 2) return curVal;
  const left = parseFloat(parts[0]);
  const op = parts[1];
  if (!isFinite(left)) return NaN;
  switch (op) {
    case "+": return left + curVal;
    case "-": return left - curVal;
    case "×": return left * curVal;
    case "÷": return curVal === 0 ? NaN : left / curVal;
    case "^": return Math.pow(left, curVal);
    case "^(1/y)": return Math.pow(left, 1 / curVal);
    case "mod": return left % curVal;
    case "AND": return Math.trunc(left) & Math.trunc(curVal);
    case "OR": return Math.trunc(left) | Math.trunc(curVal);
    case "XOR": return Math.trunc(left) ^ Math.trunc(curVal);
    case "LSHIFT": return Math.trunc(left) << Math.trunc(curVal);
    case "RSHIFT": return Math.trunc(left) >> Math.trunc(curVal);
    default: return curVal;
  }
}

function formatResult(n: number): string {
  if (!isFinite(n)) return isNaN(n) ? "Error" : n > 0 ? "Infinity" : "-Infinity";
  if (Math.abs(n) >= 1e15 || (Math.abs(n) < 1e-10 && n !== 0)) {
    return n.toExponential(6).replace(/\.?0+e/, "e");
  }
  const s = n.toPrecision(12);
  return parseFloat(s).toString();
}

const initialState: CalcState = {
  mode: "standard",
  display: "0",
  expression: "",
  justEvaluated: false,
  memory: 0,
  base: "DEC",
  angleUnit: "DEG",
  shiftActive: false,
};

function reducer(state: CalcState, action: CalcAction): CalcState {
  const currentNum = () => fromBase(state.display, state.base);

  switch (action.type) {
    case "SET_MODE":
      return { ...state, mode: action.mode, display: "0", expression: "", justEvaluated: false, base: "DEC", shiftActive: false };

    case "SET_BASE": {
      const val = currentNum();
      const newDisplay = action.base === "DEC"
        ? (isNaN(val) ? "0" : formatResult(Math.trunc(val)))
        : toBase(val, action.base);
      return { ...state, base: action.base, display: newDisplay, justEvaluated: false };
    }

    case "SET_ANGLE":
      return { ...state, angleUnit: action.unit };

    case "TOGGLE_SHIFT":
      return { ...state, shiftActive: !state.shiftActive };

    case "CONSTANT":
      return { ...state, display: formatResult(action.value), justEvaluated: true };

    case "DIGIT": {
      if (!validDigitForBase(action.digit, state.base)) return state;
      if (state.justEvaluated) {
        return { ...state, display: action.digit, justEvaluated: false };
      }
      if (state.display === "0" || state.display === "-0") {
        const sign = state.display.startsWith("-") ? "-" : "";
        return { ...state, display: sign + action.digit };
      }
      if (state.display.replace("-", "").replace(".", "").length >= MAX_DIGITS) return state;
      return { ...state, display: state.display + action.digit };
    }

    case "DECIMAL": {
      if (state.base !== "DEC") return state;
      if (state.justEvaluated) return { ...state, display: "0.", justEvaluated: false };
      if (state.display.includes(".")) return state;
      return { ...state, display: state.display + "." };
    }

    case "NEGATE": {
      if (state.display === "0" || state.display === "Error") return state;
      const toggled = state.display.startsWith("-") ? state.display.slice(1) : "-" + state.display;
      return { ...state, display: toggled };
    }

    case "PERCENT": {
      if (state.base !== "DEC") return state;
      const val = currentNum();
      if (state.expression) {
        const leftVal = parseFloat(state.expression.split(" ")[0]);
        const pct = isFinite(leftVal) ? (leftVal * val) / 100 : val / 100;
        return { ...state, display: formatResult(pct) };
      }
      return { ...state, display: formatResult(val / 100) };
    }

    case "OPERATOR": {
      const val = currentNum();
      if (state.expression && !state.justEvaluated) {
        const result = evaluateExpression(state.expression, val);
        const disp = state.base === "DEC" ? formatResult(result) : toBase(result, state.base);
        return { ...state, display: disp, expression: `${disp} ${action.op}`, justEvaluated: false };
      }
      const disp = state.base === "DEC" ? formatResult(val) : toBase(val, state.base);
      return { ...state, expression: `${disp} ${action.op}`, justEvaluated: false };
    }

    case "EQUALS": {
      if (!state.expression) return { ...state, justEvaluated: true };
      const val = currentNum();
      const result = evaluateExpression(state.expression, val);
      const disp = state.base === "DEC" ? formatResult(result) : toBase(result, state.base);
      return { ...state, display: disp, expression: "", justEvaluated: true };
    }

    case "CLEAR":
      return { ...state, display: "0", expression: "", justEvaluated: false };

    case "BACKSPACE": {
      if (state.justEvaluated) return { ...state, display: "0", justEvaluated: false };
      if (state.display.length <= 1 || (state.display.length === 2 && state.display.startsWith("-"))) {
        return { ...state, display: "0" };
      }
      return { ...state, display: state.display.slice(0, -1) };
    }

    case "UNARY": {
      const val = currentNum();
      const result = applyUnary(action.fn, val, state.angleUnit);
      const disp = state.base === "DEC" ? formatResult(result) : toBase(result, state.base);
      return { ...state, display: disp, justEvaluated: true };
    }

    case "MEMORY": {
      const val = currentNum();
      switch (action.op) {
        case "MC": return { ...state, memory: 0 };
        case "MR": return { ...state, display: formatResult(state.memory), justEvaluated: true };
        case "MS": return { ...state, memory: val };
        case "M+": return { ...state, memory: state.memory + val };
        case "M-": return { ...state, memory: state.memory - val };
      }
    }

    default:
      return state;
  }
}

interface CalcButtonProps {
  label: React.ReactNode;
  onClick: () => void;
  variant?: "digit" | "operator" | "action" | "fn" | "equal" | "base" | "active";
  wide?: boolean;
  disabled?: boolean;
  className?: string;
}

function CalcButton({ label, onClick, variant = "digit", wide, disabled, className }: CalcButtonProps) {
  const base = "flex items-center justify-center rounded-lg font-medium select-none cursor-pointer transition-all active:scale-95 active:brightness-90";
  const variants: Record<string, string> = {
    digit: "bg-background border border-border hover:bg-accent text-foreground",
    operator: "bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20",
    action: "bg-muted hover:bg-muted/80 text-muted-foreground border border-border",
    fn: "bg-secondary/50 hover:bg-secondary text-secondary-foreground border border-border text-xs",
    equal: "bg-primary hover:bg-primary/90 text-primary-foreground border border-primary",
    base: "bg-muted/60 hover:bg-muted text-muted-foreground border border-border text-xs font-mono",
    active: "bg-primary text-primary-foreground border border-primary",
  };
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        base,
        variants[variant],
        wide ? "col-span-2" : "",
        "disabled:opacity-30 disabled:cursor-not-allowed",
        className,
      )}
    >
      {label}
    </button>
  );
}

function BitDisplay({ value }: { value: number }) {
  const int = Math.trunc(value) & 0xffffffff;
  const bits = Array.from({ length: 32 }, (_, i) => (int >> (31 - i)) & 1);
  return (
    <div className="font-mono text-xs text-muted-foreground px-1 overflow-x-auto">
      <div className="flex gap-0.5 min-w-max">
        {bits.map((b, i) => (
          <span key={i} className={cn("px-0.5", b ? "text-primary font-bold" : "")}>
            {b}
          </span>
        ))}
      </div>
      <div className="flex gap-0.5 min-w-max mt-0.5">
        {Array.from({ length: 32 }, (_, i) => (
          <span key={i} className="px-0.5 text-[9px] text-muted-foreground/50">
            {31 - i}
          </span>
        ))}
      </div>
    </div>
  );
}

function BaseDisplay({ value, currentBase }: { value: number; currentBase: Base }) {
  const entries: [Base, string][] = [
    ["HEX", isFinite(value) ? toBase(Math.trunc(value), "HEX") : "---"],
    ["DEC", isFinite(value) ? String(Math.trunc(value)) : "---"],
    ["OCT", isFinite(value) ? toBase(Math.trunc(value), "OCT") : "---"],
    ["BIN", isFinite(value) ? toBase(Math.trunc(value), "BIN") : "---"],
  ];
  return (
    <div className="space-y-0.5 px-1 text-xs font-mono">
      {entries.map(([base, val]) => (
        <div key={base} className={cn("flex gap-2", base === currentBase ? "text-foreground font-bold" : "text-muted-foreground")}>
          <span className="w-8 shrink-0 text-muted-foreground/70">{base}</span>
          <span className="truncate">{val}</span>
        </div>
      ))}
    </div>
  );
}

export function TechnicalCalculator({ onBack }: { onBack: () => void }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const d = (digit: string) => dispatch({ type: "DIGIT", digit });
  const op = (o: string) => dispatch({ type: "OPERATOR", op: o });
  const unary = (fn: string) => dispatch({ type: "UNARY", fn });

  const currentValue = fromBase(state.display, state.base);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const key = e.key;
    const digits = "0123456789abcdefABCDEF";
    if (digits.includes(key)) { e.preventDefault(); d(key.toUpperCase()); return; }
    if (key === ".") { e.preventDefault(); dispatch({ type: "DECIMAL" }); return; }
    if (key === "+" || key === "-" || key === "*" || key === "/") {
      e.preventDefault();
      const map: Record<string, string> = { "+": "+", "-": "-", "*": "×", "/": "÷" };
      op(map[key]);
      return;
    }
    if (key === "Enter" || key === "=") { e.preventDefault(); dispatch({ type: "EQUALS" }); return; }
    if (key === "Backspace") { e.preventDefault(); dispatch({ type: "BACKSPACE" }); return; }
    if (key === "Escape" || key === "Delete") { e.preventDefault(); dispatch({ type: "CLEAR" }); return; }
    if (key === "%") { e.preventDefault(); dispatch({ type: "PERCENT" }); return; }
  }, []);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  const exprDisplay = state.expression || "";
  const isError = state.display === "Error" || state.display === "Infinity" || state.display === "-Infinity";

  return (
    <div className="flex h-full w-full flex-col bg-background text-foreground">
      {/* Header */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-3 shrink-0">
        <button onClick={onBack} className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Back
        </button>
        <span className="text-sm font-medium ml-2">Calculator</span>
        <div className="ml-auto flex gap-1">
          {(["standard", "scientific", "programmer"] as CalcMode[]).map((m) => (
            <button
              key={m}
              onClick={() => dispatch({ type: "SET_MODE", mode: m })}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-medium capitalize transition-colors",
                state.mode === m
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent",
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-1 min-h-0 flex-col overflow-auto">
        {/* Display */}
        <div className="shrink-0 border-b border-border bg-muted/30 px-4 py-3 space-y-1">
          {state.mode === "programmer" && (
            <div className="mb-2">
              <BaseDisplay value={currentValue} currentBase={state.base} />
            </div>
          )}
          <div className="text-right text-xs text-muted-foreground font-mono h-4 truncate">
            {exprDisplay}
          </div>
          <div
            className={cn(
              "text-right font-mono font-semibold break-all",
              isError ? "text-destructive text-xl" : "text-foreground",
              state.display.length > 14 ? "text-lg" : state.display.length > 10 ? "text-2xl" : "text-4xl",
            )}
          >
            {state.display}
          </div>
          {state.mode === "programmer" && (
            <div className="mt-2 overflow-x-auto">
              <BitDisplay value={currentValue} />
            </div>
          )}
          {state.memory !== 0 && (
            <div className="text-right text-xs text-primary/70">M = {formatResult(state.memory)}</div>
          )}
        </div>

        {/* Buttons */}
        <div className="flex-1 p-2">
          {state.mode === "standard" && <StandardButtons state={state} dispatch={dispatch} />}
          {state.mode === "scientific" && <ScientificButtons state={state} dispatch={dispatch} />}
          {state.mode === "programmer" && <ProgrammerButtons state={state} dispatch={dispatch} />}
        </div>
      </div>
    </div>
  );
}

function StandardButtons({ state, dispatch }: { state: CalcState; dispatch: React.Dispatch<CalcAction> }) {
  const d = (digit: string) => dispatch({ type: "DIGIT", digit });
  const op = (o: string) => dispatch({ type: "OPERATOR", op: o });

  return (
    <div className="grid grid-cols-4 gap-1.5 h-full" style={{ gridTemplateRows: "repeat(5, 1fr)" }}>
      {/* Row 1 */}
      <CalcButton label="MC" onClick={() => dispatch({ type: "MEMORY", op: "MC" })} variant="action" />
      <CalcButton label="MR" onClick={() => dispatch({ type: "MEMORY", op: "MR" })} variant="action" disabled={state.memory === 0} />
      <CalcButton label="M+" onClick={() => dispatch({ type: "MEMORY", op: "M+" })} variant="action" />
      <CalcButton label="M−" onClick={() => dispatch({ type: "MEMORY", op: "M-" })} variant="action" />
      {/* Row 2 */}
      <CalcButton label="%" onClick={() => dispatch({ type: "PERCENT" })} variant="action" />
      <CalcButton label="CE" onClick={() => dispatch({ type: "CLEAR" })} variant="action" />
      <CalcButton label="C" onClick={() => dispatch({ type: "CLEAR" })} variant="action" />
      <CalcButton label={<ArrowLeft className="h-4 w-4" />} onClick={() => dispatch({ type: "BACKSPACE" })} variant="action" />
      {/* Row 3 */}
      <CalcButton label="1/x" onClick={() => dispatch({ type: "UNARY", fn: "1/x" })} variant="fn" />
      <CalcButton label="x²" onClick={() => dispatch({ type: "UNARY", fn: "x2" })} variant="fn" />
      <CalcButton label="√x" onClick={() => dispatch({ type: "UNARY", fn: "sqrt" })} variant="fn" />
      <CalcButton label="÷" onClick={() => op("÷")} variant="operator" />
      {/* Row 4 */}
      <CalcButton label="7" onClick={() => d("7")} />
      <CalcButton label="8" onClick={() => d("8")} />
      <CalcButton label="9" onClick={() => d("9")} />
      <CalcButton label="×" onClick={() => op("×")} variant="operator" />
      {/* Row 5 */}
      <CalcButton label="4" onClick={() => d("4")} />
      <CalcButton label="5" onClick={() => d("5")} />
      <CalcButton label="6" onClick={() => d("6")} />
      <CalcButton label="−" onClick={() => op("-")} variant="operator" />
      {/* Row 6 */}
      <CalcButton label="1" onClick={() => d("1")} />
      <CalcButton label="2" onClick={() => d("2")} />
      <CalcButton label="3" onClick={() => d("3")} />
      <CalcButton label="+" onClick={() => op("+")} variant="operator" />
      {/* Row 7 */}
      <CalcButton label="+/−" onClick={() => dispatch({ type: "NEGATE" })} />
      <CalcButton label="0" onClick={() => d("0")} />
      <CalcButton label="." onClick={() => dispatch({ type: "DECIMAL" })} />
      <CalcButton label="=" onClick={() => dispatch({ type: "EQUALS" })} variant="equal" />
    </div>
  );
}

function ScientificButtons({ state, dispatch }: { state: CalcState; dispatch: React.Dispatch<CalcAction> }) {
  const d = (digit: string) => dispatch({ type: "DIGIT", digit });
  const op = (o: string) => dispatch({ type: "OPERATOR", op: o });
  const unary = (fn: string) => dispatch({ type: "UNARY", fn });
  const shift = state.shiftActive;

  return (
    <div className="grid grid-cols-5 gap-1 h-full" style={{ gridTemplateRows: "repeat(8, 1fr)" }}>
      {/* Angle + shift */}
      <CalcButton
        label={state.angleUnit}
        onClick={() => dispatch({ type: "SET_ANGLE", unit: state.angleUnit === "DEG" ? "RAD" : "DEG" })}
        variant="base"
      />
      <CalcButton label="2nd" onClick={() => dispatch({ type: "TOGGLE_SHIFT" })} variant={shift ? "active" : "action"} />
      <CalcButton label={shift ? "asin" : "sin"} onClick={() => unary(shift ? "asin" : "sin")} variant="fn" />
      <CalcButton label={shift ? "acos" : "cos"} onClick={() => unary(shift ? "acos" : "cos")} variant="fn" />
      <CalcButton label={shift ? "atan" : "tan"} onClick={() => unary(shift ? "atan" : "tan")} variant="fn" />

      <CalcButton label={shift ? "eˣ" : "ln"} onClick={() => unary(shift ? "exp" : "ln")} variant="fn" />
      <CalcButton label={shift ? "10ˣ" : "log"} onClick={() => { if (shift) { dispatch({ type: "OPERATOR", op: "^" }); dispatch({ type: "DIGIT", digit: "1" }); dispatch({ type: "DIGIT", digit: "0" }); dispatch({ type: "EQUALS" }); } else unary("log"); }} variant="fn" />
      <CalcButton label={shift ? "2ˣ" : "log₂"} onClick={() => unary(shift ? "exp" : "log2")} variant="fn" />
      <CalcButton label={shift ? "x^(1/y)" : "xʸ"} onClick={() => op(shift ? "^(1/y)" : "^")} variant="fn" />
      <CalcButton label="n!" onClick={() => unary("n!")} variant="fn" />

      <CalcButton label="MC" onClick={() => dispatch({ type: "MEMORY", op: "MC" })} variant="action" />
      <CalcButton label="MR" onClick={() => dispatch({ type: "MEMORY", op: "MR" })} variant="action" />
      <CalcButton label="M+" onClick={() => dispatch({ type: "MEMORY", op: "M+" })} variant="action" />
      <CalcButton label="M−" onClick={() => dispatch({ type: "MEMORY", op: "M-" })} variant="action" />
      <CalcButton label="MS" onClick={() => dispatch({ type: "MEMORY", op: "MS" })} variant="action" />

      <CalcButton label={shift ? "cbrt" : "√"} onClick={() => unary(shift ? "cbrt" : "sqrt")} variant="fn" />
      <CalcButton label="x²" onClick={() => unary("x2")} variant="fn" />
      <CalcButton label="x³" onClick={() => unary("x3")} variant="fn" />
      <CalcButton label="|x|" onClick={() => unary("abs")} variant="fn" />
      <CalcButton label="1/x" onClick={() => unary("1/x")} variant="fn" />

      <CalcButton label="π" onClick={() => dispatch({ type: "CONSTANT", value: Math.PI })} variant="fn" />
      <CalcButton label="e" onClick={() => dispatch({ type: "CONSTANT", value: Math.E })} variant="fn" />
      <CalcButton label="%" onClick={() => dispatch({ type: "PERCENT" })} variant="action" />
      <CalcButton label="CE" onClick={() => dispatch({ type: "CLEAR" })} variant="action" />
      <CalcButton label={<ArrowLeft className="h-3 w-3" />} onClick={() => dispatch({ type: "BACKSPACE" })} variant="action" />

      <CalcButton label="7" onClick={() => d("7")} />
      <CalcButton label="8" onClick={() => d("8")} />
      <CalcButton label="9" onClick={() => d("9")} />
      <CalcButton label="÷" onClick={() => op("÷")} variant="operator" />
      <CalcButton label="C" onClick={() => dispatch({ type: "CLEAR" })} variant="action" />

      <CalcButton label="4" onClick={() => d("4")} />
      <CalcButton label="5" onClick={() => d("5")} />
      <CalcButton label="6" onClick={() => d("6")} />
      <CalcButton label="×" onClick={() => op("×")} variant="operator" />
      <CalcButton label="mod" onClick={() => op("mod")} variant="fn" />

      <CalcButton label="1" onClick={() => d("1")} />
      <CalcButton label="2" onClick={() => d("2")} />
      <CalcButton label="3" onClick={() => d("3")} />
      <CalcButton label="−" onClick={() => op("-")} variant="operator" />
      <CalcButton label="+/−" onClick={() => dispatch({ type: "NEGATE" })} />

      <CalcButton label="0" onClick={() => d("0")} wide />
      <CalcButton label="." onClick={() => dispatch({ type: "DECIMAL" })} />
      <CalcButton label="+" onClick={() => op("+")} variant="operator" />
      <CalcButton label="=" onClick={() => dispatch({ type: "EQUALS" })} variant="equal" />
    </div>
  );
}

function ProgrammerButtons({ state, dispatch }: { state: CalcState; dispatch: React.Dispatch<CalcAction> }) {
  const d = (digit: string) => dispatch({ type: "DIGIT", digit });
  const op = (o: string) => dispatch({ type: "OPERATOR", op: o });
  const base = state.base;
  const hexDisabled = base === "BIN" || base === "OCT";
  const decOnly = base !== "DEC";

  return (
    <div className="space-y-2">
      {/* Base selector */}
      <div className="grid grid-cols-4 gap-1">
        {(["HEX", "DEC", "OCT", "BIN"] as Base[]).map((b) => (
          <CalcButton
            key={b}
            label={b}
            onClick={() => dispatch({ type: "SET_BASE", base: b })}
            variant={state.base === b ? "active" : "base"}
          />
        ))}
      </div>

      <div className="grid grid-cols-5 gap-1" style={{ gridTemplateRows: "repeat(6, 2.5rem)" }}>
        {/* Bitwise ops */}
        <CalcButton label="AND" onClick={() => op("AND")} variant="fn" />
        <CalcButton label="OR" onClick={() => op("OR")} variant="fn" />
        <CalcButton label="XOR" onClick={() => op("XOR")} variant="fn" />
        <CalcButton label="NOT" onClick={() => dispatch({ type: "UNARY", fn: "NOT" })} variant="fn" />
        <CalcButton label={<ArrowLeft className="h-3 w-3" />} onClick={() => dispatch({ type: "BACKSPACE" })} variant="action" />

        <CalcButton label="LSH" onClick={() => op("LSHIFT")} variant="fn" />
        <CalcButton label="RSH" onClick={() => op("RSHIFT")} variant="fn" />
        <CalcButton label="mod" onClick={() => op("mod")} variant="fn" />
        <CalcButton label="CE" onClick={() => dispatch({ type: "CLEAR" })} variant="action" />
        <CalcButton label="C" onClick={() => dispatch({ type: "CLEAR" })} variant="action" />

        {/* Hex digits A-F */}
        <CalcButton label="A" onClick={() => d("A")} variant="fn" disabled={hexDisabled} />
        <CalcButton label="B" onClick={() => d("B")} variant="fn" disabled={hexDisabled} />
        <CalcButton label="C" onClick={() => d("C")} variant="fn" disabled={hexDisabled} />
        <CalcButton label="÷" onClick={() => op("÷")} variant="operator" disabled={decOnly} />
        <CalcButton label="×" onClick={() => op("×")} variant="operator" disabled={decOnly} />

        <CalcButton label="D" onClick={() => d("D")} variant="fn" disabled={hexDisabled} />
        <CalcButton label="E" onClick={() => d("E")} variant="fn" disabled={hexDisabled} />
        <CalcButton label="F" onClick={() => d("F")} variant="fn" disabled={hexDisabled} />
        <CalcButton label="−" onClick={() => op("-")} variant="operator" />
        <CalcButton label="+" onClick={() => op("+")} variant="operator" />

        <CalcButton label="7" onClick={() => d("7")} disabled={base === "BIN"} />
        <CalcButton label="8" onClick={() => d("8")} disabled={base === "BIN" || base === "OCT"} />
        <CalcButton label="9" onClick={() => d("9")} disabled={base === "BIN" || base === "OCT"} />
        <CalcButton label="+/−" onClick={() => dispatch({ type: "NEGATE" })} />
        <CalcButton label="=" onClick={() => dispatch({ type: "EQUALS" })} variant="equal" />

        <CalcButton label="4" onClick={() => d("4")} disabled={base === "BIN"} />
        <CalcButton label="5" onClick={() => d("5")} disabled={base === "BIN"} />
        <CalcButton label="6" onClick={() => d("6")} disabled={base === "BIN"} />
        <CalcButton label="1" onClick={() => d("1")} />
        <CalcButton label="2" onClick={() => d("2")} disabled={base === "BIN"} />

        <CalcButton label="3" onClick={() => d("3")} disabled={base === "BIN"} />
        <CalcButton label="0" onClick={() => d("0")} wide />
        <div />
        <div />
      </div>
    </div>
  );
}
