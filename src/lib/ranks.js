export const RANK_TIERS = [
  {
    rank_level: 1,
    name: 'Rank 1',
    title: 'Bronze Ambassador',
    badge: '🥉',
    type: 'DIRECT_VOLUME', // Level 1 only
    target_volume: 5000,
    reward_amount: 250,
    withdrawable_everyday: true, // Credited to withdrawable_balance (anytime)
    description: 'First rank direct volume $5,000 = $250 once-off bonus (Withdrawable anytime)'
  },
  {
    rank_level: 2,
    name: 'Rank 2',
    title: 'Silver Leader',
    badge: '🥈',
    type: 'TEAM_VOLUME', // All team levels combined
    target_volume: 15000,
    reward_amount: 750,
    withdrawable_everyday: false, // Credited to team_commission_balance (Friday only)
    description: 'Second rank team volume $15,000 = $750 once-off bonus (Withdrawable on Fridays)'
  },
  {
    rank_level: 3,
    name: 'Rank 3',
    title: 'Gold Director',
    badge: '🥇',
    type: 'TEAM_VOLUME',
    target_volume: 30000,
    reward_amount: 1250,
    withdrawable_everyday: false,
    description: 'Third rank team volume $30,000 = $1,250 once-off bonus (Withdrawable on Fridays)'
  },
  {
    rank_level: 4,
    name: 'Rank 4',
    title: 'Diamond Partner',
    badge: '💎',
    type: 'TEAM_VOLUME',
    target_volume: 60000,
    reward_amount: 2500,
    withdrawable_everyday: false,
    description: 'Fourth rank team volume $60,000 = $2,500 once-off bonus (Withdrawable on Fridays)'
  }
];

/**
 * Checks if today is Friday in UTC or given timezone.
 */
export function isFriday(timezone = 'UTC') {
  if (new Date().getDay() === 5) return true;
  try {
    const tz = timezone || 'UTC';
    const dayName = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'long' }).format(new Date());
    if (dayName.toLowerCase() === 'friday') return true;
  } catch (e) {
    // fallback
  }
  return false;
}

/**
 * Calculates user's direct volume (L1) and total team volume (L1-L4).
 */
export async function getUserTeamAndVolume(prismaClient, userId) {
  // Level 1 Users
  const l1Users = await prismaClient.users.findMany({
    where: { referred_by: userId },
    select: { id: true, username: true, full_name: true, email: true, created_at: true }
  });
  const l1Ids = l1Users.map(u => u.id);

  // Level 2 Users
  let l2Users = [];
  if (l1Ids.length > 0) {
    l2Users = await prismaClient.users.findMany({
      where: { referred_by: { in: l1Ids } },
      select: { id: true, username: true, full_name: true, email: true, created_at: true }
    });
  }
  const l2Ids = l2Users.map(u => u.id);

  // Level 3 Users
  let l3Users = [];
  if (l2Ids.length > 0) {
    l3Users = await prismaClient.users.findMany({
      where: { referred_by: { in: l2Ids } },
      select: { id: true, username: true, full_name: true, email: true, created_at: true }
    });
  }
  const l3Ids = l3Users.map(u => u.id);

  // Level 4 Users
  let l4Users = [];
  if (l3Ids.length > 0) {
    l4Users = await prismaClient.users.findMany({
      where: { referred_by: { in: l3Ids } },
      select: { id: true, username: true, full_name: true, email: true, created_at: true }
    });
  }
  const l4Ids = l4Users.map(u => u.id);

  const calcVolume = async (ids) => {
    if (!ids || ids.length === 0) return 0;
    const agg = await prismaClient.deposits.aggregate({
      where: {
        user_id: { in: ids },
        status: { in: ['APPROVED', 'approved'] }
      },
      _sum: { amount: true }
    });
    return Number(agg._sum.amount || 0);
  };

  const directVolume = await calcVolume(l1Ids);
  const l2Volume = await calcVolume(l2Ids);
  const l3Volume = await calcVolume(l3Ids);
  const l4Volume = await calcVolume(l4Ids);
  const teamVolume = Number((directVolume + l2Volume + l3Volume + l4Volume).toFixed(2));

  return {
    l1Users,
    l2Users,
    l3Users,
    l4Users,
    directVolume: Number(directVolume.toFixed(2)),
    teamVolume,
    levelVolumes: {
      level1: Number(directVolume.toFixed(2)),
      level2: Number(l2Volume.toFixed(2)),
      level3: Number(l3Volume.toFixed(2)),
      level4: Number(l4Volume.toFixed(2))
    }
  };
}

