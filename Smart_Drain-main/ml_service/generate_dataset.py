"""Generate an explicitly synthetic SmartDrain training dataset.
These labels are rule-derived simulation labels, not observed overflow outcomes.
"""
from pathlib import Path
import argparse
import numpy as np
import pandas as pd

FEATURES = ["water_level_percent", "rise_rate_cm_min", "rain_sensor_value", "rain_intensity_code"]
LABELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--rows", type=int, default=12000)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--output", default="data/synthetic_smartdrain.csv")
    args = parser.parse_args()
    if args.rows < 1000:
        parser.error("Use at least 1000 rows for this demonstration")
    rng = np.random.default_rng(args.seed)
    n = args.rows
    # Mix broad, plausible operating regimes instead of sampling every feature uniformly.
    regimes = rng.choice([0, 1, 2, 3], size=n, p=[0.48, 0.27, 0.17, 0.08])
    level_means = np.array([25, 55, 76, 91])
    rise_means = np.array([0.00, 0.12, 0.42, 0.95])
    rain_means = np.array([900, 700, 430, 230])
    level = np.clip(rng.normal(level_means[regimes], [16, 13, 10, 6][0] if False else 12, n), 0, 100)
    rise = np.clip(rng.normal(rise_means[regimes], 0.25, n), -0.7, 2.5)
    rain = np.clip(rng.normal(rain_means[regimes], 110, n), 0, 1023)
    rain_code = np.where(rain > 800, 0, np.where(rain > 600, 1, np.where(rain > 350, 2, 3)))
    # Transparent rule-derived synthetic target. This is not a measured overflow label.
    score = np.zeros(n)
    score += np.where(level >= 90, 40, np.where(level >= 80, 30, np.where(level >= 60, 15, np.where(level >= 40, 5, 0))))
    score += np.where(rise > 0.8, 30, np.where(rise > 0.3, 15, np.where(rise > 0.05, 5, 0)))
    score += np.where(rain_code == 3, 20, np.where(rain_code == 2, 10, np.where(rain_code == 1, 3, 0)))
    # Small label noise keeps the task from being a perfectly deterministic lookup table.
    score = np.clip(score + rng.normal(0, 4, n), 0, 100)
    label = np.where(score >= 75, "CRITICAL", np.where(score >= 50, "HIGH", np.where(score >= 25, "MEDIUM", "LOW")))
    # Add synthetic timestamps and scenario IDs for traceability; not model features.
    start = pd.Timestamp("2026-01-01T00:00:00Z")
    timestamps = start + pd.to_timedelta(np.arange(n) * 3, unit="s")
    df = pd.DataFrame({
        "timestamp": timestamps.astype(str),
        "scenario_id": [f"SYN-{i // 20:05d}" for i in range(n)],
        "water_level_percent": np.round(level, 2),
        "rise_rate_cm_min": np.round(rise, 3),
        "rain_sensor_value": np.round(rain).astype(int),
        "rain_intensity_code": rain_code.astype(int),
        "risk_label": label,
        "label_source": "synthetic_rule_derived_not_observed_overflow",
    })
    out = Path(args.output)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False)
    print(f"Wrote {len(df)} synthetic rows to {out.resolve()}")
    print("Label counts:")
    print(df.risk_label.value_counts().to_string())
    print("WARNING: labels are generated from simulation rules, not observed real-world overflow events.")

if __name__ == "__main__":
    main()
