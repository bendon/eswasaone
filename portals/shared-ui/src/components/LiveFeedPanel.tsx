import { Icon, type IconName } from "../icons/Icon";

export type LiveAlert = {
  id: string;
  tone: "r" | "g" | "a" | "t";
  icon: IconName;
  label: string;
  text: string;
};

type Props = {
  alerts: LiveAlert[];
  showMiniAsk?: boolean;
  miniHint?: string;
};

export function LiveFeedPanel({
  alerts,
  showMiniAsk,
  miniHint = 'Try: "renew cert", "export to EU", "my training"',
}: Props) {
  return (
    <div className="agent">
      <div className="agent__h">
        <span className="d">
          <Icon name="i-spark" />
        </span>
        <b>EswasaOne Assistant</b>
        <span className="live">Live</span>
      </div>
      {alerts.map((a) => (
        <div key={a.id} className={`alert ${a.tone}`}>
          <Icon name={a.icon} />
          <div>
            <b>{a.label}</b>
            {a.text}
          </div>
        </div>
      ))}
      {showMiniAsk ? (
        <>
          <div className="agent__ask">
            Ask the AI Agent…
            <Icon name="i-send" />
          </div>
          <div className="agent__try">{miniHint}</div>
        </>
      ) : null}
    </div>
  );
}
