import { telemetry } from '@devvit/analytics/client/reddit';

function canEmitTelemetry(): boolean {
  return typeof window !== 'undefined' && typeof fetch === 'function';
}

async function runTelemetrySafely(task: () => Promise<unknown>): Promise<void> {
  if (!canEmitTelemetry()) return;
  try {
    await task();
  } catch (err) {
    // Local preview and non-Devvit environments lack /api/telemetry; ignore transport errors so gameplay continues.
    void err;
  }
}

export async function trackAppReady(): Promise<void> {
  await runTelemetrySafely(() => telemetry.appReady());
}

export async function trackJourneyStart(): Promise<void> {
  await runTelemetrySafely(() => telemetry.startJourney());
}

export async function trackJourneyProgress(progress: number, action: string): Promise<void> {
  await runTelemetrySafely(() => telemetry.progress({ progress, action }));
}

export async function trackJourneyInteraction(
  action: string,
  actionDetails?: string
): Promise<void> {
  await runTelemetrySafely(() =>
    telemetry.interaction({
      action,
      ...(actionDetails !== undefined ? { actionDetails } : {}),
    })
  );
}

export async function trackJourneyEnd(outcome?: string): Promise<void> {
  const complete = outcome !== 'abandon' && outcome !== 'quit' && outcome !== 'incomplete';
  await runTelemetrySafely(() => telemetry.endJourney({ complete }));
}