/**
 * Checks and awards any earned once-off rank bonuses for a user.
 * Must be executed within a prisma transaction or with prismaClient.
 */
export async function checkAndAwardRankRewards(tx, userId) {
  try {
    const user = await tx.users.findUnique({
      where: { id: userId },
      include: { rank_rewards: true }
    });
    if (!user) return [];

    const volumes = await getUserTeamAndVolume(tx, userId);
    const directVolume = volumes.directVolume;
    const teamVolume = volumes.teamVolume;

    const claimedRankLevels = new Set(user.rank_rewards.map(r => r.rank_level));
    const awarded = [];
    let updatedCurrentRank = user.current_rank || 0;

    for (const tier of RANK_TIERS) {
      if (claimedRankLevels.has(tier.rank_level)) continue;

      const achievedVolume = tier.type === 'DIRECT_VOLUME' ? directVolume : teamVolume;

      if (achievedVolume >= tier.target_volume) {
        // Record claim in user_rank_rewards
        await tx.user_rank_rewards.create({
          data: {
            user_id: user.id,
            rank_level: tier.rank_level,
            rank_name: tier.name,
            reward_amount: tier.reward_amount,
            volume_achieved: achievedVolume
          }
        });

        if (tier.withdrawable_everyday) {
          // Direct Rank 1 Bonus: credited to withdrawable_balance (available 24/7)
          const balanceBefore = Number(user.withdrawable_balance || 0);
          const balanceAfter = Number((balanceBefore + tier.reward_amount).toFixed(2));

          await tx.users.update({
            where: { id: user.id },
            data: {
              withdrawable_balance: balanceAfter,
              current_rank: Math.max(updatedCurrentRank, tier.rank_level)
            }
          });

          await tx.transactions.create({
            data: {
              user_id: user.id,
              type: 'RANK_REWARD',
              amount: tier.reward_amount,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              description: `Rank Up Reward: ${tier.name} ($${tier.reward_amount} direct volume bonus - withdrawable anytime)`
            }
          });
        } else {
          // Team Ranks 2-4: credited to team_commission_balance (withdrawable on Friday)
          const balanceBefore = Number(user.team_commission_balance || 0);
          const balanceAfter = Number((balanceBefore + tier.reward_amount).toFixed(2));

          await tx.users.update({
            where: { id: user.id },
            data: {
              team_commission_balance: balanceAfter,
              current_rank: Math.max(updatedCurrentRank, tier.rank_level)
            }
          });

          await tx.transactions.create({
            data: {
              user_id: user.id,
              type: 'RANK_REWARD',
              amount: tier.reward_amount,
              balance_before: balanceBefore,
              balance_after: balanceAfter,
              description: `Rank Up Reward: ${tier.name} ($${tier.reward_amount} team volume bonus - withdrawable on Fridays)`
            }
          });
        }

        updatedCurrentRank = Math.max(updatedCurrentRank, tier.rank_level);
        awarded.push({
          rank_level: tier.rank_level,
          name: tier.name,
          reward_amount: tier.reward_amount
        });

        console.log(`[RANK_UP] User ${user.id} promoted to ${tier.name}! Awarded bonus: $${tier.reward_amount}`);
      }
    }

    return awarded;
  } catch (error) {
    console.error(`Error in checkAndAwardRankRewards for user ${userId}:`, error);
    return [];
  }
}
