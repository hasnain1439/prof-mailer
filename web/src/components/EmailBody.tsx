"use client";

/**
 * Renders an email body. HTML bodies go into a fully sandboxed iframe
 * (sandbox="" => no scripts, no same-origin, no forms, no top navigation).
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
        className={`block w-full rounded-lg bg-white ring-1 ring-slate-200 ${className}`}
        style={{ height }}
      />
    );
  }
  return <pre className={`whitespace-pre-wrap break-words font-sans text-sm leading-relaxed ${textClassName} ${className}`}>{body}</pre>;
}

export function HtmlBadge() {
  return (
    <span className="rounded-full bg-amber-50 px-2 py-0.5 font-mono text-[10px] font-semibold text-amber-800 ring-1 ring-inset ring-amber-600/20">HTML</span>
  );
}
