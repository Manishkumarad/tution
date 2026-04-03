const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const { query } = require('../config/db');
const env = require('../config/env');

const receiptsDir = path.join(__dirname, '../../storage/receipts');

function ensureReceiptsDir() {
  if (!fs.existsSync(receiptsDir)) {
    fs.mkdirSync(receiptsDir, { recursive: true });
  }
}

async function getReceiptData(paymentId, coachingId) {
  const result = await query(
    `SELECT p.id AS payment_id, p.amount, p.method, p.payment_mode, p.paid_at, p.created_at,
            s.id AS student_id, s.full_name AS student_name, s.class_name,
            c.name AS coaching_name
     FROM payments p
     JOIN students s ON s.id = p.student_id AND s.coaching_id = p.coaching_id
     JOIN coachings c ON c.id = p.coaching_id
     WHERE p.id = $1 AND p.coaching_id = $2`,
    [paymentId, coachingId]
  );

  return result.rows[0] || null;
}

function toReceiptFileName(paymentId) {
  return `receipt-${paymentId}.pdf`;
}

function formatDate(value) {
  const date = value ? new Date(value) : new Date();
  return date.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
}

async function upsertReceiptRecord({ coachingId, studentId, paymentId, receiptNumber, filePath }) {
  const receiptUrl = env.receiptBaseUrl ? `${env.receiptBaseUrl}/${path.basename(filePath)}` : null;

  const existing = await query(
    `SELECT id FROM receipts
     WHERE coaching_id = $1 AND payment_id = $2
     LIMIT 1`,
    [coachingId, paymentId]
  );

  if (existing.rows[0]) {
    const update = await query(
      `UPDATE receipts
       SET receipt_number = $1,
           file_path = $2,
           receipt_url = $3,
           generated_at = NOW()
       WHERE id = $4
       RETURNING *`,
      [receiptNumber, filePath, receiptUrl, existing.rows[0].id]
    );
    return update.rows[0];
  }

  const insert = await query(
    `INSERT INTO receipts (
      coaching_id, student_id, payment_id, receipt_number, file_path, receipt_url
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *`,
    [coachingId, studentId, paymentId, receiptNumber, filePath, receiptUrl]
  );

  return insert.rows[0];
}

async function generateReceiptForPayment({ paymentId, coachingId }) {
  ensureReceiptsDir();

  const data = await getReceiptData(paymentId, coachingId);
  if (!data) {
    throw new Error('Payment not found for receipt generation');
  }

  const receiptNumber = `RCP-${coachingId}-${paymentId}`;
  const fileName = toReceiptFileName(paymentId);
  const filePath = path.join(receiptsDir, fileName);

  await new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    doc.fontSize(20).text('Payment Receipt', { align: 'center' });
    doc.moveDown();

    doc.fontSize(12);
    doc.text(`Receipt Number: ${receiptNumber}`);
    doc.text(`Generated At: ${formatDate(new Date())}`);
    doc.moveDown();

    doc.text(`Coaching: ${data.coaching_name}`);
    doc.text(`Student: ${data.student_name}`);
    doc.text(`Class: ${data.class_name || '-'}`);
    doc.text(`Student ID: ${data.student_id}`);
    doc.moveDown();

    doc.text(`Payment ID: ${data.payment_id}`);
    doc.text(`Amount: Rs ${Number(data.amount).toFixed(2)}`);
    doc.text(`Method: ${data.method}`);
    doc.text(`Mode: ${data.payment_mode}`);
    doc.text(`Paid At: ${formatDate(data.paid_at || data.created_at)}`);

    doc.moveDown(2);
    doc.text('This is a system generated receipt.', { align: 'left' });

    doc.end();

    stream.on('finish', resolve);
    stream.on('error', reject);
  });

  return upsertReceiptRecord({
    coachingId,
    studentId: data.student_id,
    paymentId,
    receiptNumber,
    filePath
  });
}

module.exports = {
  generateReceiptForPayment
};
