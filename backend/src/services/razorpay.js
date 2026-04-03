const Razorpay = require('razorpay');
const crypto = require('crypto');
const env = require('../config/env');

let razorpayClient = null;

function getRazorpayClient() {
  if (!env.razorpayKeyId || !env.razorpayKeySecret) {
    const err = new Error('Razorpay is not configured');
    err.statusCode = 500;
    throw err;
  }

  if (!razorpayClient) {
    razorpayClient = new Razorpay({
      key_id: env.razorpayKeyId,
      key_secret: env.razorpayKeySecret
    });
  }

  return razorpayClient;
}

function verifyPaymentSignature(orderId, paymentId, signature) {
  const body = `${orderId}|${paymentId}`;
  const expected = crypto
    .createHmac('sha256', env.razorpayKeySecret)
    .update(body)
    .digest('hex');
  if (!signature || expected.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

function verifyWebhookSignature(rawBody, signature) {
  const expected = crypto
    .createHmac('sha256', env.razorpayWebhookSecret)
    .update(rawBody)
    .digest('hex');
  if (!signature || expected.length !== signature.length) {
    return false;
  }
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
}

module.exports = {
  getRazorpayClient,
  verifyPaymentSignature,
  verifyWebhookSignature
};
