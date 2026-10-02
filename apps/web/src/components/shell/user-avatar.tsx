import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@masdan/ui/components/avatar";
import type { ComponentProps } from "react";

import { initialsOf } from "./initials";

/** A member's photo, falling back to their initials. */
export const UserAvatar = ({
  image,
  name,
  ...props
}: Omit<ComponentProps<typeof Avatar>, "children"> & {
  image?: string | null;
  name: string;
}) => (
  <Avatar {...props}>
    {image ? <AvatarImage alt="" src={image} /> : null}
    <AvatarFallback>{initialsOf(name)}</AvatarFallback>
  </Avatar>
);
