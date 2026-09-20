'use strict';

// Ordered by id. A migration is applied once and then never re-run, so never
// edit one that has shipped — add the next number instead.
module.exports = [require('./0001_owner_master_subscription')];
