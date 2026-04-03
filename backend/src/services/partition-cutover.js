const env = require('../config/env');

function paymentsTable() {
  return env.partitionReadTables ? 'payments_p' : 'payments';
}

function attendanceTable() {
  return env.partitionReadTables ? 'attendance_p' : 'attendance';
}

function isDualWriteEnabled() {
  return env.partitionDualWrite;
}

module.exports = {
  paymentsTable,
  attendanceTable,
  isDualWriteEnabled
};
