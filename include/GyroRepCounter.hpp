#pragma once

#include "RepCounter.hpp"   // gives you RepEvent + SensorFrame

class GyroRepCounter {
public:
  // vel_thresh: minimum |gyro| (deg/s) to count as real motion
  // min_flip_gap_ms: minimum time between direction flips
  GyroRepCounter(float vel_thresh, int min_flip_gap_ms);

  RepEvent update(const SensorFrame& f);

private:
  float thresh_;
  int min_gap_ms_;

  int total_ = 0;          // total reps detected
  int flips_ = 0;          // how many valid direction changes seen in current rep
  int last_dir_ = 0;       // +1 or -1
  bool     in_deadband_ = true;
  int64_t last_flip_t_ = -1;
};
