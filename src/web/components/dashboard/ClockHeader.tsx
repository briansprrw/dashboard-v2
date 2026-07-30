// Large configurable date/time header (M0.3 AC-G6; product-plan A5: "Large
// configurable date/time header suitable for a side monitor or smart
// frame"; Glance mode spec: "Makes date/time prominent when enabled").
// Ticks every second so a wall/smart-frame display stays current without a
// page reload — this is the one place in the app that owns a running timer
// purely for display, unrelated to data refresh (M3.5's polling).

import { useEffect, useState } from 'react';

const TIME_FORMAT = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  month: 'long',
  day: 'numeric',
});

export function ClockHeader() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="clock-header" data-testid="clock-header">
      <span className="clock-header__time">{TIME_FORMAT.format(now)}</span>
      <span className="clock-header__date">{DATE_FORMAT.format(now)}</span>
    </div>
  );
}
