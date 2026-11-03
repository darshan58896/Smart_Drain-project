"""Optional experimental ML inference API for SmartDrain."""
from contextlib import asynccontextmanager
from pathlib import Path
import joblib
import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

ROOT = Path(__file__).resolve().parent
MODEL_PATH = ROOT / "artifacts" / "risk_classifier.joblib"
FEATURES = ["water_level_percent", "rise_rate_cm_min", "rain_sensor_value", "rain_intensity_code"]

# Model bundle is loaded once at startup and held in memory.
# This eliminates per-request disk I/O (12 MB joblib file) that caused
# cold-start latency spikes exceeding the backend ML_TIMEOUT_MS.
_bundle: dict | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _bundle
    if MODEL_PATH.exists():
        _bundle = joblib.load(MODEL_PATH)
    yield
    _bundle = None


app = FastAPI(title="SmartDrain Experimental ML API", version="0.1.0", lifespan=lifespan)


class PredictionRequest(BaseModel):
    water_level_percent: float = Field(ge=0, le=100)
    rise_rate_cm_min: float = Field(ge=-20, le=20)
    rain_sensor_value: int = Field(ge=0, le=1023, description="Raw ADC value; calibrate per sensor")


def rain_code(raw: int) -> int:
    # Mirrors the example thresholds in the current SmartDrain risk engine.
    return 0 if raw > 800 else 1 if raw > 600 else 2 if raw > 350 else 3


@app.get("/")
def root():
    return {
        "service": "SmartDrain Experimental ML API",
        "docs_url": "/docs",
        "health_url": "/health",
        "status": "running"
    }


@app.get("/health")
def health():
    return {
        "status": "ok",
        "model_loaded": _bundle is not None,
        "data_type": "synthetic-trained experimental model",
    }


@app.post("/predict")
def predict(req: PredictionRequest):
    if _bundle is None:
        raise HTTPException(
            status_code=503,
            detail="Model not loaded. Run generate_dataset.py and train_model.py first.",
        )
    # Pass as a named DataFrame to match the feature names the Pipeline was fitted on,
    # suppressing sklearn's feature-name validation warning.
    x = pd.DataFrame([[
        req.water_level_percent,
        req.rise_rate_cm_min,
        req.rain_sensor_value,
        rain_code(req.rain_sensor_value),
    ]], columns=FEATURES)
    model = _bundle["model"]
    label = str(model.predict(x)[0])
    probabilities = model.predict_proba(x)[0]
    class_probabilities = {str(c): round(float(p), 4) for c, p in zip(model.classes_, probabilities)}
    return {
        "risk_prediction_experimental": label,
        "class_probabilities": class_probabilities,
        "model_type": "RandomForestClassifier",
        "training_data_type": "synthetic",
        "real_world_validated": False,
        "warning": "Experimental prediction trained on synthetic rule-derived labels; do not use as a standalone safety decision. Keep rule-based alerts enabled.",
    }
