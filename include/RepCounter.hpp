#pragma once
#include "SensorFrame.hpp"

struct RepEvent {
  bool completed = false;
  int total_reps = 0;
};

class RepCounter {
public:
  RepCounter(float high_thresh, float low_thresh, int min_gap_ms);

  RepEvent update(const SensorFrame& f);

private:
  float high_;
  float low_;
  int min_gap_ms_;

  bool waiting_for_peak_ = true;
  int total_ = 0;
  int64_t last_rep_t_ = -1;

  bool has_prev_ = false;
  float prev_filt_ = 0.0f;

  float lowpass(float x);
};
