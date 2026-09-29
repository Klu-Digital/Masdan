import { FieldError } from "@masdan/ui/components/field";

const messageOf = (error: unknown): string | undefined => {
  if (typeof error === "object" && error !== null && "message" in error) {
    return error.message === undefined ? undefined : String(error.message);
  }
  return error === undefined ? undefined : String(error);
};

export const FieldErrors = ({ errors }: { errors: unknown[] }) =>
  errors.map((error) => {
    const message = messageOf(error);
    return message ? (
      <FieldError key={message} match>
        {message}
      </FieldError>
    ) : null;
  });
