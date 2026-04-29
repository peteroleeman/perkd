'use strict';

require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const QRCode = require('qrcode');
const path = require('path');
const fs = require('fs');

const ROUTER_VERSION = '1.0';

/** Path to email template assets (same dir as emailrouter.js) */
const TEMPLATES_PATH = path.join(__dirname, 'assets', 'email-templates');

/**
 * Load an HTML template from assets/email-templates/.
 * @param {string} templateName - Filename without extension (e.g. 'offer')
 * @returns {string} Raw HTML template content
 */
function loadTemplateFromAsset(templateName) {
  const filePath = path.join(TEMPLATES_PATH, `${templateName}.html`);
  return fs.readFileSync(filePath, 'utf8');
}

/**
 * Replace {{placeholder}} fields in template with values from data.
 * @param {string} html - Raw HTML template
 * @param {Record<string, string|number>} data - Key-value map for placeholders
 * @returns {string} HTML with placeholders replaced
 */
function replaceTemplateFields(html, data) {
  return html.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return data[key] !== undefined ? String(data[key]) : match;
  });
}

/**
 * Wraps caller-supplied HTML content in a polished, branded email template.
 * @param {string} bodyHtml   - The inner HTML content provided by the caller.
 * @param {string} fromName   - Brand / sender name shown in the header.
 * @param {string} [storeTitle] - Optional store title; when provided, used as brand name instead of fromName.
 * @returns {string} Full HTML email string.
 */
