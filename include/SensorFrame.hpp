#pragma once
#include <cstdint>

struct SensorFrame {
  int64_t t_ms = 0;
  float ax = 0, ay = 0, az = 0;   // accel in g
  float gx = 0, gy = 0, gz = 0;   // gyro in deg/s
};
