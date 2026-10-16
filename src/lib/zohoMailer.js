import axios from "axios";
import { getZohoAccessToken } from "./zohoToken.js";

export async function sendEmail({ to, subject, html }) {
  try {
    const accessToken = await getZohoAccessToken();
    const accountId = (process.env.ZOHO_MAIL_ACCOUNT_ID || "8563946000000008002").replace(/["']/g, "").trim();
    // Zoho Mail API strictly requires the authenticated primary mailbox address: info@tradefluxbot.com
    const fromAddress = "info@tradefluxbot.com";

    const url = `https://mail.zoho.com/api/accounts/${accountId}/messages`;

    await axios.post(
      url,
      {
        fromAddress: fromAddress,
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
      }
    );

    console.log(`Email sent successfully to ${to}`);
    return { success: true };
  } catch (err) {
    console.error("Zoho Mail API error:", err.response?.data || err.message);
    return { success: false, error: err.response?.data || err.message };
  }
}
