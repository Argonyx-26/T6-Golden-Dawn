import { describe, expect, it } from "vitest";
import { authErrorMessage } from "./supabase";

describe("authErrorMessage", () => {
  it("maps known errors to clear messages", () => {
    expect(authErrorMessage({ message: "Invalid login credentials", code: "invalid_credentials" }, true)).toBe("Wrong email or password.");
    expect(authErrorMessage({ message: "User already registered", code: "user_already_exists" }, true)).toMatch(/already exists/);
    expect(authErrorMessage({ message: "Password should be at least 6 characters.", code: "weak_password" }, true)).toMatch(/too weak.*6 characters/);
    expect(authErrorMessage({ message: "Failed to fetch", name: "AuthRetryableFetchError" }, true)).toMatch(/internet/);
    expect(authErrorMessage({ message: "TypeError: Failed to fetch" }, true)).toMatch(/internet/);
  });

  it("explains missing config before anything else", () => {
    expect(authErrorMessage({ message: "x", code: "invalid_credentials" }, false)).toMatch(/\.env\.local/);
  });

  it("falls back to the raw message", () => {
    expect(authErrorMessage({ message: "Something odd" }, true)).toBe("Something odd");
  });
});
