"""Train a baseline Random Forest on synthetic SmartDrain data only."""
from pathlib import Path
import json
import joblib
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import accuracy_score, classification_report, confusion_matrix
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.impute import SimpleImputer

ROOT = Path(__file__).resolve().parent
DATA = ROOT / "data" / "synthetic_smartdrain.csv"
ARTIFACTS = ROOT / "artifacts"
FEATURES = ["water_level_percent", "rise_rate_cm_min", "rain_sensor_value", "rain_intensity_code"]


def main():
    if not DATA.exists():
        raise SystemExit("Dataset not found. Run: python generate_dataset.py first")
    df = pd.read_csv(DATA)
    X = df[FEATURES]
    y = df["risk_label"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.20, random_state=42, stratify=y
    )
    model = Pipeline([
        ("imputer", SimpleImputer(strategy="median")),
        ("classifier", RandomForestClassifier(
            n_estimators=250, max_depth=12, min_samples_leaf=3,
            class_weight="balanced", random_state=42, n_jobs=-1
        )),
    ])
    model.fit(X_train, y_train)
    pred = model.predict(X_test)
    report = {
        "model": "RandomForestClassifier",
        "training_data": "synthetic SmartDrain simulation; rule-derived labels",
        "real_world_validation": False,
        "rows_total": int(len(df)),
        "rows_train": int(len(X_train)),
        "rows_test": int(len(X_test)),
        "features": FEATURES,
        "accuracy_on_synthetic_holdout": float(accuracy_score(y_test, pred)),
        "classification_report": classification_report(y_test, pred, output_dict=True, zero_division=0),
        "confusion_matrix_labels_order": sorted(y.unique().tolist()),
        "confusion_matrix": confusion_matrix(y_test, pred, labels=sorted(y.unique().tolist())).tolist(),
        "important_note": "These metrics measure agreement with synthetic rule-derived labels only; they do not establish real-world overflow prediction accuracy."
    }
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    joblib.dump({"model": model, "features": FEATURES, "classes": list(model.classes_), "training_data_type": "synthetic"}, ARTIFACTS / "risk_classifier.joblib")
    (ARTIFACTS / "evaluation_report.json").write_text(json.dumps(report, indent=2))
    print(f"Synthetic holdout accuracy: {report['accuracy_on_synthetic_holdout']:.3f}")
    print("Saved artifacts/risk_classifier.joblib and artifacts/evaluation_report.json")
    print("Reminder: synthetic holdout metrics are not real-world performance evidence.")

if __name__ == "__main__":
    main()
