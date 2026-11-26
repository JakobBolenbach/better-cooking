// Settings for the user's own AI (issue #5), part of the settings tab (src/settingsTab.ts).
import { AI_KEY_ID, endpointValid, type AiProvider } from "./ai";
import { secretRow, type Group, type RowContext } from "./settingsRows";
import { tr } from "./i18n";

export function aiGroup(ctx: RowContext): Group {
  const p = ctx.plugin;
  return {
    heading: tr("setAiHeading"),
    intro: tr("setAiIntro"),
    rows: [
      {
        name: tr("setAiProvider"),
        aliases: ["Anthropic", "OpenAI", "Ollama", "LM Studio"],
        render: (s) =>
          s.addDropdown((d) =>
            d
              .addOptions({ anthropic: tr("setAiAnthropic"), openai: tr("setAiOpenai") })
              .setValue(p.settings.aiProvider)
              .onChange(async (v) => {
                await p.save({ aiProvider: v as AiProvider });
                ctx.refresh();
              }),
          ),
      },
      {
        name: tr("setAiEndpoint"),
        desc: tr("setAiEndpointDesc"),
        render: (s) => {
          const hint = s.descEl.createDiv({ cls: "mod-warning" });
          s.addText((t) =>
            t
              .setPlaceholder("https://…")
              .setValue(p.settings.aiEndpoint)
              .onChange(async (v) => {
                const ok = endpointValid(v);
                hint.setText(ok ? "" : tr("setAiEndpointInvalid"));
                if (!ok) return;
                await p.save({ aiEndpoint: v.trim() });
                ctx.refresh();
              }),
          );
        },
      },
      {
        name: tr("setAiModel"),
        desc: tr("setAiModelDesc"),
        render: (s) =>
          s.addText((t) =>
            t.setValue(p.settings.aiModel).onChange(async (v) => {
              await p.save({ aiModel: v.trim() });
              ctx.refresh();
            }),
          ),
      },
      secretRow(ctx, AI_KEY_ID, tr("setAiKey"), tr("setAiKeyDesc"), "sk-…"),
    ],
  };
}
