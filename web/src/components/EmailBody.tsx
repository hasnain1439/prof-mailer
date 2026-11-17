"use client";

/**
 * Renders an email body. HTML bodies go into a fully sandboxed iframe
 * (sandbox="" => no scripts, no same-origin, no forms, no top navigation).
 * The iframe always stays white: emails are designed for light backgrounds.
 */
export function EmailBody({
  body,
  isHtml,
  height = 400,
  className = "",
  textClassName = "",
  title = "Email preview",
}: {
  body: string;
  isHtml: boolean;
  height?: number;
  className?: string;
  textClassName?: string;
  title?: string;
}) {
  if (isHtml) {
    return (
      <iframe
        title={title}
        sandbox=""
        srcDoc={body}
        referrerPolicy="no-referrer"
        className={`block w-full rounded-md border border-border bg-white ${className}`}
        style={{ height, colorScheme: "light", background: "#fff" }}
      />
    );
  }
  return <pre className={`font-sans text-sm leading-relaxed break-words whitespace-pre-wrap text-text ${textClassName} ${className}`}>{body}</pre>;
}

export function HtmlBadge() {
  return (
    <span className="inline-flex h-5 items-center rounded-sm border border-border bg-surface px-1.5 font-mono text-[11px] font-medium text-muted">HTML</span>
  );
}
