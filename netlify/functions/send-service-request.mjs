export default async (req) => {
  // Only allow POST
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const BREVO_API_KEY = process.env.BREVO_API_KEY;
  if (!BREVO_API_KEY) {
    return new Response(JSON.stringify({ error: 'Server configuration error.' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let data;
  try {
    data = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Validate required fields
  const required = ['firstName', 'lastName', 'email', 'phone', 'address', 'requestType', 'material', 'description'];
  for (const field of required) {
    if (!data[field] || !data[field].trim()) {
      return new Response(JSON.stringify({ error: `Missing required field: ${field}` }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  }

  if (!data.photos || data.photos.length === 0) {
    return new Response(JSON.stringify({ error: 'At least one photo is required.' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Build HTML email body
  const urgencyBadge = data.urgency === 'Normal'
    ? '<span style="color:#5b7b2f;font-weight:600;">Normal</span>'
    : '<span style="color:#c0392b;font-weight:600;">Urgent - Affecting daily use</span>';

  const htmlContent = `
    <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;max-width:600px;margin:0 auto;color:#2d2d2d;">
      <div style="background:#5b7b2f;padding:20px 24px;border-radius:8px 8px 0 0;">
        <h1 style="margin:0;color:#fff;font-size:20px;">Countertop Service Request</h1>
      </div>
      <div style="border:1px solid #d6d9d0;border-top:none;padding:24px;border-radius:0 0 8px 8px;">
        <h2 style="color:#5b7b2f;font-size:16px;margin:0 0 16px;border-bottom:2px solid #f0f4ea;padding-bottom:8px;">Contact Information</h2>
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;width:140px;">Name</td><td style="padding:4px 0;">${data.firstName} ${data.lastName}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;">Email</td><td style="padding:4px 0;"><a href="mailto:${data.email}" style="color:#5b7b2f;">${data.email}</a></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;">Phone</td><td style="padding:4px 0;"><a href="tel:${data.phone}" style="color:#5b7b2f;">${data.phone}</a></td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;">Service Address</td><td style="padding:4px 0;">${data.address}</td></tr>
        </table>

        <h2 style="color:#5b7b2f;font-size:16px;margin:24px 0 16px;border-bottom:2px solid #f0f4ea;padding-bottom:8px;">Service Details</h2>
        <table style="width:100%;font-size:14px;border-collapse:collapse;">
          <tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;width:140px;">Request Type</td><td style="padding:4px 0;font-weight:600;">${data.requestType}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;">Material</td><td style="padding:4px 0;">${data.material}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;">Install Date</td><td style="padding:4px 0;">${data.installDate || 'Not provided'}</td></tr>
          <tr><td style="padding:4px 12px 4px 0;color:#6b6b6b;">Urgency</td><td style="padding:4px 0;">${urgencyBadge}</td></tr>
        </table>

        <h2 style="color:#5b7b2f;font-size:16px;margin:24px 0 16px;border-bottom:2px solid #f0f4ea;padding-bottom:8px;">Description</h2>
        <p style="font-size:14px;line-height:1.6;white-space:pre-wrap;background:#f5f6f3;padding:12px 16px;border-radius:6px;">${data.description}</p>

        <p style="font-size:13px;color:#6b6b6b;margin-top:24px;border-top:1px solid #d6d9d0;padding-top:12px;">${data.photos.length} photo(s) attached to this email.</p>
      </div>
    </div>
  `;

  // Build Brevo API payload
  const emailPayload = {
    sender: {
      name: 'FloForm Service Request',
      email: 'sam@sccountertops.ca',
    },
    to: [
      { email: 'sbeaumont@floform.com', name: 'FloForm Service Team' },
    ],
    replyTo: {
      email: data.email,
      name: `${data.firstName} ${data.lastName}`,
    },
    subject: `Service Request: ${data.requestType} – ${data.firstName} ${data.lastName}`,
    htmlContent: htmlContent,
    attachment: data.photos.map((photo) => ({
      content: photo.content,
      name: photo.name,
    })),
  };

  try {
    const brevoRes = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        'accept': 'application/json',
        'api-key': BREVO_API_KEY,
        'content-type': 'application/json',
      },
      body: JSON.stringify(emailPayload),
    });

    if (!brevoRes.ok) {
      const errBody = await brevoRes.text();
      console.error('Brevo API error:', brevoRes.status, errBody);
      return new Response(JSON.stringify({ error: 'Failed to send email. Please try again later.' }), {
        status: 502,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });

  } catch (err) {
    console.error('Network error sending email:', err);
    return new Response(JSON.stringify({ error: 'Failed to send email. Please try again later.' }), {
      status: 502,
      headers: { 'Content-Type': 'application/json' },
    });
  }
};
