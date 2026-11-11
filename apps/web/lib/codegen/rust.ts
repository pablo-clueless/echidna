import { file, type GeneratedCode, header, indent, lineComment, SPEED_OF_SOUND } from "./common";
import { type FirmwareTarget, ident } from "./model";
import { piConfigLines } from "./linux";

/** Rust names are snake case: `S1` → `s1`. */
const local = (id: string) => ident(id).toLowerCase();

/** The HC-SR04's trigger pulse and echo timing, written inline so it needs no generic pin types. */
const hcsr04Block = (
  id: string,
  v: string,
  calls: { high: string; low: string; isHigh: string; sleep10us: string },
) => [
  "{",
  `    ${calls.high};`,
  `    ${calls.sleep10us};`,
  `    ${calls.low};`,
  "    let timeout = Instant::now() + Duration::from_millis(30);",
  "    let mut start = Instant::now();",
  `    while !${calls.isHigh} && start < timeout {`,
  "        start = Instant::now();",
  "    }",
  "    let mut end = start;",
  `    while ${calls.isHigh} && end < timeout {`,
  "        end = Instant::now();",
  "    }",
  "    if end < timeout && end > start {",
  `        println!("${id} distance_m={:.2}", (end - start).as_secs_f64() * ${SPEED_OF_SOUND}.0 / 2.0);`,
  "    } else {",
  `        println!("${id} error=no-echo");`,
  "    }",
  `} // ${v}`,
];

/** esp-idf-hal on the ESP32, with the Rust standard library. */
const esp32 = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const crates = [
    'esp-idf-hal = "0.45"',
    'esp-idf-svc = "0.51"',
    'anyhow = "1"',
    ...(has("bme280") ? ['bme280 = "0.5"'] : []),
    ...(has("ds18b20") ? ['one-wire-bus = "0.1"', 'ds18b20 = "0.1"'] : []),
  ];
  const uses = [
    "use esp_idf_hal::delay::{Delay, FreeRtos};",
    "use esp_idf_hal::gpio::PinDriver;",
    "use esp_idf_hal::peripherals::Peripherals;",
    ...(has("bme280")
      ? [
          "use esp_idf_hal::i2c::{I2cConfig, I2cDriver};",
          "use esp_idf_hal::prelude::*;",
          "use bme280::i2c::BME280;",
        ]
      : []),
    ...(has("ds18b20")
      ? ["use ds18b20::{Ds18b20, Resolution};", "use one_wire_bus::OneWire;"]
      : []),
    ...(has("hcsr04") ? ["use std::time::{Duration, Instant};"] : []),
  ];
  const setup = [
    "esp_idf_svc::sys::link_patches();",
    "let peripherals = Peripherals::take()?;",
    "let pins = peripherals.pins;",
    "#[allow(unused_mut, unused_variables)]",
    "let mut delay = Delay::new_default();",
  ];
  const loop: string[] = [];
  for (const p of ps) {
    const v = local(p.id);
    switch (p.type) {
      case "bme280":
        setup.push(
          "",
          `// ${p.id} ${p.name}: the primary address is 0x76.`,
          `let i2c = I2cDriver::new(peripherals.i2c0, pins.gpio${t.i2c?.sda.gpio ?? 21}, pins.gpio${t.i2c?.scl.gpio ?? 22}, &I2cConfig::new().baudrate(100.kHz().into()))?;`,
          `let mut ${v} = BME280::new_primary(i2c);`,
          `${v}.init(&mut delay).map_err(|e| anyhow::anyhow!("${p.id}: {e:?}"))?;`,
        );
        loop.push(
          `if let Ok(m) = ${v}.measure(&mut delay) {`,
          `    println!("${p.id} temperature_c={:.2}", m.temperature);`,
          `    println!("${p.id} pressure_pa={:.0}", m.pressure);`,
          `    println!("${p.id} humidity_pct={:.1}", m.humidity);`,
          "}",
        );
        break;
      case "ds18b20":
        setup.push(
          "",
          `// ${p.id} ${p.name} on ${p.data.label}, open drain with its 4.7 kΩ pull-up.`,
          `let mut ${v}_bus = OneWire::new(PinDriver::input_output_od(pins.gpio${p.data.gpio})?)`,
          `    .map_err(|e| anyhow::anyhow!("${p.id}: {e:?}"))?;`,
        );
        loop.push(
          `if ds18b20::start_simultaneous_temp_measurement(&mut ${v}_bus, &mut delay).is_ok() {`,
          "    Resolution::Bits12.delay_for_measurement_time(&mut delay);",
          `    if let Ok(Some((address, _))) = ${v}_bus.device_search(None, false, &mut delay) {`,
          "        if let Ok(sensor) = Ds18b20::new::<esp_idf_hal::sys::EspError>(address) {",
          `            if let Ok(data) = sensor.read_data(&mut ${v}_bus, &mut delay) {`,
          `                println!("${p.id} temperature_c={:.2}", data.temperature);`,
          "            }",
          "        }",
          "    }",
          "}",
        );
        break;
      case "hcsr04":
        setup.push(
          "",
          `// ${p.id} ${p.name}`,
          `let mut ${v}_trig = PinDriver::output(pins.gpio${p.trig.gpio})?;`,
          `let ${v}_echo = PinDriver::input(pins.gpio${p.echo.gpio})?;`,
        );
        loop.push(
          ...hcsr04Block(p.id, v, {
            high: `${v}_trig.set_high()?`,
            low: `${v}_trig.set_low()?`,
            isHigh: `${v}_echo.is_high()`,
            sleep10us: "esp_idf_hal::delay::Ets::delay_us(10)",
          }),
        );
        break;
      case "i2c":
        setup.push("", `// ${p.id} ${p.name}: on the I2C bus, with no driver here.`);
        break;
      case "output":
        setup.push(`let mut ${v} = PinDriver::output(pins.gpio${p.pin.gpio})?; // ${p.name}`);
        loop.push(`if on { ${v}.set_high()? } else { ${v}.set_low()? }`);
        break;
      case "input":
        setup.push(`let ${v} = PinDriver::input(pins.gpio${p.pin.gpio})?; // ${p.name}`);
        loop.push(`println!("${p.id} level={}", ${v}.is_high() as u8);`);
        break;
    }
  }
  const blinks = has("output");
  return file([
    ...lineComment(
      header(
        t,
        "Rust on ESP-IDF (std), with esp-idf-hal: see the Rust on ESP book, esp-rs.github.io/book.",
        [
          "cargo generate esp-rs/esp-idf-template cargo   (pick the esp32 MCU)",
          "Add to Cargo.toml [dependencies]:",
          ...crates.map((c) => `  ${c}`),
          "Save this as src/main.rs, then: cargo run   (espflash flashes and monitors)",
        ],
        [
          "Driver crates change their APIs between versions; these are the versions written against.",
        ],
      ),
    ),
    ...uses,
    "",
    "fn main() -> anyhow::Result<()> {",
    ...indent([
      ...setup,
      "",
      `println!("# Echidna: ${t.boardId} ${t.boardName}");`,
      ...(blinks ? ["let mut on = true;"] : []),
      "loop {",
      ...indent(loop),
      ...(blinks ? ["    on = !on;"] : []),
      "    FreeRtos::delay_ms(1000);",
      "}",
    ]),
    "}",
  ]);
};

