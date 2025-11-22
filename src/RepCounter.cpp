#include "RepCounter.hpp"
#include <cmath>
#include <iostream>   


RepCounter::RepCounter(float high_thresh, float low_thresh, int min_gap_ms)
  : high_(high_thresh), low_(low_thresh), min_gap_ms_(min_gap_ms) {}

float RepCounter::lowpass(float x) {
  const float alpha = 0.6f; // tune later
  if (!has_prev_) {
    has_prev_ = true;
    prev_filt_ = x;
    return x;
  }
  prev_filt_ = alpha * x + (1.0f - alpha) * prev_filt_;
  return prev_filt_;
}

RepEvent RepCounter::update(const SensorFrame& f) {
  float amag = std::sqrt(f.ax*f.ax + f.ay*f.ay + f.az*f.az);
  float s = lowpass(amag);


  RepEvent ev;
  ev.total_reps = total_;

  if (waiting_for_peak_) {
    if (s > high_) {
      waiting_for_peak_ = false;
    }
  } else {
    if (s < low_) {
      if (last_rep_t_ < 0 || (f.t_ms - last_rep_t_) >= min_gap_ms_) {
        total_++;
        last_rep_t_ = f.t_ms;
        ev.completed = true;
        ev.total_reps = total_;
      }
      waiting_for_peak_ = true;
    }
  }

  return ev;
}
