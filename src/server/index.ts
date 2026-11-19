import { Hono, type Context } from 'hono';
import { serve } from '@hono/node-server';
import { createServer, getServerPort } from '@devvit/web/server';
import { telemetry } from '@devvit/analytics/server/reddit';
import {
  TELEMETRY_JOURNEY_ENDPOINTS,
  TELEMETRY_UNSPECIFIED_RECEIPT,
} from '@devvit/analytics/shared/reddit';
import { api } from './routes/api';
import { menu } from './routes/menu';
import { scheduler } from './routes/scheduler';
import { triggers } from './routes/triggers';

const INVALID_RECEIPT = {
  status: 'JOURNEY_RECEIPT_INVALID',
  message: 'Invalid: Event payload was not recorded.',
} as const;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

async function parseJsonObject(c: Context): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await c.req.json();
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

// @devvit/analytics exports an Express router, so we expose the same endpoints natively in Hono.
const telemetryRoutes = new Hono();

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.start, async (c) => {
  try {
    const response = await telemetry.startJourney();
    if (!isNonEmptyString(response.journeyId)) {
      return c.json(
        { error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
        500
      );
    }
    return c.json(response);
  } catch (error) {
    console.error('Telemetry start error:', error);
    return c.json(
      { error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      500
    );
  }
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.progress, async (c) => {
  try {
    const body = await parseJsonObject(c);
    if (!body) {
      return c.json({ error: 'Expected a JSON object body.', receipt: INVALID_RECEIPT }, 400);
    }
    const { journeyId, progress, action, actionDetails } = body;
    if (!isNonEmptyString(journeyId)) {
      return c.json({ error: 'journeyId is required.', receipt: INVALID_RECEIPT }, 400);
    }
    if (!isFiniteNumber(progress) || progress < 0 || progress > 1) {
      return c.json(
        { error: 'progress must be a number between 0 and 1.', receipt: INVALID_RECEIPT },
        400
      );
    }
    if (action !== undefined && !isNonEmptyString(action)) {
      return c.json({ error: 'action must be a non-empty string.', receipt: INVALID_RECEIPT }, 400);
    }
    if (actionDetails !== undefined && !isNonEmptyString(actionDetails)) {
      return c.json(
        { error: 'actionDetails must be a non-empty string.', receipt: INVALID_RECEIPT },
        400
      );
    }
    const response = await telemetry.journeyProgress({
      journeyId,
      progress,
      ...(action !== undefined ? { action } : {}),
      ...(actionDetails !== undefined ? { actionDetails } : {}),
    });
    return c.json(response);
  } catch (error) {
    console.error('Telemetry progress error:', error);
    return c.json(
      { error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      500
    );
  }
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.interaction, async (c) => {
  try {
    const body = await parseJsonObject(c);
    if (!body) {
      return c.json({ error: 'Expected a JSON object body.', receipt: INVALID_RECEIPT }, 400);
    }
    const { journeyId, action, actionDetails } = body;
    if (journeyId !== undefined && typeof journeyId !== 'string') {
      return c.json({ error: 'journeyId must be a string.', receipt: INVALID_RECEIPT }, 400);
    }
    if (!isNonEmptyString(action)) {
      return c.json({ error: 'action is required.', receipt: INVALID_RECEIPT }, 400);
    }
    if (actionDetails !== undefined && !isNonEmptyString(actionDetails)) {
      return c.json(
        { error: 'actionDetails must be a non-empty string.', receipt: INVALID_RECEIPT },
        400
      );
    }
    const response = await telemetry.journeyInteraction({
      journeyId: isNonEmptyString(journeyId) ? journeyId : '',
      action,
      actionDetails: actionDetails ?? '',
    });
    return c.json(response);
  } catch (error) {
    console.error('Telemetry interaction error:', error);
    return c.json(
      { error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      500
    );
  }
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.end, async (c) => {
  try {
    const body = await parseJsonObject(c);
    if (!body) {
      return c.json({ error: 'Expected a JSON object body.', receipt: INVALID_RECEIPT }, 400);
    }
    const { journeyId, complete, game } = body;
    if (!isNonEmptyString(journeyId)) {
      return c.json({ error: 'journeyId is required.', receipt: INVALID_RECEIPT }, 400);
    }
    if (complete !== undefined && typeof complete !== 'boolean') {
      return c.json({ error: 'complete must be a boolean.', receipt: INVALID_RECEIPT }, 400);
    }
    let parsedGame: { win: boolean; score: number } | undefined;
    if (game !== undefined) {
      if (!isRecord(game)) {
        return c.json({ error: 'game must be an object.', receipt: INVALID_RECEIPT }, 400);
      }
      if (game.win !== undefined && typeof game.win !== 'boolean') {
        return c.json({ error: 'game.win must be a boolean.', receipt: INVALID_RECEIPT }, 400);
      }
      if (game.score !== undefined && !isFiniteNumber(game.score)) {
        return c.json({ error: 'game.score must be a number.', receipt: INVALID_RECEIPT }, 400);
      }
      parsedGame = {
        win: typeof game.win === 'boolean' ? game.win : false,
        score: typeof game.score === 'number' ? game.score : 0,
      };
    }
    const response = await telemetry.endJourney({
      journeyId,
      complete: complete ?? false,
      ...(parsedGame !== undefined ? { game: parsedGame } : {}),
    });
    return c.json(response);
  } catch (error) {
    console.error('Telemetry end error:', error);
    return c.json(
      { error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      500
    );
  }
});

telemetryRoutes.post(TELEMETRY_JOURNEY_ENDPOINTS.appReady, async (c) => {
  try {
    const response = await telemetry.appReady();
    return c.json(response);
  } catch (error) {
    console.error('Telemetry app-ready error:', error);
    return c.json(
      { error: 'Internal server error', receipt: TELEMETRY_UNSPECIFIED_RECEIPT },
      500
    );
  }
});

const app = new Hono();
const internal = new Hono();

internal.route('/menu', menu);
internal.route('/scheduler', scheduler);
internal.route('/triggers', triggers);

app.route('/api/telemetry', telemetryRoutes);
app.route('/api', api);
app.route('/internal', internal);

serve({
  fetch: app.fetch,
  createServer,
  port: getServerPort(),
});
