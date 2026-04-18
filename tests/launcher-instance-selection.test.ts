import { describe, expect, test } from "bun:test";
import { compareRuntimeInstanceIds, getInstanceShortcutLabel, getNextSequentialInstanceId } from "../apps/launcher/src/index";

describe("launcher instance selection", () => {
  test("sorts numeric instance ids before named folders", () => {
    const sorted = ["personal-instance", "02", "misc", "00", "01"].sort(compareRuntimeInstanceIds);
    expect(sorted).toEqual(["00", "01", "02", "misc", "personal-instance"]);
  });

  test("picks the next two-digit instance id from the current max", () => {
    expect(getNextSequentialInstanceId([])).toBe("00");
    expect(getNextSequentialInstanceId(["00"])).toBe("01");
    expect(getNextSequentialInstanceId(["00", "01", "personal-instance"])).toBe("02");
    expect(getNextSequentialInstanceId(["00", "02", "personal-instance"])).toBe("03");
  });

  test("maps numeric instance folders to numeric shortcut labels", () => {
    expect(getInstanceShortcutLabel("00")).toBe("0");
    expect(getInstanceShortcutLabel("01")).toBe("1");
    expect(getInstanceShortcutLabel("09")).toBe("9");
    expect(getInstanceShortcutLabel("personal-instance")).toBeNull();
  });
});
