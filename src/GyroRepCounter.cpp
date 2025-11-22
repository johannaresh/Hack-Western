#include "GyroRepCounter.hpp"
#include <iostream>   



GyroRepCounter::GyroRepCounter(float vel_thresh, int min_flip_gap_ms)
  : thresh_(vel_thresh), min_gap_ms_(min_flip_gap_ms) {}

RepEvent GyroRepCounter::update(const SensorFrame& f) {
  // Use rotation around Y axis for now
  float g = f.gy;

  RepEvent ev{};
  ev.completed  = false;
  ev.total_reps = total_;

  // Magnitude of angular velocity
  float mag = std::fabs(g);

  // 1) If we are below threshold, we're in the "deadband" (near zero motion)
  if (mag <= thresh_) {
    in_deadband_ = true;
    // we don't change direction or count anything here
    return ev;
  }

  // 2) Decide direction once above threshold
  int dir = (g > 0.0f) ? +1 : -1;

  // If we haven't yet seen any direction, just record it
  if (last_dir_ == 0) {
    last_dir_     = dir;
    in_deadband_  = false;
    last_flip_t_  = f.t_ms;   // starting reference
    return ev;
  }

  // 3) Only consider direction changes when we have just left the deadband.
  //    This prevents multiple flips while still in the same swing.
  if (!in_deadband_ && dir == last_dir_) {
    // still moving in same direction, nothing to do
    return ev;
  }

  // If we get here, we have mag > thresh_ AND either:
  // - we just left deadband (in_deadband_ was true), or
  // - dir != last_dir_ right after leaving deadband.

  if (in_deadband_) {
    // We've just left the deadband; now check if direction is different
    // from the previous direction. If same, it's just starting a new swing
    // in the same direction (common after first rep); we only count flips
    // when direction actually reverses.
    in_deadband_ = false;

    if (dir == last_dir_) {
      // same direction as before, just resume moving; no flip
      return ev;
    }

    // 4) Direction actually flipped (+1 -> -1 or -1 -> +1) after deadband
    int64_t now = f.t_ms;

    // enforce minimum time between flips to avoid rapid noise
    if (last_flip_t_ < 0 || (now - last_flip_t_) >= min_gap_ms_) {
      flips_++;
      last_flip_t_ = now;
      last_dir_    = dir;

      // Two valid flips = one full rep
      if (flips_ == 2) {
        flips_ = 0;
        total_++;
        ev.completed  = true;
        ev.total_reps = total_;
      }
    }

    return ev;
  }

  // If we somehow got here, we are above threshold, not in deadband,
  // and dir != last_dir_, but we didn't just leave deadband.
  // To be safe, update direction but don't count as a flip.
  last_dir_ = dir;
  return ev;
}
