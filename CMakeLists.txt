cmake_minimum_required(VERSION 3.16)
project(presage_sensors LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

add_executable(presage_app
  app/main.cpp
  src/JsonDataSource.cpp
  src/RepCounter.cpp
  src/GyroRepCounter.cpp 
)

target_include_directories(presage_app PRIVATE include)

# nlohmann-json is header-only, but this makes includes robust
find_package(nlohmann_json CONFIG REQUIRED)
target_link_libraries(presage_app PRIVATE nlohmann_json::nlohmann_json)
