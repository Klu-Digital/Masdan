import { describe, expect, it } from "vite-plus/test";

import { trustedOrigins } from "./index";

const WEB = "https://app.example.com";

describe("trustedOrigins", () => {
  it.each(["production", "staging"])(
    "trusts only the web origin and the app scheme in %s",
    (nodeEnv) => {
      expect(trustedOrigins(nodeEnv, WEB)).toEqual([WEB, "masdan://"]);
    }
  );

  it.each(["development", "test"])(
    "adds the Expo dev client and Metro in %s",
    (nodeEnv) => {
      expect(trustedOrigins(nodeEnv, WEB)).toEqual([
        WEB,
        "masdan://",
        "exp://",
        "http://localhost:8081",
      ]);
    }
  );
});
