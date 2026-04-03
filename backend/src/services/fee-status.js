function deriveFeeStatus(totalAmount, paidAmount, nextDueDate) {
  const dueAmount = Number(totalAmount) - Number(paidAmount);
  const today = new Date();
  const due = nextDueDate ? new Date(nextDueDate) : null;

  if (dueAmount <= 0) {
    return { dueAmount: 0, status: 'paid', validTill: due || today };
  }

  if (due && due < new Date(today.toDateString())) {
    return { dueAmount, status: 'overdue', validTill: due };
  }

  if (paidAmount > 0) {
    return { dueAmount, status: 'partial', validTill: due };
  }

  return { dueAmount, status: 'due', validTill: due };
}

function isPassValid(status, validTill) {
  if (status === 'paid') return true;
  if (!validTill) return false;
  const today = new Date();
  return new Date(validTill) >= new Date(today.toDateString());
}

module.exports = {
  deriveFeeStatus,
  isPassValid
};
