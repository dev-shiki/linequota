import { context, reddit, redis } from '@devvit/web/server';
import { getPuzzleNumber, getUtcDateKey } from '../../shared/puzzle';

const getDailyPostKey = (dateKey: string): string => `lq:daily_post:${dateKey}`;

export const createDailyPost = async () => {
  const { subredditName } = context;
  if (!subredditName) {
    throw new Error('subredditName is required in Devvit context');
  }

  const dateKey = getUtcDateKey();
  const puzzleNumber = getPuzzleNumber(dateKey);

  const post = await reddit.submitCustomPost({
    subredditName,
    title: `LineQuota #${puzzleNumber} (${dateKey}) | Daily Circuit Puzzle`,
    entry: 'default',
  });

  await redis.set(getDailyPostKey(dateKey), post.id);
  return post;
};

export const createDailyPostIfMissing = async (): Promise<{
  postId: string;
  created: boolean;
}> => {
  const dateKey = getUtcDateKey();
  const existingPostId = await redis.get(getDailyPostKey(dateKey));
  if (existingPostId) {
    return { postId: existingPostId, created: false };
  }

  const post = await createDailyPost();
  return { postId: post.id, created: true };
};
