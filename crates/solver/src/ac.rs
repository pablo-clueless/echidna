use std::f64::consts::TAU;

use crate::circuit::{AcOptions, AcSolution, Circuit, Phasor, SolveError};
use crate::dc::{Companion, Network};

/// Most frequencies one sweep may solve at, which bounds both run time and the size of the result.
pub const MAX_AC_POINTS: usize = 10_000;

/// Sweeps the circuit's small-signal response, as SPICE's `.ac dec`. Finds the DC operating point first, linearises
/// every non-linear part there, then solves the linear system at each frequency with the chosen source driven at
/// 1 V or 1 A. Results are therefore transfer functions: volts or amperes per unit of drive.
pub fn solve_ac(circuit: &Circuit, options: &AcOptions) -> Result<AcSolution, SolveError> {
    let frequencies = sweep(options)?;
    let network = Network::new(circuit)?;
    let drive = network
        .source(&options.source)
        .ok_or_else(|| SolveError::InvalidAnalysis {
            reason: format!("no voltage or current source has the ID {}", options.source),
        })?;

    let companions = vec![Companion::default(); circuit.elements.len()];
    let mut states = network.initial_states();
    let mut x = network.unknowns();
    let iterations = network.newton(&mut x, &mut states, &companions)?;
    let operating_point = network.report(&x, &companions, iterations);
    let conductances = network.linearised(&states);

    let (nodes, branches) = network.ac_outputs();
    let mut solution = AcSolution {
        frequencies: Vec::with_capacity(frequencies.len()),
        node_voltages: nodes
            .iter()
            .map(|(name, _)| ((*name).to_owned(), Vec::with_capacity(frequencies.len())))
            .collect(),
        branch_currents: branches
            .iter()
            .map(|(id, _)| ((*id).to_owned(), Vec::with_capacity(frequencies.len())))
            .collect(),
        operating_point,
    };
    for f in frequencies {
        let x = network
            .ac_system(&conductances, TAU * f, drive)
            .solve()
            .ok_or(SolveError::Singular)?;
        let phasor = |i: usize| Phasor {
            re: x[i].0,
            im: x[i].1,
        };
        solution.frequencies.push(f);
        for (name, i) in &nodes {
            if let Some(series) = solution.node_voltages.get_mut(*name) {
                series.push(phasor(*i));
            }
        }
        // A branch unknown is the current from + through the element to −, which is the current into its first pin.
        for (id, i) in &branches {
            if let Some(series) = solution.branch_currents.get_mut(*id) {
                series.push(phasor(*i));
            }
        }
    }
    Ok(solution)
}

/// Frequencies `points_per_decade` to a decade from the start, up to and including the stop frequency, as SPICE
/// spaces them.
fn sweep(options: &AcOptions) -> Result<Vec<f64>, SolveError> {
    let invalid = |reason: &str| {
        Err(SolveError::InvalidAnalysis {
            reason: reason.to_owned(),
        })
    };
    let AcOptions {
        start_frequency: start,
        stop_frequency: stop,
        points_per_decade: per_decade,
        ..
    } = *options;
    if !(start.is_finite() && start > 0.0) {
        return invalid("start frequency must be a positive number of hertz");
    }
    if !(stop.is_finite() && stop >= start) {
        return invalid("stop frequency must be finite and no lower than the start frequency");
    }
    if per_decade == 0 {
        return invalid("there must be at least one point per decade");
    }
    let decades = (stop / start).log10();
    // Allow for rounding, so a stop frequency a whole number of steps away is included exactly once.
    let steps = (decades * per_decade as f64 * (1.0 + 1e-12)).floor();
    if steps + 1.0 > MAX_AC_POINTS as f64 {
        return invalid("too many frequencies; use fewer points per decade or a narrower sweep");
    }
    let ratio = 10f64.powf(1.0 / per_decade as f64);
    Ok((0..=steps as i32).map(|k| start * ratio.powi(k)).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn options(start: f64, stop: f64, per_decade: usize) -> AcOptions {
        AcOptions {
            source: "V1".to_owned(),
            start_frequency: start,
            stop_frequency: stop,
            points_per_decade: per_decade,
        }
    }

    #[test]
    fn spaces_frequencies_evenly_per_decade_including_the_stop() {
        let f = sweep(&options(10.0, 1e4, 10)).unwrap();
        assert_eq!(f.len(), 31);
        assert!((f[10] - 100.0).abs() < 1e-9);
        assert!((f[30] - 1e4).abs() < 1e-6);
        assert_eq!(sweep(&options(50.0, 50.0, 5)).unwrap(), vec![50.0]);
    }

    #[test]
    fn rejects_unusable_settings() {
        for bad in [
            options(0.0, 1e3, 10),
            options(1e3, 10.0, 10),
            options(1.0, f64::INFINITY, 10),
            options(1.0, 1e3, 0),
            options(1e-3, 1e12, 1000),
        ] {
            assert!(matches!(
                sweep(&bad),
                Err(SolveError::InvalidAnalysis { .. })
            ));
        }
    }
}
