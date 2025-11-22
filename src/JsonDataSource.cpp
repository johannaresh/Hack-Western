#include "JsonDataSource.hpp"
#include <nlohmann/json.hpp>
#include <fstream>
#include <stdexcept>

using nlohmann::json;

JsonDataSource::JsonDataSource(const std::string& path) {
  std::ifstream f(path);
  if (!f.is_open()) throw std::runtime_error("Could not open JSON file");

  json j;
  f >> j;
  if (!j.is_array()) throw std::runtime_error("JSON must be an array");

  frames_.reserve(j.size());
  for (const auto& item : j) {
    SensorFrame fr;
    fr.t_ms = item.value("t_ms", 0);

    if (item.contains("accel_g")) {
      const auto& a = item["accel_g"];
      fr.ax = a.value("x", 0.0f);
      fr.ay = a.value("y", 0.0f);
      fr.az = a.value("z", 0.0f);
    }

    if (item.contains("gyro_dps")) {
      const auto& g = item["gyro_dps"];
      fr.gx = g.value("x", 0.0f);
      fr.gy = g.value("y", 0.0f);
      fr.gz = g.value("z", 0.0f);
    }

    frames_.push_back(fr);
  }
}

bool JsonDataSource::next(SensorFrame& out) {
  if (idx_ >= frames_.size()) return false;
  out = frames_[idx_++];
  return true;
}
