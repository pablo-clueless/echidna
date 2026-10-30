//! Semiconductor device equations and the SPICE voltage-limiting rules that keep Newton–Raphson stable.

/// Conductance added across every junction, as in SPICE, so a reverse-biased diode never leaves a node floating.
pub(crate) const GMIN: f64 = 1e-12;

/// Shockley junction current and its conductance at `vd`, including `GMIN`.
pub(crate) fn junction(is: f64, nvt: f64, vd: f64) -> (f64, f64) {
    let e = (vd / nvt).exp();
    (is * (e - 1.0) + GMIN * vd, is / nvt * e + GMIN)
}

pub(crate) fn critical_voltage(is: f64, nvt: f64) -> f64 {
    nvt * (nvt / (std::f64::consts::SQRT_2 * is)).ln()
}

/// SPICE `pnjlim`: stops a junction voltage jumping so far up the exponential that the next step overflows.
pub(crate) fn limit_junction(proposed: f64, previous: f64, nvt: f64, vcrit: f64) -> f64 {
    if proposed <= vcrit || (proposed - previous).abs() <= 2.0 * nvt {
        return proposed;
    }
    if previous > 0.0 {
        let arg = 1.0 + (proposed - previous) / nvt;
        if arg > 0.0 {
            previous + nvt * arg.ln()
        } else {
            vcrit
        }
    } else {
        nvt * (proposed / nvt).ln()
    }
}

/// Terminal currents of a bipolar transistor and their derivatives, for an NPN. Currents flow into the device.
pub(crate) struct BjtPoint {
    pub ic: f64,
    pub ib: f64,
    /// ∂Ic/∂Vbe and ∂Ic/∂Vbc.
    pub gc: (f64, f64),
    /// ∂Ib/∂Vbe and ∂Ib/∂Vbc.
    pub gb: (f64, f64),
}

/// Ebers–Moll transport model with the forward Early effect, as SPICE Gummel–Poon evaluates it when only
/// `IS`, `BF`, `BR` and `VAF` are set. `GMIN` sits across both junctions.
pub(crate) fn bjt(is: f64, bf: f64, br: f64, vaf: f64, vt: f64, vbe: f64, vbc: f64) -> BjtPoint {
    let (cbe, gbe) = junction(is, vt, vbe);
    let (cbc, gbc) = junction(is, vt, vbc);
    let (cbe_ideal, gbe_ideal) = (cbe - GMIN * vbe, gbe - GMIN);
    let (cbc_ideal, gbc_ideal) = (cbc - GMIN * vbc, gbc - GMIN);

    let inverse_early = if vaf > 0.0 { 1.0 / vaf } else { 0.0 };
    let qb = 1.0 / (1.0 - inverse_early * vbc);
    let dqb_dvbc = inverse_early * qb * qb;
    let transport = cbe_ideal - cbc_ideal;

    BjtPoint {
        ic: transport / qb - cbc_ideal / br - GMIN * vbc,
        ib: cbe_ideal / bf + cbc_ideal / br + GMIN * (vbe + vbc),
        gc: (
            gbe_ideal / qb,
            -gbc_ideal / qb - transport / (qb * qb) * dqb_dvbc - gbc_ideal / br - GMIN,
        ),
        gb: (gbe_ideal / bf + GMIN, gbc_ideal / br + GMIN),
    }
}

/// Drain current of an n-channel level 1 MOSFET and its derivatives ∂Id/∂Vgs and ∂Id/∂Vds. With `vds` below zero
/// the drain and source swap roles, as the device is symmetric.
pub(crate) fn mosfet(vto: f64, beta: f64, lambda: f64, vgs: f64, vds: f64) -> (f64, f64, f64) {
    if vds < 0.0 {
        let (id, gm, gds) = mosfet(vto, beta, lambda, vgs - vds, -vds);
        return (-id, -gm, gm + gds);
    }
    let overdrive = vgs - vto;
    if overdrive <= 0.0 {
        return (0.0, 0.0, 0.0);
    }
    let modulation = 1.0 + lambda * vds;
    if vds < overdrive {
        let shape = (overdrive - 0.5 * vds) * vds;
        (
            beta * shape * modulation,
            beta * vds * modulation,
            beta * (overdrive - vds) * modulation + beta * shape * lambda,
        )
    } else {
        let shape = 0.5 * overdrive * overdrive;
        (
            beta * shape * modulation,
            beta * overdrive * modulation,
            beta * shape * lambda,
        )
    }
}

