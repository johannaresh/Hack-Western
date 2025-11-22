#pragma once
#include "IDataSource.hpp"
#include <string>
#include <vector>

class JsonDataSource : public IDataSource {
public:
  explicit JsonDataSource(const std::string& path);
  bool next(SensorFrame& out) override;

private:
  std::vector<SensorFrame> frames_;
  size_t idx_ = 0;
};
