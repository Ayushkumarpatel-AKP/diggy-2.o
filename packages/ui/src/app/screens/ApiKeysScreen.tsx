/**
 * API Keys — the in-panel key setup as a real nav screen.
 *
 * A thin presentational wrapper: it renders the existing `SetupPanel` with
 * the values passed through from `Dashboard` and adds nothing new. No
 * `chrome`/`browser`/`fetch` here — the host persists.
 *
 * // INTERFACE FOR INTEGRATION
 * interface ApiKeysSetup { primary: SetupPanelModelValues; fallback: SetupPanelFallbackValues;
 *   search: SetupPanelSearchValues; presets: SetupPanelPreset[];
 *   onSave(values: SetupPanelValues): void | Promise<void>; status?: string; onClose?: () => void }
 * interface ApiKeysScreenProps { onCommand(label: string, intent?: string): void;
 *   state?: ScreenState; preview?: boolean; setup?: ApiKeysSetup }
 * // END INTERFACE FOR INTEGRATION
 */
import { Panel } from "../../primitives/Card.js";
import { ScreenHeader } from "../ScreenHeader.js";
import { StateBlock, PreviewBadge, type ScreenState } from "../ScreenState.js";
import {
  SetupPanel,
  type SetupPanelFallbackValues,
  type SetupPanelModelValues,
  type SetupPanelPreset,
  type SetupPanelSearchValues,
  type SetupPanelValues,
} from "../SetupPanel.js";

export interface ApiKeysSetup {
  primary: SetupPanelModelValues;
  fallback: SetupPanelFallbackValues;
  search: SetupPanelSearchValues;
  presets: SetupPanelPreset[];
  onSave(values: SetupPanelValues): void | Promise<void>;
  status?: string;
  onClose?: () => void;
}

export interface ApiKeysScreenProps {
  onCommand: (label: string, intent?: string) => void;
  state?: ScreenState;
  preview?: boolean;
  /** Values from the host; absent keeps the honest empty state below. */
  setup?: ApiKeysSetup;
}

export function ApiKeysScreen({
  onCommand,
  state = "ready",
  preview = true,
  setup,
}: ApiKeysScreenProps) {
  return (
    <>
      <ScreenHeader
        icon="lock"
        tone="blue"
        title="API Keys"
        subtitle="Connect DIGGY to your model provider."
      >
        {preview ? <PreviewBadge /> : null}
      </ScreenHeader>

      {state !== "ready" ? (
        <Panel>
          <StateBlock
            state={state}
            icon="lock"
            title={
              state === "loading"
                ? "Loading your keys…"
                : state === "empty"
                  ? "No keys saved yet"
                  : "Couldn’t load your keys"
            }
            message={
              state === "empty"
                ? "Paste your API keys here to connect DIGGY to your model provider."
                : state === "error"
                  ? "The settings didn’t respond. Try again."
                  : undefined
            }
            onRetry={() => onCommand("Retry setup")}
          />
        </Panel>
      ) : setup ? (
        <SetupPanel
          primary={setup.primary}
          fallback={setup.fallback}
          search={setup.search}
          presets={setup.presets}
          onSave={setup.onSave}
          {...(setup.status !== undefined ? { status: setup.status } : {})}
          {...(setup.onClose !== undefined ? { onClose: setup.onClose } : {})}
        />
      ) : (
        <Panel>
          <StateBlock
            state="empty"
            icon="lock"
            title="Keys live here"
            message="Paste your API keys here to connect DIGGY to your model provider. Keys stay on this device and go only to the provider you chose."
          />
        </Panel>
      )}
    </>
  );
}
