use crate::circuit::{Circuit, ElementKind, SolveError, TransientOptions, TransientSolution};
use crate::dc::{Companion, Network};

/// Most time steps one run may take, which bounds both run time and the size of the result.
pub const MAX_TIME_STEPS: usize = 100_000;

/// Simulates the circuit from switch-on: at time zero every capacitor is discharged and no current flows in any
/// inductor, as with SPICE's `.tran … uic`. Sources hold their DC values throughout.
///
/// Takes equal steps, solving each with Newton–Raphson from the previous step's answer. The first step is backward
/// Euler, since only one past value is known; the rest use the second-order backward difference formula (Gear 2),
/// which is accurate to second order like the trapezoidal rule but does not ring after a sudden change.
pub fn solve_transient(
    circuit: &Circuit,
    options: &TransientOptions,
) -> Result<TransientSolution, SolveError> {
    let steps = step_count(options)?;
    let network = Network::new(circuit)?;
    let h = options.stop_time / steps as f64;

    let mut states = network.initial_states();
    let mut x = network.unknowns();
    let mut now = vec![0.0; circuit.elements.len()];
    let mut before = now.clone();

    let mut solution = TransientSolution {
        times: Vec::with_capacity(steps),
        node_voltages: Default::default(),
        pin_currents: Default::default(),
        component_power: Default::default(),
        iterations: 0,
    };
    for step in 1..=steps {
        // Derivative of a stored quantity q ≈ (a0·q[n+1] + a1·q[n] + a2·q[n−1]) / h.
        let (a0, a1, a2) = if step == 1 {
            (1.0, -1.0, 0.0)
        } else {
            (1.5, -2.0, 0.5)
        };
        let companions: Vec<Companion> = circuit
            .elements
            .iter()
            .zip(now.iter().zip(&before))
            .map(|(element, (q, q_before))| {
                let scale = match element.kind {
                    ElementKind::Capacitor { capacitance } => capacitance / h,
                    ElementKind::Inductor { inductance } => inductance / h,
                    _ => return Companion::default(),
                };
                Companion {
                    gain: a0 * scale,
                    offset: scale * (a1 * q + a2 * q_before),
                }
            })
            .collect();

        solution.iterations += network.newton(&mut x, &mut states, &companions)?;
        before = std::mem::replace(&mut now, network.stored(&x));

        let sample = network.report(&x, &companions, 0);
        solution.times.push(step as f64 * h);
        for (node, v) in sample.node_voltages {
            solution.node_voltages.entry(node).or_default().push(v);
        }
        for (id, currents) in sample.pin_currents {
            let series = solution
                .pin_currents
                .entry(id)
                .or_insert_with(|| vec![Vec::with_capacity(steps); currents.len()]);
            for (pin, i) in series.iter_mut().zip(currents) {
                pin.push(i);
            }
        }
        for (id, p) in sample.component_power {
            solution.component_power.entry(id).or_default().push(p);
        }
    }
    Ok(solution)
}

fn step_count(options: &TransientOptions) -> Result<usize, SolveError> {
    let invalid = |reason: &str| {
        Err(SolveError::InvalidAnalysis {
            reason: reason.to_owned(),
        })
    };
    let TransientOptions {
        stop_time,
        time_step,
    } = *options;
    if !(stop_time.is_finite() && stop_time > 0.0) {
        return invalid("stop time must be a positive number of seconds");
    }
    if !(time_step.is_finite() && time_step > 0.0) {
        return invalid("time step must be a positive number of seconds");
    }
    // Allow for rounding, so a stop time that is a whole number of steps takes exactly that many.
    let steps = (stop_time / time_step * (1.0 - 1e-12)).ceil();
    if steps > MAX_TIME_STEPS as f64 {
        return invalid("too many time steps; lengthen the step or shorten the run");
    }
    Ok(steps.max(1.0) as usize)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(stop_time: f64, time_step: f64) -> TransientOptions {
        TransientOptions {
            stop_time,
            time_step,
        }
    }

    #[test]
    fn takes_whole_steps_that_end_at_the_stop_time() {
        assert_eq!(step_count(&options(1e-3, 1e-5)), Ok(100));
        assert_eq!(step_count(&options(1e-3, 3e-4)), Ok(4));
        assert_eq!(step_count(&options(1e-3, 1.0)), Ok(1));
    }

    #[test]
    fn rejects_unusable_settings() {
        for bad in [
            options(0.0, 1e-6),
            options(1e-3, 0.0),
            options(f64::NAN, 1e-6),
            options(1e-3, f64::INFINITY),
            options(1.0, 1e-6),
        ] {
            assert!(matches!(
                step_count(&bad),
                Err(SolveError::InvalidAnalysis { .. })
            ));
        }
    }
}
