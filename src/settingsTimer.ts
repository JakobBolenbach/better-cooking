// Settings of the cooking timers (issue #58), part of the settings tab (src/settingsTab.ts).
import type { Group, RowContext } from "./settingsRows";
import { tr, type Key } from "./i18n";
import { TIMER_VOLUMES, type TimerVolume } from "./timerSound";

const LABEL: Record<TimerVolume, Key> = {
  off: "timerVolumeOff",
  low: "timerVolumeLow",
  normal: "timerVolumeNormal",
  loud: "timerVolumeLoud",
};

export function timerGroup(ctx: RowContext): Group {
  const p = ctx.plugin;
  return {
    heading: tr("setTimerHeading"),
    intro: tr("timerPhoneHint"),
    rows: [
      {
        name: tr("setTimerVolume"),
        desc: tr("setTimerVolumeDesc"),
        aliases: ["Timer", "Gong", "Alarm", "Sound"],
        render: (s) => {
          s.addDropdown((d) =>
            d
              .addOptions(Object.fromEntries(TIMER_VOLUMES.map((v) => [v, tr(LABEL[v])])))
              .setValue(p.settings.timerVolume)
              .onChange((v) => void p.save({ timerVolume: v as TimerVolume })),
          );
          s.addButton((b) => b.setButtonText(tr("setTimerTest")).onClick(() => p.timers.testSound()));
        },
      },
    ],
  };
}
