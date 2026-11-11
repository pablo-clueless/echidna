import {
  BAUD,
  blockComment,
  file,
  type GeneratedCode,
  header,
  indent,
  readingsOf,
  SPEED_OF_SOUND,
} from "./common";
import { type FirmwareTarget, ident } from "./model";
import { piConfigLines } from "./linux";

/** Java names are camel case: `S1` → `s1`. */
const local = (id: string) => ident(id).toLowerCase();

/** Pi4J 2 on Raspberry Pi OS, with the sensors read through the kernel's drivers in sysfs. */
const raspberryPi = (t: FirmwareTarget): string => {
  const ps = t.peripherals;
  const has = (type: string) => ps.some((p) => p.type === type);
  const gpio = ps.some((p) => p.type === "output" || p.type === "input" || p.type === "hcsr04");
  const sysfs = has("bme280") || has("ds18b20");
  const imports = [
    ...(sysfs
      ? ["import java.io.IOException;", "import java.nio.file.*;", "import java.util.Optional;"]
      : []),
    ...(gpio
      ? [
          "import com.pi4j.Pi4J;",
          "import com.pi4j.context.Context;",
          "import com.pi4j.io.gpio.digital.DigitalInput;",
          "import com.pi4j.io.gpio.digital.DigitalOutput;",
        ]
      : []),
  ];
  const helpers: string[] = [];
  if (sysfs)
    helpers.push(
      "/** The number in the first file in {@code dir} matching {@code glob}, such as a sysfs attribute. */",
      "static Optional<Double> readNumber(String dir, String glob) {",
      "    try (DirectoryStream<Path> found = Files.newDirectoryStream(Paths.get(dir), glob)) {",
      "        for (Path path : found)",
      "            return Optional.of(Double.parseDouble(Files.readString(path).trim()));",
      "    } catch (IOException | NumberFormatException | DirectoryIteratorException e) {",
      "        // Not there, or not a number: no reading this time.",
      "    }",
      "    return Optional.empty();",
      "}",
    );
  if (has("bme280"))
    helpers.push(
      "",
      "/** The IIO device the kernel's bme280 driver made, found by name. */",
      "static Optional<String> bme280Device() {",
      '    try (DirectoryStream<Path> devices = Files.newDirectoryStream(Paths.get("/sys/bus/iio/devices"))) {',
      "        for (Path device : devices)",
      '            if (Files.readString(device.resolve("name")).trim().equals("bme280"))',
      "                return Optional.of(device.toString());",
      "    } catch (IOException e) {",
      "        // No IIO devices.",
      "    }",
      "    return Optional.empty();",
      "}",
    );
  if (has("hcsr04"))
    helpers.push(
      "",
      "/** Sends a 10 µs trigger pulse and times the echo, in metres; empty with no echo within 30 ms. */",
      "static Optional<Double> hcsr04Metres(DigitalOutput trig, DigitalInput echo) {",
      "    trig.high();",
      "    long pulse = System.nanoTime() + 10_000;",
      "    while (System.nanoTime() < pulse) Thread.onSpinWait();",
      "    trig.low();",
      "    long timeout = System.nanoTime() + 30_000_000L;",
      "    long start = System.nanoTime();",
      "    while (echo.isLow())",
      "        if ((start = System.nanoTime()) > timeout) return Optional.empty();",
      "    long end = start;",
      "    while (echo.isHigh())",
      "        if ((end = System.nanoTime()) > timeout) return Optional.empty();",
      `    return Optional.of((end - start) / 1e9 * ${SPEED_OF_SOUND} / 2);`,
      "}",
    );

  const setup: string[] = [];
  if (gpio) setup.push("Context pi4j = Pi4J.newAutoContext();");
  if (has("bme280")) setup.push("Optional<String> bme280 = bme280Device();");
  const loop: string[] = [];
  for (const p of ps) {
    const v = local(p.id);
    switch (p.type) {
      case "bme280":
        loop.push(
          "if (bme280.isPresent()) {",
          "    // The driver reports milli-degrees, kilopascals and milli-percent.",
          '    readNumber(bme280.get(), "in_temp_input")',
          `        .ifPresent(v -> System.out.printf("${p.id} temperature_c=%.2f%n", v / 1000));`,
          '    readNumber(bme280.get(), "in_pressure_input")',
          `        .ifPresent(v -> System.out.printf("${p.id} pressure_pa=%.0f%n", v * 1000));`,
          '    readNumber(bme280.get(), "in_humidityrelative_input")',
          `        .ifPresent(v -> System.out.printf("${p.id} humidity_pct=%.1f%n", v / 1000));`,
          "}",
        );
        break;
      case "ds18b20":
        loop.push(
          'try (DirectoryStream<Path> sensors = Files.newDirectoryStream(Paths.get("/sys/bus/w1/devices"), "28-*")) {',
          "    for (Path sensor : sensors)",
          '        readNumber(sensor.toString(), "temperature")',
          `            .ifPresent(v -> System.out.printf("${p.id} temperature_c=%.2f%n", v / 1000));`,
          "} catch (IOException e) {",
          `    System.out.println("${p.id} error=read");`,
          "}",
        );
        break;
      case "hcsr04":
        setup.push(
          `DigitalOutput ${v}Trig = pi4j.digitalOutput().create(${p.trig.gpio}); // ${p.trig.label}`,
          `DigitalInput ${v}Echo = pi4j.digitalInput().create(${p.echo.gpio}); // ${p.echo.label}`,
        );
        loop.push(
          `hcsr04Metres(${v}Trig, ${v}Echo).ifPresentOrElse(`,
          `    m -> System.out.printf("${p.id} distance_m=%.2f%n", m),`,
          `    () -> System.out.println("${p.id} error=no-echo"));`,
        );
        break;
      case "i2c":
        loop.push(`// ${p.id} ${p.name}: on the I2C bus, with no driver here.`);
        break;
      case "output":
        setup.push(`DigitalOutput ${v} = pi4j.digitalOutput().create(${p.pin.gpio}); // ${p.name}`);
        loop.push(`if (on) ${v}.high(); else ${v}.low();`);
        break;
      case "input":
        setup.push(`DigitalInput ${v} = pi4j.digitalInput().create(${p.pin.gpio}); // ${p.name}`);
        loop.push(`System.out.printf("${p.id} level=%d%n", ${v}.isHigh() ? 1 : 0);`);
        break;
    }
  }
  const blinks = has("output");
  return file([
    ...blockComment(
      header(
        t,
        "Java 17 or later on Raspberry Pi OS" + (gpio ? ", with Pi4J 2 (pi4j.com)." : "."),
        gpio
          ? [
              "Add com.pi4j:pi4j-core, pi4j-plugin-raspberrypi and pi4j-plugin-gpiod 2.7 to your build",
              "Save this as Echidna.java, then run it with the Pi4J jars on the class path",
            ]
          : ["java Echidna.java"],
        piConfigLines(t),
      ),
    ),
    ...(imports.length ? ["", ...imports] : []),
    "",
    "public class Echidna {",
    ...indent([
      ...helpers,
      ...(helpers.length ? [""] : []),
      "public static void main(String[] args) throws InterruptedException {",
      ...indent([
        ...setup,
        ...(setup.length ? [""] : []),
        `System.out.println("# Echidna: ${t.boardId} ${t.boardName}");`,
        ...(blinks ? ["boolean on = true;"] : []),
        "while (true) {",
        ...indent(loop),
        ...(blinks ? ["    on = !on;"] : []),
        "    Thread.sleep(1000);",
        "}",
      ]),
      "}",
    ]),
    "}",
  ]);
};