/** Rust on Raspberry Pi OS: kernel drivers through sysfs for the sensors, rppal for the pins. */
const raspberryPi = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const gpio = ps.some((p) => p.type === "output" || p.type === "input" || p.type === "hcsr04");
  const sysfs = has("bme280") || has("ds18b20");
  const uses = [
    ...(sysfs ? ["use std::fs;", "use std::path::{Path, PathBuf};"] : []),
    "use std::thread;",
    `use std::time::${has("hcsr04") ? "{Duration, Instant}" : "Duration"};`,
    ...(gpio ? ["", "use rppal::gpio::Gpio;"] : []),
  ];
  const helpers: string[] = [];
  if (sysfs)
    helpers.push(
      "/// The number in a file, such as a sysfs attribute.",
      "fn read_number(path: &Path) -> Option<f64> {",
      "    fs::read_to_string(path).ok()?.trim().parse().ok()",
      "}",
      "",
      "/// The first entry of a directory whose name starts with `prefix` and holds `leaf`.",
      "fn find(dir: &str, prefix: &str, leaf: &str) -> Option<PathBuf> {",
      "    fs::read_dir(dir).ok()?.flatten().map(|e| e.path()).find_map(|p| {",
      "        let name = p.file_name()?.to_string_lossy().into_owned();",
      "        (name.starts_with(prefix) && p.join(leaf).exists()).then(|| p.join(leaf))",
      "    })",
      "}",
    );
  if (has("bme280"))
    helpers.push(
      "",
      "/// The IIO device the kernel's bme280 driver made, found by name.",
      "fn bme280_device() -> Option<PathBuf> {",
      '    fs::read_dir("/sys/bus/iio/devices").ok()?.flatten().map(|e| e.path()).find(|p| {',
      '        fs::read_to_string(p.join("name")).map_or(false, |n| n.trim() == "bme280")',
      "    })",
      "}",
    );

  const setup: string[] = [];
  if (gpio) setup.push("let gpio = Gpio::new()?;");
  if (has("bme280")) setup.push("let bme280 = bme280_device();");
  const loop: string[] = [];
  for (const p of ps) {
    const v = local(p.id);
    switch (p.type) {
      case "bme280":
        loop.push(
          "if let Some(dir) = &bme280 {",
          "    // The driver reports milli-degrees, kilopascals and milli-percent.",
          '    if let Some(v) = read_number(&dir.join("in_temp_input")) {',
          `        println!("${p.id} temperature_c={:.2}", v / 1000.0);`,
          "    }",
          '    if let Some(v) = read_number(&dir.join("in_pressure_input")) {',
          `        println!("${p.id} pressure_pa={:.0}", v * 1000.0);`,
          "    }",
          '    if let Some(v) = read_number(&dir.join("in_humidityrelative_input")) {',
          `        println!("${p.id} humidity_pct={:.1}", v / 1000.0);`,
          "    }",
          "}",
        );
        break;
      case "ds18b20":
        loop.push(
          'if let Some(v) = find("/sys/bus/w1/devices", "28-", "temperature").and_then(|p| read_number(&p)) {',
          `    println!("${p.id} temperature_c={:.2}", v / 1000.0);`,
          "}",
        );
        break;
      case "hcsr04":
        setup.push(
          `let mut ${v}_trig = gpio.get(${p.trig.gpio})?.into_output_low(); // ${p.trig.label}`,
          `let ${v}_echo = gpio.get(${p.echo.gpio})?.into_input(); // ${p.echo.label}`,
        );
        loop.push(
          ...hcsr04Block(p.id, v, {
            high: `${v}_trig.set_high()`,
            low: `${v}_trig.set_low()`,
            isHigh: `${v}_echo.is_high()`,
            sleep10us: "thread::sleep(Duration::from_micros(10))",
          }),
        );
        break;
      case "i2c":
        loop.push(`// ${p.id} ${p.name}: on the I2C bus, with no driver here.`);
        break;
      case "output":
        setup.push(`let mut ${v} = gpio.get(${p.pin.gpio})?.into_output(); // ${p.name}`);
        loop.push(`if on { ${v}.set_high() } else { ${v}.set_low() }`);
        break;
      case "input":
        setup.push(`let ${v} = gpio.get(${p.pin.gpio})?.into_input(); // ${p.name}`);
        loop.push(`println!("${p.id} level={}", ${v}.is_high() as u8);`);
        break;
    }
  }
  const blinks = has("output");
  return file([
    ...lineComment(
      header(
        t,
        "Rust (stable) on Raspberry Pi OS" +
          (gpio ? ', with the rppal crate (rppal = "0.22").' : "."),
        [
          "cargo new echidna && cd echidna" + (gpio ? " && cargo add rppal@0.22" : ""),
          "Save this as src/main.rs, then: cargo run --release",
        ],
        piConfigLines(t),
      ),
    ),
    ...uses,
    ...(helpers.length ? ["", ...helpers] : []),
    "",
    "fn main() -> Result<(), Box<dyn std::error::Error>> {",
    ...indent([
      ...setup,
      ...(setup.length ? [""] : []),
      `println!("# Echidna: ${t.boardId} ${t.boardName}");`,
      ...(blinks ? ["let mut on = true;"] : []),
      "loop {",
      ...indent(loop),
      ...(blinks ? ["    on = !on;"] : []),
      "    thread::sleep(Duration::from_secs(1));",
      "}",
    ]),
    "}",
  ]);
};

/** There is no maintained Rust HAL for the UNO R4's Renesas RA4M1, so this tab says so. */
const arduino = (t: FirmwareTarget): string =>
  file(
    lineComment([
      ...header(t, "none: there is no maintained Rust HAL for the UNO R4's Renesas RA4M1.", []),
      "",
      "avr-hal covers the older AVR UNO, not the R4. Use the C++ tab for this board, or",
      "start from an ESP32 or Raspberry Pi to get Rust.",
    ]),
  ) + "\nfn main() {}\n";

/**
 * The program in Rust for the project's dev board.
 * @param target - From `firmwareTarget`.
 * @returns The source and what to call it.
 */
export const generateRust = (target: FirmwareTarget): GeneratedCode => {
  switch (target.family) {
    case "esp32":
      return { fileName: "main.rs", code: esp32(target) };
    case "raspberryPi":
      return { fileName: "main.rs", code: raspberryPi(target) };
    case "arduino":
      return { fileName: "main.rs", code: arduino(target) };
  }
};
