import {
  blockComment,
  file,
  type GeneratedCode,
  header,
  hex,
  indent,
  SPEED_OF_SOUND,
} from "./common";
import { type FirmwareTarget, ident } from "./model";
import { piConfigLines, piGpioChip } from "./linux";

/** ESP-IDF with esp-idf-lib's drivers, which are C. */
const esp32 = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const includes = [
    "#include <stdbool.h>",
    "#include <stdio.h>",
    "#include <string.h>",
    "",
    '#include "freertos/FreeRTOS.h"',
    '#include "freertos/task.h"',
    '#include "driver/gpio.h"',
    '#include "esp_err.h"',
    ...(has("bme280") ? ["", "#include <i2cdev.h>", "#include <bmp280.h>"] : []),
    ...(has("ds18b20") ? ["#include <ds18x20.h>"] : []),
    ...(has("hcsr04") ? ["#include <ultrasonic.h>"] : []),
  ];
  const defines: string[] = [];
  if (t.i2c)
    defines.push(
      `#define PIN_SDA GPIO_NUM_${t.i2c.sda.gpio} /* ${t.i2c.sda.label} */`,
      `#define PIN_SCL GPIO_NUM_${t.i2c.scl.gpio} /* ${t.i2c.scl.label} */`,
    );
  const globals: string[] = [];
  const setup: string[] = [];
  const loop: string[] = [];
  if (has("bme280")) setup.push("ESP_ERROR_CHECK(i2cdev_init());");
  for (const p of ps) {
    const id = ident(p.id);
    switch (p.type) {
      case "bme280":
        globals.push(`static bmp280_t ${id};`);
        setup.push(
          "",
          `/* ${p.id} ${p.name} */`,
          `bmp280_params_t ${id}_params;`,
          `bmp280_init_default_params(&${id}_params);`,
          `memset(&${id}, 0, sizeof ${id});`,
          `ESP_ERROR_CHECK(bmp280_init_desc(&${id}, ${p.address === 0x76 ? "BMP280_I2C_ADDRESS_0" : hex(p.address)}, I2C_NUM_0, PIN_SDA, PIN_SCL));`,
          `ESP_ERROR_CHECK(bmp280_init(&${id}, &${id}_params));`,
        );
        loop.push(
          "",
          "{",
          "    float temperature, pressure, humidity;",
          `    if (bmp280_read_float(&${id}, &temperature, &pressure, &humidity) == ESP_OK) {`,
          `        printf("${p.id} temperature_c=%.2f\\n", temperature);`,
          `        printf("${p.id} pressure_pa=%.0f\\n", pressure);`,
          `        printf("${p.id} humidity_pct=%.1f\\n", humidity);`,
          "    } else {",
          `        printf("${p.id} error=read\\n");`,
          "    }",
          "}",
        );
        break;
      case "ds18b20":
        defines.push(`#define ${id}_PIN GPIO_NUM_${p.data.gpio} /* ${p.data.label} */`);
        loop.push(
          "",
          "{",
          "    float temperature;",
          `    if (ds18x20_measure_and_read(${id}_PIN, DS18X20_ANY, &temperature) == ESP_OK)`,
          `        printf("${p.id} temperature_c=%.2f\\n", temperature);`,
          "    else",
          `        printf("${p.id} error=read\\n");`,
          "}",
        );
        break;
      case "hcsr04":
        globals.push(
          `static ultrasonic_sensor_t ${id} = {`,
          `    .trigger_pin = GPIO_NUM_${p.trig.gpio}, /* ${p.trig.label} */`,
          `    .echo_pin = GPIO_NUM_${p.echo.gpio}, /* ${p.echo.label} */`,
          "};",
        );
        setup.push("", `/* ${p.id} ${p.name} */`, `ESP_ERROR_CHECK(ultrasonic_init(&${id}));`);
        loop.push(
          "",
          "{",
          "    uint32_t centimetres;",
          `    if (ultrasonic_measure_cm(&${id}, 400, &centimetres) == ESP_OK)`,
          `        printf("${p.id} distance_m=%.2f\\n", centimetres / 100.0);`,
          "    else",
          `        printf("${p.id} error=no-echo\\n");`,
          "}",
        );
        break;
      case "i2c":
        setup.push("", `/* ${p.id} ${p.name}: on the I2C bus, with no driver here. */`);
        break;
      case "output":
        defines.push(`#define ${id}_PIN GPIO_NUM_${p.pin.gpio} /* ${p.name} */`);
        setup.push(
          "",
          `gpio_reset_pin(${id}_PIN);`,
          `gpio_set_direction(${id}_PIN, GPIO_MODE_OUTPUT);`,
        );
        loop.push("", `gpio_set_level(${id}_PIN, on); /* ${p.name} */`);
        break;
      case "input":
        defines.push(`#define ${id}_PIN GPIO_NUM_${p.pin.gpio} /* ${p.name} */`);
        setup.push(
          "",
          `gpio_reset_pin(${id}_PIN);`,
          `gpio_set_direction(${id}_PIN, GPIO_MODE_INPUT);`,
        );
        loop.push("", `printf("${p.id} level=%d\\n", gpio_get_level(${id}_PIN));`);
        break;
    }
  }
  const blinks = ps.some((p) => p.type === "output");
  const components = [
    ...(has("bme280") ? ["i2cdev", "bmp280"] : []),
    ...(has("ds18b20") ? ["onewire", "ds18x20"] : []),
    ...(has("hcsr04") ? ["ultrasonic"] : []),
  ];
  return file([
    ...blockComment(
      header(t, "ESP-IDF 5 with the esp-idf-lib driver components (github.com/esp-idf-lib).", [
        "idf.py create-project echidna && cd echidna",
        `Add the components: ${components.length ? components.join(", ") : "none needed"}`,
        "Save this as main/main.c, then: idf.py build flash monitor",
      ]),
    ),
    "",
    ...includes,
    ...(defines.length ? ["", ...defines] : []),
    ...(globals.length ? ["", ...globals] : []),
    "",
    "void app_main(void)",
    "{",
    ...indent(setup.length ? setup : ["/* Nothing to set up. */"]),
    "",
    ...indent([
      ...(blinks ? ["bool on = true;"] : []),
      "while (true) {",
      ...indent(loop.length ? loop.slice(loop[0] === "" ? 1 : 0) : ["/* Nothing to read. */"]),
      ...(blinks ? ["", "    on = !on;"] : []),
      "    vTaskDelay(pdMS_TO_TICKS(1000));",
      "}",
    ]),
    "}",
  ]);
};