/// SPICE `fetlim`: limits a gate voltage step so the channel does not jump between off and strongly on.
pub(crate) fn limit_fet(proposed: f64, previous: f64, vto: f64) -> f64 {
    let high = (2.0 * (previous - vto)).abs() + 2.0;
    let low = (previous - vto).abs() + 1.0;
    let fully_on = vto + 3.5;
    let step = proposed - previous;
    if previous >= vto {
        if previous >= fully_on {
            if step <= 0.0 {
                if proposed >= fully_on {
                    if -step > low {
                        previous - low
                    } else {
                        proposed
                    }
                } else {
                    proposed.max(vto + 2.0)
                }
            } else if step >= high {
                previous + high
            } else {
                proposed
            }
        } else if step <= 0.0 {
            proposed.max(vto - 0.5)
        } else {
            proposed.min(vto + 4.0)
        }
    } else if step <= 0.0 {
        if -step > high {
            previous - high
        } else {
            proposed
        }
    } else if proposed <= vto + 0.5 {
        if step > low { previous + low } else { proposed }
    } else {
        vto + 0.5
    }
}

/// SPICE `limvds`: limits a drain–source voltage step.
pub(crate) fn limit_drain_source(proposed: f64, previous: f64) -> f64 {
    if previous >= 3.5 {
        if proposed > previous {
            proposed.min(3.0 * previous + 2.0)
        } else if proposed < 3.5 {
            proposed.max(2.0)
        } else {
            proposed
        }
    } else if proposed > previous {
        proposed.min(4.0)
    } else {
        proposed.max(-0.5)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const VT: f64 = 0.025_864;

    /// Central difference, to check analytic derivatives.
    fn slope(f: impl Fn(f64) -> f64, x: f64) -> f64 {
        let h = 1e-6;
        (f(x + h) - f(x - h)) / (2.0 * h)
    }

    fn near(actual: f64, expected: f64) {
        assert!(
            (actual - expected).abs() <= 1e-5 * expected.abs().max(1e-9),
            "expected {expected}, got {actual}"
        );
    }

    #[test]
    fn bjt_derivatives_match_finite_differences() {
        let at = |vbe: f64, vbc: f64| bjt(1e-14, 200.0, 2.0, 60.0, VT, vbe, vbc);
        for (vbe, vbc) in [(0.65, -4.0), (0.7, 0.55), (0.3, -0.2)] {
            let p = at(vbe, vbc);
            near(p.gc.0, slope(|v| at(v, vbc).ic, vbe));
            near(p.gc.1, slope(|v| at(vbe, v).ic, vbc));
            near(p.gb.0, slope(|v| at(v, vbc).ib, vbe));
            near(p.gb.1, slope(|v| at(vbe, v).ib, vbc));
        }
    }

    #[test]
    fn mosfet_derivatives_match_finite_differences() {
        let at = |vgs: f64, vds: f64| mosfet(1.5, 2e-3, 0.02, vgs, vds);
        for (vgs, vds) in [(4.0, 0.8), (4.0, 6.0), (3.0, -0.7), (3.0, -4.0)] {
            let (_, gm, gds) = at(vgs, vds);
            near(gm, slope(|v| at(v, vds).0, vgs));
            near(gds, slope(|v| at(vgs, v).0, vds));
        }
    }

    #[test]
    fn mosfet_is_continuous_at_the_saturation_edge() {
        let (below, ..) = mosfet(1.0, 1e-3, 0.05, 3.0, 2.0 - 1e-9);
        let (above, ..) = mosfet(1.0, 1e-3, 0.05, 3.0, 2.0 + 1e-9);
        near(below, above);
    }

    #[test]
    fn mosfet_is_off_below_threshold() {
        assert_eq!(mosfet(2.0, 1e-3, 0.0, 1.9, 5.0), (0.0, 0.0, 0.0));
    }
}
