export async function sendMagicLinkEmail(
  to: string,
  code: string,
  apiKey: string,
  from: string
): Promise<void> {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to,
      subject: 'Your SignChain login code',
      html: `
        <div style="font-family: sans-serif; max-width: 400px; margin: 0 auto; padding: 32px;">
          <h2 style="color: #6d28d9; margin-bottom: 24px;">SignChain</h2>
          <p>Your login code is:</p>
          <div style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #111; margin: 24px 0; text-align: center;">
            ${code}
          </div>
          <p style="color: #666; font-size: 14px;">This code expires in 10 minutes.</p>
        </div>
      `,
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Resend error ${res.status}: ${body}`);
  }
}