/** Linux on the Raspberry Pi: kernel drivers through sysfs for the sensors, libgpiod 2 for the pins. */
const raspberryPi = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const lines = ps.filter((p) => p.type === "output" || p.type === "input" || p.type === "hcsr04");
  const outputs = ps.flatMap((p) =>
    p.type === "output"
      ? [{ id: ident(p.id), gpio: p.pin.gpio, label: p.name }]
      : p.type === "hcsr04"
        ? [{ id: `${ident(p.id)}_TRIG`, gpio: p.trig.gpio, label: `${p.id} trigger` }]
        : [],
  );
  const inputs = ps.flatMap((p) =>
    p.type === "input"
      ? [{ id: ident(p.id), gpio: p.pin.gpio, label: p.name }]
      : p.type === "hcsr04"
        ? [{ id: `${ident(p.id)}_ECHO`, gpio: p.echo.gpio, label: `${p.id} echo` }]
        : [],
  );
  const gpio = lines.length > 0;

  const helpers: string[] = [];
  if (has("bme280") || has("ds18b20"))
    helpers.push(
      "/* Reads the first number in the first file matching a pattern, such as a sysfs attribute. */",
      "static bool read_number(const char *pattern, double *value)",
      "{",
      "    glob_t found;",
      "    if (glob(pattern, 0, NULL, &found) != 0) return false;",
      '    FILE *f = fopen(found.gl_pathv[0], "r");',
      "    globfree(&found);",
      "    if (!f) return false;",
      '    bool ok = fscanf(f, "%lf", value) == 1;',
      "    fclose(f);",
      "    return ok;",
      "}",
    );
  if (has("bme280"))
    helpers.push(
      "",
      "/* The IIO device the kernel's bme280 driver made, found by name. */",
      "static bool bme280_path(char *path, size_t size)",
      "{",
      "    glob_t found;",
      '    if (glob("/sys/bus/iio/devices/iio:device*/name", 0, NULL, &found) != 0) return false;',
      "    bool ok = false;",
      "    for (size_t i = 0; i < found.gl_pathc && !ok; i++) {",
      "        char name[32] = {0};",
      '        FILE *f = fopen(found.gl_pathv[i], "r");',
      '        if (f && fgets(name, sizeof name, f) && strncmp(name, "bme280", 6) == 0) {',
      '            snprintf(path, size, "%.*s", (int)(strlen(found.gl_pathv[i]) - 5), found.gl_pathv[i]);',
      "            ok = true;",
      "        }",
      "        if (f) fclose(f);",
      "    }",
      "    globfree(&found);",
      "    return ok;",
      "}",
    );
  if (has("hcsr04"))
    helpers.push(
      "",
      "static double now_seconds(void)",
      "{",
      "    struct timespec ts;",
      "    clock_gettime(CLOCK_MONOTONIC, &ts);",
      "    return ts.tv_sec + ts.tv_nsec / 1e9;",
      "}",
      "",
      "/* Sends a 10 µs trigger pulse and times the echo. Returns the distance in metres, or -1 with no echo. */",
      "static double hcsr04_measure(struct gpiod_line_request *req, unsigned int trig, unsigned int echo)",
      "{",
      "    gpiod_line_request_set_value(req, trig, GPIOD_LINE_VALUE_ACTIVE);",
      "    nanosleep(&(struct timespec){.tv_nsec = 10000}, NULL);",
      "    gpiod_line_request_set_value(req, trig, GPIOD_LINE_VALUE_INACTIVE);",
      "    double start = now_seconds(), timeout = start + 0.03;",
      "    while (gpiod_line_request_get_value(req, echo) != GPIOD_LINE_VALUE_ACTIVE)",
      "        if ((start = now_seconds()) > timeout) return -1;",
      "    double end = start;",
      "    while (gpiod_line_request_get_value(req, echo) == GPIOD_LINE_VALUE_ACTIVE)",
      "        if ((end = now_seconds()) > timeout) return -1;",
      `    return (end - start) * ${SPEED_OF_SOUND} / 2;`,
      "}",
    );

  const setup: string[] = [];
  if (has("bme280"))
    setup.push(
      "char bme280[256];",
      "if (!bme280_path(bme280, sizeof bme280))",
      '    fprintf(stderr, "No bme280 IIO device: is the overlay in config.txt?\\n");',
    );
  if (gpio) {
    setup.push(
      `struct gpiod_chip *chip = gpiod_chip_open("${piGpioChip(t)}");`,
      'if (!chip) { perror("gpiod_chip_open"); return 1; }',
      "struct gpiod_line_config *config = gpiod_line_config_new();",
    );
    if (outputs.length)
      setup.push(
        `unsigned int outputs[] = { ${outputs.map((o) => `${o.id}_PIN`).join(", ")} };`,
        "struct gpiod_line_settings *out = gpiod_line_settings_new();",
        "gpiod_line_settings_set_direction(out, GPIOD_LINE_DIRECTION_OUTPUT);",
        `gpiod_line_config_add_line_settings(config, outputs, ${outputs.length}, out);`,
      );
    if (inputs.length)
      setup.push(
        `unsigned int inputs[] = { ${inputs.map((o) => `${o.id}_PIN`).join(", ")} };`,
        "struct gpiod_line_settings *in = gpiod_line_settings_new();",
        "gpiod_line_settings_set_direction(in, GPIOD_LINE_DIRECTION_INPUT);",
        `gpiod_line_config_add_line_settings(config, inputs, ${inputs.length}, in);`,
      );
    setup.push(
      "struct gpiod_request_config *request = gpiod_request_config_new();",
      'gpiod_request_config_set_consumer(request, "echidna");',
      "struct gpiod_line_request *req = gpiod_chip_request_lines(chip, request, config);",
      'if (!req) { perror("gpiod_chip_request_lines"); return 1; }',
    );
  }

  const loop: string[] = [];
  for (const p of ps) {
    const id = ident(p.id);
    switch (p.type) {
      case "bme280":
        loop.push(
          "{",
          "    char attribute[300];",
          "    double value;",
          `    /* The driver reports milli-degrees, kilopascals and milli-percent. */`,
          '    snprintf(attribute, sizeof attribute, "%s/in_temp_input", bme280);',
          `    if (read_number(attribute, &value)) printf("${p.id} temperature_c=%.2f\\n", value / 1000);`,
          '    snprintf(attribute, sizeof attribute, "%s/in_pressure_input", bme280);',
          `    if (read_number(attribute, &value)) printf("${p.id} pressure_pa=%.0f\\n", value * 1000);`,
          '    snprintf(attribute, sizeof attribute, "%s/in_humidityrelative_input", bme280);',
          `    if (read_number(attribute, &value)) printf("${p.id} humidity_pct=%.1f\\n", value / 1000);`,
          "}",
        );
        break;
      case "ds18b20":
        loop.push(
          "{",
          "    double value;",
          '    if (read_number("/sys/bus/w1/devices/28-*/temperature", &value))',
          `        printf("${p.id} temperature_c=%.2f\\n", value / 1000);`,
          "    else",
          `        printf("${p.id} error=read\\n");`,
          "}",
        );
        break;
      case "hcsr04":
        loop.push(
          "{",
          `    double metres = hcsr04_measure(req, ${id}_TRIG_PIN, ${id}_ECHO_PIN);`,
          `    if (metres >= 0) printf("${p.id} distance_m=%.2f\\n", metres);`,
          `    else printf("${p.id} error=no-echo\\n");`,
          "}",
        );
        break;
      case "i2c":
        loop.push(`/* ${p.id} ${p.name}: on the I2C bus, with no driver here. */`);
        break;
      case "output":
        loop.push(
          `gpiod_line_request_set_value(req, ${id}_PIN, on ? GPIOD_LINE_VALUE_ACTIVE : GPIOD_LINE_VALUE_INACTIVE);`,
        );
        break;
      case "input":
        loop.push(
          `printf("${p.id} level=%d\\n", gpiod_line_request_get_value(req, ${id}_PIN) == GPIOD_LINE_VALUE_ACTIVE);`,
        );
        break;
    }
  }
  const blinks = has("output");
  const defines = [...outputs, ...inputs].map(
    (o) => `#define ${o.id}_PIN ${o.gpio} /* GPIO${o.gpio}: ${o.label} */`,
  );

  return file([
    ...blockComment(
      header(
        t,
        "gcc on Raspberry Pi OS, with libgpiod 2 (sudo apt install libgpiod-dev).",
        [`gcc -O2 -Wall -o echidna main.c${gpio ? " -lgpiod" : ""}`, "./echidna"],
        piConfigLines(t),
      ),
    ),
    "",
    "#define _POSIX_C_SOURCE 200809L",
    "#include <stdbool.h>",
    "#include <stdio.h>",
    "#include <string.h>",
    "#include <glob.h>",
    "#include <time.h>",
    "#include <unistd.h>",
    ...(gpio ? ["", "#include <gpiod.h>"] : []),
    ...(defines.length ? ["", ...defines] : []),
    ...(helpers.length ? ["", ...helpers] : []),
    "",
    "int main(void)",
    "{",
    ...indent([
      ...setup,
      ...(setup.length ? [""] : []),
      ...(blinks ? ["bool on = true;"] : []),
      "for (;;) {",
      ...indent(loop.length ? loop : ["/* Nothing to read. */"]),
      ...(blinks ? ["    on = !on;"] : []),
      "    fflush(stdout);",
      "    sleep(1);",
      "}",
    ]),
    "}",
  ]);
};

/** The Arduino core is C++, so its C tab points to the C++ sketch. */
const arduino = (t: FirmwareTarget): string =>
  file(
    blockComment([
      ...header(t, "Arduino IDE or arduino-cli, with the Arduino UNO R4 core.", []),
      "",
      "The Arduino core and its sensor libraries (Wire, Adafruit BME280, DallasTemperature)",
      "are C++, and sketches are compiled as C++, so there is no separate C version for this",
      "board: use the C++ tab. Its sketch keeps to plain functions, so it reads much like C.",
    ]),
  );

/**
 * The program in C for the project's dev board.
 * @param target - From `firmwareTarget`.
 * @returns The source and what to call it.
 */
export const generateC = (target: FirmwareTarget): GeneratedCode => {
  switch (target.family) {
    case "esp32":
      return { fileName: "main.c", code: esp32(target) };
    case "raspberryPi":
      return { fileName: "main.c", code: raspberryPi(target) };
    case "arduino":
      return { fileName: "README.c", code: arduino(target) };
  }
};
