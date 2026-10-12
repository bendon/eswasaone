/** Shows the exact outbound message an action will send (gap 01 C5). */
export type PreviewMessage = {
  to: string;
  subject: string;
  body: string;
  channel?: ("email" | "sms" | "portal")[];
};

export function MessagePreview({ message, title = "Message that will be sent" }: { message: PreviewMessage; title?: string }) {
  return (
    <div className="eo-msgprev">
      <div className="eo-msgprev__h">
        <b>{title}</b>
        {message.channel?.map((c) => (
          <span key={c} className="crm-pill crm-pill--slate">
            {c === "sms" ? "SMS" : c === "email" ? "Email" : "Portal"}
          </span>
        ))}
      </div>
      <dl className="crm-kv">
        <dt>To</dt>
        <dd>{message.to}</dd>
        <dt>Subject</dt>
        <dd>
          <b>{message.subject}</b>
        </dd>
      </dl>
      <pre className="eo-msgprev__body">{message.body}</pre>
    </div>
  );
}
