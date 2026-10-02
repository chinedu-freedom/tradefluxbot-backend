export function emailTemplate(content, siteName = "TradeFluxBot") {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin:0; padding:0; background-color:#f8f9fa; font-family:'Proxima Nova', -apple-system, BlinkMacSystemFont, 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
      <table width="100%" border="0" cellspacing="0" cellpadding="0" style="background-color:#f8f9fa; padding:40px 0;">
         <tr>
          <td align="center">
            <table width="600" border="0" cellspacing="0" cellpadding="0" style="background-color:#ffffff; border-radius:12px; overflow:hidden; box-shadow:0 4px 16px rgba(0,0,0,0.04);">
              <!-- Header -->
              <tr>
                <td style="background-color:#0073b6; padding:30px 40px; text-align:center;">
                  <h1 style="color:#ffffff; margin:0; font-size:28px; letter-spacing:1px;">${siteName}</h1>
                </td>
              </tr>
              <!-- Body -->
              <tr>
                <td style="padding:40px;">
                  ${content}
                </td>
              </tr>
              <!-- Footer -->
              <tr>
                <td style="background-color:#f1f5f9; padding:24px 40px; text-align:center;">
                  <p style="margin:0; color:#64748b; font-size:13px; line-height:1.6;">
                    © ${new Date().getFullYear()} ${siteName}. All rights reserved.<br>
                    You received this email because you are registered on ${siteName}.
                  </p>
                </td>
              </tr>
            </table>
          </td>
        </tr>
      </table>
    </body>
    </html>
  `;
}
