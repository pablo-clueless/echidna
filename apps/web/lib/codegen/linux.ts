import type { FirmwareTarget } from "./model";
import { hex } from "./common";

/**
 * The GPIO character device for the header pins. The Pi 5's RP1 header pins were `gpiochip4` on kernels before
 * 6.6.45; they are `gpiochip0` on both boards now.
 */
export const piGpioChip = (_t: FirmwareTarget) => "/dev/gpiochip0";

/**
 * What to add to `/boot/firmware/config.txt` so the kernel drives the sensors: its bme280 driver over I²C, and the
 * 1-Wire bus on the DS18B20's pin. Each program then reads them from sysfs, as files.
 * @param t - The board and what is connected to it.
 * @returns Comment lines, empty when no sensor needs a kernel driver.
 */
export const piConfigLines = (t: FirmwareTarget): string[] => {
  const overlays = t.peripherals.flatMap((p) =>
    p.type === "bme280"
      ? ["dtparam=i2c_arm=on", `dtoverlay=i2c-sensor,bme280,addr=${hex(p.address)}`]
      : p.type === "ds18b20"
        ? [`dtoverlay=w1-gpio,gpiopin=${p.data.gpio}`]
        : [],
  );
  const notes = [
    ...(t.specId === "raspberry-pi-5"
      ? ["On a Pi 5 with a kernel older than 6.6.45, the header pins are on /dev/gpiochip4."]
      : []),
  ];
  if (!overlays.length) return notes;
  return [
    "Add to /boot/firmware/config.txt and reboot, so the kernel's drivers read the sensors:",
    ...overlays.map((o) => `  ${o}`),
    ...notes,
  ];
};
