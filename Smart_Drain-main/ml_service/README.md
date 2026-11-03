# SmartDrain Experimental ML Module

This module adds an **experimental** Random Forest risk classifier without changing the ESP8266 firmware or replacing `backend/riskEngine.js`.

## Important limitations

- The included dataset is synthetic and labels are generated from transparent rules, not observed overflow events.
- Accuracy and classification metrics in `artifacts/evaluation_report.json` only measure agreement with synthetic rule-derived labels.
- These metrics do **not** establish real-world overflow prediction accuracy.
- Keep the existing rule-based engine and hardware buzzer protections enabled. Do not use this model as the sole safety system.
- The API's `rain_sensor_value` is the raw ADC value. It does not represent rainfall in mm/h unless separately calibrated.

## Setup (Windows PowerShell)

From the `ml_service` directory:

```powershell
py -m venv .venv
.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
pip install -r requirements.txt
python generate_dataset.py --rows 12000
python train_model.py
uvicorn app:app --host 127.0.0.1 --port 8000
```

Check `http://127.0.0.1:8000/health` and API docs at `http://127.0.0.1:8000/docs`.

## Example request

```powershell
Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8000/predict -ContentType 'application/json' -Body '{"water_level_percent":72,"rise_rate_cm_min":0.35,"rain_sensor_value":420}'
```

Response contains an experimental class and class probabilities. Probabilities are model outputs, not calibrated real-world overflow probabilities.

## Backend integration plan

The service is deliberately separate so a Python dependency cannot break the current Node backend. The next integration step is to add a timeout-protected optional call from Node.js and display the result with an `experimental` label. If the ML service is offline, existing rule-based risk assessment must continue working. Do not feed the synthetic prediction into incident creation until it has been reviewed and validated.

## Moving toward real-world validation

1. Continue saving timestamped IoT readings.
2. Collect varied operating conditions across dry, rainy, rising, and falling water levels.
3. Record observed outcomes separately from threshold-derived risk categories.
4. Split real data by time (not random rows) to avoid leakage between adjacent readings.
5. Evaluate against real outcomes and compare against the current rule-based baseline.
6. Retrain only after the real dataset and labels are sufficiently representative.
