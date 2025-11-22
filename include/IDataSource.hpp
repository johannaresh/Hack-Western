#pragma once
#include "SensorFrame.hpp"

class IDataSource {
public:
  virtual ~IDataSource() = default;
  virtual bool next(SensorFrame& out) = 0;
};
