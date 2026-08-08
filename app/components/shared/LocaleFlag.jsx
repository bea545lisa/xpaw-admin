import * as Flags from "country-flag-icons/react/3x2";
import { getLocaleCountryCode } from "../../utils/localeFlag";

export default function LocaleFlag({ locale, title, size = 16, round = false }) {
  const code = getLocaleCountryCode(locale);
  const Flag = code ? Flags[code] : null;
  if (!Flag) return null;

  if (!round) {
    return <Flag title={title} style={{ width: size, height: size * 0.75, flexShrink: 0, borderRadius: 2 }} />;
  }

  // Flaggen sind 3:2 (Breite:Höhe). Für vollständige Kreis-Abdeckung ohne Lücken in den Ecken
  // muss die Höhe mind. dem Kreisdurchmesser entsprechen → Breite = Höhe * 1.5.
  const flagWidth = size * 1.55;
  const flagHeight = flagWidth * (2 / 3);

  return (
    <span style={{
      position: "relative", display: "inline-block",
      width: size, height: size, borderRadius: "50%", overflow: "hidden", flexShrink: 0,
    }}>
      <Flag title={title} style={{
        position: "absolute", top: "50%", left: "50%",
        width: flagWidth, height: flagHeight,
        transform: "translate(-50%, -50%)",
        filter: "saturate(0.6) brightness(1.03)",
      }} />
    </span>
  );
}
