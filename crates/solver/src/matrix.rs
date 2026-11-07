/// Dense square system `A·x = b`, stored row-major. Circuits are capped at a few hundred unknowns, where
/// dense LU is fast enough and simpler than a sparse factorisation.
#[derive(Debug, Clone)]
pub(crate) struct System {
    n: usize,
    a: Vec<f64>,
    b: Vec<f64>,
}

impl System {
    pub(crate) fn new(n: usize) -> Self {
        Self {
            n,
            a: vec![0.0; n * n],
            b: vec![0.0; n],
        }
    }

    pub(crate) fn add(&mut self, row: usize, col: usize, value: f64) {
        self.a[row * self.n + col] += value;
    }

    pub(crate) fn add_rhs(&mut self, row: usize, value: f64) {
        self.b[row] += value;
    }

    /// The coefficient matrix, row-major, without solving.
    pub(crate) fn into_matrix(self) -> Vec<f64> {
        self.a
    }

    /// Solves in place with partial pivoting. Returns `None` when the matrix is singular.
    pub(crate) fn solve(mut self) -> Option<Vec<f64>> {
        let n = self.n;
        let scale = self.a.iter().fold(0.0_f64, |m, v| m.max(v.abs()));
        let tiny = scale * 1e-15;

        for k in 0..n {
            let pivot = (k..n)
                .max_by(|&i, &j| self.a[i * n + k].abs().total_cmp(&self.a[j * n + k].abs()))?;
            if self.a[pivot * n + k].abs() <= tiny {
                return None;
            }
            if pivot != k {
                for c in 0..n {
                    self.a.swap(k * n + c, pivot * n + c);
                }
                self.b.swap(k, pivot);
            }
            let diag = self.a[k * n + k];
            for i in k + 1..n {
                let factor = self.a[i * n + k] / diag;
                if factor == 0.0 {
                    continue;
                }
                for c in k..n {
                    self.a[i * n + c] -= factor * self.a[k * n + c];
                }
                self.b[i] -= factor * self.b[k];
            }
        }

        let mut x = vec![0.0; n];
        for k in (0..n).rev() {
            let tail: f64 = (k + 1..n).map(|c| self.a[k * n + c] * x[c]).sum();
            x[k] = (self.b[k] - tail) / self.a[k * n + k];
        }
        Some(x)
    }
}

type Complex = (f64, f64);

fn mul((a, b): Complex, (c, d): Complex) -> Complex {
    (a * c - b * d, a * d + b * c)
}

fn div((a, b): Complex, (c, d): Complex) -> Complex {
    let m = c * c + d * d;
    ((a * c + b * d) / m, (b * c - a * d) / m)
}

fn norm((a, b): Complex) -> f64 {
    a.hypot(b)
}

/// Dense complex square system `(G + jB)·x = b`, for AC analysis: `G` from conductances, `B` from reactances.
#[derive(Debug, Clone)]
pub(crate) struct ComplexSystem {
    n: usize,
    a: Vec<Complex>,
    b: Vec<Complex>,
}

impl ComplexSystem {
    /// Starts from a real matrix, row-major, such as the linearised conductances at the operating point.
    pub(crate) fn from_real(n: usize, real: &[f64]) -> Self {
        Self {
            n,
            a: real.iter().map(|&g| (g, 0.0)).collect(),
            b: vec![(0.0, 0.0); n],
        }
    }

    pub(crate) fn add_imag(&mut self, row: usize, col: usize, value: f64) {
        self.a[row * self.n + col].1 += value;
    }

    pub(crate) fn add_rhs(&mut self, row: usize, value: f64) {
        self.b[row].0 += value;
    }

    /// Solves with partial pivoting. Returns `None` when the matrix is singular.
    pub(crate) fn solve(mut self) -> Option<Vec<Complex>> {
        let n = self.n;
        let scale = self.a.iter().fold(0.0_f64, |m, &v| m.max(norm(v)));
        let tiny = scale * 1e-15;

        for k in 0..n {
            let pivot = (k..n)
                .max_by(|&i, &j| norm(self.a[i * n + k]).total_cmp(&norm(self.a[j * n + k])))?;
            if norm(self.a[pivot * n + k]) <= tiny {
                return None;
            }
            if pivot != k {
                for c in 0..n {
                    self.a.swap(k * n + c, pivot * n + c);
                }
                self.b.swap(k, pivot);
            }
            let diag = self.a[k * n + k];
            for i in k + 1..n {
                let factor = div(self.a[i * n + k], diag);
                if factor == (0.0, 0.0) {
                    continue;
                }
                for c in k..n {
                    let (re, im) = mul(factor, self.a[k * n + c]);
                    self.a[i * n + c].0 -= re;
                    self.a[i * n + c].1 -= im;
                }
                let (re, im) = mul(factor, self.b[k]);
                self.b[i].0 -= re;
                self.b[i].1 -= im;
            }
        }

        let mut x = vec![(0.0, 0.0); n];
        for k in (0..n).rev() {
            let mut rest = self.b[k];
            for (&a, &xc) in self.a[k * n + k + 1..(k + 1) * n].iter().zip(&x[k + 1..]) {
                let (re, im) = mul(a, xc);
                rest.0 -= re;
                rest.1 -= im;
            }
            x[k] = div(rest, self.a[k * n + k]);
        }
        Some(x)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn solves_a_complex_system() {
        // (1 + j)·x = 2 gives x = 1 − j.
        let mut s = ComplexSystem::from_real(1, &[1.0]);
        s.add_imag(0, 0, 1.0);
        s.add_rhs(0, 2.0);
        let x = s.solve().unwrap();
        assert!((x[0].0 - 1.0).abs() < 1e-15 && (x[0].1 + 1.0).abs() < 1e-15);
    }

    #[test]
    fn solves_with_pivoting() {
        let mut s = System::new(2);
        s.add(0, 1, 1.0);
        s.add(1, 0, 2.0);
        s.add(1, 1, 1.0);
        s.add_rhs(0, 3.0);
        s.add_rhs(1, 5.0);
        assert_eq!(s.solve(), Some(vec![1.0, 3.0]));
    }

    #[test]
    fn detects_singular() {
        let mut s = System::new(2);
        s.add(0, 0, 1.0);
        s.add(0, 1, 1.0);
        s.add(1, 0, 2.0);
        s.add(1, 1, 2.0);
        assert_eq!(s.solve(), None);
    }
}
