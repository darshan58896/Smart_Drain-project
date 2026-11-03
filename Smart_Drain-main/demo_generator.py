#!/usr/bin/env python3
"""
SmartDrain — Python Demo Data Generator
Sends simulated telemetry to the backend REST API.
Useful when hardware is not available.

Usage:
  python demo_generator.py                  # Run all 5 scenarios in sequence
  python demo_generator.py --scenario 3    # Stream scenario 3 continuously
  python demo_generator.py --count 30      # Send 30 readings per scenario
"""

import argparse
import json
import random
import sys
import time
import urllib.request
import urllib.error

BACKEND = "http://localhost:3001"
DEVICE_ID = "DRAIN_001"

# Scenario definitions — match the backend demo scenarios
SCENARIOS = {
    1: {
        "name": "Normal Drainage",
        "water_distance_cm": (11.0, 13.0),  # range (min, max)
        "rain_value": (850, 1000),
        "flow_rate_lpm": (6.0, 7.0),
    },
    2: {
        "name": "Rising Water",
        "water_distance_cm": (7.5, 9.5),
        "rain_value": (380, 550),
        "flow_rate_lpm": (3.5, 4.5),
    },
    3: {
        "name": "Partial Blockage",
        "water_distance_cm": (2.5, 4.5),
        "rain_value": (150, 280),
        "flow_rate_lpm": (0.5, 1.2),
    },
    4: {
        "name": "Critical",
        "water_distance_cm": (1.0, 2.5),
        "rain_value": (80, 180),
        "flow_rate_lpm": (0.1, 0.5),
    },
    5: {
        "name": "Recovery",
        "water_distance_cm": (8.0, 10.0),
        "rain_value": (450, 600),
        "flow_rate_lpm": (5.0, 6.0),
    },
}


def rand(lo, hi):
    return round(random.uniform(lo, hi), 2)


def send_telemetry(data):
    payload = json.dumps(data).encode()
    req = urllib.request.Request(
        f"{BACKEND}/api/telemetry",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=5) as resp:
            result = json.loads(resp.read())
            r = result.get("processed", {})
            print(
                f"  ✓ Risk: {r.get('risk_level','?'):8} "
                f"Score: {r.get('risk_score','?'):3} "
                f"Level: {r.get('water_level_percent','?'):3}% "
                f"Rain: {r.get('rain_intensity','?'):8} "
                f"Flow: {r.get('flow_rate_lpm','?')} L/m"
            )
    except urllib.error.URLError as e:
        print(f"  ✗ Connection error: {e}. Is the backend running on {BACKEND}?")
        sys.exit(1)


def run_scenario(scenario_num, count, interval):
    s = SCENARIOS[scenario_num]
    print(f"\n{'─'*60}")
    print(f"  Scenario {scenario_num}: {s['name']} ({count} readings, {interval}s interval)")
    print(f"{'─'*60}")
    for i in range(count):
        data = {
            "device_id":        DEVICE_ID,
            "water_distance_cm": rand(*s["water_distance_cm"]),
            "rain_value":        int(rand(*s["rain_value"])),
            "flow_rate_lpm":    rand(*s["flow_rate_lpm"]),
            "wifi_status":      "ONLINE",
        }
        print(f"  [{i+1:3d}/{count}]", end=" ")
        send_telemetry(data)
        if i < count - 1:
            time.sleep(interval)


def main():
    parser = argparse.ArgumentParser(description="SmartDrain demo data generator")
    parser.add_argument("--scenario", type=int, choices=[1,2,3,4,5],
                        help="Run only this scenario continuously")
    parser.add_argument("--count", type=int, default=15,
                        help="Readings per scenario (default: 15)")
    parser.add_argument("--interval", type=float, default=2.0,
                        help="Seconds between readings (default: 2.0)")
    args = parser.parse_args()

    print("\n🚰 SmartDrain — Python Demo Generator")
    print(f"   Backend: {BACKEND}")
    print(f"   Device:  {DEVICE_ID}")

    if args.scenario:
        # Stream single scenario in a loop
        print(f"\n   Streaming Scenario {args.scenario} indefinitely. Ctrl+C to stop.")
        try:
            while True:
                run_scenario(args.scenario, args.count, args.interval)
        except KeyboardInterrupt:
            print("\n\n   Stopped.")
    else:
        # Run all 5 scenarios in sequence
        print(f"\n   Running all 5 scenarios ({args.count} readings each)...")
        for scenario_num in [1, 2, 3, 4, 5]:
            run_scenario(scenario_num, args.count, args.interval)
        print("\n✅ Demo sequence complete.")


if __name__ == "__main__":
    main()
