/** Seconds between one part coming alive and the next. */
export const STEP_GAP = 0.32;
/** Seconds a part takes to go from dark to fully lit. */
export const RAMP = 0.22;
/** Seconds the accent flash lingers on a part after it is lit. */
export const FLASH = 0.6;
/** Seconds the board takes to go dark after power is cut. */
export const FADE_OUT = 0.35;

export type Phase = "off" | "booting" | "powered";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

/**
 * Builds the timing for a power-up sequence that brings `steps` parts alive one after another.
 * @param steps - Number of parts, in the order power reaches them.
 * @returns Sequence timings plus helpers to read the state of any part at a time since power-on.
 */
export const createPowerUp = (steps: number) => {
  const done = (steps - 1) * STEP_GAP + RAMP;
  /** Time after which every part is lit and every flash has faded. */
  const settled = done + FLASH;

  /**
   * Reads one part's state.
   * @param t - Seconds since power-on.
   * @param step - Part index.
   * @returns `level` from 0 (dark) to 1 (lit), and `flash` strength for the accent colour.
   */
  const stepAt = (t: number, step: number) => {
    const since = t - step * STEP_GAP;
    const level = clamp01(since / RAMP);
    const flash = since <= 0 ? 0 : since < RAMP ? 1 : clamp01(1 - (since - RAMP) / FLASH);
    return { level, flash };
  };

  /**
   * Finds the part power is reaching right now.
   * @param t - Seconds since power-on.
   * @returns The part index, or -1 before power-on and once the sequence is done.
   */
  const activeStepAt = (t: number): number => {
    if (t < 0 || t >= done) return -1;
    return Math.min(steps - 1, Math.floor(t / STEP_GAP));
  };

  /**
   * Counts parts that are fully lit.
   * @param t - Seconds since power-on.
   * @returns How many parts are lit.
   */
  const litAt = (t: number): number => {
    let lit = 0;
    for (let i = 0; i < steps; i++) if (stepAt(t, i).level >= 1) lit++;
    return lit;
  };

  /**
   * Reports which phase of the sequence a time falls in.
   * @param t - Seconds since power-on.
   * @returns `booting` while parts are still coming alive, then `powered`.
   */
  const phaseAt = (t: number): Exclude<Phase, "off"> => (t < done ? "booting" : "powered");

  return { steps, done, settled, stepAt, activeStepAt, litAt, phaseAt };
};

export type PowerUp = ReturnType<typeof createPowerUp>;
