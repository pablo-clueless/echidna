import {
  file,
  type GeneratedCode,
  header,
  hex,
  indent,
  lineComment,
  SPEED_OF_SOUND,
} from "./common";
import { type FirmwareTarget, ident } from "./model";
import { piConfigLines } from "./linux";

const TAB = "\t";
const tabs = (lines: string[], depth = 1) => indent(lines, depth, TAB);
const BOOL_TO_INT = [
  "func boolToInt(b bool) int {",
  `${TAB}if b {`,
  `${TAB}${TAB}return 1`,
  `${TAB}}`,
  `${TAB}return 0`,
  "}",
];

/** Go names start lower case for package-private values: `S1` → `s1`. */
const local = (id: string) => ident(id).toLowerCase();

/** TinyGo on the ESP32, with drivers from tinygo.org/x/drivers. */
const esp32 = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const imports = [
    '"fmt"',
    '"machine"',
    '"time"',
    ...(has("bme280") ? ['"tinygo.org/x/drivers/bme280"'] : []),
    ...(has("ds18b20") ? ['"tinygo.org/x/drivers/ds18b20"', '"tinygo.org/x/drivers/onewire"'] : []),
    ...(has("hcsr04") ? ['"tinygo.org/x/drivers/hcsr04"'] : []),
  ];
  const setup: string[] = [];
  const loop: string[] = [];
  if (t.i2c && has("bme280"))
    setup.push(
      `machine.I2C0.Configure(machine.I2CConfig{SDA: machine.GPIO${t.i2c.sda.gpio}, SCL: machine.GPIO${t.i2c.scl.gpio}})`,
    );
  for (const p of ps) {
    const v = local(p.id);
    switch (p.type) {
      case "bme280":
        setup.push(
          "",
          `// ${p.id} ${p.name}`,
          `${v} := bme280.New(machine.I2C0)`,
          `${v}.Address = ${hex(p.address)}`,
          `${v}.Configure()`,
        );
        loop.push(
          "",
          "// The driver reports milli-degrees, milli-pascals and hundredths of a percent.",
          `if t, err := ${v}.ReadTemperature(); err == nil {`,
          `${TAB}fmt.Printf("${p.id} temperature_c=%.2f\\n", float32(t)/1000)`,
          "}",
          `if pa, err := ${v}.ReadPressure(); err == nil {`,
          `${TAB}fmt.Printf("${p.id} pressure_pa=%.0f\\n", float32(pa)/1000)`,
          "}",
          `if h, err := ${v}.ReadHumidity(); err == nil {`,
          `${TAB}fmt.Printf("${p.id} humidity_pct=%.1f\\n", float32(h)/100)`,
          "}",
        );
        break;
      case "ds18b20":
        setup.push(
          "",
          `// ${p.id} ${p.name} on ${p.data.label}`,
          `${v}Bus := onewire.New(machine.GPIO${p.data.gpio})`,
          `${v} := ds18b20.New(${v}Bus)`,
          `${v}Roms, _ := ${v}Bus.Search(onewire.SEARCH_ROM)`,
        );
        loop.push(
          "",
          `for _, rom := range ${v}Roms {`,
          `${TAB}${v}.RequestTemperature(rom)`,
          `${TAB}time.Sleep(750 * time.Millisecond)`,
          `${TAB}if t, err := ${v}.ReadTemperature(rom); err == nil {`,
          `${TAB}${TAB}fmt.Printf("${p.id} temperature_c=%.2f\\n", float32(t)/1000)`,
          `${TAB}}`,
          "}",
        );
        break;
      case "hcsr04":
        setup.push(
          "",
          `// ${p.id} ${p.name}: trigger ${p.trig.label}, echo ${p.echo.label}`,
          `${v} := hcsr04.New(machine.GPIO${p.trig.gpio}, machine.GPIO${p.echo.gpio})`,
          `${v}.Configure()`,
        );
        loop.push(
          "",
          `if mm := ${v}.ReadDistance(); mm > 0 {`,
          `${TAB}fmt.Printf("${p.id} distance_m=%.2f\\n", float32(mm)/1000)`,
          "} else {",
          `${TAB}fmt.Println("${p.id} error=no-echo")`,
          "}",
        );
        break;
      case "i2c":
        setup.push("", `// ${p.id} ${p.name}: on the I2C bus, with no driver here.`);
        break;
      case "output":
        setup.push(
          "",
          `${v} := machine.GPIO${p.pin.gpio} // ${p.name}`,
          `${v}.Configure(machine.PinConfig{Mode: machine.PinOutput})`,
        );
        loop.push("", `${v}.Set(on)`);
        break;
      case "input":
        setup.push(
          "",
          `${v} := machine.GPIO${p.pin.gpio} // ${p.name}`,
          `${v}.Configure(machine.PinConfig{Mode: machine.PinInput})`,
        );
        loop.push("", `fmt.Printf("${p.id} level=%d\\n", boolToInt(${v}.Get()))`);
        break;
    }
  }
  const blinks = has("output");
  const reads = has("input");
  return file([
    ...lineComment(
      header(t, "TinyGo 0.33 or later, with tinygo.org/x/drivers.", [
        "go mod init echidna && go get tinygo.org/x/drivers",
        "tinygo flash -target=esp32-coreboard-v2 -monitor .",
      ]),
    ),
    "package main",
    "",
    "import (",
    ...tabs(imports),
    ")",
    "",
    "func main() {",
    ...tabs([
      `fmt.Println("# Echidna: ${t.boardId} ${t.boardName}")`,
      ...setup,
      "",
      ...(blinks ? ["on := true"] : []),
      "for {",
      ...tabs(loop.slice(loop[0] === "" ? 1 : 0)),
      ...(blinks ? [`${TAB}on = !on`] : []),
      `${TAB}time.Sleep(time.Second)`,
      "}",
    ]),
    "}",
    ...(reads ? ["", ...BOOL_TO_INT] : []),
  ]);
};

