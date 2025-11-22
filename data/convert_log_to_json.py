import re
import json
import math

INPUT_FILE = "data.txt"   
OUTPUT_FILE = "sensor_data.json"
DT_MS = 20                       # time step between frames

G = 9.80665                      # m/s^2 per g
RAD_TO_DEG = 180.0 / math.pi     # rad/s to deg/s


# Regexes for parsing lines
accel_re = re.compile(
    r"Acceleration X:\s*([-0-9.]+),\s*Y:\s*([-0-9.]+),\s*Z:\s*([-0-9.]+)\s*m/s\^2"
)
gyro_re = re.compile(
    r"Rotation X:\s*([-0-9.]+),\s*Y:\s*([-0-9.]+),\s*Z:\s*([-0-9.]+)\s*rad/s"
)

def parse_log_to_frames(INPUT_FILE):
    # Read non-empty lines
    with open(INPUT_FILE, "r") as f:
        lines = [ln.strip() for ln in f if ln.strip()]

    frames = []
    t_ms = 0

    # Expect pairs: Accel line, then Rotation line
    i = 0
    while i + 1 < len(lines):
        accel_line = lines[i]
        gyro_line  = lines[i + 1]

        ma = accel_re.search(accel_line)
        mg = gyro_re.search(gyro_line)

        if not ma or not mg:
            # If format is off, skip these two and move on
            print(f"Skipping lines {i}, {i+1} due to parse error")
            i += 2
            continue

        ax_ms2 = float(ma.group(1))
        ay_ms2 = float(ma.group(2))
        az_ms2 = float(ma.group(3))

        gx_rads = float(mg.group(1))
        gy_rads = float(mg.group(2))
        gz_rads = float(mg.group(3))

        # Convert units
        ax_g = ax_ms2 / G
        ay_g = ay_ms2 / G
        az_g = az_ms2 / G

        gx_dps = gx_rads * RAD_TO_DEG
        gy_dps = gy_rads * RAD_TO_DEG
        gz_dps = gz_rads * RAD_TO_DEG

        frame = {
            "t_ms": t_ms,
            "accel_g": {
                "x": round(ax_g, 5),
                "y": round(ay_g, 5),
                "z": round(az_g, 5),
            },
            "gyro_dps": {
                "x": round(gx_dps, 5),
                "y": round(gy_dps, 5),
                "z": round(gz_dps, 5),
            }
            # stress_raw / strain_ue ignored as requested
        }

        frames.append(frame)

        t_ms += DT_MS
        i += 2

    return frames


def main():
    frames = parse_log_to_frames(INPUT_FILE)
    print(f"Parsed {len(frames)} frames")

    # Write as JSON array, pretty-printed
    with open(OUTPUT_FILE, "w") as out:
        json.dump(frames, out, indent=2)

    print(f"Wrote {OUTPUT_FILE}")


if __name__ == "__main__":
    main()
