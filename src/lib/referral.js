import { checkAndAwardRankRewards } from './ranks.js';

/**
 * Distributes referral commissions up to 4 levels upon approved deposit:
 * - Level 1: Credited to withdrawable_balance (Available everyday 24/7)
 * - Level 2, 3, 4: Credited to team_commission_balance (Withdrawable strictly on Fridays)
 *
 * Then triggers rank evaluations & once-off bonus awards for all uplines:
 * - Rank 1: Direct Volume $5,000 => $250 bonus (Withdrawable anytime)
 * - Rank 2: Team Volume $15,000 => $750 bonus (Withdrawable on Fridays)
 * - Rank 3: Team Volume $30,000 => $1,250 bonus (Withdrawable on Fridays)
 * - Rank 4: Team Volume $60,000 => $2,500 bonus (Withdrawable on Fridays)
 */
export async function distributeDepositReferralCommission(tx, { userId, depositAmount }) {
  try {
    const user = await tx.users.findUnique({
      where: { id: userId },
      select: { id: true, username: true, full_name: true, referred_by: true }
    });

    if (!user || !user.referred_by) {
      return null;
    }

    const numDeposit = Number(depositAmount);
    if (numDeposit <= 0) return null;

    const settings = await tx.settings.findFirst();
    const l1Rate = Number(settings?.level1_commission ?? 5);
    const l2Rate = Number(settings?.level2_commission ?? 0);
    const l3Rate = Number(settings?.level3_commission ?? 0);
    const l4Rate = Number(settings?.level4_commission ?? 0);

    const depositorName = user.username || user.full_name || 'referral';
    const uplineIds = [];

    // Traverse up to 4 upline levels
    let currentReferrerId = user.referred_by;
    let level = 1;

    while (currentReferrerId && level <= 4) {
      const referrer = await tx.users.findUnique({
        where: { id: currentReferrerId }
      });

      if (!referrer) break;
      uplineIds.push(referrer.id);

      // Check if referrer can earn referral commissions
      if (referrer.can_earn_referral !== false) {
        let rate = 0;
        if (level === 1) rate = l1Rate;
        else if (level === 2) rate = l2Rate;
        else if (level === 3) rate = l3Rate;
        else if (level === 4) rate = l4Rate;

        if (rate > 0) {
          const commissionAmount = Number((numDeposit * (rate / 100)).toFixed(2));

          if (commissionAmount > 0) {
            if (level === 1) {
              // Level 1: Credited to withdrawable_balance (everyday 24/7)
              const balanceBefore = Number(referrer.withdrawable_balance || 0);
              const balanceAfter = Number((balanceBefore + commissionAmount).toFixed(2));

              await tx.users.update({
                where: { id: referrer.id },
                data: { withdrawable_balance: balanceAfter }
              });

              await tx.referral_commissions.create({
                data: {
                  user_id: referrer.id,
                  from_user_id: user.id,
                  amount: commissionAmount,
                  level: 1
                }
              });

              await tx.transactions.create({
                data: {
                  user_id: referrer.id,
                  type: 'REFERRAL_COMMISSION',
                  amount: commissionAmount,
                  balance_before: balanceBefore,
                  balance_after: balanceAfter,
                  description: `Direct Level 1 (${rate}%) referral commission from ${depositorName}'s deposit of $${numDeposit} (Everyday Withdrawable)`
                }
              });

              console.log(`[REFERRAL_L1] Credited $${commissionAmount} (${rate}%) to referrer ${referrer.id} from ${user.id} ($${numDeposit})`);
            } else {
              // Levels 2, 3, 4: Credited to team_commission_balance (Friday only)
              const balanceBefore = Number(referrer.team_commission_balance || 0);
              const balanceAfter = Number((balanceBefore + commissionAmount).toFixed(2));

              await tx.users.update({
                where: { id: referrer.id },
                data: { team_commission_balance: balanceAfter }
              });

              await tx.referral_commissions.create({
                data: {
                  user_id: referrer.id,
                  from_user_id: user.id,
                  amount: commissionAmount,
                  level: level
                }
              });

              await tx.transactions.create({
                data: {
                  user_id: referrer.id,
                  type: 'TEAM_REFERRAL_COMMISSION',
                  amount: commissionAmount,
                  balance_before: balanceBefore,
                  balance_after: balanceAfter,
                  description: `Team Level ${level} (${rate}%) referral commission from ${depositorName}'s deposit of $${numDeposit} (Friday Withdrawable)`
                }
              });

              console.log(`[REFERRAL_L${level}] Credited $${commissionAmount} (${rate}%) to upline ${referrer.id} from ${user.id} ($${numDeposit})`);
            }
          }
        }
      }

      currentReferrerId = referrer.referred_by;
      level++;
    }

    // Evaluate rank updates and award once-off bonuses for all uplines
    for (const uplineId of uplineIds) {
      await checkAndAwardRankRewards(tx, uplineId);
    }

    return {
      success: true,
      uplineCount: uplineIds.length
    };
  } catch (error) {
    console.error('Error distributing deposit referral commissions:', error);
    return null;
  }
}
