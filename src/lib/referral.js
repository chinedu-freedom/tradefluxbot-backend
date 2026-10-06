/**
 * Distributes direct 5% referral commission to the referrer when a referred user completes a deposit.
 * Commission is credited to the referrer's withdrawable_balance.
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

    const settings = await tx.settings.findFirst();
    const rate = Number(settings?.level1_commission ?? 5);
    if (rate <= 0) return null;

    const numDeposit = Number(depositAmount);
    if (numDeposit <= 0) return null;

    const commissionAmount = Number((numDeposit * (rate / 100)).toFixed(2));
    if (commissionAmount <= 0) return null;

    const referrer = await tx.users.findUnique({
      where: { id: user.referred_by }
    });

    if (!referrer) return null;

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

    const depositorIdentifier = user.username || user.full_name || 'referral';
    await tx.transactions.create({
      data: {
        user_id: referrer.id,
        type: 'REFERRAL_COMMISSION',
        amount: commissionAmount,
        balance_before: balanceBefore,
        balance_after: balanceAfter,
        description: `${rate}% referral commission from ${depositorIdentifier}'s deposit of $${numDeposit}`
      }
    });

    console.log(`[REFERRAL] Credited $${commissionAmount} (${rate}%) to referrer ${referrer.id} from depositor ${user.id} ($${numDeposit})`);

    return {
      referrerId: referrer.id,
      amount: commissionAmount,
      rate
    };
  } catch (error) {
    console.error('Error distributing deposit referral commission:', error);
    return null;
  }
}
