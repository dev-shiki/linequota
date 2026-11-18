import { context, reddit } from '@devvit/web/server';
import { getPuzzleNumber, getUtcDateKey } from '../../shared/puzzle';

export const createDailyPost = async () => {
  const { subredditName } = context;
  if (!subredditName) {
    throw new Error('subredditName is required in Devvit context');
  }

  const dateKey = getUtcDateKey();
  const puzzleNumber = getPuzzleNumber(dateKey);

  return await reddit.submitCustomPost({
    subredditName,
    title: `LineQuota #${puzzleNumber} (${dateKey}) | Daily Circuit Puzzle`,
    entry: 'default',
  });
};
