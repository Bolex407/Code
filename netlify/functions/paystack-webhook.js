// Receives Paystack's "charge.success" webhook, then emails the payer a ticket with a QR code.
const crypto = require("crypto");
const nodemailer = require("nodemailer");
const QRCode = require("qrcode");
const path = require("path");
const fs = require("fs");

// Keep this in sync with the tiers in public/index.html. null = any amount accepted.
const TIERS = {
  "Member": 5000,
  "Distributor": 10000,
  "Manager": 20000,
  "Senior Manager": 30000,
  "Executive Manager": 50000,
  "Director": 100000,
  "World-Team": null
};

const env = (k, d) => process.env[k] || d;
const esc = (s) => String(s == null ? "" : s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const naira = (n) => "₦" + Number(n).toLocaleString("en-NG");

function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// The QR code holds "reference.signature". A scanner can recompute the signature to spot fake tickets.
function ticketCode(reference) {
  const sig = crypto.createHmac("sha256", env("TICKET_SECRET", "change-me")).update(reference).digest("hex").slice(0, 12);
  return reference + "." + sig;
}

function mailer() {
  return nodemailer.createTransport({
    host: env("SMTP_HOST", "smtp.gmail.com"),
    port: Number(env("SMTP_PORT", "465")),
    secure: Number(env("SMTP_PORT", "465")) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
  });
}

async function verifyWithPaystack(reference) {
  const r = await fetch("https://api.paystack.co/transaction/verify/" + encodeURIComponent(reference), {
    headers: { Authorization: "Bearer " + process.env.PAYSTACK_SECRET_KEY }
  });
  const j = await r.json();
  if (!j.status || !j.data || j.data.status !== "success") throw new Error("Paystack did not confirm this payment");
  return j.data;
}

function ticketHtml(t) {
  return `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;border:1px solid #e3e4e0;border-radius:14px;overflow:hidden">
  <div style="background:#ffffff;padding:20px 24px;border-bottom:4px solid #FCA403">
    <img src="cid:brandlogo" width="180" alt="Orchestra" style="display:block;margin-bottom:14px">
    <div style="font-size:13px;color:#5f625f">Your ticket</div>
    <div style="font-size:22px;font-weight:bold;color:#111">${esc(t.event)}</div>
  </div>
  <div style="padding:24px">
    <p style="margin:0 0 16px">Hi ${esc(t.name)}, your payment was received. Show this QR code at entry.</p>
    <div style="text-align:center;margin:8px 0 20px"><img src="cid:ticketqr" width="220" height="220" alt="Ticket QR code"></div>
    <table style="width:100%;font-size:14px;border-collapse:collapse">
      <tr><td style="padding:6px 0;color:#5f625f">Name</td><td style="text-align:right"><b>${esc(t.name)}</b></td></tr>
      <tr><td style="padding:6px 0;color:#5f625f">Status</td><td style="text-align:right"><b>${esc(t.status)}</b></td></tr>
      <tr><td style="padding:6px 0;color:#5f625f">Amount paid</td><td style="text-align:right"><b>${esc(naira(t.amount))}</b></td></tr>
      <tr><td style="padding:6px 0;color:#5f625f">Reference</td><td style="text-align:right"><b>${esc(t.reference)}</b></td></tr>
    </table>
    <p style="font-size:12px;color:#5f625f;margin:20px 0 0">Keep this email. Each ticket is valid for one person. Questions? Write to ${esc(env("SUPPORT_EMAIL", "support.orchestra.team@gmail.com"))}.</p>
  </div></div>`;
}

async function handleSuccess(eventData) {
  const tx = await verifyWithPaystack(eventData.reference);
  const fields = {};
  ((tx.metadata && tx.metadata.custom_fields) || []).forEach((f) => { fields[f.variable_name] = f.value; });

  const reference = tx.reference;
  const amount = tx.amount / 100;
  const status = fields.status;
  const name = fields.customer_name || "Guest";
  const email = tx.customer && tx.customer.email;
  const expected = TIERS[status];
  const organizer = env("ORGANIZER_EMAIL", process.env.SMTP_USER);
  const from = env("FROM_EMAIL", "Orchestra Support <" + process.env.SMTP_USER + ">");
  const event = env("EVENT_NAME", "Orchestra Event");
  const transport = mailer();

  // Amount must match the status they picked (stops people editing the price in their browser).
  if (expected === undefined || (expected !== null && amount < expected)) {
    await transport.sendMail({
      from, to: organizer,
      subject: "Payment needs review: " + reference,
      text: `No ticket was sent.\nReference: ${reference}\nName: ${name}\nEmail: ${email}\nStatus claimed: ${status}\nPaid: ${naira(amount)}\nExpected: ${expected == null ? "unknown status" : naira(expected)}`
    });
    return;
  }

  const qr = await QRCode.toBuffer(ticketCode(reference), { width: 440, margin: 2 });
  await transport.sendMail({
    from, to: email, bcc: organizer,
    subject: `Your ticket for ${event}`,
    html: ticketHtml({ event, name, status, amount, reference }),
    attachments: [
      { filename: "ticket-qr.png", content: qr, cid: "ticketqr" },
      { filename: "logo.png", content: fs.readFileSync(path.join(__dirname, "logo.png")), cid: "brandlogo" }
    ]
  });
}

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method not allowed" };
  const raw = event.isBase64Encoded ? Buffer.from(event.body, "base64").toString("utf8") : event.body;
  const expectedSig = crypto.createHmac("sha512", process.env.PAYSTACK_SECRET_KEY || "").update(raw).digest("hex");
  if (!safeEqual(event.headers["x-paystack-signature"] || "", expectedSig)) return { statusCode: 401, body: "Invalid signature" };

  const payload = JSON.parse(raw);
  if (payload.event !== "charge.success") return { statusCode: 200, body: "Ignored" };
  try {
    await handleSuccess(payload.data);
  } catch (e) {
    console.error("Ticket email failed:", e);
    return { statusCode: 500, body: "Failed" }; // Paystack will retry
  }
  return { statusCode: 200, body: "OK" };
};
