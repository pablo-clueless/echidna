export const STEP_GAP = 0.6;
export const DROP = 0.75;
export const HIGHLIGHT_FADE = 0.7;
export const HOLD = 3;
export const LIFT = 0.9;
export const LIFT_STAGGER = 0.05;
export const REST = 0.6;

export type Phase = "assembling" | "powered" | "resetting";

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));

export const easeOutBack = (x: number) => {
  const c1 = 1.4;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
};

export const easeInCubic = (x: number) => x * x * x;

/**
 * Builds the timing for an assembly loop of `steps` parts.
 * @param steps - Number of placement steps.
 * @returns Cycle timings plus helpers to read the state of any step at a time within the cycle.
 */
export const createTimeline = (steps: number) => {
  const assembled = (steps - 1) * STEP_GAP + DROP;
  const liftStart = assembled + HOLD;
  const cycle = liftStart + (steps - 1) * LIFT_STAGGER + LIFT + REST;

  /**
   * Reads one step's animation progress.
   * @param t - Time within the cycle, in seconds.
   * @param step - Step index.
   * @returns `drop` and `lift` progress from 0 to 1, and `highlight` strength for the accent colour.
   */
  const stepAt = (t: number, step: number) => {
    const start = step * STEP_GAP;
    const drop = clamp01((t - start) / DROP);
    const lift = clamp01((t - liftStart - step * LIFT_STAGGER) / LIFT);
    const highlight = drop <= 0 ? 0 : drop < 1 ? 1 : clamp01(1 - (t - start - DROP) / HIGHLIGHT_FADE);
    return { drop, lift, highlight };
  };

  /**
   * Reports which phase of the loop a time falls in.
   * @param t - Time within the cycle, in seconds.
   * @returns The loop phase.
   */
  const phaseAt = (t: number): Phase => (t < assembled ? "assembling" : t < liftStart ? "powered" : "resetting");

  /**
   * Finds the step currently being placed.
   * @param t - Time within the cycle, in seconds.
   * @returns The step index, or -1 when no part is being placed.
   */
  const activeStepAt = (t: number): number => {
    if (t < 0 || t >= assembled) return -1;
    return Math.min(steps - 1, Math.floor(t / STEP_GAP));
  };

  /**
   * Counts parts that have finished seating.
   * @param t - Time within the cycle, in seconds.
   * @returns How many steps are fully placed.
   */
  const placedAt = (t: number): number => {
    if (t >= liftStart) return steps;
    let placed = 0;
    for (let i = 0; i < steps; i++) if (stepAt(t, i).drop >= 1) placed++;
    return placed;
  };

  /**
   * Measures how far the board has powered up.
   * @param t - Time within the cycle, in seconds.
   * @returns 0 before power-on, rising to 1, and falling back to 0 as parts lift.
   */
  const powerAt = (t: number): number => clamp01((t - assembled) / 0.6) * (1 - clamp01((t - liftStart) / 0.3));

  return { steps, assembled, liftStart, cycle, stepAt, phaseAt, activeStepAt, placedAt, powerAt };
};

export type Timeline = ReturnType<typeof createTimeline>;
