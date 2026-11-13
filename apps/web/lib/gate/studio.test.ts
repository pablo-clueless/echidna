import { describe, expect, it } from "vitest";

import { hostnameOf, isLocalHost, studioBounce } from "./studio";

describe("studio gate", () => {
  it("treats only loopback hostnames as local", () => {
    for (const host of ["localhost", "127.0.0.1", "::1", "[::1]", "echidna.localhost"])
      expect(isLocalHost(host)).toBe(true);
    for (const host of ["echidna.app", "localhost.evil.com", "192.168.1.10", "echidna.vercel.app"])
      expect(isLocalHost(host)).toBe(false);
  });

  it("drops the port from a Host header", () => {
    expect(hostnameOf("localhost:3000")).toBe("localhost");
    expect(hostnameOf("[::1]:3000")).toBe("[::1]");
    expect(hostnameOf("echidna.app")).toBe("echidna.app");
  });

  it("lets the studio through locally", () => {
    expect(studioBounce("/en/studio", "localhost:3000")).toBeNull();
    expect(studioBounce("/studio", "127.0.0.1:3100")).toBeNull();
  });

  it("bounces a deployment even when the Host header claims to be local", () => {
    expect(studioBounce("/en/studio", "localhost", true)).toBe("/en");
    expect(studioBounce("/en/studio", null)).toBe("/en");
  });

  it("bounces the studio elsewhere to the home page in the same locale", () => {
    expect(studioBounce("/fr/studio", "echidna.app")).toBe("/fr");
    expect(studioBounce("/ja/studio/anything", "echidna.app")).toBe("/ja");
    expect(studioBounce("/studio", "echidna.app")).toBe("/");
  });

  it("leaves every other page alone", () => {
    for (const path of ["/", "/en", "/en/studios", "/en/about/studio", "/studio-notes"])
      expect(studioBounce(path, "echidna.app")).toBeNull();
  });
});
