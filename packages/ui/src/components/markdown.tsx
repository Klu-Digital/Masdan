import { cn } from "@masdan/ui/lib/utils";
import type React from "react";
import ReactMarkdown from "react-markdown";
import type { Components } from "react-markdown";
import remarkGfm from "remark-gfm";

const components: Components = {
  a: ({ node: _node, children, className, href, ...props }) => {
    const external = href ? /^https?:\/\//u.test(href) : false;
    return (
      <a
        className={cn(
          "text-primary font-medium underline decoration-current/30 underline-offset-2 hover:decoration-current",
          className
        )}
        href={href}
        {...(external ? { rel: "noreferrer", target: "_blank" } : {})}
        {...props}
      >
        {children}
      </a>
    );
  },
  blockquote: ({ node: _node, className, ...props }) => (
    <blockquote
      className={cn(
        "border-border text-muted-foreground border-s-2 ps-3",
        className
      )}
      {...props}
    />
  ),
  code: ({ node: _node, className, ...props }) => (
    <code
      className={cn(
        "bg-muted rounded-md px-1.5 py-0.5 font-mono text-[0.85em] break-words in-[pre]:bg-transparent in-[pre]:p-0 in-[pre]:text-xs",
        className
      )}
      {...props}
    />
  ),
  h1: ({ node: _node, children, className, ...props }) => (
    <h3 className={cn("text-base font-semibold", className)} {...props}>
      {children}
    </h3>
  ),
  h2: ({ node: _node, children, className, ...props }) => (
    <h3 className={cn("text-base font-semibold", className)} {...props}>
      {children}
    </h3>
  ),
  h3: ({ node: _node, children, className, ...props }) => (
    <h4 className={cn("font-semibold", className)} {...props}>
      {children}
    </h4>
  ),
  h4: ({ node: _node, children, className, ...props }) => (
    <h5 className={cn("font-semibold", className)} {...props}>
      {children}
    </h5>
  ),
  hr: ({ node: _node, className, ...props }) => (
    <hr className={cn("border-hairline", className)} {...props} />
  ),
  li: ({ node: _node, className, ...props }) => (
    <li
      className={cn(
        "marker:text-muted-foreground ps-1 [&>ol]:mt-1.5 [&>ul]:mt-1.5",
        className
      )}
      {...props}
    />
  ),
  ol: ({ node: _node, className, ...props }) => (
    <ol
      className={cn("flex list-decimal flex-col gap-1.5 ps-5", className)}
      {...props}
    />
  ),
  pre: ({ node: _node, className, ...props }) => (
    <pre
      className={cn(
        "bg-muted max-h-64 overflow-auto rounded-lg p-3 text-xs",
        className
      )}
      {...props}
    />
  ),
  strong: ({ node: _node, className, ...props }) => (
    <strong className={cn("font-semibold", className)} {...props} />
  ),
  table: ({ node: _node, className, ...props }) => (
    <div className="ring-hairline overflow-x-auto rounded-lg ring-1">
      <table
        className={cn("w-full text-xs tabular-nums", className)}
        {...props}
      />
    </div>
  ),
  td: ({ node: _node, className, ...props }) => (
    <td
      className={cn(
        "border-hairline border-t px-2.5 py-1.5 align-top",
        className
      )}
      {...props}
    />
  ),
  th: ({ node: _node, className, ...props }) => (
    <th
      className={cn(
        "bg-muted px-2.5 py-1.5 text-start font-medium whitespace-nowrap",
        className
      )}
      {...props}
    />
  ),
  ul: ({ node: _node, className, ...props }) => (
    <ul
      className={cn("flex list-disc flex-col gap-1.5 ps-5", className)}
      {...props}
    />
  ),
};

/** Renders untrusted model output as GFM; raw HTML is dropped. */
export const Markdown = ({
  children,
  className,
}: {
  children: string;
  className?: string;
}): React.ReactElement => (
  <div
    className={cn(
      "flex min-w-0 flex-col gap-3 text-sm leading-relaxed break-words",
      className
    )}
    data-slot="markdown"
  >
    <ReactMarkdown components={components} remarkPlugins={[remarkGfm]}>
      {children}
    </ReactMarkdown>
  </div>
);
