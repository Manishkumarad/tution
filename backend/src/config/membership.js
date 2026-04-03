const MEMBERSHIP_PLANS = {
  starter: {
    code: 'starter',
    label: 'Starter',
    price: 0,
    durationMonths: 0,
    maxStudents: 5,
    features: [
      'Up to 5 students',
      'Basic dashboard access',
      'Standard support'
    ]
  },
  monthly: {
    code: 'monthly',
    label: 'Premium Monthly',
    price: 3500,
    durationMonths: 1,
    maxStudents: 300,
    features: [
      'Up to 300 students',
      'Priority support',
      'Faster reminder processing'
    ]
  },
  six_month: {
    code: 'six_month',
    label: 'Premium 6 Months',
    price: 20000,
    durationMonths: 6,
    maxStudents: 1000,
    features: [
      'Up to 1000 students',
      'Everything in Monthly',
      'Advanced reporting and exports'
    ]
  },
  yearly: {
    code: 'yearly',
    label: 'Premium 1 Year',
    price: 35000,
    durationMonths: 12,
    maxStudents: 5000,
    features: [
      'Up to 5000 students',
      'Everything in 6 Months',
      'Quick Send Message access'
    ]
  },
  premium: {
    code: 'premium',
    label: 'Premium (Legacy)',
    price: 0,
    durationMonths: 0,
    maxStudents: 1000,
    features: [
      'Legacy premium account',
      'Up to 1000 students',
      'Priority support'
    ]
  }
};

function getMembershipPlan(planType) {
  return MEMBERSHIP_PLANS[planType] || MEMBERSHIP_PLANS.starter;
}

function listMembershipPlans() {
  return Object.values(MEMBERSHIP_PLANS);
}

module.exports = {
  MEMBERSHIP_PLANS,
  getMembershipPlan,
  listMembershipPlans
};
