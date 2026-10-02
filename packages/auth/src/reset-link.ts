// Not better-auth's redirect: its path puts the token in the request log.
export const resetPasswordUrl = (webOrigin: string, token: string): string => {
  const url = new URL("/reset-password", webOrigin);
  url.searchParams.set("token", token);
  return url.toString();
};
