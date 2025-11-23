#include "SensorFrame.hpp"
#include "RepCounter.hpp"
#include "GyroRepCounter.hpp"

#include <nlohmann/json.hpp>

#include <boost/asio.hpp>
#include <boost/asio/serial_port.hpp>

#include <iostream>
#include <string>
#include <cmath>
#include <cstdint>

namespace asio = boost::asio;
using json = nlohmann::json;

// Read one JSON frame from serial and fill SensorFrame.
// Expected line format (one per line) from ESP32, e.g.:
// {"t_ms":0,"accel_g":{"x":0.01,"y":-0.02,"z":1.00},"gyro_dps":{"x":0.3,"y":-0.1,"z":0.2}}
bool read_frame_from_serial(asio::serial_port& port, SensorFrame& f) {
    static asio::streambuf buffer;

    // Block until we see a '\n'
    std::size_t bytes_read = asio::read_until(port, buffer, '\n');
    if (bytes_read == 0) {
        return false;
    }

    std::istream is(&buffer);
    std::string line;
    std::getline(is, line);  // consume one line

    if (!line.empty() && line.back() == '\r') {
        line.pop_back();
    }
    if (line.empty()) {
        return false;
    }

    // Optional: debug raw line
    // std::cerr << "RAW: " << line << "\n";

    // Parse JSON
    json j = json::parse(line);

    // Map JSON → SensorFrame
    f.t_ms = j.value("t_ms", 0);

    if (j.contains("accel_g")) {
        auto ag = j["accel_g"];
        f.ax = ag.value("x", 0.0f);
        f.ay = ag.value("y", 0.0f);
        f.az = ag.value("z", 0.0f);
    } else {
        f.ax = f.ay = 0.0f;
        f.az = 1.0f; // default to gravity if missing
    }

    if (j.contains("gyro_dps")) {
        auto gg = j["gyro_dps"];
        f.gx = gg.value("x", 0.0f);
        f.gy = gg.value("y", 0.0f);
        f.gz = gg.value("z", 0.0f);
    } else {
        f.gx = f.gy = f.gz = 0.0f;
    }

    // If your SensorFrame has extra fields (stress, strain, etc.),
    // you can read them here too, but rep logic doesn’t need them.

    return true;
}

int main() {
    try {
        // ---------- Serial setup (Windows) ----------
        asio::io_context io;

        // IMPORTANT: on Windows use "COM12" (not "/dev/COM12")
        asio::serial_port serial(io, "COM12");

        serial.set_option(asio::serial_port_base::baud_rate(115200));
        serial.set_option(asio::serial_port_base::character_size(8));
        serial.set_option(
            asio::serial_port_base::flow_control(
                asio::serial_port_base::flow_control::none
            )
        );
        serial.set_option(
            asio::serial_port_base::parity(
                asio::serial_port_base::parity::none
            )
        );
        serial.set_option(
            asio::serial_port_base::stop_bits(
                asio::serial_port_base::stop_bits::one
            )
        );

        std::cerr << "Opened serial port COM12 @ 115200\n";

        // ---------- Rep counters (same behavior as original) ----------
        RepCounter accelCounter(
            0.15f, // high threshold for amag
            1.02f, // low threshold for amag
            180    // minimum ms between accel reps
        );

        GyroRepCounter gyroCounter(
            8.0f,  // gyro velocity threshold in deg/s
            160    // minimum ms between direction flips
        );

        SensorFrame f{};
        int lastAccelTotal = 0;
        int lastGyroTotal  = 0;

        // Serial timing is driven by the device, so no manual sleeps here
        for (;;) {
            if (!read_frame_from_serial(serial, f)) {
                continue; // skip if read/parse failed
            }

            auto accelEv = accelCounter.update(f);
            auto gyroEv  = gyroCounter.update(f);

            // magnitude of acceleration in g
            float amag = std::sqrt(f.ax * f.ax + f.ay * f.ay + f.az * f.az);

            if (accelEv.completed) {
                lastAccelTotal = accelEv.total_reps;
            }
            if (gyroEv.completed) {
                lastGyroTotal = gyroEv.total_reps;
            }

            // EXACT format Node/server expects: one JSON object per line
            std::cout
                << "{"
                << "\"t_ms\":"       << f.t_ms         << ","
                << "\"amag\":"       << amag           << ","
                << "\"accel_reps\":" << lastAccelTotal << ","
                << "\"gyro_reps\":"  << lastGyroTotal
                << "}"
                << std::endl;
        }

        return 0; // unreachable
    } catch (const std::exception& e) {
        std::cerr << "Error in main: " << e.what() << "\n";
        return 1;
    }
}