function wrapInTemplate(bodyHtml, fromName, storeTitle) {
  const year = new Date().getFullYear();
  const brandName = (storeTitle && String(storeTitle).trim()) ? String(storeTitle).trim() : (fromName || process.env.EMAIL_FROM_NAME || 'Foodio');

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${brandName}</title>
  <!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
</head>
<body style="margin:0;padding:0;background-color:#f4f6f9;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color:#f4f6f9;">
    <tr>
      <td align="center" style="padding:40px 16px;">

        <!-- Card -->
        <table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td align="center" style="background:linear-gradient(135deg,#FF6B35 0%,#FF8C42 100%);padding:36px 32px;">
              <table cellpadding="0" cellspacing="0" border="0">
                <tr>
                  <td>
                    <div style="background:rgba(255,255,255,0.15);border-radius:50%;width:64px;height:64px;display:inline-flex;align-items:center;justify-content:center;margin-bottom:12px;">
                      <span style="font-size:32px;line-height:1;">🍽️</span>
                    </div>
                  </td>
                </tr>
                <tr>
                  <td align="center">
                    <h1 style="margin:0;color:#ffffff;font-size:26px;font-weight:700;letter-spacing:-0.5px;">${brandName}</h1>
                    <p style="margin:6px 0 0;color:rgba(255,255,255,0.85);font-size:14px;">Your trusted dining companion</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <div style="color:#2d3748;font-size:15px;line-height:1.7;">
                ${bodyHtml}
              </div>
            </td>
          </tr>

          <!-- Divider -->
          <tr>
            <td style="padding:0 40px;">
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:0;" />
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td align="center" style="padding:28px 32px 36px;">
              <p style="margin:0 0 8px;color:#718096;font-size:13px;">
                You're receiving this email from <strong>${brandName}</strong>.
              </p>
              <p style="margin:0;color:#a0aec0;font-size:12px;">
                &copy; ${year} ${brandName}. All rights reserved.
              </p>
              <table cellpadding="0" cellspacing="0" border="0" style="margin-top:16px;">
                <tr>
                  <td>
                    <div style="width:32px;height:4px;background:linear-gradient(90deg,#FF6B35,#FF8C42);border-radius:2px;"></div>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

        </table>
        <!-- /Card -->

      </td>
    </tr>
  </table>
</body>
</html>`;
}

class EmailRouter {
  constructor() {
    this.router = express.Router();
    this.transporter = null;
    this._initTransporter();
    this._registerRoutes();
  }

  /** Lazily initialise the Nodemailer transporter from env vars. */
  _initTransporter() {
    const host = process.env.EMAIL_SMTP_HOST || 'smtp.gmail.com';
    const port = parseInt(process.env.EMAIL_SMTP_PORT || '465', 10);
    const user = process.env.EMAIL_SMTP_USER;
    const pass = process.env.EMAIL_SMTP_PASS;

    if (!user || !pass) {
      console.warn('[EmailRouter] EMAIL_SMTP_USER or EMAIL_SMTP_PASS not set — email sending will fail.');
      return;
    }

    this.transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,   // SSL for 465, STARTTLS for 587
      auth: { user, pass },
    });
  }

  _registerRoutes() {
    const router = this.router;

    // ------------------------------------------------------------------ GET /about
    router.get('/about', (req, res) => {
      res.json({
        router  : 'EmailRouter',
        version : ROUTER_VERSION,
        provider: 'Nodemailer / SMTP',
        endpoints: [
          { method: 'GET',  path: '/email/about', description: 'Router info' },
          { method: 'POST', path: '/email/send',  description: 'Send an HTML email' },
          { method: 'POST', path: '/email/trigger-collect', description: 'Send collection email (single item)' },
          { method: 'POST', path: '/email/trigger-collectmany', description: 'Send collection email (multiple items with photo and quantity)' },
          { method: 'POST', path: '/email/trigger-giftreceipt', description: 'Send gift receipt to sender confirming message sent to receiver' },
          { method: 'POST', path: '/email/trigger-collected', description: 'Notify sender that receiver has collected the items' },
          { method: 'POST', path: '/email/trigger-cancelreceipt', description: 'Send cancel receipt to sender – gift has been canceled' },
          { method: 'POST', path: '/email/trigger-cancel-collection', description: 'Inform receiver that gift has been canceled by sender' },
          { method: 'POST', path: '/email/trigger-pos-audit-report', description: 'Send POS audit report HTML from app to receiver_email' },
        ],
      });
    });

    // ----------------------------------------------------------------- POST /send
    router.post('/send', async (req, res) => {
      const {
        to,
        subject,
        html,
        from_name,
        store_title,
        sender_email,
        use_template = true,  // set to false to skip the wrapper
      } = req.body;

      // ---- Validation ----
      if (!to || !subject || !html) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: to, subject, html',
        });
      }

      if (!this.transporter) {
        return res.status(500).json({
          success: false,
          error  : 'Email transporter not initialised — check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in .env',
        });
      }

      // ---- Build email ----
      const fromName    = from_name || process.env.EMAIL_FROM_NAME    || 'Foodio';
      const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;
      const finalHtml   = use_template ? wrapInTemplate(html, fromName, store_title) : html;

      const mailOptions = {
        from   : `"${fromName}" <${fromAddress}>`,
        to,
        subject,
        html   : finalHtml,
        ...(sender_email && String(sender_email).trim() && { replyTo: String(sender_email).trim() }),
      };

      // ---- Send ----
      try {
        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailRouter] Email sent to ${to} — messageId: ${info.messageId}`);
        return res.json({
          success  : true,
          messageId: info.messageId,
          to,
          subject,
        });
      } catch (err) {
        console.error('[EmailRouter] sendMail error:', err);
        return res.status(500).json({
          success: false,
          error  : err.message,
        });
      }
    });

    // ----------------------------------------------------------------- POST /trigger-collect
    // Load template from assets/email-templates/collection.html — sends to receiver_email
    router.post('/trigger-collect', async (req, res) => {
      const {
        subject,
        template_name = 'collection',
        template_data,
      } = req.body;

      const receiverEmail = (template_data && template_data.receiver_email && String(template_data.receiver_email).trim()) ? String(template_data.receiver_email).trim() : '';
      const collectionCodeInput = (template_data && template_data.collection_code !== undefined && template_data.collection_code !== null) ? String(template_data.collection_code).trim() : '';

      if (!receiverEmail || !subject) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: subject and template_data.receiver_email',
        });
      }

      if (!collectionCodeInput) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required field: template_data.collection_code',
        });
      }

      if (!this.transporter) {
        return res.status(500).json({
          success: false,
          error  : 'Email transporter not initialised — check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in .env',
        });
      }

      try {
        const rawHtml = loadTemplateFromAsset(template_name);

        // Hardcoded example data — override with template_data from req.body if provided
        const defaultData = {
          brand_name     : 'Foodio',
          store_title    : 'Foodio',
          store_address  : '123 Main Street, Kuala Lumpur',
          store_logo_url : 'https://placehold.co/80x80/f5f5f5/666?text=Logo',
          sender_name    : 'Alex',
          sender_email   : '',
          receiver_name  : 'Jordan',
          receiver_email : '',
          item_name      : 'Golden Perch Aglio Olio',
          schedule_date  : '15 March 2026',
          remark         : '',
          image_url      : '',
          collection_code: '',
          year           : new Date().getFullYear(),
        };

        const data = { ...defaultData, ...(template_data || {}) };

        // Brand name: use store_title when specified, else Foodio
        data.brand_name = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : 'Foodio';

        // QR: encode full user-provided collection code. Display: show only part after _
        const qrCodeContent = collectionCodeInput;
        const collectionCodeDisplay = collectionCodeInput.includes('_')
          ? collectionCodeInput.substring(collectionCodeInput.lastIndexOf('_') + 1)
          : collectionCodeInput;
        data.collection_code = collectionCodeDisplay;

        // Generate QR code — use CID attachment (Gmail blocks base64 data: URLs)
        const qrDataUrl = await QRCode.toDataURL(qrCodeContent, { width: 160, margin: 2 });
        const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        data.qr_code_html = `<img src="cid:qrCollectionCode" alt="Collection code ${collectionCodeDisplay}" width="160" height="160" style="width:160px;height:160px;display:block;margin:0 auto;" />`;
        data.qr_attachment = { filename: 'qr.png', content: qrBuffer, cid: 'qrCollectionCode' };

        // Build store_logo_html: show logo img only when store_logo_url is provided
        data.store_logo_html = (data.store_logo_url && String(data.store_logo_url).trim())
          ? `<img src="${String(data.store_logo_url).replace(/"/g, '&quot;')}" alt="${String(data.store_title || '').replace(/"/g, '&quot;')}" width="80" height="80" style="max-width:80px;max-height:80px;width:80px;height:80px;object-fit:contain;display:inline-block;background:rgba(255,255,255,0.2);border-radius:12px;padding:8px;" />`
          : '';

        // Build image_html: show img only when image_url is provided
        data.image_html = (data.image_url && String(data.image_url).trim())
          ? `<img src="${String(data.image_url).replace(/"/g, '&quot;')}" alt="${String(data.item_name || '').replace(/"/g, '&quot;')}" width="100%" style="max-width:320px;width:100%;height:auto;border-radius:12px;display:block;margin:0 auto;" />`
          : '';

        // Build remark_html: show remark block only when sender provides a remark
        const remark = (data.remark && String(data.remark).trim()) ? String(data.remark).trim() : '';
        const escapedRemark = remark.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
        const senderName = String(data.sender_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        data.remark_html = remark
          ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;margin:0 0 24px;border-radius:0 8px 8px 0;"><p style="margin:0 0 6px;color:#92400e;font-size:13px;font-weight:600;">A message from ${senderName}:</p><p style="margin:0;color:#78350f;font-size:15px;line-height:1.6;">${escapedRemark}</p></div>`
          : '';

        data.sender_email_row = (data.sender_email && String(data.sender_email).trim())
          ? `<tr><td style="padding:6px 0;color:#2d3748;font-size:15px;"><strong>Sender email:</strong> ${String(data.sender_email).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</td></tr>`
          : '';

        const finalHtml = replaceTemplateFields(rawHtml, data);

        const fromName    = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : (process.env.EMAIL_FROM_NAME || 'Foodio');
        const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;

        const mailOptions = {
          from        : `"${fromName}" <${fromAddress}>`,
          to          : receiverEmail,
          subject,
          html        : finalHtml,
          attachments : [data.qr_attachment],
          ...(data.sender_email && String(data.sender_email).trim() && { replyTo: String(data.sender_email).trim() }),
        };

        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailRouter] Collection email sent to ${receiverEmail} (receiver) — messageId: ${info.messageId} — collection_code: ${collectionCodeDisplay}`);
        return res.json({
          success        : true,
          messageId      : info.messageId,
          to             : receiverEmail,
          subject,
          collection_code: collectionCodeDisplay,
        });
      } catch (err) {
        console.error('[EmailRouter] trigger-collect error:', err);
        return res.status(500).json({
          success: false,
          error  : err.message,
        });
      }
    });

    // ----------------------------------------------------------------- POST /trigger-collectmany
    // Load template collections.html — supports multiple items with photo and quantity, sends to receiver_email
    router.post('/trigger-collectmany', async (req, res) => {
      const {
        subject,
        template_data,
      } = req.body;

      const receiverEmail = (template_data && template_data.receiver_email && String(template_data.receiver_email).trim()) ? String(template_data.receiver_email).trim() : '';
      const collectionCodeInput = (template_data && template_data.collection_code !== undefined && template_data.collection_code !== null) ? String(template_data.collection_code).trim() : '';

      if (!receiverEmail || !subject) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: subject and template_data.receiver_email',
        });
      }

      if (!collectionCodeInput) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required field: template_data.collection_code',
        });
      }

      if (!this.transporter) {
        return res.status(500).json({
          success: false,
          error  : 'Email transporter not initialised — check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in .env',
        });
      }

      try {
        const rawHtml = loadTemplateFromAsset('collections');

        const defaultData = {
          brand_name     : 'Foodio',
          store_title    : 'Foodio',
          store_address  : '123 Main Street, Kuala Lumpur',
          store_logo_url : 'https://placehold.co/80x80/f5f5f5/666?text=Logo',
          sender_name    : 'Alex',
          sender_email   : '',
          receiver_name  : 'Jordan',
          receiver_email : '',
          schedule_date  : '15 March 2026',
          remark         : '',
          items          : [
            { item_name: 'Golden Perch Aglio Olio', image_url: 'https://placehold.co/200x150/f5f5f5/666?text=Item', quantity: 2 },
            { item_name: 'Coffee', image_url: '', quantity: 1 },
          ],
          collection_code: '',
          year           : new Date().getFullYear(),
        };

        const data = { ...defaultData, ...(template_data || {}) };

        data.brand_name = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : 'Foodio';

        // QR: encode full user-provided collection code. Display: show only part after _
        const qrCodeContent = collectionCodeInput;
        const collectionCodeDisplay = collectionCodeInput.includes('_')
          ? collectionCodeInput.substring(collectionCodeInput.lastIndexOf('_') + 1)
          : collectionCodeInput;
        data.collection_code = collectionCodeDisplay;

        const qrDataUrl = await QRCode.toDataURL(qrCodeContent, { width: 160, margin: 2 });
        const qrBuffer = Buffer.from(qrDataUrl.replace(/^data:image\/\w+;base64,/, ''), 'base64');
        data.qr_code_html = `<img src="cid:qrCollectionCode" alt="Collection code ${collectionCodeDisplay}" width="160" height="160" style="width:160px;height:160px;display:block;margin:0 auto;" />`;
        data.qr_attachment = { filename: 'qr.png', content: qrBuffer, cid: 'qrCollectionCode' };

        data.store_logo_html = (data.store_logo_url && String(data.store_logo_url).trim())
          ? `<img src="${String(data.store_logo_url).replace(/"/g, '&quot;')}" alt="${String(data.store_title || '').replace(/"/g, '&quot;')}" width="80" height="80" style="max-width:80px;max-height:80px;width:80px;height:80px;object-fit:contain;display:inline-block;background:rgba(255,255,255,0.2);border-radius:12px;padding:8px;" />`
          : '';

        // Build items_html: each item with photo + name + quantity
        const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : defaultData.items;
        const itemRows = items.map((it) => {
          const name = String(it.item_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
          const imgUrl = (it.image_url && String(it.image_url).trim()) ? String(it.image_url).replace(/"/g, '&quot;') : '';
          const imgHtml = imgUrl
            ? `<img src="${imgUrl}" alt="${name}" width="120" height="90" style="width:120px;height:90px;object-fit:cover;border-radius:8px;display:block;" />`
            : '<div style="width:120px;height:90px;background:#e2e8f0;border-radius:8px;display:flex;align-items:center;justify-content:center;color:#718096;font-size:12px;">No image</div>';
          return `<table cellpadding="0" cellspacing="0" border="0" style="width:100%;margin-bottom:16px;background:#f7fafc;border-radius:12px;overflow:hidden;"><tr><td style="padding:16px;vertical-align:middle;width:120px;">${imgHtml}</td><td style="padding:16px;vertical-align:middle;"><p style="margin:0 0 4px;color:#2d3748;font-size:15px;font-weight:600;">${name}</p><p style="margin:0;color:#4a5568;font-size:14px;"><strong>Quantity:</strong> ${qty}</p></td></tr></table>`;
        });
        data.items_html = itemRows.join('');

        const remark = (data.remark && String(data.remark).trim()) ? String(data.remark).trim() : '';
        const escapedRemark = remark.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');
        const senderName = String(data.sender_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        data.remark_html = remark
          ? `<div style="background:#fef3c7;border-left:4px solid #f59e0b;padding:16px;margin:0 0 24px;border-radius:0 8px 8px 0;"><p style="margin:0 0 6px;color:#92400e;font-size:13px;font-weight:600;">A message from ${senderName}:</p><p style="margin:0;color:#78350f;font-size:15px;line-height:1.6;">${escapedRemark}</p></div>`
          : '';

        data.sender_email_row = (data.sender_email && String(data.sender_email).trim())
          ? `<tr><td style="padding:6px 0;color:#2d3748;font-size:15px;"><strong>Sender email:</strong> ${String(data.sender_email).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</td></tr>`
          : '';

        const finalHtml = replaceTemplateFields(rawHtml, data);

        const fromName    = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : (process.env.EMAIL_FROM_NAME || 'Foodio');
        const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;

        const mailOptions = {
          from        : `"${fromName}" <${fromAddress}>`,
          to          : receiverEmail,
          subject,
          html        : finalHtml,
          attachments : [data.qr_attachment],
          ...(data.sender_email && String(data.sender_email).trim() && { replyTo: String(data.sender_email).trim() }),
        };

        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailRouter] Collections email sent to ${receiverEmail} (receiver) — messageId: ${info.messageId} — collection_code: ${collectionCodeDisplay}`);
        return res.json({
          success        : true,
          messageId      : info.messageId,
          to             : receiverEmail,
          subject,
          collection_code: collectionCodeDisplay,
        });
      } catch (err) {
        console.error('[EmailRouter] trigger-collectmany error:', err);
        return res.status(500).json({
          success: false,
          error  : err.message,
        });
      }
    });

    // ----------------------------------------------------------------- POST /trigger-giftreceipt
    // Send gift receipt to sender — confirms message sent to receiver, lists receiver, address, items, collection code
    router.post('/trigger-giftreceipt', async (req, res) => {
      const {
        subject,
        template_data,
      } = req.body;

      const senderEmail = (template_data && template_data.sender_email && String(template_data.sender_email).trim()) ? String(template_data.sender_email).trim() : '';

      if (!senderEmail || !subject) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: subject and template_data.sender_email (gift receipt is sent to sender email)',
        });
      }

      if (!this.transporter) {
        return res.status(500).json({
          success: false,
          error  : 'Email transporter not initialised — check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in .env',
        });
      }

      try {
        const rawHtml = loadTemplateFromAsset('giftreceipt');

        const defaultData = {
          brand_name       : 'Foodio',
          store_title      : 'Foodio',
          store_address    : '123 Main Street, Kuala Lumpur',
          store_logo_url   : 'https://placehold.co/80x80/f5f5f5/666?text=Logo',
          sender_name      : 'Alex',
          sender_email     : '',
          receiver_name    : 'Jordan',
          receiver_address : '456 Receiver Road, Kuala Lumpur',
          items            : [
            { item_name: 'Golden Perch Aglio Olio', quantity: 2 },
            { item_name: 'Coffee', quantity: 1 },
          ],
          collection_code  : '847291',
          year             : new Date().getFullYear(),
        };

        const data = { ...defaultData, ...(template_data || {}) };

        data.brand_name = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : 'Foodio';

        const collectionCode = String(data.collection_code || '').replace(/\D/g, '').padStart(6, '0').slice(-6) || '000000';
        data.collection_code = collectionCode;

        data.store_logo_html = (data.store_logo_url && String(data.store_logo_url).trim())
          ? `<img src="${String(data.store_logo_url).replace(/"/g, '&quot;')}" alt="${String(data.store_title || '').replace(/"/g, '&quot;')}" width="80" height="80" style="max-width:80px;max-height:80px;width:80px;height:80px;object-fit:contain;display:inline-block;background:rgba(255,255,255,0.2);border-radius:12px;padding:8px;" />`
          : '';

        // Build items_html: simple list with item name + quantity
        const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : defaultData.items;
        const itemRows = items.map((it) => {
          const name = String(it.item_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
          return `<tr><td style="padding:8px 0;color:#2d3748;font-size:15px;border-bottom:1px solid #e2e8f0;">${name}</td><td style="padding:8px 0;color:#4a5568;font-size:15px;border-bottom:1px solid #e2e8f0;text-align:right;">x${qty}</td></tr>`;
        });
        data.items_html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7fafc;border-radius:12px;padding:16px;"><tbody>${itemRows.join('')}</tbody></table>`;

        data.sender_email_row = (data.sender_email && String(data.sender_email).trim())
          ? `<tr><td style="padding:6px 0;color:#2d3748;font-size:15px;"><strong>Sender email:</strong> ${String(data.sender_email).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</td></tr>`
          : '';

        const finalHtml = replaceTemplateFields(rawHtml, data);

        const fromName    = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : (process.env.EMAIL_FROM_NAME || 'Foodio');
        const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;

        const mailOptions = {
          from   : `"${fromName}" <${fromAddress}>`,
          to     : senderEmail,
          subject,
          html   : finalHtml,
          ...(data.sender_email && String(data.sender_email).trim() && { replyTo: String(data.sender_email).trim() }),
        };

        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailRouter] Gift receipt sent to ${senderEmail} (sender) — messageId: ${info.messageId}`);
        return res.json({
          success  : true,
          messageId: info.messageId,
          to       : senderEmail,
          subject,
        });
      } catch (err) {
        console.error('[EmailRouter] trigger-giftreceipt error:', err);
        return res.status(500).json({
          success: false,
          error  : err.message,
        });
      }
    });

    // ----------------------------------------------------------------- POST /trigger-collected
    // Notify sender that receiver has collected the items — includes collection_date and collection_time
    router.post('/trigger-collected', async (req, res) => {
      const {
        subject,
        template_data,
      } = req.body;

      const senderEmail = (template_data && template_data.sender_email && String(template_data.sender_email).trim()) ? String(template_data.sender_email).trim() : '';
      const collectionDate = (template_data && template_data.collection_date && String(template_data.collection_date).trim()) ? String(template_data.collection_date).trim() : '';
      const collectionTime = (template_data && template_data.collection_time && String(template_data.collection_time).trim()) ? String(template_data.collection_time).trim() : '';

      if (!senderEmail || !subject) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: subject and template_data.sender_email',
        });
      }

      if (!collectionDate || !collectionTime) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: template_data.collection_date and template_data.collection_time',
        });
      }

      if (!this.transporter) {
        return res.status(500).json({
          success: false,
          error  : 'Email transporter not initialised — check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in .env',
        });
      }

      try {
        const rawHtml = loadTemplateFromAsset('collection-collected');

        const defaultData = {
          brand_name       : 'Foodio',
          store_title      : 'Foodio',
          store_address    : '123 Main Street, Kuala Lumpur',
          store_logo_url   : 'https://placehold.co/80x80/f5f5f5/666?text=Logo',
          sender_name      : 'Alex',
          sender_email     : '',
          receiver_name    : 'Jordan',
          receiver_address : '456 Receiver Road, Kuala Lumpur',
          collection_code  : '847291',
          collection_date  : '15 March 2026',
          collection_time  : '2:30 PM',
          items            : [
            { item_name: 'Golden Perch Aglio Olio', quantity: 2 },
            { item_name: 'Coffee', quantity: 1 },
          ],
          year             : new Date().getFullYear(),
        };

        const data = { ...defaultData, ...(template_data || {}) };

        data.brand_name = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : 'Foodio';

        data.collection_code = String(data.collection_code || '').replace(/\D/g, '').padStart(6, '0').slice(-6) || '000000';

        data.store_logo_html = (data.store_logo_url && String(data.store_logo_url).trim())
          ? `<img src="${String(data.store_logo_url).replace(/"/g, '&quot;')}" alt="${String(data.store_title || '').replace(/"/g, '&quot;')}" width="80" height="80" style="max-width:80px;max-height:80px;width:80px;height:80px;object-fit:contain;display:inline-block;background:rgba(255,255,255,0.2);border-radius:12px;padding:8px;" />`
          : '';

        const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : defaultData.items;
        const itemRows = items.map((it) => {
          const name = String(it.item_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
          return `<tr><td style="padding:8px 0;color:#2d3748;font-size:15px;border-bottom:1px solid #e2e8f0;">${name}</td><td style="padding:8px 0;color:#4a5568;font-size:15px;border-bottom:1px solid #e2e8f0;text-align:right;">x${qty}</td></tr>`;
        });
        data.items_html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7fafc;border-radius:12px;padding:16px;"><tbody>${itemRows.join('')}</tbody></table>`;

        const finalHtml = replaceTemplateFields(rawHtml, data);

        const fromName    = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : (process.env.EMAIL_FROM_NAME || 'Foodio');
        const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;

        const mailOptions = {
          from   : `"${fromName}" <${fromAddress}>`,
          to     : senderEmail,
          subject,
          html   : finalHtml,
          ...(data.sender_email && String(data.sender_email).trim() && { replyTo: String(data.sender_email).trim() }),
        };

        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailRouter] Collection collected notification sent to ${senderEmail} — messageId: ${info.messageId}`);
        return res.json({
          success  : true,
          messageId: info.messageId,
          to       : senderEmail,
          subject,
        });
      } catch (err) {
        console.error('[EmailRouter] trigger-collected error:', err);
        return res.status(500).json({
          success: false,
          error  : err.message,
        });
      }
    });

    // ----------------------------------------------------------------- POST /trigger-cancelreceipt
    // Send cancel receipt to sender — gift has been canceled, includes cancellation_date and cancellation_time
    router.post('/trigger-cancelreceipt', async (req, res) => {
      const {
        subject,
        template_data,
      } = req.body;

      const senderEmail = (template_data && template_data.sender_email && String(template_data.sender_email).trim()) ? String(template_data.sender_email).trim() : '';
      const cancellationDate = (template_data && template_data.cancellation_date && String(template_data.cancellation_date).trim()) ? String(template_data.cancellation_date).trim() : '';
      const cancellationTime = (template_data && template_data.cancellation_time && String(template_data.cancellation_time).trim()) ? String(template_data.cancellation_time).trim() : '';

      if (!senderEmail || !subject) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: subject and template_data.sender_email',
        });
      }

      if (!cancellationDate || !cancellationTime) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: template_data.cancellation_date and template_data.cancellation_time',
        });
      }

      if (!this.transporter) {
        return res.status(500).json({
          success: false,
          error  : 'Email transporter not initialised — check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in .env',
        });
      }

      try {
        const rawHtml = loadTemplateFromAsset('cancelreceipt');

        const defaultData = {
          brand_name         : 'Foodio',
          store_title        : 'Foodio',
          store_address      : '123 Main Street, Kuala Lumpur',
          store_logo_url     : 'https://placehold.co/80x80/f5f5f5/666?text=Logo',
          sender_name        : 'Alex',
          sender_email       : '',
          receiver_name      : 'Jordan',
          receiver_address   : '456 Receiver Road, Kuala Lumpur',
          cancellation_date  : '',
          cancellation_time  : '',
          collection_code    : '847291',
          items              : [
            { item_name: 'Golden Perch Aglio Olio', quantity: 2 },
            { item_name: 'Coffee', quantity: 1 },
          ],
          year               : new Date().getFullYear(),
        };

        const data = { ...defaultData, ...(template_data || {}) };
        data.cancellation_date = cancellationDate;
        data.cancellation_time = cancellationTime;

        data.brand_name = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : 'Foodio';

        data.collection_code = String(data.collection_code || '').replace(/\D/g, '').padStart(6, '0').slice(-6) || '000000';

        data.store_logo_html = (data.store_logo_url && String(data.store_logo_url).trim())
          ? `<img src="${String(data.store_logo_url).replace(/"/g, '&quot;')}" alt="${String(data.store_title || '').replace(/"/g, '&quot;')}" width="80" height="80" style="max-width:80px;max-height:80px;width:80px;height:80px;object-fit:contain;display:inline-block;background:rgba(255,255,255,0.2);border-radius:12px;padding:8px;" />`
          : '';

        const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : defaultData.items;
        const itemRows = items.map((it) => {
          const name = String(it.item_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
          return `<tr><td style="padding:8px 0;color:#2d3748;font-size:15px;border-bottom:1px solid #e2e8f0;">${name}</td><td style="padding:8px 0;color:#4a5568;font-size:15px;border-bottom:1px solid #e2e8f0;text-align:right;">x${qty}</td></tr>`;
        });
        data.items_html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7fafc;border-radius:12px;padding:16px;"><tbody>${itemRows.join('')}</tbody></table>`;

        data.sender_email_row = (data.sender_email && String(data.sender_email).trim())
          ? `<tr><td style="padding:6px 0;color:#2d3748;font-size:15px;"><strong>Sender email:</strong> ${String(data.sender_email).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')}</td></tr>`
          : '';

        const finalHtml = replaceTemplateFields(rawHtml, data);

        const fromName    = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : (process.env.EMAIL_FROM_NAME || 'Foodio');
        const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;

        const mailOptions = {
          from   : `"${fromName}" <${fromAddress}>`,
          to     : senderEmail,
          subject,
          html   : finalHtml,
          ...(data.sender_email && String(data.sender_email).trim() && { replyTo: String(data.sender_email).trim() }),
        };

        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailRouter] Cancel receipt sent to ${senderEmail} — messageId: ${info.messageId}`);
        return res.json({
          success  : true,
          messageId: info.messageId,
          to       : senderEmail,
          subject,
        });
      } catch (err) {
        console.error('[EmailRouter] trigger-cancelreceipt error:', err);
        return res.status(500).json({
          success: false,
          error  : err.message,
        });
      }
    });

    // ----------------------------------------------------------------- POST /trigger-cancel-collection
    // Inform receiver that gift has been canceled by sender — sends to receiver_email, requires cancellation_date and cancellation_time
    router.post('/trigger-cancel-collection', async (req, res) => {
      const {
        subject,
        template_data,
      } = req.body;

      const receiverEmail = (template_data && template_data.receiver_email && String(template_data.receiver_email).trim()) ? String(template_data.receiver_email).trim() : '';
      const cancellationDate = (template_data && template_data.cancellation_date && String(template_data.cancellation_date).trim()) ? String(template_data.cancellation_date).trim() : '';
      const cancellationTime = (template_data && template_data.cancellation_time && String(template_data.cancellation_time).trim()) ? String(template_data.cancellation_time).trim() : '';

      if (!receiverEmail || !subject) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: subject and template_data.receiver_email',
        });
      }

      if (!cancellationDate || !cancellationTime) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: template_data.cancellation_date and template_data.cancellation_time',
        });
      }

      if (!this.transporter) {
        return res.status(500).json({
          success: false,
          error  : 'Email transporter not initialised — check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in .env',
        });
      }

      try {
        const rawHtml = loadTemplateFromAsset('cancel-collection');

        const defaultData = {
          brand_name        : 'Foodio',
          store_title       : 'Foodio',
          store_address     : '123 Main Street, Kuala Lumpur',
          store_logo_url    : 'https://placehold.co/80x80/f5f5f5/666?text=Logo',
          sender_name       : 'Alex',
          receiver_name     : 'Jordan',
          receiver_email    : '',
          cancellation_date : '',
          cancellation_time : '',
          items             : [
            { item_name: 'Golden Perch Aglio Olio', quantity: 2 },
            { item_name: 'Coffee', quantity: 1 },
          ],
          year              : new Date().getFullYear(),
        };

        const data = { ...defaultData, ...(template_data || {}) };
        data.cancellation_date = cancellationDate;
        data.cancellation_time = cancellationTime;

        data.brand_name = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : 'Foodio';

        data.store_logo_html = (data.store_logo_url && String(data.store_logo_url).trim())
          ? `<img src="${String(data.store_logo_url).replace(/"/g, '&quot;')}" alt="${String(data.store_title || '').replace(/"/g, '&quot;')}" width="80" height="80" style="max-width:80px;max-height:80px;width:80px;height:80px;object-fit:contain;display:inline-block;background:rgba(255,255,255,0.2);border-radius:12px;padding:8px;" />`
          : '';

        const items = Array.isArray(data.items) && data.items.length > 0 ? data.items : defaultData.items;
        const itemRows = items.map((it) => {
          const name = String(it.item_name || '').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
          const qty = Math.max(1, parseInt(it.quantity, 10) || 1);
          return `<tr><td style="padding:8px 0;color:#2d3748;font-size:15px;border-bottom:1px solid #e2e8f0;">${name}</td><td style="padding:8px 0;color:#4a5568;font-size:15px;border-bottom:1px solid #e2e8f0;text-align:right;">x${qty}</td></tr>`;
        });
        data.items_html = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7fafc;border-radius:12px;padding:16px;"><tbody>${itemRows.join('')}</tbody></table>`;

        const finalHtml = replaceTemplateFields(rawHtml, data);

        const fromName    = (data.store_title && String(data.store_title).trim()) ? String(data.store_title).trim() : (process.env.EMAIL_FROM_NAME || 'Foodio');
        const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;

        const mailOptions = {
          from   : `"${fromName}" <${fromAddress}>`,
          to     : receiverEmail,
          subject,
          html   : finalHtml,
          ...(data.sender_email && String(data.sender_email).trim() && { replyTo: String(data.sender_email).trim() }),
        };

        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailRouter] Cancel-collection notification sent to ${receiverEmail} (receiver) — messageId: ${info.messageId}`);
        return res.json({
          success  : true,
          messageId: info.messageId,
          to       : receiverEmail,
          subject,
        });
      } catch (err) {
        console.error('[EmailRouter] trigger-cancel-collection error:', err);
        return res.status(500).json({
          success: false,
          error  : err.message,
        });
      }
    });

    // ----------------------------------------------------------------- POST /trigger-pos-audit-report
    // Caller supplies full HTML in template_data.html_body; optional store_title / store_address / store_logo_url for branding.
    router.post('/trigger-pos-audit-report', async (req, res) => {
      const {
        subject,
        template_data,
      } = req.body;

      const td = template_data || {};
      const receiverEmail = (td.receiver_email && String(td.receiver_email).trim()) ? String(td.receiver_email).trim() : '';
      const htmlBodyRaw = td.html_body;
      const htmlBody = (htmlBodyRaw !== undefined && htmlBodyRaw !== null && String(htmlBodyRaw).trim()) ? String(htmlBodyRaw) : '';

      if (!receiverEmail || !subject) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required fields: subject and template_data.receiver_email',
        });
      }

      if (!htmlBody) {
        return res.status(400).json({
          success: false,
          error  : 'Missing required field: template_data.html_body',
        });
      }

      if (!this.transporter) {
        return res.status(500).json({
          success: false,
          error  : 'Email transporter not initialised — check EMAIL_SMTP_USER and EMAIL_SMTP_PASS in .env',
        });
      }

      try {
        const storeTitle = (td.store_title && String(td.store_title).trim()) ? String(td.store_title).trim() : '';
        const storeAddress = (td.store_address && String(td.store_address).trim()) ? String(td.store_address).trim() : '';
        const storeLogoUrl = (td.store_logo_url && String(td.store_logo_url).trim()) ? String(td.store_logo_url).trim() : '';

        const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
        const escHtml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');

        let innerHtml = '';
        if (storeLogoUrl) {
          const alt = storeTitle ? escAttr(storeTitle) : 'Store';
          innerHtml += `<div style="text-align:center;margin-bottom:20px;"><img src="${escAttr(storeLogoUrl)}" alt="${alt}" width="80" height="80" style="max-width:120px;max-height:80px;width:auto;height:auto;object-fit:contain;display:inline-block;" /></div>`;
        }
        if (storeAddress) {
          innerHtml += `<p style="margin:0 0 20px;color:#4a5568;font-size:14px;line-height:1.6;text-align:center;">${escHtml(storeAddress)}</p>`;
        }
        innerHtml += htmlBody;

        const fromName = storeTitle || process.env.EMAIL_FROM_NAME || 'Foodio';
        const fromAddress = process.env.EMAIL_FROM_ADDRESS || process.env.EMAIL_SMTP_USER;
        const finalHtml = wrapInTemplate(innerHtml, fromName, storeTitle || undefined);

        const mailOptions = {
          from   : `"${fromName}" <${fromAddress}>`,
          to     : receiverEmail,
          subject,
          html   : finalHtml,
        };

        const info = await this.transporter.sendMail(mailOptions);
        console.log(`[EmailRouter] POS audit report sent to ${receiverEmail} — messageId: ${info.messageId}`);
        return res.json({
          success  : true,
          messageId: info.messageId,
          to       : receiverEmail,
          subject,
        });
      } catch (err) {
        console.error('[EmailRouter] trigger-pos-audit-report error:', err);
        return res.status(500).json({
          success: false,
          error  : err.message,
        });
      }
    });
  }

  /** Return the Express Router instance for use in server.js */
  getRouter() {
    return this.router;
  }
}

module.exports = EmailRouter;
