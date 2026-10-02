import { getSessionFor, signUpTestUser } from "@masdan/testing";
import { APIError } from "better-auth/api";
import { describe, expect, it } from "vite-plus/test";

import { auth } from "./index";

describe("avatar guard", () => {
  it("saves an inline photo and refuses a remote URL", async () => {
    const { headers } = await signUpTestUser();
    const image = "data:image/png;base64,iVBORw0KGgo=";

    await auth.api.updateUser({ body: { image }, headers });
    await expect(getSessionFor(headers)).resolves.toMatchObject({
      user: { image },
    });

    await expect(
      auth.api.updateUser({
        body: { image: "https://tracker.example/pixel.png" },
        headers,
      })
    ).rejects.toBeInstanceOf(APIError);
    await expect(getSessionFor(headers)).resolves.toMatchObject({
      user: { image },
    });
  });
});
