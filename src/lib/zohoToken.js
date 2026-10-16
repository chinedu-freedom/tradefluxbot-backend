import axios from "axios";

export async function getZohoAccessToken() {
  const refreshToken = (process.env.ZOHO_REFRESH_TOKEN || "").replace(/["']/g, "").trim();
  const clientId = (process.env.ZOHO_CLIENT_ID || "").replace(/["']/g, "").trim();
  const clientSecret = (process.env.ZOHO_CLIENT_SECRET || "").replace(/["']/g, "").trim();

  const response = await axios.post(
    "https://accounts.zoho.com/oauth/v2/token",
    null,
    {
      params: {
        refresh_token: refreshToken,
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: "refresh_token",
      },
    }
  );

  return response.data.access_token;
}
