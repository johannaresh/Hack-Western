#include "GyroRepCounter.hpp"

GyroRepCounter::GyroRepCounter(float vel_thresh, int min_flip_gap_ms)
  : thresh_(vel_thresh), min_gap_ms_(min_flip_gap_ms) {}

RepEvent GyroRepCounter::update(const SensorFrame& f) {
  // For now, use gy (rotation around Y axis). Later you can change axis if needed.
  float g = f.gy;

  RepEvent ev{};
  ev.completed = false;
  ev.total_reps = total_;

  // 1) Decide "direction" only when we're moving enough
  int dir = 0;
  if (g >  thresh_) dir = +1;
  else if (g < -thresh_) dir = -1;

  // no meaningful motion
  if (dir == 0) {
    return ev;
  }

  // 2) First time we see a direction, just record it
  if (last_dir_ == 0) {
    last_dir_ = dir;
    return ev;
  }

  // 3) Direction flipped (+1 -> -1 or -1 -> +1)
  if (dir != last_dir_) {
    int64_t now = f.t_ms;

    // enforce minimum time between direction flips to avoid noise
    if (last_flip_t_ < 0 || (now - last_flip_t_) >= min_gap_ms_) {
      flips_++;
      last_flip_t_ = now;

      // 4) Two valid flips = one full rep
      if (flips_ == 2) {
        flips_ = 0;
        total_++;
        ev.completed = true;
        ev.total_reps = total_;
      }
    }

    // update last direction
    last_dir_ = dir;
  }

  return ev;
}
