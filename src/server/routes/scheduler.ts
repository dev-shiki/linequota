import { Hono } from 'hono';
import { createDailyPostIfMissing } from '../core/post';

export const scheduler = new Hono();

scheduler.post('/daily-circuit', async (c) => {
  try {
    const result = await createDailyPostIfMissing();
    return c.json({
      status: 'ok',
      postId: result.postId,
      created: result.created,
    });
  } catch (error) {
    console.error('Error running daily-circuit scheduler task:', error);
    return c.json(
      {
        status: 'error',
        message: error instanceof Error ? error.message : 'Failed to create daily post',
      },
      500
    );
  }
});
