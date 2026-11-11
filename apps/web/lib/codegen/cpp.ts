import {
  BAUD,
  file,
  type GeneratedCode,
  header,
  hex,
  indent,
  lineComment,
  SPEED_OF_SOUND,
} from "./common";
import { type FirmwareTarget, ident, type Pin } from "./model";
import { piConfigLines, piGpioChip } from "./linux";

/** How Arduino code names a pin: the number, or the analogue constant such as `A4`. */
const arduinoPin = (pin: Pin) => pin.arduino;

/** An Arduino sketch, for the ESP32's Arduino core or the UNO R4's. */
const arduino = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const esp32 = t.family === "esp32";
  const libraries = [
    ...(has("bme280") ? ["Adafruit BME280 Library"] : []),
    ...(has("ds18b20") ? ["OneWire", "DallasTemperature"] : []),
  ];
  const core = esp32 ? "esp32:esp32:esp32" : "arduino:renesas_uno:minima";
  const includes = [
    ...(has("bme280") ? ["#include <Wire.h>", "#include <Adafruit_BME280.h>"] : []),
    ...(has("ds18b20") ? ["#include <OneWire.h>", "#include <DallasTemperature.h>"] : []),
  ];
  const globals: string[] = [];
  const setup = [`Serial.begin(${BAUD});`];
  const loop: string[] = [];
  if (t.i2c && has("bme280"))
    setup.push(
      esp32
        ? `Wire.begin(${t.i2c.sda.gpio}, ${t.i2c.scl.gpio}); // SDA ${t.i2c.sda.label}, SCL ${t.i2c.scl.label}`
        : `Wire.begin(); // SDA ${t.i2c.sda.label}, SCL ${t.i2c.scl.label}`,
    );
  for (const p of ps) {
    const id = ident(p.id);
    switch (p.type) {
      case "bme280":
        globals.push(`Adafruit_BME280 ${id}; // ${p.name}`);
        setup.push(
          `if (!${id}.begin(${hex(p.address)})) Serial.println("${p.id} error=not-found");`,
        );
        loop.push(
          `print("${p.id}", "temperature_c", ${id}.readTemperature(), 2);`,
          `print("${p.id}", "pressure_pa", ${id}.readPressure(), 0);`,
          `print("${p.id}", "humidity_pct", ${id}.readHumidity(), 1);`,
        );
        break;
      case "ds18b20":
        globals.push(
          `OneWire ${id}_bus(${arduinoPin(p.data)}); // ${p.data.label}`,
          `DallasTemperature ${id}(&${id}_bus); // ${p.name}`,
        );
        setup.push(`${id}.begin();`);
        loop.push(
          `${id}.requestTemperatures();`,
          `print("${p.id}", "temperature_c", ${id}.getTempCByIndex(0), 2);`,
        );
        break;
      case "hcsr04":
        globals.push(
          `const int ${id}_TRIG = ${arduinoPin(p.trig)}; // ${p.trig.label}`,
          `const int ${id}_ECHO = ${arduinoPin(p.echo)}; // ${p.echo.label}`,
        );
        setup.push(`pinMode(${id}_TRIG, OUTPUT);`, `pinMode(${id}_ECHO, INPUT);`);
        loop.push(`print("${p.id}", "distance_m", hcsr04Metres(${id}_TRIG, ${id}_ECHO), 2);`);
        break;
      case "i2c":
        setup.push(`// ${p.id} ${p.name}: on the I2C bus, with no driver here.`);
        break;
      case "output":
        globals.push(`const int ${id}_PIN = ${arduinoPin(p.pin)}; // ${p.name}`);
        setup.push(`pinMode(${id}_PIN, OUTPUT);`);
        loop.push(`digitalWrite(${id}_PIN, on ? HIGH : LOW);`);
        break;
      case "input":
        globals.push(`const int ${id}_PIN = ${arduinoPin(p.pin)}; // ${p.name}`);
        setup.push(`pinMode(${id}_PIN, INPUT);`);
        loop.push(`print("${p.id}", "level", digitalRead(${id}_PIN), 0);`);
        break;
    }
  }
  const blinks = has("output");
  const helpers = [
    '// Prints one reading as "<designator> <quantity>=<value>".',
    "void print(const char *id, const char *quantity, float value, int digits) {",
    "  Serial.print(id);",
    "  Serial.print(' ');",
    "  Serial.print(quantity);",
    "  Serial.print('=');",
    "  Serial.println(value, digits);",
    "}",
    ...(has("hcsr04")
      ? [
          "",
          "// Sends a 10 µs trigger pulse and times the echo; NAN when nothing echoes within 30 ms.",
          "float hcsr04Metres(int trig, int echo) {",
          "  digitalWrite(trig, LOW);",
          "  delayMicroseconds(2);",
          "  digitalWrite(trig, HIGH);",
          "  delayMicroseconds(10);",
          "  digitalWrite(trig, LOW);",
          "  unsigned long echoMicros = pulseIn(echo, HIGH, 30000);",
          `  return echoMicros ? echoMicros * 1e-6f * ${SPEED_OF_SOUND} / 2 : NAN;`,
          "}",
        ]
      : []),
  ];

  return file([
    ...lineComment(
      header(
        t,
        `Arduino IDE 2 or arduino-cli, with the ${esp32 ? "ESP32 Arduino core (esp32 by Espressif)" : "Arduino UNO R4 core"}.`,
        [
          ...(libraries.length
            ? [`arduino-cli lib install ${libraries.map((l) => `"${l}"`).join(" ")}`]
            : []),
          "Save this as echidna/echidna.ino",
          `arduino-cli compile --upload -p <port> --fqbn ${core} echidna`,
          `arduino-cli monitor -p <port> -c baudrate=${BAUD}`,
        ],
        esp32 ? [] : ["For the UNO R4 WiFi, use the fqbn arduino:renesas_uno:unor4wifi."],
      ),
    ),
    ...(includes.length ? ["", ...includes] : []),
    ...(globals.length ? ["", ...globals] : []),
    ...(blinks ? ["bool on = true;"] : []),
    "",
    ...helpers,
    "",
    "void setup() {",
    ...indent(setup, 1, "  "),
    "}",
    "",
    "void loop() {",
    ...indent(loop.length ? loop : ["// Nothing to read."], 1, "  "),
    ...(blinks ? ["  on = !on;"] : []),
    "  delay(1000);",
    "}",
  ]);
};

