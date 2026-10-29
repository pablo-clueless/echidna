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

#[cfg(test)]
mod tests {
    use super::*;

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
