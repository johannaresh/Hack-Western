#include <iostream>
#include <string>
#include <boost/asio.hpp>
#include <boost/asio/serial_port.hpp>

// Use a namespace alias for brevity
namespace asio = boost::asio;
void read_serial_line(const std::string& port_name, unsigned int baud_rate) {
    try {
        asio::io_context io_context;

        asio::serial_port serial_port(io_context, port_name);
        
        serial_port.set_option(asio::serial_port_base::baud_rate(baud_rate));
        serial_port.set_option(asio::serial_port_base::character_size(8));
        serial_port.set_option(asio::serial_port_base::flow_control::none);
        serial_port.set_option(asio::serial_port_base::parity::none);
        serial_port.set_option(asio::serial_port_base::stop_bits::one);

        std::cout << "Successfully opened serial port: " << port_name 
                  << " at " << baud_rate << " baud." << std::endl;

        asio::streambuf buffer;
        
        while (true) {
            
            size_t bytes_read = asio::read_until(serial_port, buffer, '\n');
            
            // Convert the data in the buffer to a string
            std::istream is(&buffer);
            std::string line;
            std::getline(is, line);
            
            // Trim and print the received data
            if (!line.empty()) {
                // You might need to strip carriage return '\r' if the device uses CRLF
                if (line.back() == '\r') {
                    line.pop_back();
                }
                std::cout << "Read " << bytes_read << " bytes: [" << line << "]" << std::endl;
            }
        }
    } catch (const boost::system::system_error& e) {
        // Catch and report errors, especially if the port doesn't exist
        std::cerr << "Serial Error (" << e.code().value() << "): " << e.what() << std::endl;
    } catch (const std::exception& e) {
        std::cerr << "An unexpected error occurred: " << e.what() << std::endl;
    }
}

int main() {
    const std::string port_name = "/dev/COM12"; 
    const unsigned int baud_rate = 115200;

    read_serial_line(port_name, baud_rate);
    
    return 0;
}