/**
 * The web page directly, not better-auth's `/api/auth/reset-password/<token>`
 * redirect: that one puts the token in a server path the request logger sees.
 */
export const resetPasswordUrl = (webOrigin: string, token: string): string => {
  const url = new URL("/reset-password", webOrigin);
  url.searchParams.set("token", token);
  return url.toString();
};
