#include "JsonDataSource.hpp"
#include "RepCounter.hpp"
#include "GyroRepCounter.hpp"

#include <chrono>
#include <thread>
#include <iostream>
#include <cmath>

int main() {
  try {
    // Loop the sample forever so the frontend always has data
    for (;;) {
      // New data source for this loop
      JsonDataSource source("data/sample_frames.json");

      // NEW: counters are re-created each loop, so they start at 0 again
      RepCounter accelCounter(
        1.15f,  // high threshold for amag
        1.02f,  // low threshold for amag
        180     // minimum ms between accel reps
      );

      GyroRepCounter gyroCounter(
        1.0f,   // gyro velocity threshold in deg/s
        120     // minimum ms between direction flips
      );

      SensorFrame f{};
      int64_t last_t = -1;

      while (source.next(f)) {
        // simulate real-time spacing based on t_ms in the JSON
        if (last_t >= 0) {
          int64_t dt = f.t_ms - last_t;
          if (dt > 0) {
            std::this_thread::sleep_for(std::chrono::milliseconds(dt));
          }
        }
        last_t = f.t_ms;

        // update both counters
        auto accelEv = accelCounter.update(f);
        auto gyroEv  = gyroCounter.update(f);

        // compute raw acceleration magnitude
        float amag = std::sqrt(f.ax * f.ax + f.ay * f.ay + f.az * f.az);

        // per-loop totals (0 → 4 every loop with your current data)
        int accelReps = accelEv.total_reps;
        int gyroReps  = gyroEv.total_reps;

        // JSON line for Node/frontend
        std::cout
          << "{"
          << "\"t_ms\":"       << f.t_ms    << ","
          << "\"amag\":"       << amag      << ","
          << "\"accel_reps\":" << accelReps << ","
          << "\"gyro_reps\":"  << gyroReps
          << "}"
          << std::endl;
      }

      // small pause between loops so it doesn’t look glitchy
      std::this_thread::sleep_for(std::chrono::milliseconds(300));
    }

    return 0; // unreachable
  } catch (const std::exception& e) {
    std::cerr << "Error: " << e.what() << "\n";
    return 1;
  }
}
