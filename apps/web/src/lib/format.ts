export const formatBytes = (bytes: number | null): string => {
  if (bytes === null) {
    return "—";
  }
  const megabytes = bytes / (1024 * 1024);
  return megabytes >= 1
    ? `${megabytes.toFixed(1)} MB`
    : `${(bytes / 1024).toFixed(1)} KB`;
};