/** Linux on the Raspberry Pi: kernel drivers through sysfs for the sensors, libgpiod 2's C++ bindings for pins. */
const raspberryPi = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const outputs = ps.flatMap((p) =>
    p.type === "output"
      ? [{ name: ident(p.id), gpio: p.pin.gpio }]
      : p.type === "hcsr04"
        ? [{ name: `${ident(p.id)}_TRIG`, gpio: p.trig.gpio }]
        : [],
  );
  const inputs = ps.flatMap((p) =>
    p.type === "input"
      ? [{ name: ident(p.id), gpio: p.pin.gpio }]
      : p.type === "hcsr04"
        ? [{ name: `${ident(p.id)}_ECHO`, gpio: p.echo.gpio }]
        : [],
  );
  const gpio = outputs.length + inputs.length > 0;
  const helpers: string[] = [];
  if (has("bme280") || has("ds18b20"))
    helpers.push(
      "// The first file matching a directory and a name pattern, such as a sysfs attribute.",
      "std::optional<fs::path> find(const fs::path &dir, const std::regex &name, const std::string &leaf) {",
      "    std::error_code error;",
      "    for (const auto &entry : fs::directory_iterator(dir, error))",
      "        if (std::regex_match(entry.path().filename().string(), name) && fs::exists(entry.path() / leaf))",
      "            return entry.path() / leaf;",
      "    return std::nullopt;",
      "}",
      "",
      "std::optional<double> readNumber(const std::optional<fs::path> &path) {",
      "    if (!path) return std::nullopt;",
      "    std::ifstream in(*path);",
      "    double value;",
      "    if (in >> value) return value;",
      "    return std::nullopt;",
      "}",
    );
  if (has("bme280"))
    helpers.push(
      "",
      "// The IIO device the kernel's bme280 driver made, found by name.",
      "std::optional<fs::path> bme280Device() {",
      "    std::error_code error;",
      '    for (const auto &entry : fs::directory_iterator("/sys/bus/iio/devices", error)) {',
      '        std::ifstream name(entry.path() / "name");',
      "        std::string text;",
      '        if (name >> text && text == "bme280") return entry.path();',
      "    }",
      "    return std::nullopt;",
      "}",
    );
  if (has("hcsr04"))
    helpers.push(
      "",
      "// Sends a 10 µs trigger pulse and times the echo, in metres; nullopt with no echo within 30 ms.",
      "std::optional<double> hcsr04Metres(gpiod::line_request &request, unsigned trig, unsigned echo) {",
      "    using clock = std::chrono::steady_clock;",
      "    using gpiod::line::value;",
      "    request.set_value(trig, value::ACTIVE);",
      "    std::this_thread::sleep_for(std::chrono::microseconds(10));",
      "    request.set_value(trig, value::INACTIVE);",
      "    auto timeout = clock::now() + std::chrono::milliseconds(30);",
      "    auto start = clock::now();",
      "    while (request.get_value(echo) != value::ACTIVE)",
      "        if ((start = clock::now()) > timeout) return std::nullopt;",
      "    auto end = start;",
      "    while (request.get_value(echo) == value::ACTIVE)",
      "        if ((end = clock::now()) > timeout) return std::nullopt;",
      `    return std::chrono::duration<double>(end - start).count() * ${SPEED_OF_SOUND} / 2;`,
      "}",
    );

  const setup: string[] = [];
  if (has("bme280")) setup.push("const auto bme280 = bme280Device();");
  if (gpio) {
    setup.push(
      "using gpiod::line::direction;",
      `auto request = gpiod::chip("${piGpioChip(t)}")`,
      "    .prepare_request()",
      '    .set_consumer("echidna")',
    );
    if (outputs.length)
      setup.push(
        `    .add_line_settings({${outputs.map((o) => `${o.name}_PIN`).join(", ")}}, gpiod::line_settings().set_direction(direction::OUTPUT))`,
      );
    if (inputs.length)
      setup.push(
        `    .add_line_settings({${inputs.map((o) => `${o.name}_PIN`).join(", ")}}, gpiod::line_settings().set_direction(direction::INPUT))`,
      );
    setup.push("    .do_request();");
  }

  const loop: string[] = [];
  for (const p of ps) {
    const id = ident(p.id);
    switch (p.type) {
      case "bme280":
        loop.push(
          "if (bme280) {",
          "    // The driver reports milli-degrees, kilopascals and milli-percent.",
          `    if (auto v = readNumber(*bme280 / "in_temp_input")) print("${p.id}", "temperature_c", *v / 1000, 2);`,
          `    if (auto v = readNumber(*bme280 / "in_pressure_input")) print("${p.id}", "pressure_pa", *v * 1000, 0);`,
          `    if (auto v = readNumber(*bme280 / "in_humidityrelative_input")) print("${p.id}", "humidity_pct", *v / 1000, 1);`,
          "}",
        );
        break;
      case "ds18b20":
        loop.push(
          `if (auto v = readNumber(find("/sys/bus/w1/devices", std::regex("28-.*"), "temperature")))`,
          `    print("${p.id}", "temperature_c", *v / 1000, 2);`,
        );
        break;
      case "hcsr04":
        loop.push(
          `if (auto metres = hcsr04Metres(request, ${id}_TRIG_PIN, ${id}_ECHO_PIN))`,
          `    print("${p.id}", "distance_m", *metres, 2);`,
          "else",
          `    std::cout << "${p.id} error=no-echo" << std::endl;`,
        );
        break;
      case "i2c":
        loop.push(`// ${p.id} ${p.name}: on the I2C bus, with no driver here.`);
        break;
      case "output":
        loop.push(
          `request.set_value(${id}_PIN, on ? gpiod::line::value::ACTIVE : gpiod::line::value::INACTIVE);`,
        );
        break;
      case "input":
        loop.push(
          `print("${p.id}", "level", request.get_value(${id}_PIN) == gpiod::line::value::ACTIVE, 0);`,
        );
        break;
    }
  }
  const blinks = has("output");
  const constants = [...outputs, ...inputs].map(
    (o) => `constexpr unsigned ${o.name}_PIN = ${o.gpio}; // GPIO${o.gpio}`,
  );

  return file([
    ...lineComment(
      header(
        t,
        "g++ (C++17) on Raspberry Pi OS, with libgpiod 2's C++ bindings (sudo apt install libgpiod-dev).",
        [`g++ -std=c++17 -O2 -o echidna main.cpp${gpio ? " -lgpiodcxx" : ""}`, "./echidna"],
        piConfigLines(t),
      ),
    ),
    "",
    "#include <chrono>",
    "#include <filesystem>",
    "#include <fstream>",
    "#include <iomanip>",
    "#include <iostream>",
    "#include <optional>",
    "#include <regex>",
    "#include <string>",
    "#include <thread>",
    ...(gpio ? ["", "#include <gpiod.hpp>"] : []),
    "",
    "namespace fs = std::filesystem;",
    ...(constants.length ? ["", ...constants] : []),
    "",
    '// Prints one reading as "<designator> <quantity>=<value>".',
    "void print(const char *id, const char *quantity, double value, int digits) {",
    "    std::cout << id << ' ' << quantity << '=' << std::fixed << std::setprecision(digits) << value << std::endl;",
    "}",
    ...(helpers.length ? ["", ...helpers] : []),
    "",
    "int main() {",
    ...indent([
      ...setup,
      ...(setup.length ? [""] : []),
      ...(blinks ? ["bool on = true;"] : []),
      "for (;;) {",
      ...indent(loop.length ? loop : ["// Nothing to read."]),
      ...(blinks ? ["    on = !on;"] : []),
      "    std::this_thread::sleep_for(std::chrono::seconds(1));",
      "}",
    ]),
    "}",
  ]);
};

/**
 * The program in C++ for the project's dev board.
 * @param target - From `firmwareTarget`.
 * @returns The source and what to call it.
 */
export const generateCpp = (target: FirmwareTarget): GeneratedCode =>
  target.family === "raspberryPi"
    ? { fileName: "main.cpp", code: raspberryPi(target) }
    : { fileName: "echidna.ino", code: arduino(target) };