/**
 * No JVM fits on the ESP32 or the UNO R4, so the Java program runs on the computer the board is plugged into and
 * reads the C++ sketch's readings from its serial port, with jSerialComm.
 */
const hostReader = (t: FirmwareTarget): string => {
  const expected = t.peripherals.flatMap((p) =>
    readingsOf(p).map(([quantity, unit]) => ({
      key: `${p.id} ${quantity}`,
      label: `${p.name}, ${unit}`,
    })),
  );
  return file([
    ...blockComment(
      header(
        t,
        "Java 17 or later on your computer, with jSerialComm (com.fazecast:jSerialComm 2.11).",
        [
          "Flash the C++ tab's sketch to the board first: Java can't run on the board itself.",
          "java -cp jSerialComm-2.11.0.jar Echidna.java <port>   (such as COM3 or /dev/ttyUSB0)",
        ],
        [
          "No JVM fits on this board, so this program runs on the computer it is plugged into",
          "and reads the sketch's readings over USB serial.",
        ],
      ),
    ),
    "",
    "import com.fazecast.jSerialComm.SerialPort;",
    "",
    "import java.io.BufferedReader;",
    "import java.io.IOException;",
    "import java.io.InputStreamReader;",
    "import java.util.Map;",
    "",
    "public class Echidna {",
    ...indent([
      "/** What each reading is, by designator and quantity. */",
      "static final Map<String, String> READINGS = Map.ofEntries(",
      ...indent(
        expected.length
          ? expected.map(
              ({ key, label }, i) =>
                `Map.entry("${key}", "${label.replace(/"/g, '\\"')}")${i < expected.length - 1 ? "," : ""}`,
            )
          : [],
      ),
      ");",
      "",
      "public static void main(String[] args) throws IOException {",
      ...indent([
        "if (args.length == 0) {",
        "    for (SerialPort port : SerialPort.getCommPorts())",
        '        System.out.println(port.getSystemPortName() + ": " + port.getDescriptivePortName());',
        '    System.out.println("Run again with the board\'s port.");',
        "    return;",
        "}",
        "SerialPort port = SerialPort.getCommPort(args[0]);",
        `port.setBaudRate(${BAUD});`,
        "port.setComPortTimeouts(SerialPort.TIMEOUT_READ_BLOCKING, 0, 0);",
        'if (!port.openPort()) throw new IOException("Could not open " + args[0]);',
        "try (BufferedReader in = new BufferedReader(new InputStreamReader(port.getInputStream()))) {",
        "    for (String line; (line = in.readLine()) != null; ) {",
        '        // "<designator> <quantity>=<value>"',
        '        String[] parts = line.trim().split("[ =]", 3);',
        "        if (parts.length < 3) continue;",
        '        String what = READINGS.getOrDefault(parts[0] + " " + parts[1], parts[1]);',
        '        System.out.println(parts[0] + " " + what + ": " + parts[2]);',
        "    }",
        "} finally {",
        "    port.closePort();",
        "}",
      ]),
      "}",
    ]),
    "}",
  ]);
};

/**
 * The program in Java for the project's dev board: Pi4J on a Raspberry Pi, or a serial reader on the computer a
 * microcontroller board is plugged into.
 * @param target - From `firmwareTarget`.
 * @returns The source and what to call it.
 */
export const generateJava = (target: FirmwareTarget): GeneratedCode => ({
  fileName: "Echidna.java",
  code: target.family === "raspberryPi" ? raspberryPi(target) : hostReader(target),
});
