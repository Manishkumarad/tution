function notFound(_req, res) {
  return res.status(404).json({ message: 'Route not found' });
}

function errorHandler(err, _req, res, _next) {
  const status = err.statusCode || 500;
  return res.status(status).json({
    message: err.message || 'Internal server error'
  });
}

module.exports = {
  notFound,
  errorHandler
};
