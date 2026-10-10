SETUP (about 15 minutes)

1. Put this whole folder on GitHub, then in Netlify choose "Add new site > Import from Git".
2. In public/index.html find CONFIG and replace the Paystack PUBLIC key (pk_test_... for now).
3. In Netlify > Site configuration > Environment variables add these:

   PAYSTACK_SECRET_KEY  your sk_test_... (switch to sk_live_... when going live)
   TICKET_SECRET        any long random text you make up (e.g. 30+ letters and numbers)
   EVENT_NAME           Orchestra Event
   SMTP_HOST            smtp.gmail.com
   SMTP_PORT            465
   SMTP_USER            surpprt.orchestra.team@gmail.com
   SMTP_PASS            the 16-letter Gmail App Password (no spaces)
   FROM_EMAIL           Orchestra Support <surpprt.orchestra.team@gmail.com>
   ORGANIZER_EMAIL      surpprt.orchestra.team@gmail.com
   SUPPORT_EMAIL        surpprt.orchestra.team@gmail.com

4. Gmail App Password: sign in to that Gmail > Google Account > Security >
   turn on 2-Step Verification > search "App passwords" > create one named "Orchestra tickets".
5. Paystack dashboard > Settings > API Keys & Webhooks > set the Test Webhook URL to:
   https://YOUR-SITE.netlify.app/.netlify/functions/paystack-webhook
   (Live mode has its own separate Webhook URL box. Fill both.)
6. Redeploy in Netlify after saving the settings, then make a test payment
   (Paystack test card numbers are in their docs). Check the ticket email arrives.

GOING LIVE
- Swap in pk_live_... in index.html and sk_live_... in Netlify, set the Live webhook URL, redeploy.
- Replace the placeholder prices in BOTH public/index.html and netlify/functions/paystack-webhook.js (keep them identical).

NOTES
- Gmail sends about 500 emails/day. For more, use Brevo, Zoho or Resend SMTP (change SMTP_* values only).
- If someone pays less than their status price, no ticket is sent and you get an alert email.
