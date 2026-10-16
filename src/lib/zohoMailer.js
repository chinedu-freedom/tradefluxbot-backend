import axios from "axios";
import { getZohoAccessToken } from "./zohoToken.js";

let cachedZohoAccount = null;

async function getZohoAccountInfo(accessToken) {
  if (cachedZohoAccount) return cachedZohoAccount;
  try {
    const res = await axios.get("https://mail.zoho.com/api/accounts", {
      headers: { Authorization: `Zoho-oauthtoken ${accessToken}` },
      timeout: 10000
    });
    const acc = res.data?.data?.[0];
    if (acc && acc.accountId) {
      cachedZohoAccount = {
        accountId: String(acc.accountId).trim(),
        fromAddress: String(acc.primaryEmailAddress || acc.mailboxAddress || "info@tradefluxbot.com").trim().toLowerCase()
      };
      console.log(`[ZOHO] Discovered active account: ${cachedZohoAccount.accountId} (${cachedZohoAccount.fromAddress})`);
      return cachedZohoAccount;
    }
  } catch (err) {
    console.error("[ZOHO] Account lookup error:", err.response?.data || err.message);
  }
  return {
    accountId: "8563946000000008002",
    fromAddress: "info@tradefluxbot.com"
  };
}

export async function sendEmail({ to, subject, html }) {
  try {
    const accessToken = await getZohoAccessToken();
    const { accountId, fromAddress } = await getZohoAccountInfo(accessToken);

    const url = `https://mail.zoho.com/api/accounts/${accountId}/messages`;

    const res = await axios.post(
      url,
      {
        fromAddress,
        toAddress: (to || "").trim().toLowerCase(),
        subject,
        content: html,
        mailFormat: "html",
      },
      {
        headers: {
          Authorization: `Zoho-oauthtoken ${accessToken}`,
          "Content-Type": "application/json",
        },
        timeout: 15000
      }
    );

    console.log(`Email sent successfully to ${to}`);
    return { success: true };
  } catch (err) {
    console.error("Zoho Mail API error:", err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}