/** Go on Raspberry Pi OS: kernel drivers through sysfs for the sensors, periph.io for the pins. */
const raspberryPi = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const gpio = ps.some((p) => p.type === "output" || p.type === "input" || p.type === "hcsr04");
  const sysfs = has("bme280") || has("ds18b20");
  const imports = [
    '"fmt"',
    ...(gpio ? ['"log"'] : []),
    ...(sysfs ? ['"os"', '"path/filepath"', '"strconv"', '"strings"'] : []),
    '"time"',
    ...(gpio
      ? [
          "",
          '"periph.io/x/conn/v3/gpio"',
          '"periph.io/x/conn/v3/gpio/gpioreg"',
          '"periph.io/x/host/v3"',
        ]
      : []),
  ];
  const helpers: string[] = [];
  if (sysfs)
    helpers.push(
      "// readNumber reads the number in the first file matching a pattern, such as a sysfs attribute.",
      "func readNumber(pattern string) (float64, bool) {",
      `${TAB}paths, _ := filepath.Glob(pattern)`,
      `${TAB}if len(paths) == 0 {`,
      `${TAB}${TAB}return 0, false`,
      `${TAB}}`,
      `${TAB}text, err := os.ReadFile(paths[0])`,
      `${TAB}if err != nil {`,
      `${TAB}${TAB}return 0, false`,
      `${TAB}}`,
      `${TAB}value, err := strconv.ParseFloat(strings.TrimSpace(string(text)), 64)`,
      `${TAB}return value, err == nil`,
      "}",
    );
  if (has("bme280"))
    helpers.push(
      "",
      "// bme280Device finds the IIO device the kernel's bme280 driver made.",
      "func bme280Device() string {",
      `${TAB}names, _ := filepath.Glob("/sys/bus/iio/devices/iio:device*/name")`,
      `${TAB}for _, name := range names {`,
      `${TAB}${TAB}if text, err := os.ReadFile(name); err == nil && strings.TrimSpace(string(text)) == "bme280" {`,
      `${TAB}${TAB}${TAB}return filepath.Dir(name)`,
      `${TAB}${TAB}}`,
      `${TAB}}`,
      `${TAB}return ""`,
      "}",
    );
  if (has("hcsr04"))
    helpers.push(
      "",
      "// hcsr04Metres sends a 10 µs trigger pulse and times the echo; false with no echo within 30 ms.",
      "func hcsr04Metres(trig gpio.PinOut, echo gpio.PinIn) (float64, bool) {",
      `${TAB}trig.Out(gpio.High)`,
      `${TAB}time.Sleep(10 * time.Microsecond)`,
      `${TAB}trig.Out(gpio.Low)`,
      `${TAB}timeout := time.Now().Add(30 * time.Millisecond)`,
      `${TAB}start := time.Now()`,
      `${TAB}for echo.Read() == gpio.Low {`,
      `${TAB}${TAB}if start = time.Now(); start.After(timeout) {`,
      `${TAB}${TAB}${TAB}return 0, false`,
      `${TAB}${TAB}}`,
      `${TAB}}`,
      `${TAB}end := start`,
      `${TAB}for echo.Read() == gpio.High {`,
      `${TAB}${TAB}if end = time.Now(); end.After(timeout) {`,
      `${TAB}${TAB}${TAB}return 0, false`,
      `${TAB}${TAB}}`,
      `${TAB}}`,
      `${TAB}return end.Sub(start).Seconds() * ${SPEED_OF_SOUND} / 2, true`,
      "}",
    );
  const pin = (v: string, gpioNumber: number, comment: string) => [
    `${v} := gpioreg.ByName("GPIO${gpioNumber}") // ${comment}`,
    `if ${v} == nil {`,
    `${TAB}log.Fatal("no GPIO${gpioNumber}")`,
    "}",
  ];

  const setup: string[] = [];
  if (gpio) setup.push("if _, err := host.Init(); err != nil {", `${TAB}log.Fatal(err)`, "}");
  if (has("bme280")) setup.push("bme280 := bme280Device()");
  const loop: string[] = [];
  for (const p of ps) {
    const v = local(p.id);
    switch (p.type) {
      case "bme280":
        loop.push(
          "// The driver reports milli-degrees, kilopascals and milli-percent.",
          'if v, ok := readNumber(bme280 + "/in_temp_input"); ok {',
          `${TAB}fmt.Printf("${p.id} temperature_c=%.2f\\n", v/1000)`,
          "}",
          'if v, ok := readNumber(bme280 + "/in_pressure_input"); ok {',
          `${TAB}fmt.Printf("${p.id} pressure_pa=%.0f\\n", v*1000)`,
          "}",
          'if v, ok := readNumber(bme280 + "/in_humidityrelative_input"); ok {',
          `${TAB}fmt.Printf("${p.id} humidity_pct=%.1f\\n", v/1000)`,
          "}",
        );
        break;
      case "ds18b20":
        loop.push(
          'if v, ok := readNumber("/sys/bus/w1/devices/28-*/temperature"); ok {',
          `${TAB}fmt.Printf("${p.id} temperature_c=%.2f\\n", v/1000)`,
          "}",
        );
        break;
      case "hcsr04":
        setup.push(
          ...pin(`${v}Trig`, p.trig.gpio, `${p.id} trigger`),
          `${v}Trig.Out(gpio.Low)`,
          ...pin(`${v}Echo`, p.echo.gpio, `${p.id} echo`),
          `${v}Echo.In(gpio.PullNoChange, gpio.NoEdge)`,
        );
        loop.push(
          `if m, ok := hcsr04Metres(${v}Trig, ${v}Echo); ok {`,
          `${TAB}fmt.Printf("${p.id} distance_m=%.2f\\n", m)`,
          "} else {",
          `${TAB}fmt.Println("${p.id} error=no-echo")`,
          "}",
        );
        break;
      case "i2c":
        loop.push(`// ${p.id} ${p.name}: on the I2C bus, with no driver here.`);
        break;
      case "output":
        setup.push(...pin(v, p.pin.gpio, p.name));
        loop.push(`${v}.Out(level)`);
        break;
      case "input":
        setup.push(...pin(v, p.pin.gpio, p.name), `${v}.In(gpio.PullNoChange, gpio.NoEdge)`);
        loop.push(`fmt.Printf("${p.id} level=%d\\n", boolToInt(${v}.Read() == gpio.High))`);
        break;
    }
  }
  const blinks = has("output");
  return file([
    ...lineComment(
      header(
        t,
        "Go 1.22 or later on Raspberry Pi OS" + (gpio ? ", with periph.io." : "."),
        [
          "go mod init echidna" +
            (gpio ? " && go get periph.io/x/host/v3 periph.io/x/conn/v3" : ""),
          "go run .",
        ],
        piConfigLines(t),
      ),
    ),
    "package main",
    "",
    "import (",
    ...tabs(imports),
    ")",
    ...(helpers.length ? ["", ...helpers] : []),
    "",
    "func main() {",
    ...tabs([
      `fmt.Println("# Echidna: ${t.boardId} ${t.boardName}")`,
      ...setup,
      "",
      ...(blinks ? ["level := gpio.High"] : []),
      "for {",
      ...tabs(loop.length ? loop : ["// Nothing to read."]),
      ...(blinks ? [`${TAB}level = !level`] : []),
      `${TAB}time.Sleep(time.Second)`,
      "}",
    ]),
    "}",
    ...(has("input") ? ["", ...BOOL_TO_INT] : []),
  ]);
};

/** TinyGo has no target for the UNO R4's Renesas RA4M1, so this tab says so. */
const arduino = (t: FirmwareTarget): string =>
  file(
    lineComment([
      ...header(t, "none: TinyGo has no target for the UNO R4's Renesas RA4M1.", []),
      "",
      "TinyGo supports the older AVR UNO (arduino) and many other boards, but not the",
      "UNO R4. Use the C++ tab for this board, or start from an ESP32 or Raspberry Pi",
      "to get Go.",
    ]),
  ).replace(/\n$/, "\npackage main\n");

/**
 * The program in Go for the project's dev board.
 * @param target - From `firmwareTarget`.
 * @returns The source and what to call it.
 */
export const generateGo = (target: FirmwareTarget): GeneratedCode => {
  switch (target.family) {
    case "esp32":
      return { fileName: "main.go", code: esp32(target) };
    case "raspberryPi":
      return { fileName: "main.go", code: raspberryPi(target) };
    case "arduino":
      return { fileName: "main.go", code: arduino(target) };
  }
};
