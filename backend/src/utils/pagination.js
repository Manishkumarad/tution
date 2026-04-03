function getPagination(query) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(100, Math.max(1, Number(query.limit) || 25));
  const offset = (page - 1) * limit;
  return { page, limit, offset };
}

module.exports = { getPagination };
